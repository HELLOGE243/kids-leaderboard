import { authedFetch } from '../data/auth.js'
let pdfjsLib = null

async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib
  pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).href
  return pdfjsLib
}

export async function getPDFPageCount(file) {
  const pdfjs = await getPdfjs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
  return pdf.numPages
}

export async function extractTextFromPDF(file, onProgress, pageRange) {
  const pdfjs = await getPdfjs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
  const pages = []

  const from = Math.max(1, pageRange?.from ?? 1)
  const to = Math.min(pageRange?.to ?? pdf.numPages, pdf.numPages)

  for (let i = from; i <= to; i++) {
    onProgress?.(`Extracting page ${i} (${i - from + 1}/${to - from + 1})...`)
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map(item => item.str).join(' ')
    pages.push({ pageNum: i, text })
  }

  return pages
}

export function parseBookletMeta(filename) {
  const name = filename.replace(/\.pdf$/i, '').replace(/[_\s]+/g, '')
  const termMatch = name.match(/T(\d)/i)
  const weekMatch = name.match(/W(\d+)/i)
  const yearMatch = name.match(/Y(\d+)/i)
  return {
    term: termMatch ? `T${termMatch[1]}` : '',
    week: weekMatch ? `W${weekMatch[1]}` : '',
    year: yearMatch ? `Y${yearMatch[1]}` : '',
    subject: name.replace(/T\d/gi, '').replace(/W\d+/gi, '').replace(/Y\d+/gi, '').replace(/[^a-zA-Z]/g, '') || 'Quiz',
  }
}

const CHUNK_SIZE = 5
const MAX_TOKENS = 32000

/**
 * Pulls the JSON array out of a reply, keeping whatever survived a cut-off.
 *
 * The model can run out of room mid-array. Parsing the whole thing then throws,
 * and the reply's finished questions used to be thrown away along with it. So
 * when a straight parse fails, walk the text and close the brackets after the
 * last question that completed.
 *
 * @returns {{ sections: object[], truncated: boolean }}
 */
export function salvageSections(reply) {
  const raw = String(reply || '').replace(/```(?:json)?/gi, '')
  const start = raw.indexOf('[')
  if (start < 0) return { sections: [], truncated: false }
  const s = raw.slice(start)

  try {
    const parsed = JSON.parse(s)
    if (Array.isArray(parsed)) return { sections: parsed, truncated: false }
  } catch { /* cut off - salvage below */ }

  let depth = 0, inStr = false, esc = false
  let lastSectionEnd = -1, lastQuestionEnd = -1, openSection = -1
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') { inStr = true; continue }
    if (c === '[' || c === '{') {
      depth++
      if (depth === 2 && c === '{') { openSection = i; lastQuestionEnd = -1 }
    } else if (c === ']' || c === '}') {
      depth--
      if (depth === 1) lastSectionEnd = i
      else if (depth === 3) lastQuestionEnd = i
    }
  }

  const sections = []
  if (lastSectionEnd >= 0) {
    try {
      const whole = JSON.parse(s.slice(0, lastSectionEnd + 1) + ']')
      if (Array.isArray(whole)) sections.push(...whole)
    } catch { /* nothing whole to keep */ }
  }
  // The section the cut landed in: keep the questions that finished.
  if (openSection > lastSectionEnd && lastQuestionEnd > openSection) {
    try {
      const partial = JSON.parse(s.slice(openSection, lastQuestionEnd + 1) + ']}')
      if (partial?.questions?.length) sections.push(partial)
    } catch { /* nothing whole to keep */ }
  }
  return { sections, truncated: true }
}

/**
 * What a question may be, and how to tell, for each kind of booklet.
 *
 * A maths booklet and a reading booklet look the same to a parser - a question
 * followed by ruled lines - and mean different things by it. In maths the lines
 * are for working towards one right answer; in reading they are for an answer
 * in the student's own words. Asking which kind of booklet it is, once, at
 * import, settles every question on every page.
 */
const SUBJECT_RULES = {
  maths: `THIS IS A MATHS BOOKLET. Every question has one right answer.

- Nearly everything here is "mcq". A question with printed options keeps them. A question with none - "find the value of x", "calculate the total", "write the ratio", "simplify", a worded problem, fill in the blank, true or false - is still "mcq": solve it, then give it the correct answer plus three or four plausible wrong ones. The best wrong answers are the mistakes students actually make: forgetting to simplify, the wrong operation, off by one, the right number in the wrong units.
- "free-response" only where the question asks for reasoning in words rather than an answer - "explain why", "justify your answer", "describe the pattern you notice". These cannot be marked by a single value. Give each one a modelAnswer saying what the reasoning must contain.
- There is no "writing" question in a maths booklet. Never return one.
- Solve every problem carefully before choosing correctIndex, and check the arithmetic on ratios, fractions and percentages twice.
- The parser mangles maths notation. Reconstruct it from context: "37" in a fractions section is likely "3/7", "x2" is likely "x²".`,

  english: `THIS IS AN ENGLISH, READING OR VOCABULARY BOOKLET.

- "mcq" where the question prints options to choose between: a) b) c) d), (1)(2)(3)(4), or A B C D. Keep the printed options and work out which is right.
- "free-response" where a question is followed by ruled lines or blank space and prints no options - under headings like "Write your response", "Answer the questions", "Explain", or simply a numbered question with lines beneath it. This is the common shape in these booklets and must not be given invented options. Give each one a modelAnswer, drawn from the passage, saying what a correct answer has to contain.
- "writing" for one long task: an essay, a story, a letter, a composition, a whole page or most of one. There is usually one at most.
- A passage with numbered gaps and a list of words or letters to choose from: one "mcq" per gap, the listed words as its options.
- For vocabulary, synonym, antonym and word-meaning questions: name the word in the question text so it stands alone, and make the wrong options real words of the same part of speech.
- A question asking the student to rewrite a sentence using a given word is "free-response": the modelAnswer is the rewritten sentence.

