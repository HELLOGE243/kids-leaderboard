/**
 * The Training Dojo's decisions, tested without a network or a model.
 *
 * Everything here guards one of two things: what gets cached and served to the
 * whole school, and what gets written into the heuristic library an admin has
 * to read. Both are shared, so a bad one is not one student's problem.
 */
import {
  canTrain, questionAsText, suiteKey, buildAnalysePrompt, parseAnalysis,
  buildStagesPrompt, parseStages, heuristicId, mergeHeuristics,
  newRun, answerStage, nextStageIndex, runStatus, progressTree,
  stageState, questionForStage, recordReflection, addVariant, runEffort,
  buildVariantPrompt, buildReflectionPrompt, parseReflection, reflectionTooShort,
  MIN_STAGES, MAX_STAGES, MIN_REFLECTION_WORDS,
} from '../src/data/trainingDojo.js'
import {
  CELEBRATIONS, frameOrder, runLength, pickCelebration, pickPassWord, PASS_WORDS,
} from '../src/data/celebrations.js'

let pass = 0
const fails = []
const ok = (name, cond) => { if (cond) pass++; else fails.push(name) }
const eq = (name, got, want) => ok(`${name} (got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)})`, JSON.stringify(got) === JSON.stringify(want))

const mcq = (over = {}) => ({ type: 'multiple-choice', text: 'What is 2 + 2?', options: ['3', '4', '5', '6'], correctIndex: 1, ...over })
const steps = (n) => Array.from({ length: n }, (_, i) => ({ knowledge: `step ${i + 1}`, why: `because ${i + 1}` }))

// --- which questions have a dojo at all ---------------------------------

ok('a maths multiple-choice question can be trained', canTrain(mcq(), 'math'))
ok('a thinking skills multiple-choice question can be trained', canTrain(mcq(), 'thinking'))
ok('a reading question has no dojo, however well formed', !canTrain(mcq(), 'reading'))
ok('a writing question has no dojo', !canTrain(mcq(), 'writing'))
ok('a question with no subject has no dojo', !canTrain(mcq(), null))
ok('a multi-description question can be trained, since it still has options', canTrain(mcq({ type: 'multi-description' }), 'math'))
ok('a cloze question cannot be trained, having nothing to choose between', !canTrain(mcq({ type: 'dropdown-cloze' }), 'math'))
ok('a writing-type question cannot be trained', !canTrain(mcq({ type: 'writing' }), 'math'))
ok('a question with one option cannot be trained', !canTrain(mcq({ options: ['only'] }), 'math'))
ok('a question whose answer key points past its options cannot be trained', !canTrain(mcq({ correctIndex: 9 }), 'math'))
ok('a question with no answer key cannot be trained', !canTrain(mcq({ correctIndex: undefined }), 'math'))
ok('a question with a negative answer key cannot be trained', !canTrain(mcq({ correctIndex: -1 }), 'math'))
ok('a missing question cannot be trained', !canTrain(null, 'math'))

// --- the question as the model sees it -----------------------------------

ok('markup is stripped before the question reaches the model',
  !questionAsText(mcq({ text: '<p>What is <b>2</b> + 2?</p>' })).includes('<'))
ok('the stem and the prompt are both sent, since a reading-style item splits them',
  questionAsText(mcq({ text: 'Given x = 3', prompt: 'what is 2x?' })).includes('Given x = 3')
  && questionAsText(mcq({ text: 'Given x = 3', prompt: 'what is 2x?' })).includes('what is 2x?'))
ok('options are lettered so the model can name the right one', questionAsText(mcq()).includes('B. 4'))
ok('the correct answer is named by its letter', questionAsText(mcq()).includes('Correct answer: B'))
ok('an empty option is left out rather than lettered blank',
  !questionAsText(mcq({ options: ['3', '', '5', '6'] })).includes('B. \n'))
ok('a non-breaking space does not survive into the prompt',
  !questionAsText(mcq({ text: 'two&nbsp;words' })).includes('&nbsp;'))

eq('a question is keyed by its permanent id', suiteKey({ id: 'q-7' }, 3), 'q-7')
eq('a question with no id falls back to its position', suiteKey({}, 3), 'idx-3')

// --- the analyse prompt ---------------------------------------------------

