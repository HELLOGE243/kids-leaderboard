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
  MIN_STAGES, MAX_STAGES,
} from '../src/data/trainingDojo.js'

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

// --- one student's run through a suite --------------------------------------

const suite = { heuristicIds: ['heu-math-a', 'heu-math-b'], stages: [stage(), stage({ correctIndex: 2 }), stage()] }

{
  const run = newRun(suite, { sourceId: 's1', questionKey: 'q1', subject: 'math', questionSnippet: 'A question', now: 1000 })
  eq('a new run knows how many stages it has to get through', run.stageCount, 3)
  eq("a new run copies the suite's heuristics, so My Progress needs no second read", run.heuristicIds, ['heu-math-a', 'heu-math-b'])
  eq('a new run has answered nothing', run.answers.length, 0)
  eq('a new run is not complete', run.completedAt, null)
  eq('an unfinished run starts at the first stage', nextStageIndex(run, suite), 0)
  eq('a run that has answered nothing reads as not started', runStatus(run).state, 'notStarted')
}
{
  let run = newRun(suite, { sourceId: 's1', questionKey: 'q1', subject: 'math', now: 1000 })
  const a = answerStage(run, 0, 0, suite, 2000)
  ok('a right answer is recorded as right', a.correct)
  ok('answering one of three does not finish the suite', !a.done)
  eq('a part-done run reads as unfinished', runStatus(a.run).state, 'unfinished')
  eq('and resume lands on the next unanswered stage', nextStageIndex(a.run, suite), 1)

  const b = answerStage(a.run, 1, 0, suite, 3000)
  ok('a wrong answer is recorded as wrong', !b.correct)
  ok('but a wrong answer still counts as answered', !b.done && runStatus(b.run).answered === 2)

  const c = answerStage(b.run, 2, 0, suite, 4000)
  ok('answering the last stage finishes the suite', c.done)
  eq('and the run is stamped complete', c.run.completedAt, 4000)
  eq('a complete run reads as complete', runStatus(c.run).state, 'complete')
}
{
  // Out of order, because the rail lets a student jump back.
  let run = newRun(suite, { sourceId: 's1', questionKey: 'q1', subject: 'math', now: 1000 })
  run = answerStage(run, 2, 0, suite, 2000).run
  eq('answering the last stage first does not finish the suite', runStatus(run).state, 'unfinished')
  eq('and resume goes back to the first gap, not to the end', nextStageIndex(run, suite), 0)
}
{
  const run = newRun(suite, { sourceId: 's1', questionKey: 'q1', subject: 'math', now: 1000 })
  eq('answering a stage that does not exist changes nothing', answerStage(run, 99, 0, suite, 2000).run.answers.length, 0)
}

// --- My Progress -------------------------------------------------------------

{
  const runs = [
    { id: 'r1', subject: 'math', heuristicIds: ['heu-math-a', 'heu-math-b'], stageCount: 3, answers: [1, 1, 1], completedAt: 9 },
    { id: 'r2', subject: 'thinking', heuristicIds: ['heu-think-a'], stageCount: 4, answers: [1], completedAt: null },
    { id: 'r3', subject: 'math', heuristicIds: [], stageCount: 5, answers: [], completedAt: null },
  ]
  const byId = { 'heu-math-a': { name: 'Work backwards' }, 'heu-math-b': { name: 'Check it' }, 'heu-think-a': { name: 'Find the assumption' } }
  const tree = progressTree(runs, byId)
  eq('both subjects appear', tree.map((s) => s.subject), ['math', 'thinking'])
  eq('a run with two heuristics is listed under both', tree[0].groups.length, 3)
  eq('groups are named, not left as ids', tree[0].groups[0].name, 'Check it')
  ok('a run with no heuristic still appears, rather than vanishing',
    tree[0].groups.some((g) => g.id === '_none'))
  eq('an unknown heuristic id falls back to the id rather than showing blank',
    progressTree([runs[0]], {})[0].groups[0].name, 'heu-math-a')
  eq('no runs is an empty tree, not a crash', progressTree([], {}).length, 0)
  eq('an unknown subject is not dropped on the floor',
    progressTree([{ id: 'x', subject: 'astrology', heuristicIds: [], stageCount: 1, answers: [] }], {}).length, 1)
}

console.log(`${pass} pass, ${fails.length} fail`)
for (const f of fails) console.log('  FAIL: ' + f)
process.exit(fails.length ? 1 : 0)
