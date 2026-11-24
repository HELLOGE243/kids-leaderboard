/**
 * The Training Dojo: turning one question a student got wrong into a short
 * course that builds up to it.
 *
 * This module is the thinking half - what to ask the model, and what counts as
 * a usable answer coming back. It holds no network call and no clock, so every
 * prompt and every rejection can be tested without spending anything.
 *
 * The shape of the work is three calls, not one. The proxy caps `max_tokens`
 * at 4000 (functions/index.js), and eight multiple-choice questions with an
 * explanation and a skill note each do not fit in that. So: one small call
 * that works out what the question is really testing and breaks it into steps,
 * then two calls that write four stages apiece.
 */

/** Only these two subjects have a dojo. Reading and writing are not scored this way. */
export const DOJO_SUBJECTS = ['math', 'thinking']

export const SUBJECT_NAMES = { math: 'Mathematical Reasoning', thinking: 'Thinking Skills' }

/** The most stages a suite may hold, and the fewest worth building one for. */
export const MAX_STAGES = 8
export const MIN_STAGES = 4

/** Stages are written in batches this size, so one call stays inside the cap. */
export const STAGE_BATCH = 4

const text = (v) => String(v == null ? '' : v)

const plain = (html) => text(html)
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/\s+/g, ' ')
  .trim()

/** A stable id for one question inside a quiz set, matching the explanation cache. */
export function suiteKey(question, questionIndex) {
  return text(question?.id) || `idx-${Number(questionIndex) || 0}`
}

/**
 * Is this question one the dojo can teach?
 *
 * It needs options to ask about, a right answer to build towards, and a
 * subject where "the heuristic" is a real thing rather than a reading opinion.
 */
export function canTrain(question, subject) {
  if (!DOJO_SUBJECTS.includes(subject)) return false
  const type = question?.type || 'multiple-choice'
  if (type !== 'multiple-choice' && type !== 'multi-description') return false
  const options = (question?.options || []).filter((o) => text(o).trim())
  if (options.length < 2) return false
  const correct = Number(question?.correctIndex)
  return Number.isInteger(correct) && correct >= 0 && correct < (question.options || []).length
}

/** The question as the model should see it: no markup, options lettered. */
export function questionAsText(question) {
  const stem = [plain(question?.text), plain(question?.prompt)].filter(Boolean).join('\n')
  const options = (question?.options || [])
    .map((o, i) => (text(o).trim() ? `${String.fromCharCode(65 + i)}. ${plain(o)}` : null))
    .filter(Boolean)
    .join('\n')
  const correct = String.fromCharCode(65 + (Number(question?.correctIndex) || 0))
  return `${stem}\n\n${options}\n\nCorrect answer: ${correct}`
}

// ============================================================
// CALL 1 - what is this question testing, and what has to be known first
// ============================================================

/**
 * @param {object} question the question the student got wrong
 * @param {string} subject 'math' or 'thinking'
 * @param {Array<{id: string, name: string}>} library heuristics already known for that subject
 * @param {string} year the student's year level, for pitching the steps
 */
export function buildAnalysePrompt(question, subject, library, year) {
  const known = (library || []).length
    ? (library || []).map((h) => `${h.id}: ${h.name}`).join('\n')
    : '(none yet)'
  return `You are designing a short remedial course for a ${year || 'primary school'} student who got the question below wrong. The subject is ${SUBJECT_NAMES[subject] || subject}.

THE QUESTION
${questionAsText(question)}

HEURISTICS ALREADY IN THE LIBRARY FOR THIS SUBJECT
${known}

Do two things.

1. Name the heuristics this question tests. A heuristic is the transferable method a student would carry to a different question - "work backwards from the answer options", "translate a word problem into an equation", "separate a claim from the evidence for it". It is NOT the topic ("fractions") and NOT the answer.
   - Reuse an existing heuristic whenever one fits: give its id in "existingId". Only propose a new one when nothing in the library covers it.
   - Give between 1 and 3.

2. Break the question into the pieces of knowledge a student needs IN ORDER, easiest first, ending with the whole question. Between ${MIN_STAGES} and ${MAX_STAGES} steps. Each step is one idea, not a list.

Reply with JSON only, no other text:
{"heuristics":[{"existingId":null,"name":"...","description":"one sentence a teacher would recognise"}],
 "breakdown":[{"knowledge":"what this step teaches","why":"why it is needed for the original question"}]}`
}

/**
 * Reads the analyse reply, refusing anything that would poison the library.
 *
 * An `existingId` the library does not hold is dropped rather than trusted: a
 * hallucinated id would attach the question to a heuristic nobody wrote, and
 * the whole point of the library is that an admin can read it.
 *
 * @returns {{ok: true, heuristics, breakdown}|{ok: false, error: string}}
 */
