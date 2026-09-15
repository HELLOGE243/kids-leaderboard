import { authedFetch } from '../data/auth.js'
import { aiTagQuestions } from './aiTagQuestions.js'

// Bulk skill tagging that improves as it goes.
//
// Tagging 100 questions teaches Claude less than tagging 500: distinctions that
// matter (say, "Inference" splitting into "Inference from detail" and "Author's
// attitude") only become visible with volume. So a run is not one pass:
//
//   1. survey     - sample questions across the sets, propose tags to add
//   2. tag        - batches of untagged questions, saved per set as they finish
//   3. checkpoint - every CHECKPOINT_EVERY questions, look at how each tag is
//                   actually being used and propose splits for catch-all tags
//   4. retag      - questions already carrying a split tag are re-tagged against
//                   the finer tags, so early questions match later ones
//
// Every taxonomy change is a proposal: the caller decides whether to apply it
// (automatically, or after asking the teacher).

const MODEL = 'claude-opus-5'
export const CHECKPOINT_EVERY = 500
const SURVEY_SAMPLE = 120
const SPLIT_SAMPLE = 14

const strip = (html, max = 300) => String(html || '')
  .replace(/<img[^>]*>/gi, ' [image] ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max)

/** A short one-line description of a question, for taxonomy prompts. */
export function describeBrief(q) {
  const head = q.prompt ? strip(q.prompt, 200) : strip(q.text, 240)
  const opts = (q.options || []).slice(0, 4).map((o) => strip(o, 40)).join(' / ')
  return `[${q.type || 'multiple-choice'}] ${head}${opts ? ` — options: ${opts}` : ''}`
}

async function askClaude(prompt, schema, maxTokens = 3000) {
  let res
  try {
    res = await authedFetch('/api/claude/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch {
    return { ok: false, error: 'Could not reach the AI service' }
  }
  let body
  try { body = await res.json() } catch { body = null }
  if (!res.ok) return { ok: false, error: body?.error?.message || `AI service error (${res.status})` }
  try {
    return { ok: true, data: JSON.parse((body?.content || []).find((b) => b.type === 'text')?.text || '') }
  } catch {
    return { ok: false, error: 'The AI returned an unreadable result' }
  }
}

/** Evenly spaced sample, so the survey sees every set rather than the first few. */
export function spread(items, n) {
  if (items.length <= n) return [...items]
  const step = items.length / n
  return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)])
}

const TAXONOMY_SCHEMA = {
  type: 'object',
  properties: {
    additions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, reason: { type: 'string' }, coversRoughly: { type: 'integer' } },
        required: ['name', 'reason', 'coversRoughly'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string' },
  },
  required: ['additions', 'notes'],
  additionalProperties: false,
}

/**
 * Looks over a sample of one subject's questions and proposes tags the current
 * library is missing.
 * @returns {Promise<{ok:true, additions:Array<{name,reason,coversRoughly}>, notes:string}|{ok:false,error:string}>}
 */
export async function surveyTaxonomy(questions, tags, subjectName) {
  const sample = spread(questions, SURVEY_SAMPLE)
  const prompt = `You are organising the skill tags used to report ${subjectName} progress to parents at an Australian OC / Selective test preparation school.

Current tags:
${tags.map((t) => `- ${t.name}`).join('\n')}

Here is a sample of ${sample.length} questions drawn evenly from ${questions.length} questions across every quiz:
${sample.map((q, i) => `${i + 1}. ${describeBrief(q)}`).join('\n')}

Propose only tags that are clearly missing and that a parent would find meaningful ("Inference from detail" - not "Question type 3"). For each, estimate how many of the sampled questions it would cover. Propose at most 6, and none at all if the current tags already cover this sample well. Do not propose renaming or removing existing tags.`
  const res = await askClaude(prompt, TAXONOMY_SCHEMA)
  if (!res.ok) return res
  return { ok: true, additions: res.data.additions || [], notes: res.data.notes || '' }
}

const SPLIT_SCHEMA = {
  type: 'object',
  properties: {
    splits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tagName: { type: 'string' },
          reason: { type: 'string' },
          newTags: { type: 'array', items: { type: 'string' } },
        },
        required: ['tagName', 'reason', 'newTags'],
        additionalProperties: false,
      },
    },
  },
  required: ['splits'],
  additionalProperties: false,
}

/**
 * Mid-run review: with several hundred questions tagged, which tags have become
 * catch-alls that hide a distinction worth reporting to parents?
 * @param usage [{ tag, count, examples: [questionDescription] }]
 * @returns {Promise<{ok:true, splits:Array<{tagName, reason, newTags:string[]}>}|{ok:false,error}>}
 */
export async function reviewTagUsage(usage, subjectName, taggedCount) {
  const busy = usage.filter((u) => u.count >= 25)
  if (!busy.length) return { ok: true, splits: [] }
  const prompt = `You are refining the skill tags used to report ${subjectName} progress to parents. ${taggedCount} questions have been tagged so far.

How each tag is being used:
${busy.map((u) => `## ${u.tag} (${u.count} questions)\n${spread(u.examples, SPLIT_SAMPLE).map((e) => `- ${e}`).join('\n')}`).join('\n\n')}

Identify any tag that has become a catch-all: it covers two or more genuinely different skills that a parent would want reported separately, and both kinds appear often. For each, give 2-3 replacement tag names that together cover everything the old tag covered.

Be conservative: propose a split only when the distinction is clear and useful. Most tags should not be split. Return an empty list if none should be.`
  const res = await askClaude(prompt, SPLIT_SCHEMA)
  if (!res.ok) return res
  return { ok: true, splits: res.data.splits || [] }
}

/**
 * Tags a batch of questions against the given tags (the plain tagging step).
 * Thin wrapper so callers import one module.
 */
export function tagQuestions(questions, tags, onProgress) {
  return aiTagQuestions(questions, tags, onProgress)
}
