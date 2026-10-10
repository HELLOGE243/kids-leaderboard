import { authedFetch } from '../data/auth.js'

/**
 * JSON.parse for model output that contains LaTeX.
 *
 * A model asked for \(3 	imes 4\) inside a JSON string writes a single
 * backslash, which is not a legal JSON escape, and the whole reply fails to
 * parse. Any backslash that does not begin a legal escape is doubled before
 * parsing, so the maths survives and the JSON is valid.
 */
export function parseJsonLoose(text) {
  try {
    return JSON.parse(text)
  } catch {
    // A model asked for LaTeX writes a single backslash inside a JSON string -
    // \times, \frac, \( - which is not a legal JSON escape, so the whole reply
    // fails to parse. Those backslashes are doubled and the maths survives.
    //
    // \t and \f are legal JSON escapes AND the start of \times and \frac, so
    // the next characters decide: a run of two or more letters is a LaTeX
    // command, a lone escape character is JSON's own.
    const slash = String.fromCharCode(92)
    const jsonEscapes = ['"', slash, '/', 'b', 'f', 'n', 'r', 't', 'u']
    const isLetter = (ch) => !!ch && ch >= 'a' && ch <= 'z' || !!ch && ch >= 'A' && ch <= 'Z'
    let out = ''
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch !== slash) { out += ch; continue }
      const next = text[i + 1]
      const latexCommand = isLetter(next) && isLetter(text[i + 2])
      if (!latexCommand && jsonEscapes.includes(next)) out += ch
      else out += slash + slash
    }
    return JSON.parse(out)
  }
}

