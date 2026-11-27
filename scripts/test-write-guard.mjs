/**
 * The guard that stands between a stale snapshot and a term's work.
 *
 * These lines had no tests until a Year 4 student's record was emptied by the
 * one case they did not cover, so the cases are written as the situations they
 * come from rather than as inputs and outputs.
 */
import {
  wouldDestroyWork, uncheckedWriteRefusal, mergePartialOverStored, lostKeys, WORK_KEYS,
} from '../src/data/writeGuard.js'

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
  // The stub drops keys as well as emptying arrays, and since 27 Nov the
  // dropped keys are the question asked first - it is the stronger signal and
  // it reads better in a console, because it names what would be deleted
  // rather than counting what is left.
  ok('and the refusal names the keys it would delete',
    /does not mention/.test(refusal) && /homeworkAttempts/.test(refusal) && /scores/.test(refusal))
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


// --- lostKeys: the rule added after Hannah, 27 Nov ---
{
  // Her record as the server held it, and the write that landed on it. The
  // numbers are the real ones: 25 attempts became 2, which is why the old
  // "went to exactly none" test never fired, and three keys went missing.
  const hers = full({
    homeworkAttempts: Array.from({ length: 25 }, (_, i) => ({ id: `a${i}` })),
    vocabBank: Array.from({ length: 40 }, (_, i) => ({ word: `w${i}` })),
    dojoCustomReview: { on: true },
    profile: { tokens: 269 },
  })
  const standIn = {
    _savedAt: 9000,
    _partial: true,
    studentId: '46090575',
    homeworkAttempts: [{ id: 'a25' }, { id: 'a26' }],
    homeworkRedos: [],
    quizAttempts: [],
    scores: [1],
    dojoCards: [],
    homeworkProgress: {},
  }
  eq('the keys Hannah lost are the keys this names',
    lostKeys(hers, standIn).sort(), ['dojoCustomReview', 'profile', 'vocabBank'])
  const refusal = wouldDestroyWork(hers, standIn)
  ok('and the write that lost them is refused', !!refusal)
  ok('and the refusal names them', /profile/.test(refusal) && /vocabBank/.test(refusal))
  ok('and it says why dropping a key is a deletion', /written whole/.test(refusal))
}
{
  // The point of the change, stated as a test: the old rule asked whether an
  // array reached zero, and the stand-in record is built around the item being
  // written, so it never does. 25 to 2 must be refused.
  const stored = full({ homeworkAttempts: [1, 2, 3, 4, 5], profile: { a: 1 } })
  const nonzero = { _savedAt: 9000, homeworkAttempts: [6], homeworkRedos: [], quizAttempts: [], scores: [1], dojoCards: [], homeworkProgress: {} }
  ok('work that shrinks without reaching none is refused', !!wouldDestroyWork(stored, nonzero))
}
{
  // The same shrinkage with every key present and nothing dropped: a teacher
  // taking an attempt off a paper. Allowed, as it was before.
  const stored = full({ homeworkAttempts: [1, 2, 3] })
  no('a teacher removing one attempt from a whole record is allowed',
    wouldDestroyWork(stored, full({ _savedAt: 9000, homeworkAttempts: [1, 2] })))
  no('and emptying it outright on a whole record is still allowed',
    wouldDestroyWork(stored, full({ _savedAt: 9000, homeworkAttempts: [] })))
}
{
  // The rule must not fire on the things it is not about, or it gets switched
  // off and then it protects nobody.
  const stored = full({ dojoClones: [], explanationReports: {}, purchases: null })
  no('dropping a key that held nothing is not a wipe',
    wouldDestroyWork(stored, full({ _savedAt: 9000 })))
  eq('and none of the empty keys are counted as lost', lostKeys(stored, full()), [])
  const overflowed = full({ _overflow: { parts: 2, bytes: 1 }, _migrated: true })
  eq('the overflow manifest disappearing as a record shrinks is not a wipe',
    lostKeys(overflowed, full()), [])
  no('a record that only adds keys goes ahead',
    wouldDestroyWork(full(), full({ _savedAt: 9000, somethingNew: [1] })))
  eq('and nothing stored means nothing to lose', lostKeys(null, full()), [])
  // A write of nothing is every non-empty key lost, and no exception thrown.
  eq('a write of nothing at all loses every key that held something',
    lostKeys(full(), null), ['homeworkAttempts', 'scores'])
}

