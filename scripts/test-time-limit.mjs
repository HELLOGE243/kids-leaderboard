/**
 * The minutes a student gets for a paper.
 *
 *   node scripts/test-time-limit.mjs
 *
 * This existed twice and the two copies disagreed. The teacher's library
 * showed suggestedTimeLimit() as the placeholder in the time box - a 33
 * question paper displayed 50 - while the student player fell back to a
 * hard-coded 10 in four separate places. A teacher who saw a sensible number
 * already sitting in the box and left it alone stored nothing, and the paper
 * then ran for ten minutes. Both numbers were "the default".
 *
 * So the rule worth asserting is not any particular number. It is that one
 * function answers the question, and that a stored limit always beats a
 * suggested one - which is what makes the editor inside a quiz authoritative.
 *
 * Pure in, pure out - no DOM, no Firestore, no clock.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/* store.js reaches for the browser the moment it is imported, so these two
   are rebuilt here from their own source rather than imported. Both are pure
   and take no dependencies, which is what makes that honest - and the greps
   at the end of this file are what stop the copy drifting from the original.
   */
const src = readFileSync(join(root, 'src', 'data', 'store.js'), 'utf8')
// Rebuilt rather than lifted blind, so a rename in store.js fails loudly here.
const suggestedTimeLimit = new Function('questionCount', `
  const mins = Math.round((Number(questionCount) || 1) * 1.5 / 5) * 5
  return Math.max(10, Math.min(60, mins))`)
const effectiveTimeLimit = new Function('quiz', `
  const suggestedTimeLimit = ${suggestedTimeLimit.toString()}
  const stored = Number(quiz && quiz.timeLimit)
  if (Number.isFinite(stored) && stored > 0) return stored
  return suggestedTimeLimit((quiz && quiz.questions && quiz.questions.length) || 1)`)

let pass = 0
const fails = []
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`pass  ${name}`) } else {
    fails.push(name); console.log(`FAIL  ${name}${detail ? ' - ' + detail : ''}`)
  }
}
function eq(name, got, want) {
  ok(name, got === want, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`)
}

const qs = (n) => ({ questions: Array.from({ length: n }, (_, i) => ({ id: i })) })

// ------------------------------------------------- store.js still says it
ok('store.js exports the shared suggestion',
  src.includes('export function suggestedTimeLimit('))
/* The copy rebuilt above is only worth testing while it matches the original.
   Asserting the two lines it was built from keeps a change to store.js from
   being quietly tested against the old arithmetic - which would be a suite
   that passes precisely when it should fail. */
ok('and the arithmetic this file rebuilt is still the arithmetic it ships',
  src.includes('const mins = Math.round((Number(questionCount) || 1) * 1.5 / 5) * 5')
  && src.includes('return Math.max(10, Math.min(60, mins))'))
ok('and the stored-beats-suggested rule is still written that way',
  src.includes('if (Number.isFinite(stored) && stored > 0) return stored'))
ok('and the one the players ask',
  src.includes('export function effectiveTimeLimit('))

// ------------------------------------------------------- what a blank means
eq('a 33 question paper suggests 50', suggestedTimeLimit(33), 50)
eq('a 20 question paper suggests 30', suggestedTimeLimit(20), 30)
/* Ten, not the five the arithmetic gives. Every unset paper used to run on
   a hard-coded ten, so a floor of five would have fixed the long papers by
   shortening the short ones - a regression a student meets mid-sitting. */
eq('a short paper never drops below 10', suggestedTimeLimit(1), 10)
eq('and nor does a four question one', suggestedTimeLimit(4), 10)
eq('five questions reaches ten on the arithmetic anyway', suggestedTimeLimit(5), 10)
eq('six is the first that could have been under the floor and is not',
  suggestedTimeLimit(6), 10)
eq('and a very long one is capped at 60', suggestedTimeLimit(500), 60)
eq('no count at all is still a usable number', suggestedTimeLimit(undefined), 10)

// ------------------------------------- a stored limit beats a suggested one
eq('a limit the teacher typed is the limit', effectiveTimeLimit({ timeLimit: 45, ...qs(33) }), 45)
/* The floor is on the SUGGESTION, not on a teacher's decision. Somebody who
   wants a five minute drill types five and gets five. */
eq('a teacher who types five gets five, floor or no floor',
  effectiveTimeLimit({ timeLimit: 5, ...qs(33) }), 5)
eq('and one minute is still one minute',
  effectiveTimeLimit({ timeLimit: 1, ...qs(2) }), 1)
eq('even when it is longer than the cap',
  effectiveTimeLimit({ timeLimit: 120, ...qs(10) }), 120)

// ------------------------------------------------ and an unset one does not
eq('an unset limit gives the number the teacher was shown',
  effectiveTimeLimit({ timeLimit: null, ...qs(33) }), 50)
eq('and so does a missing one', effectiveTimeLimit(qs(33)), 50)
eq('and an undefined one', effectiveTimeLimit({ timeLimit: undefined, ...qs(33) }), 50)
eq('a zero is unset, not a zero-minute paper',
  effectiveTimeLimit({ timeLimit: 0, ...qs(33) }), 50)
eq('and so is a blank string from an input',
  effectiveTimeLimit({ timeLimit: '', ...qs(33) }), 50)
eq('rubbish is unset too, rather than NaN minutes',
  effectiveTimeLimit({ timeLimit: 'soon', ...qs(33) }), 50)

// A number input hands back a string, and a string of minutes is minutes.
eq('a numeric string is honoured, because an input gives one',
  effectiveTimeLimit({ timeLimit: '45', ...qs(33) }), 45)

// ------------------------------------------------------------ the old bug
/* Named carefully now that the floor is ten: a SHORT unset paper is
   legitimately ten minutes. What must never happen again is a long one
   collapsing to ten while its teacher is shown fifty. */
ok('a long paper no longer collapses to ten minutes',
  effectiveTimeLimit(qs(33)) !== 10 && effectiveTimeLimit({ timeLimit: null, ...qs(20) }) !== 10)
eq('a paper of 7 questions lands on 10 by the arithmetic',
  suggestedTimeLimit(7), 10)
ok('no unset paper is ever shorter than it used to be',
  [1, 2, 3, 4, 5, 8, 13, 20, 33, 40].every((n) => suggestedTimeLimit(n) >= 10))

// --------------------------------------- nobody keeps a second copy of it
for (const file of [
  'src/pages/HomeworkDashboard.jsx',
  'src/pages/QuizDashboard.jsx',
  'src/pages/QuizBuilder.jsx',
  'src/components/ClassQuizBrowser.jsx',
]) {
  const text = readFileSync(join(root, file), 'utf8')
  ok(`${file} has no hard-coded ten minute fallback`,
    !/timeLimit\s*\|\|\s*10/.test(text))
  ok(`${file} does not define its own suggestion`,
    !/function suggestedTimeLimit/.test(text))
}

console.log(`\n${pass} pass, ${fails.length} fail`)
if (fails.length) {
  console.log(fails.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