export async function checkExplanation({ questionText, correctAnswer, officialExplanation, studentReason, studentExplanation }) {
  const explanationContext = officialExplanation
    ? `\nOfficial explanation (written by the teacher): "${officialExplanation}"\nThe student's explanation MUST align with the key concepts in the official explanation to be considered coherent.`
    : ''

  const prompt = `You are a strict but friendly tutor helping a primary/high school student review a quiz question they got wrong. Your job is to detect whether they GENUINELY understand or are BLUFFING.

Question: ${questionText}
Correct answer: ${correctAnswer}${explanationContext}
Student said they got it wrong because: "${studentReason}"
Student's explanation of why the correct answer is right: "${studentExplanation}"

Evaluate carefully. A student is BLUFFING if they:
- Give a vague or generic answer like "because it's the right one" or "it makes sense"
- Just restate the answer without explaining WHY it's correct
- Use filler words without real substance
- Copy/paste the question or answer back without adding reasoning
- Say something completely unrelated to the question
- Give an extremely short non-answer (less than ~10 words of real content)
- Don't mention any of the key concepts from the official explanation

A GENUINE explanation shows they understand the specific reasoning behind why this answer is correct, even if their grammar or wording is imperfect. It should touch on the same core idea as the official explanation.

Reply with a JSON object only, no other text:
{"coherent": true/false, "reply": "your short message (1-2 sentences max)"}

If coherent is false, identify which key idea from the official explanation the student is MISSING and give a targeted hint about that specific concept. Do NOT reveal the answer — just point them in the right direction. For example: "You're close, but think about what happens to X when Y changes." Be encouraging but firm. Keep language simple and age-appropriate.`

  try {
    const res = await authedFetch('/api/claude/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return fallbackCheck(studentExplanation, correctAnswer, officialExplanation)
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return parseJsonLoose(match[0])
    return fallbackCheck(studentExplanation, correctAnswer, officialExplanation)
  } catch {
    return fallbackCheck(studentExplanation, correctAnswer, officialExplanation)
  }
}

function fallbackCheck(explanation, correctAnswer, officialExplanation) {
  const words = explanation.trim().split(/\s+/)
  const lower = explanation.toLowerCase()

  const bluffPhrases = ['because it is', 'it\'s correct', 'it makes sense', 'it\'s the right', 'because it\'s right', 'i think so', 'just because', 'idk', 'i don\'t know', 'no reason', 'i forgot', 'not sure', 'dont know', 'don\'t know']
  const isBluff = bluffPhrases.some((p) => lower.includes(p))

  if (words.length < 8) {
    return { coherent: false, reply: "That's too short! Write at least a couple of sentences explaining WHY this is the correct answer. Really think about it!" }
  }
  if (isBluff) {
    return { coherent: false, reply: "Hmm, it sounds like you might be guessing. Try to explain the specific reason — what makes this answer different from the others?" }
  }

  if (officialExplanation) {
    const keyWords = officialExplanation.toLowerCase().split(/\s+/).filter((w) => w.length > 4)
    const matchCount = keyWords.filter((w) => lower.includes(w)).length
    const matchRatio = keyWords.length > 0 ? matchCount / keyWords.length : 0
    if (matchRatio < 0.3) {
      return { coherent: false, reply: "You're on the right track, but your explanation doesn't quite cover the key idea. Think about what specifically makes this answer correct — what's the main concept?" }
    }
  } else {
    const answerWords = correctAnswer.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
    const mentionsAnswer = answerWords.some((w) => lower.includes(w))
    if (!mentionsAnswer) {
      return { coherent: false, reply: `Almost there! Try to explain what makes "${correctAnswer}" the right choice specifically. What's the reasoning behind it?` }
    }
  }

  if (words.length < 15) {
    return { coherent: false, reply: "Good start, but can you explain a bit more? Try to give a fuller explanation of why this is the correct answer." }
  }

  return { coherent: true, reply: "Nice work! You clearly understand why that's the correct answer. Keep it up!" }
}

/**
 * Marks a student's definition of one word from a cloze gap. Definitions are
 * what a cloze question is really testing, so this is deliberately stricter
 * than a spelling check and more forgiving than a dictionary match: the idea
 * has to be right, the wording does not.
 * @returns {Promise<{ok:boolean, reply:string}>}
 */
export async function checkDefinition({ word, context, studentDefinition }) {
  const text = (studentDefinition || '').trim()
  if (text.length < 3) return { ok: false, reply: 'Write a little more - what does the word actually mean?' }

  const prompt = `A student aged 8-13 is defining a word from a cloze passage. Decide whether their definition shows they know what the word means.

Word: "${word}"${context ? `
The sentence it came from: "${context}"` : ''}
Student's definition: "${text}"

Accept it when the core meaning is right, even if the grammar, spelling or wording is childlike or imprecise. A synonym plus a little explanation is fine.
Reject it when it is circular ("it means ${word}"), a guess, unrelated, copied from the sentence without saying what the word means, or so vague it shows nothing ("it's a thing", "good word").

Reply with a JSON object only, no other text:
{"ok": true/false, "reply": "one short sentence"}

When ok is false, give a hint about the kind of meaning to aim for without stating the definition. Be warm and brief.
Write any number or fraction as LaTeX between \\( and \\).`

  try {
    const res = await authedFetch('/api/claude/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`API ${res.status}`)
    const data = await res.json()
    const raw = data.content?.[0]?.text || ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('no JSON')
    const parsed = parseJsonLoose(match[0])
    return { ok: !!parsed.ok, reply: parsed.reply || (parsed.ok ? 'That works.' : 'Try again.') }
  } catch (e) {
    console.error('[AI] checkDefinition failed:', e)
    // Never block a student on an API failure: accept anything they clearly
    // wrote themselves, and say so plainly.
    return { ok: text.split(/\s+/).length >= 4, reply: text.split(/\s+/).length >= 4 ? 'Marked offline - accepted.' : 'Write a fuller sentence.' }
  }
}

export function parseExplanation(exp) {
  if (!exp) return { general: '', options: {} }
  try {
    const parsed = JSON.parse(exp)
    return { general: parsed.general || '', options: parsed.options || {} }
  } catch {
    return { general: String(exp), options: {} }
  }
}

export function serializeExplanation(obj) {
  return JSON.stringify({ general: obj.general || '', options: obj.options || {} })
}

export async function generateShadowClones({ questionText, options, correctIndex, correctAnswer }) {
  const optionsList = options.filter(Boolean).map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n')

  const prompt = `You are creating 2 "Shadow Clone" practice questions for a primary/high school student (ages 8-13) who got a question wrong. The clones test the SAME underlying concept but at different difficulty levels.

Original question: "${questionText}"
Options:
${optionsList}
Correct answer: ${correctAnswer}

Create exactly 2 multiple-choice questions testing the same concept:
1. EASY — uses the basic idea in a simpler, more obvious way. The correct answer should be clearly right.
2. HARD — a challenging twist on the concept with a fresh scenario. Must be harder than the original.

QUALITY RULES (especially for the HARD question):
- The correct answer MUST be unambiguously, factually correct. Double-check it.
- Every distractor must be clearly wrong — no trick answers, no debatable options.
- The question text must be clear and self-contained. A student should not need extra context.
- If the concept is maths, ensure all numbers and working are correct.
- Do NOT create questions where multiple options could be argued as correct.

Return a JSON array of exactly 2 objects. Each object has:
- "text": the question text (HTML allowed: <b>, <i>, <u>)
- "options": array of exactly 4 answer strings
- "correctIndex": 0-3 (index of correct answer)
- "difficulty": "easy" or "hard"

RULES:
- Return ONLY the JSON array. No other text.
- Use simple, age-appropriate language.
- Each question MUST have exactly 4 options.
- The questions should feel fresh, not just reworded copies.`

  try {
    const res = await authedFetch('/api/claude/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\[[\s\S]*\]/)
    if (match) return parseJsonLoose(match[0])
    return null
  } catch {
    return null
  }
}

export async function generateVocabExercise(words) {
  const wordList = words.map(w => `${w.word}: ${w.definition}`).join('\n')
  const prompt = `Generate 6 vocabulary exercises for a Year 5-6 student using these words from their vocabulary bank:

${wordList}

Return a JSON array of 6 exercise objects. Mix these types:
1. "cloze" — a sentence with a blank, student picks the correct word. Include 4 options.
2. "definition" — given a definition, pick the matching word. Include 4 options.
3. "sentence" — given a word, pick the sentence that uses it correctly. Include 3 options.

Each object:
{
  "type": "cloze" | "definition" | "sentence",
  "question": "the question text (for cloze, use ___ for the blank)",
  "options": ["option1", "option2", ...],
  "correctIndex": 0-3,
  "word": "the target word"
}

Return ONLY the JSON array, no other text. Make exercises age-appropriate and the distractors plausible but clearly wrong.`

  try {
    const res = await authedFetch('/api/claude/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return []
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\[[\s\S]*\]/)
    if (match) return parseJsonLoose(match[0])
    return []
  } catch {
    return []
  }
}

export async function generateGrammarExercises() {
  const prompt = `Generate 8 grammar and punctuation exercises for Year 5-6 students. Mix these types:
1. "correction" — a sentence with ONE error (grammar, spelling, or punctuation). Student picks the corrected version. 4 options.
2. "punctuation" — a sentence missing punctuation. Student picks the correctly punctuated version. 4 options.
3. "tense" — a sentence with the wrong verb tense. Student picks the correct tense. 4 options.

Each object:
{
  "type": "correction" | "punctuation" | "tense",
  "question": "the question or prompt",
  "options": ["option1", "option2", "option3", "option4"],
  "correctIndex": 0-3,
  "explanation": "brief explanation of the correct answer (1 sentence)"
}

Return ONLY a JSON array. Make questions age-appropriate. Distractors should be plausible but clearly wrong to someone who knows the rule.`

  try {
    const res = await authedFetch('/api/claude/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return []
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\[[\s\S]*\]/)
    if (match) return parseJsonLoose(match[0])
    return []
  } catch {
    return []
  }
}

export async function generateWritingSuggestions(studentText, rubricCategories) {
  const catDescriptions = rubricCategories.map(c => `${c.name}: ${c.criteria.join('; ')}`).join('\n')
  const prompt = `You are a Year 5-6 writing teacher reviewing a student's writing response. Analyse the writing and suggest specific improvements.

Student's writing:
"""
${studentText}
"""

Marking rubric categories:
${catDescriptions}

Return a JSON array of 4-8 suggestions. Each suggestion:
{
  "category": "content|structure|vocabulary|fluency|mechanics",
  "issue": "what's wrong (specific, 1 sentence)",
  "suggestion": "how to fix it (specific, 1 sentence)",
  "excerpt": "the exact phrase or sentence from the student's text this applies to"
}

Focus on:
- Spelling and grammar mistakes
- Weak vocabulary that could be upgraded
- Sentence structure improvements
- Missing punctuation
- Logical flow issues

Keep language simple — a teacher should instantly understand each suggestion.
Return ONLY the JSON array, no other text.`

  try {
    const res = await authedFetch('/api/claude/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return []
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\[[\s\S]*\]/)
    if (match) return parseJsonLoose(match[0])
    return []
  } catch {
    return []
  }
}

/** The words out of a rich-text answer, for putting in a prompt. */
function plainWords(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Marks a piece of writing, against the pieces already marked for the question
 * where there are any.
 *
 * @param {Array} [exemplars] previously marked pieces, from getWritingExemplars
 */
export async function generateAiMark(studentText, rubricCategories, preAnalysis, exemplars = []) {
  const catDescriptions = rubricCategories.map(c => `- ${c.key}: "${c.name}" — criteria: ${c.criteria.join('; ')}`).join('\n')
  const contextNote = preAnalysis ? `Your prior analysis of this writing: style="${preAnalysis.style}", level="${preAnalysis.level}", strengths="${preAnalysis.strengths}", weaknesses="${preAnalysis.weaknesses}".` : ''

  // A mark means nothing on its own. Where other answers to this same question
  // have been marked, they are the standard this one is measured against.
  const anchors = (exemplars || []).map((ex, i) => {
    const perCat = (ex.categories || [])
      .map((c) => `${c.key} ${c.score}/5`).join(', ')
    return `Reference piece ${i + 1} - awarded ${ex.totalScore}/25 (${perCat}):
"""
${plainWords(ex.studentText).slice(0, 2200)}
"""`
  }).join('\n\n')

  const calibration = anchors ? `
ALREADY MARKED FOR THIS SAME QUESTION — these are your standard:

${anchors}

Mark the new piece on the same scale as those. A piece clearly better written than a reference piece must score higher than it, and one clearly weaker must score lower; a piece of much the same standard gets much the same mark. Say in "calibration" how the new piece sits against them.

Then check the references themselves. If reading them together shows one was marked too generously or too harshly against the others, list it under "inconsistencies" with the mark you would give it and one sentence of why. Judge only what the writing shows, and leave out any reference you consider correctly marked — an empty list is the right answer when the marking is consistent.
` : ''

  const prompt = `You are a nurturing, supportive Year 5-6 writing teacher marking a student's work. Be encouraging and positive — celebrate what the student did well, and frame improvements gently as next steps.

Student's writing:
"""
${studentText}
"""

${contextNote}

${calibration}
Rubric categories (each scored 1-5, where 1=Beginning, 2=Developing, 3=Competent, 4=Proficient, 5=Advanced):
${catDescriptions}

For each category, give a score (1-5) and a short nurturing comment (1-2 sentences). Start with what the student did well, then suggest one area to grow. Be specific — reference actual parts of their writing.

Also write an overall comment (2-3 sentences) that is warm, encouraging, and highlights the student's strengths while giving one clear next step.

Return ONLY a JSON object:
{
  "categories": [
    { "key": "content", "score": 4, "comment": "..." },
    { "key": "structure", "score": 3, "comment": "..." },
    { "key": "vocabulary", "score": 3, "comment": "..." },
    { "key": "fluency", "score": 4, "comment": "..." },
    { "key": "mechanics", "score": 3, "comment": "..." }
  ],
  "overallComment": "...",
  "calibration": "One sentence on how this piece sits against the reference pieces, or \"\" if there were none.",
  "inconsistencies": [
    { "reference": 1, "suggestedTotal": 17, "categories": [{ "key": "content", "score": 3 }], "reason": "..." }
  ]
}`

  try {
    const res = await authedFetch('/api/claude/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        // The reference pieces are in the question, so there is more to read
        // and a little more to say about where this one sits.
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = parseJsonLoose(match[0])
    if (!parsed) return null
    // An inconsistency is about one of the pieces we sent, so carry the
    // attempt it belongs to back with it.
    parsed.inconsistencies = (Array.isArray(parsed.inconsistencies) ? parsed.inconsistencies : [])
      .map((item) => {
        const ref = exemplars[(Number(item.reference) || 0) - 1]
        if (!ref) return null
        return {
          attemptId: ref.attemptId,
          studentId: ref.studentId,
          was: ref.totalScore,
          suggestedTotal: Number(item.suggestedTotal) || 0,
          categories: Array.isArray(item.categories) ? item.categories : [],
          reason: item.reason || '',
        }
      })
      .filter(Boolean)
      .filter((item) => item.suggestedTotal > 0 && item.suggestedTotal !== item.was)
    return parsed
  } catch {
    return null
  }
}

/**
 * Marks a student's rewrite with their first attempt in front of it.
 *
 * The point is not the mark on its own but the distance travelled: the model is
 * shown both pieces and what the first scored, so the new score is on the same
 * scale and the feedback can say what actually changed.
 *
 * @returns {Promise<object|null>} categories, overallComment, improvement, improved[], stillToWork[]
 */
export async function remarkWritingRewrite(originalText, rewriteText, rubricCategories, originalMark) {
  const catDescriptions = rubricCategories
    .map(c => `- ${c.key}: "${c.name}" — criteria: ${c.criteria.join('; ')}`).join('\n')
  const firstScores = (originalMark?.categories || [])
    .map(c => `${c.key} ${c.score}/5`).join(', ')
  const teacherNotes = (originalMark?.categories || [])
    .filter(c => c.comment)
    .map(c => `- ${c.key}: ${c.comment}`).join('\n')

  const prompt = `You are a nurturing Year 5-6 writing teacher. A student has read your feedback on a piece of writing and written it again. Mark the new version, and tell them what changed.

THEIR FIRST VERSION — scored ${originalMark?.totalScore ?? '?'}/25 (${firstScores}):
"""
${plainWords(originalText)}
"""

The feedback they were given on it:
${teacherNotes || '(none recorded)'}
${originalMark?.overallComment ? `Overall: ${originalMark.overallComment}` : ''}

THEIR REWRITE:
"""
${plainWords(rewriteText)}
"""

Rubric categories (each scored 1-5, where 1=Beginning, 2=Developing, 3=Competent, 4=Proficient, 5=Advanced):
${catDescriptions}

Mark the rewrite on the same scale you marked the first version on. Be honest: a category only goes up where the writing genuinely got better, it stays the same where it did not, and it goes down if something that worked before has been lost. Praise what improved, in their own words where you can quote them.

Then say in one or two warm sentences what changed overall, list the things they clearly improved, and list what is still worth working on next time.

Return ONLY a JSON object:
{
  "categories": [
    { "key": "content", "score": 4, "comment": "..." },
    { "key": "structure", "score": 3, "comment": "..." },
    { "key": "vocabulary", "score": 3, "comment": "..." },
    { "key": "fluency", "score": 4, "comment": "..." },
    { "key": "mechanics", "score": 3, "comment": "..." }
  ],
  "overallComment": "...",
  "improvement": "One or two sentences on what changed between the two versions.",
  "improved": ["what they clearly did better", "..."],
  "stillToWork": ["what to aim for next time", "..."]
}`

  try {
    const res = await authedFetch('/api/claude/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = parseJsonLoose(match[0])
    if (!parsed) return null
    parsed.improved = Array.isArray(parsed.improved) ? parsed.improved : []
    parsed.stillToWork = Array.isArray(parsed.stillToWork) ? parsed.stillToWork : []
    return parsed
  } catch {
    return null
  }
}

/**
 * Marks short written answers against the answers the teacher wrote.
 *
 * Every question on the paper goes in one request, because a paper is handed in
 * all at once and a student should not wait on a round trip per question. The
 * marking is generous about wording and strict about substance: a short answer
 * is testing whether they know the thing, not whether they phrased it the way
 * the teacher did.
 *
 * @param {Array<{index:number, question:string, modelAnswer:string, marks:number, answer:string}>} items
 * @returns {Promise<Record<number, {score:number, comment:string}>>} by question index
 */
export async function markShortAnswers(items) {
  const asked = (items || []).filter((it) => String(it.answer || '').trim())
  if (!asked.length) return {}

  const body = asked.map((it) => `Question ${it.index + 1} (worth ${it.marks} mark${it.marks === 1 ? '' : 's'}):
${plainWords(it.question)}

The answer it should contain:
${plainWords(it.modelAnswer)}

What the student wrote:
${String(it.answer).slice(0, 1500)}`).join('\n\n---\n\n')

  const prompt = `You are marking short written answers on a Year 5-6 test. For each one, compare what the student wrote against the answer the teacher gave, and award the marks.

Mark on substance, not on wording. A student who has the right idea in their own words, or with a spelling slip, or more briefly than the teacher's answer, has earned the marks. A student who contradicts the answer, misses the part that was being tested, or writes something that only sounds similar has not. Where a question carries more than one mark, award part of them for an answer that gets part of the way.

Then write one short sentence to the student about it - warm, specific, and about their answer rather than about the marking.

${body}

Return ONLY a JSON object keyed by question number as written above:
{
  "1": { "score": 1, "comment": "..." },
  "2": { "score": 0, "comment": "..." }
}`

  try {
    const res = await authedFetch('/api/claude/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return {}
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return {}
    const parsed = parseJsonLoose(match[0])
    if (!parsed) return {}
    const out = {}
    for (const it of asked) {
      const got = parsed[String(it.index + 1)]
      if (!got) continue
      const score = Number(got.score)
      out[it.index] = {
        score: Number.isFinite(score) ? Math.max(0, Math.min(Math.round(score), it.marks)) : 0,
        comment: String(got.comment || ''),
      }
    }
    return out
  } catch {
    return {}
  }
}

export async function preAnalyseWriting(studentText) {
  const prompt = `You are an experienced Year 5-6 writing teacher. Read this student's writing carefully and prepare a brief internal analysis that will help you provide targeted feedback.

Student's writing:
"""
${studentText}
"""

Return ONLY a JSON object:
{
  "strengths": ["1-2 sentence strength"],
  "weaknesses": ["1-2 sentence area for improvement"],
  "style": "1 sentence describing the student's writing style/voice",
  "level": "beginner|developing|competent|proficient|advanced"
}
Keep it concise. This is for your own reference to give better feedback, not shown to the student.`

  try {
    const res = await authedFetch('/api/claude/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return parseJsonLoose(match[0])
    return null
  } catch {
    return null
  }
}

export async function generateAiAnnotation(fullText, selectedText, preAnalysis) {
  const contextNote = preAnalysis ? `Your prior analysis: style is "${preAnalysis.style}", level is "${preAnalysis.level}".` : ''
  const prompt = `You are a Year 5-6 writing teacher marking a student's work. You have highlighted a specific part and need feedback.

Full student writing:
"""
${fullText}
"""

${contextNote}

The teacher has highlighted this excerpt:
"""
${selectedText}
"""

Provide TWO things:
1. A short teacher comment explaining what could be improved about this highlighted section (1-2 sentences, constructive, age-appropriate)
2. A rephrased version of JUST the highlighted excerpt that improves it while keeping the student's voice and intent

Return ONLY a JSON object:
{
  "comment": "your teacher feedback comment",
  "rephrase": "the improved version of the highlighted text"
}
Do not change the meaning. Keep the student's voice. Fix grammar, vocabulary, sentence structure, or clarity issues.`

  try {
    const res = await authedFetch('/api/claude/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return parseJsonLoose(match[0])
    return null
  } catch {
    return null
  }
}

export async function generateExplanation({ questionText, options, correctIndex }) {
  const correctAnswer = options[correctIndex] || ''
  const optionsList = options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n')
  const optionKeys = options.map((_, i) => `"${String.fromCharCode(65 + i)}"`)

  const prompt = `You are a primary school teacher explaining a quiz question to a student aged 8-13. Write a structured explanation as a JSON object.

Question: "${questionText}"

Options:
${optionsList}

Correct answer: ${String.fromCharCode(65 + correctIndex)}) ${correctAnswer}

Return a JSON object with this EXACT structure:
{
  "general": "The overall concept explanation — teach the underlying idea needed to answer this. Walk through WHY the correct answer (${String.fromCharCode(65 + correctIndex)}) is right step by step. If maths, show the working. Use <b>bold</b> for key terms, <i>italic</i> for emphasis, and <u>underline</u> for critical points. Write 2-4 sentences.",
  "options": {
    ${options.map((o, i) => {
      const letter = String.fromCharCode(65 + i)
      if (i === correctIndex) {
        return `"${letter}": "Explain why <b>${o}</b> is the correct answer. What reasoning or logic confirms it? Be specific to the content. 1-3 sentences."`
      }
      return `"${letter}": "Explain why a student might pick <b>${o}</b> — what misunderstanding leads to it? Then explain why it doesn't work. Use 'You might have picked this because...' style. 1-3 sentences."`
    }).join(',\n    ')}
  }
}

RULES:
- Return ONLY the JSON object. No text before or after it.
- No titles, headers, or markdown. Only HTML tags: <b>, <i>, <u>.
- Use simple language a 10-year-old understands. Be warm and encouraging.
- Be SPECIFIC to the actual question content. Never give generic advice.
- Every option MUST have its own explanation.
- For maths questions, prefer plain-language explanations and arithmetic (e.g. "3 groups of 4 is 12"). Only use algebra or formal equations when the concept genuinely requires it.
- Write EVERY number, fraction, ratio, equation or piece of working as LaTeX between \\( and \\): for example \\(3 \\times 4 = 12\\), \\(\\frac{3}{4}\\), \\(15\\%\\), \\(2:3\\). Use \\[ ... \\] only for a line of working that deserves its own line. Never write a fraction as 3/4 in plain text.`

  try {
    const res = await authedFetch('/api/claude/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      console.error(`[AI] API error ${res.status}`)
      return { general: '', options: {} }
    }
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = parseJsonLoose(match[0])
      return { general: parsed.general || '', options: parsed.options || {} }
    }
    return { general: text, options: {} }
  } catch (e) {
    console.error('[AI] Fetch failed:', e)
    return { general: '', options: {} }
  }
}

/**
 * A dictionary entry for one word: what it means, what part of speech it is, and
 * two sentences that use it.
 *
 * The sentences are the point of the pair. The first gives almost nothing away —
 * the word could be many things — and the second surrounds it with enough that
 * its meaning can be worked out. Shown in that order while training, they let a
 * student reach for the word before being handed it.
 *
 * One call rather than three: the sentences have to agree with the definition.
 * @returns {Promise<{definition,partOfSpeech,sentenceLow,sentenceHigh}|null>}
 */
/**
 * Two sentences for a word whose meaning is already known.
 *
 * Used when the dictionary has the word: it gives a proper gloss but no examples,
 * and the examples are what a student practises against.
 * @returns {Promise<{sentenceLow,sentenceHigh}|null>}
 */
export async function generateWordSentences(word, definition, senses = []) {
  try {
    const res = await authedFetch('/api/claude/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: (senses.length > 1
            ? `A dictionary gives these meanings for "${word}":
`
              + senses.map((s, i) => `${i + 1}. (${s.partOfSpeech}) ${s.definition}`).join(String.fromCharCode(10))
              + `

Choose the one a 10 to 12 year old student is most likely to meet in a book or a test.
`
            : `The word "${word}" means: ${definition}
`)
            + `
Write two sentences for a 10 to 12 year old student, both using "${word}" exactly once.
`
            + (senses.length > 1
              ? `Reply with JSON only: {"chose": <the number you picked>, "sentenceLow": "...", "sentenceHigh": "..."}
`
              : `Reply with JSON only: {"sentenceLow": "...", "sentenceHigh": "..."}
`)
            + `sentenceLow: the words around it give almost no clue to its meaning.
`
            + `sentenceHigh: the words around it make its meaning easy to work out.
`
            + `Neither sentence may define the word outright.`,
        }],
      }),
    })
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = parseJsonLoose(match[0])
    if (!parsed) return null
    return {
      sentenceLow: parsed.sentenceLow || '',
      sentenceHigh: parsed.sentenceHigh || '',
      // Which of the dictionary's senses it wrote for, so the entry can follow.
      chose: Number(parsed.chose) || 0,
    }
  } catch (e) {
    console.error('[AI] Word sentences failed:', e)
    return null
  }
}

export async function generateWordEntry(word, context = '') {
  try {
    const res = await authedFetch('/api/claude/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `For the word "${word}", write a dictionary entry for a bright 10 to 12 year old student preparing for selective school tests.`
            + (context ? ` It was met in this sentence: "${context}".` : '')
            + `

Reply with JSON only:
`
            + `{"definition": "the meaning in under 12 words, as a dictionary writes it: no full stop, no 'this word means', just the sense",`
            + ` "partOfSpeech": "noun|verb|adjective|adverb",`
            + ` "sentenceLow": "a natural sentence using the word where the surrounding words give almost no clue to its meaning",`
            + ` "sentenceHigh": "a natural sentence using the word where the surrounding words make its meaning easy to work out"}`
            + `

Both sentences must contain the word "${word}" exactly once, and must not define it outright.`,
        }],
      }),
    })
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = parseJsonLoose(match[0])
    if (!parsed) return null
    return {
      definition: parsed.definition || '',
      partOfSpeech: parsed.partOfSpeech || '',
      sentenceLow: parsed.sentenceLow || '',
      sentenceHigh: parsed.sentenceHigh || '',
    }
  } catch (e) {
    console.error('[AI] Word entry failed:', e)
    return null
  }
}

export async function generateWordDefinition(word) {
  try {
    const res = await authedFetch('/api/claude/v1/messages', {
      method: 'POST',
      // The proxy adds the API key server-side. Never send it from the browser:
      // any VITE_ variable is compiled into the public bundle.
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: `Define the word "${word}" in simple language suitable for a school student. Reply with JSON only: {"definition": "...", "partOfSpeech": "noun/verb/adj/etc"}` }]
      })
    })
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return parseJsonLoose(match[0])
    return { definition: text, partOfSpeech: '' }
  } catch (e) {
    console.error('[AI] Word definition failed:', e)
    return null
  }
}
