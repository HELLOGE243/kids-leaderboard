import { authedFetch } from '../data/auth.js'
// Suggests skill tags for quiz questions, choosing only from the teacher's tag
// library (the tag ids are an enum in the output schema, so Claude can't invent
// one). It may also propose new tags, which the teacher approves separately.
// Nothing is saved here: the Quiz Builder shows the suggestions for review.

const MODEL = 'claude-opus-5'
const BATCH = 12

const strip = (html, max) => String(html || '')
  .replace(/<img[^>]*>/gi, ' [image] ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max)

function describe(q, i) {
  const parts = [`#${i} type=${q.type || 'multiple-choice'}`]
  if (q.prompt) parts.push(`Question: ${strip(q.prompt, 400)}`)
  parts.push(`${q.prompt ? 'Passage/stem' : 'Question'}: ${strip(q.text, q.prompt ? 900 : 1200)}`)
  if (q.descriptions?.length) parts.push(`Extracts: ${q.descriptions.map((d) => strip(d.content, 250)).join(' | ')}`)
  if (q.options?.length) parts.push(`Options: ${q.options.map((o, k) => `${'ABCDEFG'[k]}) ${strip(o, 120)}`).join('  ')}`)
  if (q.matchQuestions?.length) parts.push(`Statements: ${q.matchQuestions.map((m) => strip(m.question, 120)).join(' | ')}`)
  if (q.blanks?.length) parts.push(`Gaps: ${q.blanks.map((b) => b.options.join('/')).join('; ')}`)
  return parts.join('\n')
}

/**
 * @param {Array} questions quiz questions (with ids)
 * @param {Array<{id,name,subject}>} tags the allowed tags
 * @param {(done:number,total:number)=>void} [onProgress]
 * @returns {Promise<{ok:true, results: Array<{questionId, tagIds, confidence}>, suggestions: Array<{name, reason, count}>} | {ok:false, error}>}
 */
export async function aiTagQuestions(questions, tags, onProgress) {
  if (!tags.length) return { ok: false, error: 'No tags for this subject yet.' }
  const schema = {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer' },
            tagIds: { type: 'array', items: { type: 'string', enum: tags.map((t) => t.id) } },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['index', 'tagIds', 'confidence'],
          additionalProperties: false,
        },
      },
      newTagIdeas: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, reason: { type: 'string' } },
          required: ['name', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['results', 'newTagIdeas'],
    additionalProperties: false,
  }
  const tagList = tags.map((t) => `${t.id}: ${t.name}`).join('\n')
  const results = []
  const ideas = new Map()

  for (let start = 0; start < questions.length; start += BATCH) {
    const batch = questions.slice(start, start + BATCH)
    const prompt = `You tag questions from Australian OC and Selective school entry test preparation by the skill each one tests, for reports to parents.

Allowed tags:
${tagList}

For each question give the 1-2 tags that best describe the main skill tested (never more than 2; prefer 1). Use "low" confidence when none fits well. Only if several questions clearly test a skill missing from the list, add it to newTagIdeas (short name, a few words) - otherwise leave newTagIdeas empty.

Questions:
${batch.map((q, i) => describe(q, start + i)).join('\n\n')}`
    let res
    try {
      res = await authedFetch('/api/claude/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4000,
          output_config: { effort: 'low', format: { type: 'json_schema', schema } },
          messages: [{ role: 'user', content: prompt }],
        }),
      })
    } catch {
      return { ok: false, error: 'Could not reach the AI service' }
    }
    let body
    try { body = await res.json() } catch { body = null }
    if (!res.ok) return { ok: false, error: body?.error?.message || `AI service error (${res.status})` }
    let parsed
    try { parsed = JSON.parse((body?.content || []).find((b) => b.type === 'text')?.text || '') } catch { return { ok: false, error: 'The AI returned an unreadable result' } }
    for (const r of parsed.results || []) {
      const q = questions[r.index]
      if (!q?.id || r.index < start || r.index >= start + BATCH) continue
      results.push({ questionId: q.id, tagIds: [...new Set(r.tagIds)].slice(0, 2), confidence: r.confidence })
    }
    for (const idea of parsed.newTagIdeas || []) {
      const key = idea.name.trim().toLowerCase()
      if (!key) continue
      const cur = ideas.get(key) || { name: idea.name.trim(), reason: idea.reason, count: 0 }
      cur.count++
      ideas.set(key, cur)
    }
    onProgress?.(Math.min(start + BATCH, questions.length), questions.length)
  }
  return { ok: true, results, suggestions: [...ideas.values()] }
}