A WEEK'S BOOKLET IS FIVE DAYS OF WORK, and the pages say which day they are: a corner marker reading "DAY 1", "Day 2", "WEEK 11 DAY 3" or similar. That marker starts a day and everything after it belongs to that day until the next marker appears, however many pages later.

Where a booklet is marked out in days, the day IS the section: give every question from a marker the sectionTitle "Day 1", "Day 2" and so on, exactly in that form, so the pages of one day come together as one quiz however they were read. Do not invent a different title for a page in the middle of a day, and do not split a day into smaller sections.

Where a booklet carries no day markers at all, title the sections by their printed headings as usual.`,

  mixed: `THIS BOOKLET MIXES SUBJECTS. Decide question by question.

- "mcq" where options are printed, and for any question whose answer is a single number, value or word even if no options are printed - solve it and supply the correct answer with three or four plausible wrong ones.
- "free-response" where the answer is in sentences, in the student's own words, with ruled lines and no options.
- "writing" for one long task taking a whole page or most of one.
- A passage with numbered gaps and a word list: one "mcq" per gap.`,
}

function buildPrompt(pdfText, chunkInfo, subject) {
  // A day runs over several pages and the pages are read a few at a time, so a
  // batch can begin in the middle of one with no marker on it. The day the last
  // batch ended in is carried over, or its questions would be filed under a
  // heading invented for whichever page happened to come first.
  const carried = chunkInfo?.carryDay
    ? `The pages before this batch were ${chunkInfo.carryDay}. Any question here that comes before the next day marker belongs to ${chunkInfo.carryDay}.\n`
    : ''
  const chunkNote = chunkInfo
    ? `\nYou are processing pages ${chunkInfo.from}-${chunkInfo.to} of ${chunkInfo.total}. Extract ALL questions from these pages — do not summarise or skip any.\n${carried}`
    : ''

  return `You are analyzing a tutoring booklet PDF for primary/high school students. The text was extracted by a PDF parser, so it may be garbled, incomplete, or poorly formatted. Your job is to reconstruct and complete every question, then organize them into sections.
${chunkNote}
CRITICAL: Extract EVERY SINGLE question you find. Do NOT skip questions, do NOT summarise, do NOT abbreviate. If there are 35 questions in a section, return all 35.

${SUBJECT_RULES[subject] || SUBJECT_RULES.mixed}

SEPARATE THE PASSAGE FROM THE QUESTION. A booklet asks several questions about one passage, poem, extract, poster or diagram. The student reads that on one side of the screen and answers on the other, so the two must come back apart:

- "passage" — the text the question is about, in full, exactly as printed. The same passage is repeated on every question that asks about it, so each question stands on its own. Leave it out for a question that needs nothing to read: a grammar item, a standalone sum, a vocabulary item with its own sentence.
- "text" — the question itself and nothing else. "Why does the writer say his siblings did not have a real childhood?" — not the passage, and not the instruction line that introduced the set ("Read the text below and answer questions 1 to 8").

The instruction line that introduces a set of questions is not a question. Do not return it as one, and do not put it in "text".

