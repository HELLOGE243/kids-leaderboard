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
    const res = await fetch('/api/claude/v1/messages', {
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
    if (match) return JSON.parse(match[0])
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
    const res = await fetch('/api/claude/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\[[\s\S]*\]/)
    if (match) return JSON.parse(match[0])
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
    const res = await fetch('/api/claude/v1/messages', {
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
    if (match) return JSON.parse(match[0])
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
    const res = await fetch('/api/claude/v1/messages', {
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
    if (match) return JSON.parse(match[0])
    return []
  } catch {
    return []
  }
}

export async function generateWritingSuggestions(studentText, rubricCategories) {
  const catDescriptions = rubricCategories.map(c => `${c.name}: ${c.criteria.join('; ')}`).join('\n')
  const prompt = `You are a Year 5-6 writing teacher reviewing a student's free-writing response. Analyse the writing and suggest specific improvements.

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
    const res = await fetch('/api/claude/v1/messages', {
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
    if (match) return JSON.parse(match[0])
    return []
  } catch {
    return []
  }
}

export async function generateAiMark(studentText, rubricCategories, preAnalysis) {
  const catDescriptions = rubricCategories.map(c => `- ${c.key}: "${c.name}" — criteria: ${c.criteria.join('; ')}`).join('\n')
  const contextNote = preAnalysis ? `Your prior analysis of this writing: style="${preAnalysis.style}", level="${preAnalysis.level}", strengths="${preAnalysis.strengths}", weaknesses="${preAnalysis.weaknesses}".` : ''
  const prompt = `You are a nurturing, supportive Year 5-6 writing teacher marking a student's work. Be encouraging and positive — celebrate what the student did well, and frame improvements gently as next steps.

Student's writing:
"""
${studentText}
"""

${contextNote}

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
  "overallComment": "..."
}`

  try {
    const res = await fetch('/api/claude/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    return null
  } catch {
    return null
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
    const res = await fetch('/api/claude/v1/messages', {
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
    if (match) return JSON.parse(match[0])
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
    const res = await fetch('/api/claude/v1/messages', {
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
    if (match) return JSON.parse(match[0])
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
- For maths questions, prefer plain-language explanations and arithmetic (e.g. "3 groups of 4 is 12"). Only use algebra or formal equations when the concept genuinely requires it.`

  try {
    const res = await fetch('/api/claude/v1/messages', {
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
      const parsed = JSON.parse(match[0])
      return { general: parsed.general || '', options: parsed.options || {} }
    }
    return { general: text, options: {} }
  } catch (e) {
    console.error('[AI] Fetch failed:', e)
    return { general: '', options: {} }
  }
}

export async function generateWordDefinition(word) {
  try {
    const res = await fetch('/api/claude/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': import.meta.env.VITE_CLAUDE_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: `Define the word "${word}" in simple language suitable for a school student. Reply with JSON only: {"definition": "...", "partOfSpeech": "noun/verb/adj/etc"}` }]
      })
    })
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    return { definition: text, partOfSpeech: '' }
  } catch (e) {
    console.error('[AI] Word definition failed:', e)
    return null
  }
}
