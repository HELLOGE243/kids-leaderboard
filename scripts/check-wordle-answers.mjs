/**
 * Every word the daily Wordle can set has to be a real five-letter word.
 *
 *   node scripts/check-wordle-answers.mjs
 *
 * The list once contained HEMP. Four letters. On the day it came up the board
 * could not be filled, let alone solved, and nothing in the code noticed:
 * nothing checked the answers against the dictionary the guesses are checked
 * against. This does, and exits non-zero so it can be run before a release.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'src', 'pages', 'games', 'DailyWordle.jsx'), 'utf8')
const { isRealWord } = await import('../src/data/words5.js')

const body = src.match(/const WORDS = \[([\s\S]*?)\n\]/)[1]
const words = [...body.matchAll(/'([A-Z]+)'/g)].map((m) => m[1])

const problems = []
const seen = new Set()
for (const w of words) {
  if (w.length !== 5) problems.push(`${w} is ${w.length} letters, not 5`)
  else if (!isRealWord(w)) problems.push(`${w} is not in the guess dictionary`)
  if (seen.has(w)) problems.push(`${w} appears more than once`)
  seen.add(w)
}

console.log(`checked ${words.length} answers`)
if (problems.length) {
  for (const p of problems) console.error(`  ! ${p}`)
  process.exit(1)
}
console.log('  every answer is a real five-letter word, and each appears once')
