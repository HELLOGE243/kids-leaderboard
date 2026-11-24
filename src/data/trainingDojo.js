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
// REPLACEMENT QUESTIONS
//
// A wrong answer is not the end of a stage. The student says why they got it
// wrong, and then faces another question on the same step. That second
// question is a variant, and variants are kept on the suite rather than being
// generated per student per failure: the next child to miss that step gets the
// one already written, and one is only ever generated when the bank runs dry.
// ============================================================

/**
 * @param {object} question the ORIGINAL question the suite was built from
 * @param {object} stage the stage being replaced
 * @param {Array} existing the variants already written for it, so the model
 *   is told what not to write again
 */
export function buildVariantPrompt(question, stage, existing, year) {
  const seen = [stage, ...(existing || [])]
    .map((v, i) => `${i + 1}. ${text(v?.text).trim()}`)
    .join('\n')
  return `A ${year || 'primary school'} student just got the question below wrong, and has explained what they missed. Write them ONE more question on the same idea, so they can show they have it now.

THE IDEA THIS STEP TEACHES
${text(stage?.knowledge).trim()}

THE QUESTIONS THEY HAVE ALREADY SEEN ON IT - do not repeat any of these, and do not simply change the numbers in one
${seen}

FOR CONTEXT, the harder question the whole course builds towards
${questionAsText(question)}

Rules:
- Same idea, same difficulty. This is another go, not a harder one and not an easier one.
- Come at it from a different angle: if they were asked to pick a result, ask them to pick the method, or work it the other way round.
- Exactly four options, exactly one correct. Wrong options must be mistakes a student would really make.
- "explanation" is the worked reasoning, shown after they answer.
- Plain text. No markup, no LaTeX.

Reply with JSON only, no other text:
{"stages":[{"skillNote":"...","text":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}]}`
}

// ============================================================
// THE WRITTEN REFLECTION
//
// Between the wrong answer and the next question, the student writes what they
// got wrong. It is checked, because an unchecked box that says "I understand"
// is a box every child learns to tick.
// ============================================================

/** The shortest reflection worth sending to the model. Below this it is refused locally, free. */
export const MIN_REFLECTION_WORDS = 8

export function buildReflectionPrompt(stage, chosenIndex, written) {
  const options = (stage?.options || []).map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')
  return `A student answered this practice question wrongly and has written what they think went wrong. Decide whether they have actually understood it.

QUESTION
${text(stage?.text).trim()}
${options}

The correct answer is ${String.fromCharCode(65 + (Number(stage?.correctIndex) || 0))}.
They chose ${String.fromCharCode(65 + (Number(chosenIndex) || 0))}.
The worked explanation they were shown: ${text(stage?.explanation).trim()}

WHAT THEY WROTE
"${text(written).trim()}"

They understand if they name the specific thing that makes the right answer right, or the specific mistake they made. Their spelling and grammar do not matter at all, and nor does how short it is, as long as the reasoning is there.

They do NOT understand if they only restate the answer, say it "makes sense" or "I misread", copy the explanation back without adding anything, or write something unrelated.

Be generous about expression and strict about reasoning. The point is to find out whether to move them on, not to catch them out.

Reply with JSON only, no other text:
{"understood": true, "feedback": "one sentence TO the student - if they have it, name what they got; if not, point at the thing to look at again without giving the answer away"}`
}

/**
 * Reads the reflection verdict.
 *
 * An unreadable reply is treated as understood, on purpose. The student has
 * already answered the question and already written something; holding them
 * there because the model returned bad JSON would punish a child for an
 * outage. The failure is logged by the caller and the loop goes on.
 */
export function parseReflection(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { understood: true, feedback: '', degraded: true }
  }
  return {
    understood: parsed.understood !== false,
    feedback: text(parsed.feedback).trim(),
    degraded: false,
  }
}

/** Refuses a reflection too short to be worth a call, before one is made. */
export function reflectionTooShort(written) {
  return text(written).trim().split(/\s+/).filter(Boolean).length < MIN_REFLECTION_WORDS
}

// ============================================================
// A student's run through a suite
// ============================================================

/** One stage's slot on a fresh run. */
function blankStage() {
  return { attempts: [], reflections: [], variant: 0, passed: false, needsReflection: false }
}

/**
 * Where a student is in a suite.
 *
 * `heuristicIds` is copied onto the run on purpose. My Progress groups a
 * student's runs by heuristic, and without the copy that one screen would have
 * to load every suite document the student has ever opened to draw itself.
 */
