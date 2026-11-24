import { authedFetch } from './auth.js'
import { parseJsonLoose } from '../utils/jsonLoose.js'
import {
  buildAnalysePrompt, parseAnalysis, buildStagesPrompt, parseStages,
  buildVariantPrompt, buildReflectionPrompt, parseReflection,
  mergeHeuristics, STAGE_BATCH,
} from './trainingDojo.js'

/**
 * The Training Dojo's calls to the model.
 *
 * Everything that decides anything lives in trainingDojo.js and is tested
 * without a network. This file only carries messages: build a prompt, send it
 * through the app's own proxy, hand what comes back to a parser.
 *
 * The model is the one the proxy allows that can actually do this work. The
 * proxy caps max_tokens at 4000 and counts every call against the student's
 * daily allowance, so a suite is built in the fewest calls that fit: one to
 * work out what the question tests, then one per batch of stages.
 */
const MODEL = 'claude-sonnet-5'
const ENDPOINT = '/api/claude/v1/messages'

/**
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: string}>}
 */
async function ask(prompt, maxTokens) {
  let res
  try {
    res = await authedFetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
    })
  } catch {
    return { ok: false, error: 'Could not reach the AI service' }
  }
  let body
  try { body = await res.json() } catch { body = null }
  if (!res.ok) return { ok: false, error: body?.error?.message || `AI service error (${res.status})` }
  // A reply cut off at the ceiling is not short JSON, it is broken JSON.
  if (body?.stop_reason === 'max_tokens') return { ok: false, error: 'The AI ran out of room' }
  if (body?.stop_reason === 'refusal') return { ok: false, error: 'The AI declined this one' }
  const out = (body?.content || []).find((b) => b.type === 'text')?.text || ''
  // Models fence JSON even when told not to.
  const fenced = out.match(/```(?:json)?\s*([\s\S]*?)```/)
  try {
    return { ok: true, data: parseJsonLoose(fenced ? fenced[1] : out) }
  } catch {
    return { ok: false, error: 'The AI returned something unreadable' }
  }
}

/**
 * Builds a whole suite for one question.
 *
 * Nothing is returned until every stage is in hand: a half-built suite cached
 * for the school is worse than none, because the next student to open it gets
 * a course that stops in the middle and no sign anything went wrong.
 *
 * @param {(step: string) => void} [onProgress] for the waiting screen
 */
export async function buildSuite({ question, subject, library, year }, onProgress) {
  onProgress?.('Working out what this question is really testing')
  const first = await ask(buildAnalysePrompt(question, subject, library, year), 3000)
  if (!first.ok) return { ok: false, error: first.error }
  const analysis = parseAnalysis(first.data, library)
  if (!analysis.ok) return { ok: false, error: analysis.error }

  const merged = mergeHeuristics(library, analysis.heuristics, subject)
  const total = analysis.breakdown.length
  const stages = []
  for (let i = 0; i < total; i += STAGE_BATCH) {
    const slice = analysis.breakdown.slice(i, i + STAGE_BATCH)
    onProgress?.(`Writing questions ${i + 1}–${i + slice.length} of ${total}`)
    const res = await ask(buildStagesPrompt(question, slice, i, total, year), 4000)
    if (!res.ok) return { ok: false, error: res.error }
    const parsed = parseStages(res.data, slice, i)
    if (!parsed.ok) return { ok: false, error: parsed.error }
    stages.push(...parsed.stages)
  }

  return {
    ok: true,
    suite: { schemaVersion: 1, subject, heuristicIds: merged.ids, stages, generatedAt: Date.now(), model: MODEL },
    library: merged.library,
    added: merged.added,
  }
}

/** One more question on a step the student has just missed. */
export async function buildVariant({ question, stage, existing, year }) {
  const res = await ask(buildVariantPrompt(question, stage, existing, year), 1500)
  if (!res.ok) return { ok: false, error: res.error }
  const parsed = parseStages(res.data, [{ knowledge: stage?.knowledge, why: stage?.skillNote }], 0)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  return { ok: true, variant: parsed.stages[0] }
}

/**
 * Reads a student's written reflection.
 *
 * A failure here lets them through rather than holding them: they have already
 * answered the question and already written something, and trapping a child
 * behind an outage is a worse outcome than letting one weak sentence past.
 */
export async function checkReflection({ stage, chosenIndex, written }) {
  const res = await ask(buildReflectionPrompt(stage, chosenIndex, written), 600)
  if (!res.ok) {
    console.warn('Training Dojo: the reflection could not be checked:', res.error)
    return { understood: true, feedback: '', degraded: true }
  }
  return parseReflection(res.data)
}
