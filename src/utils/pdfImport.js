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

function buildPrompt(pdfText, chunkInfo) {
  const chunkNote = chunkInfo
    ? `\nYou are processing pages ${chunkInfo.from}-${chunkInfo.to} of ${chunkInfo.total}. Extract ALL questions from these pages — do not summarise or skip any.\n`
    : ''

  return `You are analyzing a tutoring booklet PDF for primary/high school students. It may be maths, English, vocabulary, comprehension, science, or a mix. The text was extracted by a PDF parser, so it may be garbled, incomplete, or poorly formatted. Your job is to reconstruct and complete every question, then organize them into sections.
${chunkNote}
CRITICAL: Extract EVERY SINGLE question you find. Do NOT skip questions, do NOT summarise, do NOT abbreviate. If there are 35 questions in a section, return all 35.

EVERY question must end up as multiple-choice with options and a correctIndex — regardless of whether the original had MCQ options or not. Open-ended questions, short answer, fill-in-blank, "find the value", "calculate", "write the ratio" — ALL of these must be converted to MCQ by generating plausible options.

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
6. If the question is free-response (no options given): solve the problem, generate 4 plausible wrong answers plus the correct answer (4-5 options total). Place the correct answer at a varied position. Common student mistakes make the best wrong answers.
7. If the question references an image, diagram, figure, shape drawing, coordinate grid, or any visual element you cannot see in the text, set needsReview to true and set reviewReason to "References an image/diagram not available in text". Do NOT add any labels like "[Image]" to the question text — keep the text clean.
8. For True/False questions: options should be ["True", "False"].
9. For fill-in-the-blank questions: rephrase as a clear question with MCQ options.

IMPORTANT SUBJECT RULES:
- For vocabulary, synonym/antonym, word-meaning and comprehension questions: name the word or passage in the question text so the question stands alone, and make distractors real words of the same part of speech.

FOR MATHS QUESTIONS:
- Solve each problem carefully, showing your work mentally before choosing correctIndex.
- For ratios, fractions, percentages: double-check your arithmetic.
- Generate plausible distractors — common mistakes students make (e.g. forgetting to simplify, wrong operation, off-by-one).

Return ONLY a JSON array of sections, no other text:
[
  {
    "sectionTitle": "Diagnostic Test",
    "questions": [
      {
        "number": 1,
        "text": "The question text here (clean, complete, student-readable — NO labels like [Rewritten] or [Image])",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctIndex": 2,
        "needsReview": false,
        "reviewReason": "",
        "originalType": "mcq"
      }
    ]
  }
]

originalType values: "mcq", "free-response", "fill-in-blank", "true-false"

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

function chunkText(chunk) {
  return chunk.map(p => `--- Page ${p.pageNum} ---\n${p.text}`).join('\n\n')
}

/**
 * Analyses one run of pages, halving it and asking again if the reply was cut
 * off. Whatever survived the cut is kept either way, so a retry can only add
 * questions, never lose them.
 */
async function analyseChunk(chunk, total, onProgress, warn, depth = 0) {
  const from = chunk[0].pageNum
  const to = chunk[chunk.length - 1].pageNum
  const label = from === to ? `page ${from}` : `pages ${from}-${to}`
  onProgress?.(`Analysing ${label}...`)

  let sections = []
  let truncated = false
  try {
    const res = await callAI(buildPrompt(chunkText(chunk), { from, to, total }))
    sections = res.sections
    truncated = res.truncated
  } catch (err) {
    warn(`${label}: ${err.message}`)
    if (chunk.length === 1) return []
    truncated = true
  }

  const found = sections.reduce((n, sec) => n + (sec.questions?.length || 0), 0)

  if (truncated && chunk.length > 1 && depth < 3) {
    // More on these pages than one reply holds. Split, and ask about each half.
    onProgress?.(`${label} held more than one reply - splitting...`)
    const halves = []
    const mid = Math.ceil(chunk.length / 2)
    for (const half of [chunk.slice(0, mid), chunk.slice(mid)]) {
      halves.push(...await analyseChunk(half, total, onProgress, warn, depth + 1))
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
 */
export async function processWithAI(pages, onProgress, onWarn) {
  const warn = (msg) => { console.warn('[pdfImport]', msg); onWarn?.(msg) }

  const chunks = []
  for (let i = 0; i < pages.length; i += CHUNK_SIZE) {
    chunks.push(pages.slice(i, i + CHUNK_SIZE))
  }

  const allResults = []
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(`Analysing chunk ${i + 1} of ${chunks.length}...`)
    allResults.push(await analyseChunk(chunks[i], pages.length, onProgress, warn))
  }

  const merged = mergeSections(allResults)
  if (!merged.length) throw new Error('AI could not find any questions in this PDF.')
  return merged
}