export function parseAnalysis(parsed, library) {
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'the model did not return an object' }
  const known = new Set((library || []).map((h) => h.id))
  const heuristics = []
  for (const h of Array.isArray(parsed.heuristics) ? parsed.heuristics : []) {
    const name = text(h?.name).trim()
    const existingId = text(h?.existingId).trim()
    if (existingId && known.has(existingId)) {
      heuristics.push({ existingId, name, description: text(h?.description).trim() })
      continue
    }
    if (!name) continue
    heuristics.push({ existingId: null, name, description: text(h?.description).trim() })
  }
  if (!heuristics.length) return { ok: false, error: 'no heuristic was named' }

  const breakdown = []
  for (const b of Array.isArray(parsed.breakdown) ? parsed.breakdown : []) {
    const knowledge = text(b?.knowledge).trim()
    if (!knowledge) continue
    breakdown.push({ knowledge, why: text(b?.why).trim() })
    if (breakdown.length === MAX_STAGES) break
  }
  if (breakdown.length < MIN_STAGES) {
    return { ok: false, error: `only ${breakdown.length} usable steps came back, and a suite needs ${MIN_STAGES}` }
  }
  return { ok: true, heuristics: heuristics.slice(0, 3), breakdown }
}

// ============================================================
// CALLS 2 and 3 - write the stages
// ============================================================

/**
 * @param {object} question the original question
 * @param {Array} steps the slice of the breakdown this call should write
 * @param {number} offset how many stages come before this slice
 * @param {number} total how many stages the whole suite will have
 */
export function buildStagesPrompt(question, steps, offset, total, year) {
  const list = steps
    .map((s, i) => `Step ${offset + i + 1} of ${total}: ${s.knowledge}\n  (needed because: ${s.why})`)
    .join('\n')
  return `You are writing part of a remedial course for a ${year || 'primary school'} student who got this question wrong.

THE ORIGINAL QUESTION, which the course builds up to
${questionAsText(question)}

WRITE ONE MULTIPLE-CHOICE QUESTION FOR EACH STEP BELOW
${list}

Rules for every question you write:
- It must be answerable on its own, without having seen the original.
- Exactly four options, exactly one correct. Wrong options must be mistakes a student would really make, never filler.
- Difficulty rises with the step number. Step ${offset + steps.length} must be harder than step ${offset + 1}.
- "skillNote" is written TO the student, before they see the question: say what this one is teaching and how it leads to the question they got wrong. Two sentences at most.
- "explanation" is shown after they answer: the worked reasoning, not just the answer.
- Plain text. No markup, no LaTeX.

Reply with JSON only, no other text:
{"stages":[{"skillNote":"...","text":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}]}`
}

/**
 * Reads a stages reply, keeping only stages that could actually be asked.
 *
 * A stage missing an option, or pointing at an option that is not there, is
 * dropped rather than repaired. A repaired stage is a question nobody wrote
 * and nobody checked, and it would be cached and served to the whole school.
 *
 * @returns {{ok: true, stages, dropped}|{ok: false, error: string}}
 */
export function parseStages(parsed, steps, offset) {
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'the model did not return an object' }
  const raw = Array.isArray(parsed.stages) ? parsed.stages : []
  const stages = []
  const dropped = []
  raw.forEach((s, i) => {
    const step = steps[i]
    if (!step) return
    const body = text(s?.text).trim()
    const options = (Array.isArray(s?.options) ? s.options : []).map((o) => text(o).trim())
    // Not `Number(s.correctIndex)`: Number(null) and Number('') are both 0, so a
    // stage that came back with no answer key at all would quietly be marked
    // correct at option A - and then cached, and served to everyone.
    const correctIndex = typeof s?.correctIndex === 'number' ? s.correctIndex
      : (typeof s?.correctIndex === 'string' && s.correctIndex.trim()) ? Number(s.correctIndex)
        : NaN
    const why = []
    if (!body) why.push('no question text')
    if (options.length !== 4 || options.some((o) => !o)) why.push('its four options are not all there')
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
      why.push('the correct answer is not one of the options')
    }
    if (new Set(options).size !== options.length) why.push('two options are identical')
    if (why.length) {
      dropped.push(`step ${offset + i + 1}: ${why.join(', ')}`)
      return
    }
    stages.push({
      step: offset + i + 1,
      knowledge: step.knowledge,
      skillNote: text(s?.skillNote).trim() || step.why || step.knowledge,
      text: body,
      options,
      correctIndex,
      explanation: text(s?.explanation).trim(),
    })
  })
  if (!stages.length) return { ok: false, error: dropped.join('; ') || 'no stages came back' }
  return { ok: true, stages, dropped }
}