{
  const prompt = buildAnalysePrompt(mcq(), 'math', [{ id: 'heu-math-a', name: 'Work backwards' }], 'Y4')
  ok('the analyse prompt shows the model the heuristics it should reuse', prompt.includes('heu-math-a: Work backwards'))
  ok('the analyse prompt names the year level', prompt.includes('Y4'))
  ok('the analyse prompt names the subject in words', prompt.includes('Mathematical Reasoning'))
  ok('an empty library is stated rather than left blank', buildAnalysePrompt(mcq(), 'math', [], 'Y4').includes('(none yet)'))
}

// --- reading the analysis back --------------------------------------------

{
  const lib = [{ id: 'heu-math-a', name: 'Work backwards' }]
  const good = { heuristics: [{ existingId: 'heu-math-a' }], breakdown: steps(6) }
  const res = parseAnalysis(good, lib)
  ok('a well-formed analysis is accepted', res.ok)
  eq('six steps come back as six', res.breakdown.length, 6)
}
{
  const res = parseAnalysis({ heuristics: [{ existingId: 'heu-math-NOPE', name: 'Invented' }], breakdown: steps(5) }, [])
  ok('an id the library does not hold is not trusted', res.ok && res.heuristics[0].existingId === null)
  eq('but its name is kept, so the heuristic is still proposed', res.heuristics[0].name, 'Invented')
}
ok('an analysis naming no heuristic is refused', !parseAnalysis({ heuristics: [], breakdown: steps(6) }, []).ok)
ok('an analysis that is not an object is refused', !parseAnalysis(null, []).ok)
ok('an analysis that is a string is refused', !parseAnalysis('sorry, I cannot help', []).ok)
ok(`fewer than ${MIN_STAGES} steps is refused, since that is not a course`,
  !parseAnalysis({ heuristics: [{ name: 'X' }], breakdown: steps(MIN_STAGES - 1) }, []).ok)
eq(`more than ${MAX_STAGES} steps is cut to ${MAX_STAGES}`,
  parseAnalysis({ heuristics: [{ name: 'X' }], breakdown: steps(20) }, []).breakdown.length, MAX_STAGES)
eq('no more than three heuristics are taken from one question',
  parseAnalysis({ heuristics: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }], breakdown: steps(5) }, []).heuristics.length, 3)
ok('a blank step is dropped rather than becoming an empty stage',
  parseAnalysis({ heuristics: [{ name: 'X' }], breakdown: [...steps(5), { knowledge: '   ' }] }, []).breakdown.length === 5)

// --- the stages prompt ----------------------------------------------------

{
  const prompt = buildStagesPrompt(mcq(), steps(4), 4, 8, 'Y6')
  ok('a later batch is numbered from where the earlier one stopped', prompt.includes('Step 5 of 8'))
  ok('the original question is shown, so the stages build towards it', prompt.includes('What is 2 + 2?'))
  ok('the reason a step exists is passed on to whoever writes it', prompt.includes('needed because: because 1'))
}

// --- reading the stages back ----------------------------------------------

