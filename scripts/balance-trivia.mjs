/**
 * Spreads the correct answer evenly across the four option positions.
 *
 *   node scripts/balance-trivia.mjs [--check]
 *
 * Writing questions by hand produces a strong positional bias without anyone
 * intending it - the first draft of this bank had the answer in position B for
 * 44 of 60 questions, so a student who always pressed the second button would
 * have scored 73% without reading anything. Generated batches do the same.
 *
 * This rotates each question's options so that the correct one lands in a
 * position chosen round-robin. Rotation rather than a shuffle, so the order of
 * the distractors relative to each other is preserved: they are often written
 * to run from most to least plausible, and scrambling that makes some
 * questions read oddly.
 *
 * --check reports the spread and exits non-zero if it is lopsided, so it can
 * run in the same breath as the other checks.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const path = join(root, 'src', 'data', 'triviaBank.js')
const CHECK = process.argv.includes('--check')

const { default: bank } = await import('../src/data/triviaBank.js')

function spread(qs) {
  const d = [0, 0, 0, 0]
  for (const q of qs) d[q.correct]++
  return d
}

const before = spread(bank)
console.log(`${bank.length} questions, answer positions ${before.join('/')}`)

if (CHECK) {
  const worst = Math.max(...before)
  const fair = bank.length / 4
  // Allow a reasonable margin; this is about catching a landslide, not
  // enforcing an exact quarter in each position.
  const ok = worst <= fair * 1.6
  console.log(ok
    ? '  spread is acceptable'
    : `  LOPSIDED: position ${before.indexOf(worst)} holds ${worst} of ${bank.length}`)
  process.exit(ok ? 0 : 1)
}

const balanced = bank.map((q, i) => {
  const want = i % 4
  // Rotate left by however far the correct option is from where we want it.
  const shift = (q.correct - want + 4) % 4
  const options = q.options.map((_, j) => q.options[(j + shift) % 4])
  return { ...q, options, correct: want }
})

for (const q of balanced) {
  if (q.options[q.correct] !== bank.find((o) => o.id === q.id).options[bank.find((o) => o.id === q.id).correct]) {
    throw new Error(`${q.id}: rotation moved the wrong option into place`)
  }
}

const header = readFileSync(path, 'utf8').split('const BANK = [')[0]
const body = balanced.map((q) =>
  '  ' + JSON.stringify({
    id: q.id, category: q.category, question: q.question,
    options: q.options, correct: q.correct, explanation: q.explanation,
  }).replace(/^\{"/, '{ "').replace(/\}$/, ' }') + ','
).join('\n')

writeFileSync(path, `${header}const BANK = [\n${body}\n]\n\nexport default BANK\nexport const TRIVIA_COUNT = BANK.length\n`)
console.log(`rebalanced to ${spread(balanced).join('/')}`)
