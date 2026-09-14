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

function buildPrompt(pdfText, chunkInfo) {
  const chunkNote = chunkInfo
    ? `\nYou are processing pages ${chunkInfo.from}-${chunkInfo.to} of ${chunkInfo.total}. Extract ALL questions from these pages — do not summarise or skip any.\n`
    : ''

  return `You are analyzing a maths tutoring booklet PDF for primary/high school students. The text was extracted by a PDF parser, so it may be garbled, incomplete, or poorly formatted. Your job is to reconstruct and complete every question, then organize them into sections.
${chunkNote}
CRITICAL: Extract EVERY SINGLE question you find. Do NOT skip questions, do NOT summarise, do NOT abbreviate. If there are 35 questions in a section, return all 35.

EVERY question must end up as multiple-choice with options and a correctIndex — regardless of whether the original had MCQ options or not. Open-ended questions, short answer, fill-in-blank, "find the value", "calculate", "write the ratio" — ALL of these must be converted to MCQ by generating plausible options.

RULES:
1. SKIP all teaching content, instructional text, worked examples, and explanations. Only extract actual questions students must answer.
2. SKIP cover pages, table of contents, and headers/footers.
3. Group questions by their section in the booklet (e.g. "Diagnostic Test", "Ratios 1.1 Practice", "Problem Solving", "Extra Drill A").
4. Each section becomes a separate quiz — give it a clear sectionTitle.

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

IMPORTANT MATHS RULES:
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

async function callAI(prompt, onProgress) {
  const response = await authedFetch('/api/claude/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16384,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`AI request failed (${response.status}): ${err}`)
  }

  const result = await response.json()
  const text = result.content?.[0]?.text || ''

  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  try {
    return JSON.parse(jsonMatch[0])
  } catch {
    return []
  }
}

function mergeSections(allChunks) {
  const map = {}
  for (const chunk of allChunks) {
    for (const section of chunk) {
      if (!section.sectionTitle || !section.questions?.length) continue
      if (!map[section.sectionTitle]) {
        map[section.sectionTitle] = { ...section, questions: [] }
      }
      map[section.sectionTitle].questions.push(...section.questions)
    }
  }
  return Object.values(map)
}

export async function processWithAI(pages, onProgress) {
  if (pages.length <= CHUNK_SIZE) {
    const fullText = pages.map(p => `--- Page ${p.pageNum} ---\n${p.text}`).join('\n\n')
    onProgress?.('Analysing PDF with AI...')
    const sections = await callAI(buildPrompt(fullText, null), onProgress)
    if (!sections.length) throw new Error('AI could not find any questions in this PDF.')
    return sections
  }

  const chunks = []
  for (let i = 0; i < pages.length; i += CHUNK_SIZE) {
    chunks.push(pages.slice(i, i + CHUNK_SIZE))
  }

  const allResults = []
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const from = chunk[0].pageNum
    const to = chunk[chunk.length - 1].pageNum
    onProgress?.(`Analysing pages ${from}-${to} (chunk ${i + 1}/${chunks.length})...`)
    const text = chunk.map(p => `--- Page ${p.pageNum} ---\n${p.text}`).join('\n\n')
    const result = await callAI(buildPrompt(text, { from, to, total: pages.length }), onProgress)
    allResults.push(result)
  }

  const merged = mergeSections(allResults)
  if (!merged.length) throw new Error('AI could not find any questions in this PDF.')
  return merged
}