const stage = (over = {}) => ({ skillNote: 'why', text: 'Q?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: 'because', ...over })

{
  const res = parseStages({ stages: [stage(), stage()] }, steps(2), 0)
  ok('two well-formed stages are accepted', res.ok && res.stages.length === 2)
  eq('stages are numbered from the batch offset', res.stages[0].step, 1)
  eq('the step a stage was written for is carried onto it', res.stages[0].knowledge, 'step 1')
}
eq('a stage in the second batch keeps its true step number',
  parseStages({ stages: [stage()] }, steps(1), 4).stages[0].step, 5)
{
  const res = parseStages({ stages: [stage(), stage({ options: ['a', 'b', 'c'] })] }, steps(2), 0)
  ok('a stage with three options is dropped, not padded', res.ok && res.stages.length === 1)
  ok('and the drop is reported, so it is not silent', res.dropped.length === 1 && res.dropped[0].includes('step 2'))
}
ok('a stage with an empty option is dropped',
  parseStages({ stages: [stage({ options: ['a', '', 'c', 'd'] })] }, steps(1), 0).ok === false)
ok('a stage whose answer key points past its options is dropped',
  parseStages({ stages: [stage({ correctIndex: 7 })] }, steps(1), 0).ok === false)
ok('a stage with a null answer key is dropped, not read as option A',
  parseStages({ stages: [stage({ correctIndex: null })] }, steps(1), 0).ok === false)
ok('a stage with no answer key at all is dropped',
  parseStages({ stages: [stage({ correctIndex: undefined })] }, steps(1), 0).ok === false)
ok('a stage with an empty-string answer key is dropped',
  parseStages({ stages: [stage({ correctIndex: '' })] }, steps(1), 0).ok === false)
ok('a stage whose answer key came back as a string is still read',
  parseStages({ stages: [stage({ correctIndex: '2' })] }, steps(1), 0).stages?.[0]?.correctIndex === 2)
ok('a stage with two identical options is dropped, since one of them cannot be wrong',
  parseStages({ stages: [stage({ options: ['a', 'a', 'c', 'd'] })] }, steps(1), 0).ok === false)
ok('a stage with no question text is dropped',
  parseStages({ stages: [stage({ text: '  ' })] }, steps(1), 0).ok === false)
ok('a reply with no stages at all is refused', !parseStages({ stages: [] }, steps(2), 0).ok)
ok('a reply that is not an object is refused', !parseStages(null, steps(2), 0).ok)
ok('more stages than steps were asked for are ignored',
  parseStages({ stages: [stage(), stage(), stage()] }, steps(2), 0).stages.length === 2)
eq('a stage with no skill note falls back to why its step exists',
  parseStages({ stages: [stage({ skillNote: '' })] }, steps(1), 0).stages[0].skillNote, 'because 1')

// --- the heuristic library -------------------------------------------------

eq('a heuristic id is readable and built from its name',
  heuristicId('math', 'Work Backwards!'), 'heu-math-work-backwards')
eq('punctuation does not leave a trailing dash', heuristicId('math', 'Check it.'), 'heu-math-check-it')

{
  const lib = [{ id: 'heu-math-a', subject: 'math', name: 'Work backwards', archived: false }]
  const res = mergeHeuristics(lib, [{ existingId: 'heu-math-a' }], 'math')
  eq('a heuristic reused by id adds nothing to the library', res.library.length, 1)
  eq('and the question is labelled with the existing id', res.ids, ['heu-math-a'])
  eq('nothing is reported as new', res.added.length, 0)
}
{
  const lib = [{ id: 'heu-math-a', subject: 'math', name: 'Work backwards', archived: false }]
  const res = mergeHeuristics(lib, [{ existingId: null, name: 'work BACKWARDS' }], 'math')
  eq('a heuristic retyped under a different case is matched by name, not duplicated', res.library.length, 1)
  eq('and the question gets the existing id', res.ids, ['heu-math-a'])
}
{
  const res = mergeHeuristics([], [{ name: 'Draw a diagram', description: 'Sketch it' }], 'math')
  eq('a genuinely new heuristic is added', res.library.length, 1)
  eq('it is marked as the AI having written it', res.library[0].source, 'ai')
  eq('and it is reported as new, so a log can say so', res.added.length, 1)
}
{
  const lib = [{ id: 'heu-math-draw-a-diagram', subject: 'math', name: 'Something else', archived: false }]
  const res = mergeHeuristics(lib, [{ name: 'Draw a diagram' }], 'math')
  eq('a new name that collides with an existing id gets its own id', res.library.length, 2)
  ok('and the two ids differ', res.library[0].id !== res.library[1].id)
}
eq('a nameless proposal is ignored rather than becoming a blank heuristic',
  mergeHeuristics([], [{ name: '   ' }], 'math').library.length, 0)
eq('the same heuristic proposed twice is only labelled once',
  mergeHeuristics([{ id: 'heu-math-a', subject: 'math', name: 'A' }], [{ existingId: 'heu-math-a' }, { name: 'A' }], 'math').ids.length, 1)
ok('merging does not mutate the library it was given', (() => {
  const lib = [{ id: 'heu-math-a', subject: 'math', name: 'A' }]
  mergeHeuristics(lib, [{ name: 'B' }], 'math')
  return lib.length === 1
})())


// --- the replacement question ---------------------------------------------

{
  const stage = { knowledge: 'adding fractions', text: 'What is 1/2 + 1/4?', options: ['a','b','c','d'], correctIndex: 0 }
  const prompt = buildVariantPrompt(mcq(), stage, [{ text: 'An earlier variant' }], 'Y5')
  ok('the variant prompt names the idea the step teaches', prompt.includes('adding fractions'))
  ok('it shows the model the question they already failed', prompt.includes('What is 1/2 + 1/4?'))
  ok('and every variant already written, so it does not repeat one', prompt.includes('An earlier variant'))
  ok('it shows the original question for context', prompt.includes('What is 2 + 2?'))
  ok('it asks for the same difficulty, not a harder one', /same difficulty/i.test(prompt))
}

// --- the written reflection -------------------------------------------------

{
  const stage = { text: 'Q?', options: ['a','b','c','d'], correctIndex: 2, explanation: 'because c' }
  const prompt = buildReflectionPrompt(stage, 0, 'I thought it was a but actually')
  ok('the reflection prompt says which option was right', prompt.includes('correct answer is C'))
  ok('and which one the student chose', prompt.includes('They chose A'))
  ok('it passes on what the student wrote', prompt.includes('I thought it was a but actually'))
  ok('it tells the model to ignore spelling and grammar', /spelling and grammar do not matter/i.test(prompt))
  ok('and not to give the answer away in its feedback', /without giving the answer away/i.test(prompt))
}

ok('a reflection of a few words is refused before any call is made', reflectionTooShort('I misread it'))
ok('a reflection of enough words is sent', !reflectionTooShort('I added the numerators and forgot to change the bottom number first'))
ok('an empty reflection is refused', reflectionTooShort(''))
ok('whitespace is not a reflection', reflectionTooShort('      '))
eq(`the floor is ${MIN_REFLECTION_WORDS} words`,
  reflectionTooShort(Array.from({ length: MIN_REFLECTION_WORDS }, () => 'word').join(' ')), false)

eq('a clear yes is read as understood', parseReflection({ understood: true, feedback: 'Good' }).understood, true)
eq('a clear no is read as not understood', parseReflection({ understood: false, feedback: 'Look again' }).understood, false)
eq('the feedback is carried through', parseReflection({ understood: false, feedback: ' Look again ' }).feedback, 'Look again')
ok('an unreadable verdict lets the student through rather than trapping them',
  parseReflection(null).understood && parseReflection(null).degraded)
ok('and says it was degraded, so the caller can log it', parseReflection('nonsense').degraded)

// --- one student's run through a suite ---------------------------------------

const suite = {
  heuristicIds: ['heu-math-a', 'heu-math-b'],
  stages: [stage(), stage({ correctIndex: 2 }), stage()],
}
const start = (s = suite) => newRun(s, { sourceId: 's1', questionKey: 'q1', subject: 'math', questionSnippet: 'A question', now: 1000 })

{
  const run = start()
  eq('a new run knows how many stages it has to get through', run.stageCount, 3)
  eq("a new run copies the suite's heuristics, so My Progress needs no second read", run.heuristicIds, ['heu-math-a', 'heu-math-b'])
  eq('a new run has a slot per stage', run.stages.length, 3)
  eq('nothing is passed yet', run.stages.filter((s) => s.passed).length, 0)
  eq('a new run is not complete', run.completedAt, null)
  eq('an unfinished run starts at the first stage', nextStageIndex(run, suite), 0)
  eq('a run that has answered nothing reads as not started', runStatus(run).state, 'notStarted')
  eq('and it starts on the stage as written, not on a variant', questionForStage(suite, run, 0), suite.stages[0])
}

{
  // The straight run: three right answers, no reflections.
  let run = start()
  const a = answerStage(run, 0, 0, suite, 2000)
  ok('a right answer is recorded as right', a.correct)
  ok('a right answer passes the stage', stageState(a.run, 0).passed)
  ok('and asks for no reflection', !a.needsReflection)
  ok('one of three does not finish the suite', !a.done)
  eq('resume moves to the next unpassed stage', nextStageIndex(a.run, suite), 1)

  const b = answerStage(a.run, 1, 2, suite, 3000)
  const c = answerStage(b.run, 2, 0, suite, 4000)
  ok('passing the last stage finishes the suite', c.done)
  eq('and the run is stamped complete', c.run.completedAt, 4000)
  eq('a complete run reads as complete', runStatus(c.run).state, 'complete')
  eq('three stages passed first time', runEffort(c.run).firstTime, 3)
  eq('and nothing was retried', runEffort(c.run).retries, 0)
}

{
  // The wrong answer: it does not fail the stage, it asks for the reflection.
  let run = start()
  const wrong = answerStage(run, 0, 3, suite, 2000)
  ok('a wrong answer is recorded as wrong', !wrong.correct)
  ok('a wrong answer does NOT pass the stage', !stageState(wrong.run, 0).passed)
  ok('it asks for a written reflection', wrong.needsReflection)
  ok('a wrong answer never finishes the suite', !wrong.done)
  eq('resume stays on the stage they have not passed', nextStageIndex(wrong.run, suite), 0)
  eq('an unpassed stage reads as unfinished, not failed', runStatus(wrong.run).state, 'unfinished')

  // A reflection the model does not accept keeps them where they are.
  const bluff = recordReflection(wrong.run, 0, 'because it just is', { understood: false, feedback: 'Look at the second line again' }, 2500)
  ok('a reflection that misses is not accepted', !bluff.understood)
  ok('and the stage still wants one', stageState(bluff.run, 0).needsReflection)
  eq('they stay on the same question, not a new one', stageState(bluff.run, 0).variant, 0)
  eq('the feedback comes back for the student to read', bluff.feedback, 'Look at the second line again')
  eq('the attempt is kept, so nothing is lost', stageState(bluff.run, 0).reflections.length, 1)

  // One that lands moves them to the next variant.
  const got = recordReflection(bluff.run, 0, 'I used the first number instead of the total', { understood: true, feedback: 'That is it' }, 3000)
  ok('a reflection that lands is accepted', got.understood)
  ok('and the stage stops asking for one', !stageState(got.run, 0).needsReflection)
  eq('they move on to the first variant', stageState(got.run, 0).variant, 1)
  eq('both reflections are kept', stageState(got.run, 0).reflections.length, 2)
  eq('and the stage is still not passed - the reflection is not the pass', stageState(got.run, 0).passed, false)
}

{
  // The variant bank.
  const withVariant = addVariant(suite, 0, { text: 'Another go', options: ['w','x','y','z'], correctIndex: 1, explanation: 'why' })
  eq('a variant is added to the stage', withVariant.stages[0].variants.length, 1)
  eq('and the other stages are untouched', withVariant.stages[1].variants, undefined)
  ok('the original suite is not mutated', suite.stages[0].variants === undefined)

  let run = start(withVariant)
  run = answerStage(run, 0, 3, withVariant, 2000).run
  run = recordReflection(run, 0, 'I misread which total it wanted from me', { understood: true }, 2500).run
  eq('after a reflection the student faces the variant, not the original',
    questionForStage(withVariant, run, 0).text, 'Another go')

  const hit = answerStage(run, 0, 1, withVariant, 3000)
  ok('and the variant is marked against the variant’s own answer key', hit.correct)
  ok('passing the variant passes the stage', stageState(hit.run, 0).passed)
  eq('two attempts were needed', runEffort(hit.run).attempts, 2)
  eq('which counts as one retry', runEffort(hit.run).retries, 1)
  eq('and it was not a first-time pass', runEffort(hit.run).firstTime, 0)
}

{
  // Running the bank dry is the caller's cue to have one written.
  let run = start()
  run = answerStage(run, 0, 3, suite, 2000).run
  run = recordReflection(run, 0, 'I picked the one that looked biggest instead', { understood: true }, 2500).run
  eq('with no variant written yet there is no question to show', questionForStage(suite, run, 0), null)
  eq('answering when there is no question changes nothing', answerStage(run, 0, 0, suite, 3000).run, run)
}

{
  // Out of order, because the rail lets a student jump back.
  let run = start()
  run = answerStage(run, 2, 0, suite, 2000).run
  eq('passing the last stage first does not finish the suite', runStatus(run).state, 'unfinished')
  eq('and resume goes back to the first gap, not to the end', nextStageIndex(run, suite), 0)
}
eq('answering a stage that does not exist changes nothing', answerStage(start(), 99, 0, suite, 2000).run.stages.length, 3)
eq('a stage index past the end reads as a blank stage rather than throwing', stageState(start(), 99).passed, false)

// --- My Progress ---------------------------------------------------------------

{
  const made = (id, subject, ids, passed, total, complete) => ({
    id, subject, heuristicIds: ids, stageCount: total,
    stages: Array.from({ length: total }, (_, i) => ({ attempts: i < passed ? [{}] : [], reflections: [], passed: i < passed })),
    completedAt: complete ? 9 : null,
  })
  const runs = [made('r1', 'math', ['heu-math-a', 'heu-math-b'], 3, 3, true),
    made('r2', 'thinking', ['heu-think-a'], 1, 4, false),
    made('r3', 'math', [], 0, 5, false)]
  const byId = { 'heu-math-a': { name: 'Work backwards' }, 'heu-math-b': { name: 'Check it' }, 'heu-think-a': { name: 'Find the assumption' } }
  const tree = progressTree(runs, byId)
  eq('both subjects appear', tree.map((s) => s.subject), ['math', 'thinking'])
  eq('a run with two heuristics is listed under both', tree[0].groups.length, 3)
  eq('groups are named, not left as ids', tree[0].groups[0].name, 'Check it')
  ok('a run with no heuristic still appears, rather than vanishing', tree[0].groups.some((g) => g.id === '_none'))
  eq('an unknown heuristic id falls back to the id rather than showing blank',
    progressTree([runs[0]], {})[0].groups[0].name, 'heu-math-a')
  eq('no runs is an empty tree, not a crash', progressTree([], {}).length, 0)
  eq('an unknown subject is not dropped on the floor',
    progressTree([{ id: 'x', subject: 'astrology', heuristicIds: [], stageCount: 1, stages: [] }], {}).length, 1)
}

// --- the celebrations ------------------------------------------------------------

{
  const sheet = { id: 's', use: 'complete', cols: 5, rows: 5, frames: 25, skip: [5], fps: 10, size: 256 }
  eq('a skipped frame is left out of the order', frameOrder(sheet).length, 24)
  ok('and the frames around it still play', frameOrder(sheet).includes(4) && frameOrder(sheet).includes(6))
  ok('the skipped frame itself does not', !frameOrder(sheet).includes(5))
  eq('a sheet with nothing skipped plays every frame', frameOrder({ frames: 9 }).length, 9)
  eq('the run length is counted in playing frames, not in cells', runLength(sheet), 2400)
  eq('a sheet with no fps is assumed to be twelve', runLength({ frames: 12 }), 1000)
}
{
  const list = [
    { id: 'a', use: 'complete' }, { id: 'b', use: 'complete' }, { id: 'c', use: 'pass' },
  ]
  eq('a celebration is picked from the right kind', pickCelebration('pass', null, () => 0, list).id, 'c')
  eq('the one that played last is not played again', pickCelebration('complete', 'a', () => 0, list).id, 'b')
  eq('unless it is the only one there is', pickCelebration('pass', 'c', () => 0, list).id, 'c')
  eq('nothing registered for a kind returns null, not a crash', pickCelebration('nope', null, () => 0, list), null)
  eq('an empty registry returns null', pickCelebration('complete', null, () => 0, []), null)
  ok('a random of almost one does not run off the end', !!pickCelebration('complete', null, () => 0.999999, list))
}
ok('the ninja sheet is registered for the end of a suite',
  CELEBRATIONS.some((c) => c.id === 'ninja-smoke' && c.use === 'complete'))
ok('every registered sheet has enough frames to fill its grid',
  CELEBRATIONS.every((c) => c.frames <= c.cols * c.rows))
ok('every registered sheet plays at least one frame', CELEBRATIONS.every((c) => frameOrder(c).length > 0))

ok('the band does not say the same word twice running', pickPassWord('PASS', () => 0) !== 'PASS')
ok('a word is always returned, even when it is the only one left', !!pickPassWord('ONLY', () => 0, ['ONLY']))
ok('PASS is the most common word, because it is the one that is true',
  PASS_WORDS.filter((w) => w === 'PASS').length > PASS_WORDS.length / 3)

console.log(`${pass} pass, ${fails.length} fail`)
for (const f of fails) console.log('  FAIL: ' + f)
process.exit(fails.length ? 1 : 0)
