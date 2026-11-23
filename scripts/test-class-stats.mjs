/**
 * What the class did on one question.
 *
 * The cases that matter here are the ones where there is no data, because the
 * two bugs this replaced were both a missing number reported as a real one: a
 * dash that meant "never implemented", and a 0% that meant "nobody got it
 * right" when most of the class had.
 */
import { questionCorrectness, classCorrectPct } from '../src/data/classStats.js'

let pass = 0
let fail = 0
const ok = (what, cond) => { if (cond) { pass++ } else { fail++; console.log(`  FAIL  ${what}`) } }
const eq = (what, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++
  else { fail++; console.log(`  FAIL  ${what}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`) }
}

// Stand-ins for the scoring in store.js: a multiple-choice question worth one
// mark, a cloze worth three, and a writing question worth nothing until marked.
const mc = { kind: 'mc' }
const cloze = { kind: 'cloze' }
const writing = { kind: 'writing' }
const score = (q, a) => {
  if (q.kind === 'mc') return a === 1 ? 1 : 0
  if (q.kind === 'cloze') return Array.isArray(a) ? a.filter((x) => x === 1).length : 0
  return 0
}
const outOf = (q) => (q.kind === 'cloze' ? 3 : q.kind === 'writing' ? 0 : 1)

// --- questionCorrectness: what gets recorded ---
{
  eq('a right answer records 1 and a wrong one 0',
    questionCorrectness([mc, mc], [1, 0], score, outOf), [1, 0])
  eq('a question answered in full is right',
    questionCorrectness([cloze], [[1, 1, 1]], score, outOf), [1])
  eq('a question answered in part is not right, though it earned marks',
    questionCorrectness([cloze], [[1, 1, 0]], score, outOf), [0])
  eq('an unanswered question is wrong, not unmarkable',
    questionCorrectness([mc], [undefined], score, outOf), [0])
}
{
  // The reason null exists. Writing is zero out of zero until a teacher marks
  // it, so `score >= outOf` reads 0 >= 0 and calls it correct.
  eq('an unmarked writing question records null, not 1',
    questionCorrectness([writing], ['an essay'], score, outOf), [null])
  eq('and it does not matter what was written',
    questionCorrectness([writing], [''], score, outOf), [null])
  eq('a paper of mixed types records one entry per question in order',
    questionCorrectness([mc, writing, cloze], [1, 'essay', [1, 1, 1]], score, outOf), [1, null, 1])
}
{
  eq('no questions is an empty list, not a crash', questionCorrectness(null, null, score, outOf), [])
  eq('missing answers mark every question wrong', questionCorrectness([mc, mc], null, score, outOf), [0, 0])
}

// --- classCorrectPct: reading the recorded lists ---
const rec = (list) => ({ questionCorrect: list })
const ans = (list) => ({ answers: list })
const isOne = (a) => a === 1

{
  eq('three of four right reads 75%',
    classCorrectPct([rec([1]), rec([1]), rec([1]), rec([0])], 0, isOne), 75)
  eq('it reads the question asked for, not the first',
    classCorrectPct([rec([0, 1]), rec([0, 1])], 1, isOne), 100)
  eq('a question nobody got right reads 0%, which is a real figure',
    classCorrectPct([rec([0]), rec([0])], 0, isOne), 0)
}
{
  // The bug: aggregate rows carry a score and no answers. Counting them as
  // wrong is what printed 0% across a whole paper.
  const aggregate = [{ score: 20, total: 30 }, { score: 25, total: 30 }]
  eq('rows with neither a record nor answers give null, not 0%',
    classCorrectPct(aggregate, 0, isOne), null)
  eq('and one real record among them is reported on its own',
    classCorrectPct([...aggregate, rec([1])], 0, isOne), 100)
}
{
  eq('an unmarked writing question is left out rather than counted wrong',
    classCorrectPct([rec([null]), rec([null]), rec([1])], 0, isOne), 100)
  eq('and a paper where every entry is unmarked gives null',
    classCorrectPct([rec([null]), rec([null])], 0, isOne), null)
}
{
  // Papers sat before this was recorded: whatever is held locally still counts.
  eq('attempts carrying answers are marked when they have no record',
    classCorrectPct([ans([1]), ans([0])], 0, isOne), 50)
  eq('records and answers are counted together',
    classCorrectPct([rec([1]), ans([1]), ans([0])], 0, isOne), 67)
  eq('a record wins over the answers on the same attempt',
    classCorrectPct([{ questionCorrect: [0], answers: [1] }], 0, isOne), 0)
}
{
  eq('nothing at all gives null', classCorrectPct([], 0, isOne), null)
  eq('a missing list is not a crash', classCorrectPct(null, 0, isOne), null)
  eq('a question beyond the end of a record gives null',
    classCorrectPct([rec([1])], 5, isOne), null)
  eq('and a question beyond the end of an answer list is counted wrong, not right',
    classCorrectPct([ans([1])], 5, isOne), 0)
}
{
  // A revision sitting records null for every question it did not ask, so it
  // cannot report a two-question revision as thirty-six failures.
  const redo = { questionCorrect: [null, null, 1, null, 0] }
  eq('a revision does not count the questions it never asked',
    classCorrectPct([redo], 0, isOne), null)
  eq('but does count the ones it did', classCorrectPct([redo], 2, isOne), 100)
  eq('including the ones it got wrong', classCorrectPct([redo], 4, isOne), 0)
}

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