// ============================================================
// The heuristic library
// ============================================================

/** A readable, stable id, in the shape the tag library already uses. */
export function heuristicId(subject, name) {
  return `heu-${subject}-${text(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

/**
 * Folds what the model proposed into the library it was shown.
 *
 * Matching is by id first and by name second, because the model is told to
 * reuse ids but will sometimes retype a name it was given instead. Without the
 * name check the library would grow a near-duplicate of everything it holds.
 *
 * @returns {{library, ids, added}} the library as it should now be, the ids to
 *   label the question with, and the heuristics that are new
 */
export function mergeHeuristics(library, proposed, subject) {
  const next = (library || []).map((h) => ({ ...h }))
  const byId = new Map(next.map((h) => [h.id, h]))
  const byName = new Map(next.map((h) => [h.name.toLowerCase(), h]))
  const ids = []
  const added = []
  for (const p of proposed || []) {
    const hit = (p.existingId && byId.get(p.existingId)) || byName.get(text(p.name).toLowerCase())
    if (hit) {
      if (!ids.includes(hit.id)) ids.push(hit.id)
      continue
    }
    const name = text(p.name).trim()
    if (!name) continue
    let id = heuristicId(subject, name)
    while (byId.has(id)) id += '-2'
    const made = { id, subject, name, description: text(p.description).trim(), source: 'ai', archived: false }
    next.push(made)
    byId.set(id, made)
    byName.set(name.toLowerCase(), made)
    ids.push(id)
    added.push(made)
  }
  return { library: next, ids, added }
}

// ============================================================
// A student's run through a suite
// ============================================================

/**
 * Where a student is in a suite.
 *
 * `heuristicIds` is copied onto the run on purpose. My Progress groups a
 * student's runs by heuristic, and without the copy that one screen would have
 * to load every suite document the student has ever opened to draw itself.
 */
export function newRun(suite, { sourceId, questionKey, subject, questionSnippet, now }) {
  return {
    id: `run_${now}_${Math.random().toString(36).slice(2, 8)}`,
    sourceId,
    questionKey,
    subject,
    questionSnippet: text(questionSnippet).slice(0, 180),
    heuristicIds: [...(suite?.heuristicIds || [])],
    stageCount: (suite?.stages || []).length,
    answers: [],
    startedAt: now,
    completedAt: null,
  }
}

/** Records one answer and says whether that finished the suite. */
export function answerStage(run, stageIndex, chosen, suite, now) {
  const stages = suite?.stages || []
  const stage = stages[stageIndex]
  if (!stage) return { run, correct: false, done: false }
  const answers = [...(run.answers || [])]
  answers[stageIndex] = { chosen, correct: chosen === stage.correctIndex, at: now }
  const attempted = answers.filter(Boolean).length
  const done = attempted >= stages.length
  return {
    run: { ...run, answers, completedAt: done ? now : null },
    correct: chosen === stage.correctIndex,
    done,
  }
}

/** The first stage with no answer against it - where Resume should land. */
export function nextStageIndex(run, suite) {
  const stages = (suite?.stages || []).length
  for (let i = 0; i < stages; i++) if (!(run?.answers || [])[i]) return i
  return stages ? stages - 1 : 0
}

/** Done, part-done or not started - what My Progress prints against a run. */
export function runStatus(run) {
  const answered = (run?.answers || []).filter(Boolean).length
  if (run?.completedAt) return { state: 'complete', answered, total: run.stageCount || 0 }
  if (answered > 0) return { state: 'unfinished', answered, total: run.stageCount || 0 }
  return { state: 'notStarted', answered: 0, total: run?.stageCount || 0 }
}

/**
 * A student's runs arranged the way My Progress shows them:
 * subject, then heuristic, then the questions underneath.
 */
export function progressTree(runs, heuristicsById) {
  const tree = {}
  for (const run of runs || []) {
    const subject = DOJO_SUBJECTS.includes(run?.subject) ? run.subject : 'math'
    tree[subject] = tree[subject] || {}
    const ids = (run.heuristicIds || []).length ? run.heuristicIds : ['_none']
    for (const id of ids) {
      const name = id === '_none' ? 'Not yet labelled' : (heuristicsById?.[id]?.name || id)
      tree[subject][id] = tree[subject][id] || { id, name, runs: [] }
      tree[subject][id].runs.push(run)
    }
  }
  return Object.entries(tree)
    .map(([subject, groups]) => ({
      subject,
      name: SUBJECT_NAMES[subject] || subject,
      groups: Object.values(groups).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject))
}
