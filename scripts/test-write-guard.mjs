/**
 * The guard that stands between a stale snapshot and a term's work.
 *
 * These lines had no tests until a Year 4 student's record was emptied by the
 * one case they did not cover, so the cases are written as the situations they
 * come from rather than as inputs and outputs.
 */
import { wouldDestroyWork, uncheckedWriteRefusal, WORK_KEYS } from '../src/data/writeGuard.js'

let pass = 0
let fail = 0
const ok = (what, cond) => { if (cond) { pass++ } else { fail++; console.log(`  FAIL  ${what}`) } }
const no = (what, cond) => ok(what, !cond)
const eq = (what, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++
  else { fail++; console.log(`  FAIL  ${what}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`) }
}

// A record as a working student has one: work in it, and more keys besides.
const full = (over = {}) => ({
  _savedAt: 2000,
  homeworkAttempts: [1, 2, 3],
  homeworkRedos: [],
  quizAttempts: [],
  scores: [1],
  profile: {},
  dojoCards: [],
  homeworkProgress: {},
  ...over,
})

// --- wouldDestroyWork: the stale-tab case it was written for ---
{
  const stored = full({ _savedAt: 60000 })
  const stale = full({ _savedAt: 2000 })
  ok('a snapshot taken an hour before the stored record is refused', !!wouldDestroyWork(stored, stale))
  ok('and the refusal says how far behind it is', /58s behind/.test(wouldDestroyWork(stored, stale)))
  no('a snapshot newer than the stored record goes ahead', wouldDestroyWork(stale, stored))
  no('two saves in the same moment are not a rollback',
    wouldDestroyWork(full({ _savedAt: 2000 }), full({ _savedAt: 1500 })))
}

// --- wouldDestroyWork: the stub case ---
{
  // What was written over Evelyn Chen's record: one key, every array empty.
  const stub = { _savedAt: 9000, homeworkStarts: 1 }
  const refusal = wouldDestroyWork(full(), stub)
  ok('a one-key stub over a record holding work is refused', !!refusal)
  ok('and the refusal counts the work and the missing keys', /homeworkAttempts would go from 3 to none/.test(refusal))
}
{
  // A teacher clearing the only attempt at a paper so it can be sat again is
  // allowed to empty the array - the record is not thinner, just emptier.
  const cleared = full({ _savedAt: 9000, homeworkAttempts: [] })
  no('a teacher emptying an array on an otherwise whole record is allowed', wouldDestroyWork(full(), cleared))
}
{
  no('a record with no stored copy to compare against goes ahead', wouldDestroyWork(null, full()))
  for (const key of WORK_KEYS) {
    const stored = full({ homeworkAttempts: [], scores: [], [key]: [1, 2] })
    const stub = { _savedAt: 9000, homeworkStarts: 1 }
    ok(`${key} emptying to none from a stub is refused`, !!wouldDestroyWork(stored, stub))
  }
}

// --- uncheckedWriteRefusal: the case that cost a record ---
{
  // The wipe, exactly: the read failed, so there was nothing to compare
  // against, and a partial record went in as the whole document.
  const partial = { _partial: true, _savedAt: 9000, homeworkStarts: 1 }
  const refusal = uncheckedWriteRefusal(partial, null)
  ok('a partial record is refused when the stored one could not be read', !!refusal)
  ok('and the refusal says both halves of why', /could not be read/.test(refusal) && /partial/.test(refusal))
}
{
  // The same partial record is fine once the stored one can be read: it is
  // merged over it, which happens in firebase.js and never reaches this rule.
  no('a whole record is not refused merely because the read failed',
    uncheckedWriteRefusal(full(), null))
}
{
  // No server copy, but this tab wrote a real record earlier in the session.
  // That is a lower bound on what the student had, whatever the server holds.
  const refusal = uncheckedWriteRefusal({ _savedAt: 9000, homeworkStarts: 1 }, full())
  ok('a stub is refused against what this tab last wrote', !!refusal)
  ok('and the refusal names the tab as the comparison', /this tab last wrote/.test(refusal))
}
{
  no('a record that adds work is not refused',
    uncheckedWriteRefusal(full({ _savedAt: 9000, homeworkAttempts: [1, 2, 3, 4] }), full()))
  no('a first write for a student this tab has never written is allowed',
    uncheckedWriteRefusal(full(), null))
  // Not a crash, and not allowed either: nothing is a record, and writing it
  // over work would lose the work just as surely as a stub would.
  ok('a record that is not there at all is refused against work', !!uncheckedWriteRefusal(null, full()))
  eq('and with nothing to lose it is not a crash', uncheckedWriteRefusal(undefined, undefined), '')
}
{
  // The rule must not fire on a student who genuinely has no work yet, or
  // every new account would fail to save.
  const beginner = { _savedAt: 9000, homeworkAttempts: [], scores: [], profile: {} }
  no('a student with no work yet saves normally', uncheckedWriteRefusal(beginner, beginner))
}

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
