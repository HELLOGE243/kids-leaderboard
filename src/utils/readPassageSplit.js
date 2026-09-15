import { authedFetch } from '../data/auth.js'
import { htmlToText } from './cleverspaceImport.js'
// Reads a CleverSpace item whose passage is pasted into the question with no
// clear separator, and says where the item's own question is and where the
// passage starts. The importer then splits the original HTML at that point
// (see applyAiSplit), so formatting and images are kept exactly.
//
// Goes through the app's /api/claude proxy with structured output, like
// readOptionImage.js.

const MODEL = 'claude-opus-5'

const SCHEMA = {
  type: 'object',
  properties: {
    hasPassage: { type: 'boolean' },
    question: { type: 'string' },
    passageStart: { type: 'string' },
  },
  required: ['hasPassage', 'question', 'passageStart'],
  additionalProperties: false,
}

const PROMPT = `Below is one multiple-choice item from a school reading test, as plain text. It may contain test instructions, the item's own question, and a reading passage (an extract, article, poem or cloze text) that several items share.

Return:
- hasPassage: true if the item contains a reading passage separate from its question.
- question: the item's own question or sentence stem, copied exactly (not the general instructions, not the passage).
- passageStart: the first 8-12 words of the passage, copied exactly, including any title line. Empty if there is no passage.

Item:
`

/**
 * @param {string} html the item's description HTML
 * @returns {Promise<{ok: true, question: string, passageStart: string} | {ok: false, error: string}>}
 */
export async function readPassageSplit(html) {
  const text = htmlToText(html).slice(0, 20000)
  let res
  try {
    res = await authedFetch('/api/claude/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content: PROMPT + text }],
      }),
    })
  } catch {
    return { ok: false, error: 'Could not reach the AI service' }
  }
  let body
  try { body = await res.json() } catch { body = null }
  if (!res.ok) return { ok: false, error: body?.error?.message || `AI service error (${res.status})` }
  if (body?.stop_reason === 'refusal') return { ok: false, error: 'The AI declined to read this item' }
  let parsed
  try { parsed = JSON.parse((body?.content || []).find((b) => b.type === 'text')?.text || '') } catch { return { ok: false, error: 'The AI returned an unreadable result' } }
  if (!parsed.hasPassage || !parsed.passageStart) return { ok: false, error: 'No separate passage found' }
  return { ok: true, question: String(parsed.question || '').trim(), passageStart: String(parsed.passageStart).trim() }
}