FOR A FREE-RESPONSE QUESTION, also write "modelAnswer": the answer you would put in a marking guide, in one or two sentences, drawn from the passage or the question itself. It is what the student's answer is marked against, so it must say what a correct answer has to contain. Set "marks" to 1, or 2 where the question plainly asks for two things ("give two reasons").

RULES:
1. SKIP all teaching content, instructional text, worked examples, and explanations. Only extract actual questions students must answer.
2. SKIP cover pages, table of contents, and headers/footers.
3. Group questions by their section in the booklet (e.g. "Diagnostic Test", "Ratios 1.1 Practice", "Synonyms Practice", "Extra Drill A").
4. Each section becomes a separate quiz — give it a clear sectionTitle.
4a. SECTION TITLES MUST BE STABLE. Copy the heading printed in the booklet verbatim, with no page numbers, no "(continued)", no "Part 2", no "cont." - a section carrying on from an earlier page keeps exactly the title it had there. Pages reach you in batches, and titles differing by so much as a word are filed as separate quizzes.
4b. If a batch of pages has no printed heading, use "Questions" rather than inventing a name.

QUESTION QUALITY — THIS IS CRITICAL:
- Some MCQ questions may have options that don't match the question, are nonsensical, or where none of the listed options is actually correct. CHECK every MCQ: solve the problem yourself first, then verify the correct answer exists in the options. If the options are wrong or mismatched, REPLACE them with correct, plausible options (1 correct + 3-4 distractors).
- Some questions may have impossible, contradictory, or nonsensical conditions (e.g. impossible maths, contradictory setup). If a question's premise is broken, REWRITE it so it makes sense while keeping the same topic/concept, then set needsReview to true and set reviewReason to explain what you changed (e.g. "Original had impossible values, rewritten with valid numbers").
- PDF text extraction may mangle maths formatting. Reconstruct garbled text using context (e.g. "37" in a fractions section is likely "3/7"). Write all questions in clean, student-readable text.
- If a question is too broken to confidently fix, set needsReview to true and set reviewReason to explain the issue.

FOR EACH QUESTION:
5. If the question has listed options (A/B/C/D/E or a/b/c/d): solve the problem first, then check the options are valid. If the correct answer is missing from the options or options don't make sense, generate new correct options. Set correctIndex (0-based).
6. If the question offers no options, it is a "free-response" question. Keep it as one and write its modelAnswer. Do not invent options for it.
7. If the question references an image, diagram, figure, shape drawing, coordinate grid, or any visual element you cannot see in the text, set needsReview to true and set reviewReason to "References an image/diagram not available in text". Do NOT add any labels like "[Image]" to the question text — keep the text clean.
8. For True/False questions: options should be ["True", "False"].
9. For fill-in-the-blank questions: rephrase as a clear question with MCQ options.

Return ONLY a JSON array of sections, no other text:
[
  {
    "sectionTitle": "Diagnostic Test",
    "questions": [
      {
        "number": 1,
        "type": "mcq",
        "passage": "The full text the question is about, repeated on each question about it. Omitted when the question needs nothing to read.",
        "text": "The question itself, and nothing else (clean, complete, student-readable — NO labels like [Rewritten] or [Image])",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctIndex": 2,
        "needsReview": false,
        "reviewReason": "",
        "originalType": "mcq"
      },
      {
        "number": 2,
        "type": "free-response",
        "text": "Why do pitchers like to throw breaking balls?",
        "modelAnswer": "Because they are difficult for batters to follow.",
        "marks": 1,
        "needsReview": false,
        "reviewReason": "",
        "originalType": "free-response"
      }
    ]
  }
]

type values: "mcq", "free-response", "writing". A "writing" question needs only its text; it is marked by a teacher. Only an "mcq" carries options and correctIndex. Only a "free-response" carries modelAnswer and marks.

originalType values: "mcq", "free-response", "fill-in-blank", "true-false", "writing"

Here is the extracted PDF text:

${pdfText}`
}

/**
 * One analysis call. Says what happened instead of returning an empty list, so
 * a chunk can never go missing without the teacher hearing about it.
 * @returns {Promise<{ sections: object[], truncated: boolean }>}
 */
async function callAI(prompt) {
  const response = await authedFetch('/api/claude/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`AI request failed (${response.status}): ${err}`)
  }

  const result = await response.json()
  const text = result.content?.[0]?.text || ''
  const { sections, truncated } = salvageSections(text)
  return { sections, truncated: truncated || result.stop_reason === 'max_tokens' }
}

/**
 * A section running over a chunk boundary comes back named a little differently
 * each time - "Synonyms Practice", then "Synonyms Practice (continued)". Keyed
 * on the raw title those became separate quizzes, which is how a 36-page
 * booklet arrived as a handful of five-question offcuts.
 */
function sectionKey(title) {
  return String(title)
    .toLowerCase()
    .replace(/\((?:cont(?:inued|\.)?|part\s*\d+)\)/g, '')
    .replace(/\b(?:cont(?:inued|\.)?|part\s*\d+|pages?\s*\d+(?:\s*[-–]\s*\d+)?)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function mergeSections(allChunks) {
  const map = new Map()
  for (const chunk of allChunks) {
    for (const section of chunk) {
      if (!section.sectionTitle || !section.questions?.length) continue
      const key = sectionKey(section.sectionTitle)
      if (!key) continue
      if (!map.has(key)) map.set(key, { ...section, questions: [] })
      map.get(key).questions.push(...section.questions)
    }
  }
  return [...map.values()]
}

/** The last day a batch was filing questions under, to carry to the next. */
function lastDaySeen(sections) {
  let found = null
  for (const section of sections || []) {
    const match = /\bday\s*(\d+)\b/i.exec(section?.sectionTitle || '')
    if (match) found = `Day ${match[1]}`
  }
  return found
}

function chunkText(chunk) {
  return chunk.map(p => `--- Page ${p.pageNum} ---\n${p.text}`).join('\n\n')
}

/**
 * Analyses one run of pages, halving it and asking again if the reply was cut
 * off. Whatever survived the cut is kept either way, so a retry can only add
 * questions, never lose them.
 */
async function analyseChunk(chunk, total, onProgress, warn, subject, carryDay, depth = 0) {
  const from = chunk[0].pageNum
  const to = chunk[chunk.length - 1].pageNum
  const label = from === to ? `page ${from}` : `pages ${from}-${to}`
  onProgress?.(`Analysing ${label}...`)

  let sections = []
  let truncated = false
  try {
    const res = await callAI(buildPrompt(chunkText(chunk), { from, to, total, carryDay }, subject))
    sections = res.sections
    truncated = res.truncated
  } catch (err) {
    warn(`${label}: ${err.message}`)
    if (chunk.length === 1) return []
    truncated = true
  }

  // A maths booklet has no long written task in it, and the rules say so - but
  // a page of prose questions picked up by mistake is read as one anyway, and a
  // writing question is marked by a teacher and worth nothing until they do.
  // So it is held to the rule here rather than only asked to follow it.
  if (subject === 'maths') {
    for (const sec of sections) {
      for (const q of sec.questions || []) {
        if (q?.type === 'writing') {
          q.type = 'free-response'
          q.needsReview = true
          q.reviewReason = q.reviewReason
            || 'Imported as a written answer: it reads as prose, which is unusual in a maths booklet.'
        }
      }
    }
  }

  const found = sections.reduce((n, sec) => n + (sec.questions?.length || 0), 0)

  if (truncated && chunk.length > 1 && depth < 3) {
    // More on these pages than one reply holds. Split, and ask about each half.
    onProgress?.(`${label} held more than one reply - splitting...`)
    const halves = []
    const mid = Math.ceil(chunk.length / 2)
    for (const half of [chunk.slice(0, mid), chunk.slice(mid)]) {
      halves.push(...await analyseChunk(half, total, onProgress, warn, subject, carryDay, depth + 1))
    }
    const retried = halves.reduce((n, sec) => n + (sec.questions?.length || 0), 0)
    return retried >= found ? halves : sections
  }

  if (truncated) warn(`${label}: reply was cut off, ${found} question(s) recovered`)
  else if (!found) warn(`${label}: no questions found`)
  return sections
}

/**
 * @param {(msg: string) => void} [onWarn] told about any page that gave trouble
 * @param {'maths'|'english'|'mixed'} [subject] which kind of booklet this is
 */
export async function processWithAI(pages, onProgress, onWarn, subject = 'mixed') {
  const warn = (msg) => { console.warn('[pdfImport]', msg); onWarn?.(msg) }

  const chunks = []
  for (let i = 0; i < pages.length; i += CHUNK_SIZE) {
    chunks.push(pages.slice(i, i + CHUNK_SIZE))
  }

  const allResults = []
  let carryDay = null
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(`Analysing chunk ${i + 1} of ${chunks.length}...`)
    const sections = await analyseChunk(chunks[i], pages.length, onProgress, warn, subject, carryDay)
    allResults.push(sections)
    carryDay = lastDaySeen(sections) || carryDay
  }

  const merged = mergeSections(allResults)
  if (!merged.length) throw new Error('AI could not find any questions in this PDF.')
  return merged
}

