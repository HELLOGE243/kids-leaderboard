/**
 * The archive restore planner: what goes back into a student's record.
 *
 * Every case here is one that would be a write to a live child's record if it
 * were wrong, so the duplicate tests matter as much as the happy path.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { restorePlan } = require('../functions/archiveRestore.js')

let pass = 0
let fail = 0
const ok = (what, cond) => { if (cond) { pass++ } else { fail++; console.log(`  FAIL  ${what}`) } }
const eq = (what, got, want) => {
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  if (a === b) pass++
  else { fail++; console.log(`  FAIL  ${what}\n        got  ${a}\n        want ${b}`) }
}

const sub = (o) => ({ kind: 'homework', studentId: '00478838', answers: [], questionTimes: [], ...o })

// --- the papers come back ---
{
  const plan = restorePlan({}, [sub({ id: 'h1', quizSetId: 'q1', score: 29, total: 38, date: '2026-11-21' })])
  eq('a paper missing from an empty record is restored', plan.restored.length, 1)
  eq('it goes into homeworkAttempts', Object.keys(plan.adds), ['homeworkAttempts'])
  eq('and keeps the mark it was sat for', [plan.adds.homeworkAttempts[0].score, plan.adds.homeworkAttempts[0].total], [29, 38])
  ok('and says on the record that it came from the archive', plan.adds.homeworkAttempts[0].restoredFromArchive === true)
}

// --- nothing is ever added twice ---
{
  const doc = { homeworkAttempts: [{ id: 'h1', quizSetId: 'q1', score: 29, total: 38 }] }
  const plan = restorePlan(doc, [sub({ id: 'h1', quizSetId: 'q1', score: 29, total: 38, date: '2026-11-21' })])
  eq('a paper the record already holds is left alone', plan.restored, [])
  eq('and the reason is given', plan.skipped[0].why, 'already in the record')
  eq('and the skip names the paper and the mark it refused', [plan.skipped[0].quizSetId, plan.skipped[0].score, plan.skipped[0].total], ['q1', 29, 38])
  eq('and nothing is written to that field', plan.adds.homeworkAttempts, undefined)
}
{
  // The same paper sat twice and archived under two ids. The app allows one
  // attempt per paper, so restoring both would show an impossible record.
  const doc = { homeworkAttempts: [{ id: 'h1', quizSetId: 'q1' }] }
  const plan = restorePlan(doc, [sub({ id: 'h2', quizSetId: 'q1', date: '2026-11-21' })])
  eq('a second archived attempt at a paper already in the record is refused', plan.restored, [])
  eq('and says so', plan.skipped[0].why, 'another attempt at that paper is already there')
}
{
  // Two archived copies of one paper, and an empty record: exactly one of them
  // may go back, or the restore itself creates the duplicate.
  const plan = restorePlan({}, [
    sub({ id: 'h1', quizSetId: 'q1', score: 20, date: '2026-11-20' }),
    sub({ id: 'h2', quizSetId: 'q1', score: 29, date: '2026-11-21' }),
  ])
  eq('two archived copies of one paper restore as one', plan.restored.length, 1)
  eq('and the second is skipped rather than dropped silently', plan.skipped.length, 1)
  eq('and the copy that goes back is the better mark, not the earlier one', plan.restored[0].id, 'h2')
  eq('and the skip says a better copy won', plan.skipped[0].why, 'the archive holds a better copy of that paper (29/0)')
}
{
  // Equally good copies: the choice must not depend on the order the archive
  // happened to be read in, so the earliest wins and reading it backwards
  // changes nothing.
  const two = [
    sub({ id: 'h1', quizSetId: 'q1', score: 20, date: '2026-11-20' }),
    sub({ id: 'h2', quizSetId: 'q1', score: 20, date: '2026-11-21' }),
  ]
  eq('of two equally good copies the earlier is restored', restorePlan({}, two).restored[0].id, 'h1')
  eq('and reading the archive in the other order restores the same one',
    restorePlan({}, two.slice().reverse()).restored[0].id, 'h1')
}
{
  // A better copy of a paper the record already holds is still refused: the
  // record is the authority on what has been sat, and swapping a mark out from
  // under a student is not a restore.
  const doc = { homeworkAttempts: [{ id: 'h1', quizSetId: 'q1', score: 10 }] }
  const plan = restorePlan(doc, [sub({ id: 'h2', quizSetId: 'q1', score: 30, date: '2026-11-21' })])
  eq('a better archived copy does not replace a paper already in the record', plan.restored, [])
}

// --- each kind lands where the app looks for it ---
{
  const plan = restorePlan({}, [
    sub({ id: 'h1', kind: 'homework', quizSetId: 'q1', date: '2026-11-01' }),
    sub({ id: 'r1', kind: 'redo', quizSetId: 'q2', date: '2026-11-02' }),
    sub({ id: 'c1', kind: 'checkpoint', quizSetId: 'q3', date: '2026-11-03' }),
  ])
  eq('homework, redos and checkpoints go to three different fields',
    Object.keys(plan.adds).sort(), ['homeworkAttempts', 'homeworkRedos', 'quizAttempts'])
  eq('a checkpoint is keyed by quizId, as that list is read', plan.adds.quizAttempts[0].quizId, 'q3')
  eq('and carries no quizSetId the app would not read', plan.adds.quizAttempts[0].quizSetId, undefined)
  eq('a homework paper is keyed by quizSetId', plan.adds.homeworkAttempts[0].quizSetId, 'q1')
}
{
  // A redo of a paper whose homework attempt is in the record is not a
  // duplicate: they are different lists and a student may do both.
  const doc = { homeworkAttempts: [{ id: 'h1', quizSetId: 'q1' }] }
  const plan = restorePlan(doc, [sub({ id: 'r1', kind: 'redo', quizSetId: 'q1', date: '2026-11-02' })])
  eq('a redo is restored even when the homework attempt is already there', plan.restored.length, 1)
  eq('and lands in homeworkRedos', plan.restored[0].field, 'homeworkRedos')
}
{
  const plan = restorePlan({}, [sub({ id: 'x1', kind: 'practice', quizSetId: 'q1', date: '2026-11-01' })])
  eq('a kind this restore does not know is refused, not guessed at', plan.restored, [])
  eq('and is reported so it can be looked at', plan.unknown, [{ id: 'x1', kind: 'practice' }])
}

// --- the shape that is copied, not reshaped ---
{
  // Firestore cannot hold an array inside an array, so the app wraps inner
  // arrays in a single-key object - in BOTH collections. The restore is a copy:
  // if it ever unwraps one of these, a restored paper marks wrongly.
  const wrapped = [{ __arr: [1, 2] }, 3, null]
  const plan = restorePlan({}, [sub({ id: 'h1', quizSetId: 'q1', answers: wrapped, date: '2026-11-01' })])
  eq('wrapped answers are copied across untouched', plan.adds.homeworkAttempts[0].answers, wrapped)
}
{
  const plan = restorePlan({}, [
    sub({ id: 'h2', quizSetId: 'q2', date: '2026-11-21' }),
    sub({ id: 'h1', quizSetId: 'q1', date: '2026-10-17' }),
  ])
  eq('restored papers are put back oldest first', plan.adds.homeworkAttempts.map((a) => a.id), ['h1', 'h2'])
}

// --- it does not fall over on the shapes a real document has ---
{
  eq('a student with no archive restores nothing', restorePlan({}, []).restored, [])
  eq('a missing document is not a crash', restorePlan(null, null).restored, [])
  const plan = restorePlan({ homeworkAttempts: 'not an array' }, [sub({ id: 'h1', quizSetId: 'q1', date: '2026-11-01' })])
  eq('a field that is not an array is treated as empty rather than read', plan.restored.length, 1)
  eq('a submission with no id is ignored', restorePlan({}, [sub({ quizSetId: 'q1' })]).restored, [])
}
{
  // The wipe this was written for: 13 keys left, every work array empty.
  const plan = restorePlan({ homeworkAttempts: [], quizAttempts: [], homeworkStarts: 1 },
    Array.from({ length: 30 }, (_, i) => sub({ id: `h${i}`, quizSetId: `q${i}`, date: `2026-11-${String(i + 1).padStart(2, '0')}` })))
  eq('a wiped record takes all thirty papers back', plan.restored.length, 30)
  eq('and none of them is skipped', plan.skipped, [])
}

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