export function newRun(suite, { sourceId, questionKey, subject, questionSnippet, now }) {
  const count = (suite?.stages || []).length
  return {
    id: `run_${now}_${Math.random().toString(36).slice(2, 8)}`,
    sourceId,
    questionKey,
    subject,
    questionSnippet: text(questionSnippet).slice(0, 180),
    heuristicIds: [...(suite?.heuristicIds || [])],
    stageCount: count,
    stages: Array.from({ length: count }, blankStage),
    startedAt: now,
    completedAt: null,
  }
}

/** This student's state on one stage, tolerating a run written before it existed. */
export function stageState(run, index) {
  return (run?.stages || [])[index] || blankStage()
}

/**
 * The question this student is facing on a stage right now.
 *
 * Variant 0 is the stage as written; after that it is the next question in the
 * stage's variant bank. A student who has run the bank dry gets null, which is
 * the caller's cue to have one written.
 */
export function questionForStage(suite, run, index) {
  const stage = (suite?.stages || [])[index]
  if (!stage) return null
  const at = stageState(run, index).variant || 0
  if (at === 0) return stage
  const variant = (stage.variants || [])[at - 1]
  return variant || null
}

/**
 * Records one answer.
 *
 * A right answer passes the stage for good. A wrong one does not fail it: it
 * asks for the written reflection, which is the only way past.
 */
export function answerStage(run, index, chosen, suite, now) {
  const question = questionForStage(suite, run, index)
  if (!question) return { run, correct: false, done: false, needsReflection: false }
  const correct = chosen === question.correctIndex
  const stages = [...(run.stages || [])]
  const was = stageState(run, index)
  stages[index] = {
    ...was,
    attempts: [...was.attempts, { chosen, correct, at: now, variant: was.variant || 0 }],
    passed: was.passed || correct,
    passedAt: was.passed ? was.passedAt : (correct ? now : null),
    needsReflection: !correct,
  }
  const done = stages.every((s) => s.passed)
  return {
    run: { ...run, stages, completedAt: done ? now : null },
    correct,
    done,
    needsReflection: !correct,
  }
}

/**
 * Records a written reflection and its verdict.
 *
 * Understood, and the stage moves to its next variant for another go. Not
 * understood, and nothing moves: they are asked to look again and write again,
 * on the same question, with the explanation still in front of them.
 */
export function recordReflection(run, index, written, verdict, now) {
  const stages = [...(run.stages || [])]
  const was = stageState(run, index)
  const understood = verdict?.understood !== false
  stages[index] = {
    ...was,
    reflections: [...was.reflections, { text: text(written).trim(), ok: understood, at: now }],
    needsReflection: !understood,
    variant: understood ? (was.variant || 0) + 1 : (was.variant || 0),
  }
  return { run: { ...run, stages }, understood, feedback: text(verdict?.feedback).trim() }
}

/** Adds a freshly written variant to a stage, for this student and every one after. */
export function addVariant(suite, index, variant) {
  const stages = [...(suite?.stages || [])]
  const stage = stages[index]
  if (!stage || !variant) return suite
  stages[index] = { ...stage, variants: [...(stage.variants || []), variant] }
  return { ...suite, stages }
}

/** The first stage not yet passed - where Resume should land. */
export function nextStageIndex(run, suite) {
  const count = (suite?.stages || []).length
  for (let i = 0; i < count; i++) if (!stageState(run, i).passed) return i
  return count ? count - 1 : 0
}

/** Done, part-done or not started - what My Progress prints against a run. */
export function runStatus(run) {
  const stages = run?.stages || []
  const passed = stages.filter((s) => s?.passed).length
  const touched = stages.filter((s) => (s?.attempts || []).length).length
  const total = run?.stageCount || stages.length || 0
  if (run?.completedAt) return { state: 'complete', answered: passed, total }
  if (touched > 0) return { state: 'unfinished', answered: passed, total }
  return { state: 'notStarted', answered: 0, total }
}

/** How many questions it took - what the completion screen reports. */
export function runEffort(run) {
  const stages = run?.stages || []
  const attempts = stages.reduce((n, s) => n + (s?.attempts || []).length, 0)
  const firstTime = stages.filter((s) => (s?.attempts || []).length === 1 && s.passed).length
  // Counted per stage, not as `attempts - stages.length`. That subtracts a go
  // for every stage, including ones never opened, so a part-done run reported
  // fewer retries than it had - and a run with one stage retried twice and the
  // rest untouched reported none at all.
  const retries = stages.reduce((n, s) => n + Math.max(0, (s?.attempts || []).length - 1), 0)
  return { attempts, firstTime, retries, stages: stages.length }
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