// --- mergePartialOverStored: the merge that was the other half of it ---
{
  // What actually happened to Hannah. The stored record could be read, so the
  // refusals above were never consulted: the partial record went down the merge
  // path, and the merge copied its one-item array over her twenty-five.
  const stored = {
    _savedAt: 1000,
    homeworkAttempts: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }],
    vocabBank: [{ word: 'liminal' }, { word: 'sanguine' }],
    profile: { tokens: 269 },
  }
  const partial = { _partial: true, _savedAt: 9000, homeworkAttempts: [{ id: 'a4' }] }
  const merged = mergePartialOverStored(stored, partial)
  eq('a partial record adds its attempt rather than replacing the array',
    merged.homeworkAttempts.map((a) => a.id), ['a1', 'a2', 'a3', 'a4'])
  eq('and the keys it never mentions are kept whole', merged.vocabBank.length, 2)
  eq('and so is the profile', merged.profile, { tokens: 269 })
  eq('and the merged record no longer claims to be partial', merged._partial, undefined)
  eq('and it carries the new clock', merged._savedAt, 9000)
  no('and the merged result could not be refused by the guard',
    wouldDestroyWork(stored, { ...merged, _savedAt: 9000 }))
  eq('and neither input was modified', stored.homeworkAttempts.length, 3)
}
{
  // Writing the same item twice - a retry, or two tabs - must not double it.
  const stored = { homeworkAttempts: [{ id: 'a1' }, { id: 'a2' }] }
  const again = { _partial: true, homeworkAttempts: [{ id: 'a2' }] }
  eq('an item already stored is not added twice',
    mergePartialOverStored(stored, again).homeworkAttempts.length, 2)
  // Items with no id of their own: identical content is the only identity
  // there is, and two identical attempts are one attempt.
  eq('an item with no id is matched on its contents',
    mergePartialOverStored({ scores: [{ mark: 7 }] }, { _partial: true, scores: [{ mark: 7 }] }).scores.length, 1)
  eq('and a different one is still added',
    mergePartialOverStored({ scores: [{ mark: 7 }] }, { _partial: true, scores: [{ mark: 8 }] }).scores.length, 2)
  // Each array names its identity differently, and the merge has to know all
  // of them or it appends duplicates of cards a student already has.
  for (const field of ['cardId', 'setId', 'quizSetId', 'word']) {
    const one = { items: [{ [field]: 'x', n: 1 }] }
    eq(`${field} identifies an item`,
      mergePartialOverStored(one, { _partial: true, items: [{ [field]: 'x', n: 2 }] }).items.length, 1)
  }
}
{
  // A value that is not an array still takes the incoming one - that is how a
  // profile field or a progress map is updated through a partial record.
  const merged = mergePartialOverStored(
    { profile: { tokens: 1 }, homeworkProgress: { p1: 'a' } },
    { _partial: true, profile: { tokens: 2 } })
  eq('a non-array value is replaced, not merged', merged.profile, { tokens: 2 })
  eq('and a map it does not mention is left alone', merged.homeworkProgress, { p1: 'a' })
  // A stored value that was never an array, now written as one, or the other
  // way round: take the incoming shape rather than guessing at a union.
  eq('a key that changes shape takes the incoming shape',
    mergePartialOverStored({ scores: null }, { _partial: true, scores: [1] }).scores, [1])
  eq('and an empty stored record is just the partial one, unflagged',
    mergePartialOverStored(null, { _partial: true, scores: [1] }), { scores: [1] })
}

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
