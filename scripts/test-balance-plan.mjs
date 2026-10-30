/**
 * Tests the balance repair rule against the record shapes actually in the
 * live database, read on 2026-10-30.
 *
 *   node scripts/test-balance-plan.mjs
 *
 * No credentials, no network. The point is that the decision about eighty-four
 * children's balances can be checked before it is ever pointed at them.
 */
import { planFor } from './lib/balance-plan.mjs'

const int = (n) => ({ integerValue: String(n) })
const dbl = (n) => ({ doubleValue: n })

let failed = 0
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) {
    failed++
    console.log(`FAIL  ${name}`)
    console.log(`        got  ${JSON.stringify(got)}`)
    console.log(`        want ${JSON.stringify(want)}`)
  } else {
    console.log(`pass  ${name}`)
  }
}

// --- Siyan: the ordinary case. Real figures in core, a profile of zeroes. ---
check('zeroed profile is filled from core',
  planFor(
    { tokens: int(320), tokensEarned: int(320), coinsSpent: int(0), bonusCoins: int(3810) },
    { tokens: int(0), tokensEarned: int(0), coinsSpent: int(0), bonusCoins: int(0) },
  ),
  {
    changes: {
      tokens: { from: 0, to: 320 },
      tokensEarned: { from: 0, to: 320 },
      bonusCoins: { from: 0, to: 3810 },
    },
    core: null,
    refuse: null,
  })

// --- Rob: core itself is corrupt, so nothing is written without a decision ---
const rob = { tokens: int(11), tokensEarned: int(11), coinsSpent: int(0), bonusCoins: dbl(3.00010038013016e24) }
const robProfile = { tokens: int(0), tokensEarned: int(0), coinsSpent: int(0), bonusCoins: int(0) }
const robPlan = planFor(rob, robProfile)
check('an absurd core value refuses the whole student',
  robPlan.refuse !== null, true)
check('  and never proposes writing the absurd value',
  Object.keys(robPlan.changes).includes('bonusCoins'), false)

// --- and with a decision supplied, it proceeds ---
check('--set-bonus supplies the number and unblocks it',
  planFor(rob, robProfile, 1710),
  {
    changes: {
      tokens: { from: 0, to: 11 },
      tokensEarned: { from: 0, to: 11 },
      bonusCoins: { from: 0, to: 1710 },
    },
    core: { bonusCoins: { from: 3.00010038013016e24, to: 1710 } },
    refuse: null,
  })

// --- a student already in agreement is left completely alone ---
check('matching records produce no changes',
  planFor(
    { tokens: int(5), tokensEarned: int(5), coinsSpent: int(10), bonusCoins: int(200) },
    { tokens: int(5), tokensEarned: int(5), coinsSpent: int(10), bonusCoins: int(200) },
  ),
  { changes: {}, core: null, refuse: null })

// --- a missing profile field counts as zero, which is the state most are in ---
check('a missing profile field is treated as zero, not skipped',
  planFor({ bonusCoins: int(640) }, {}),
  { changes: { bonusCoins: { from: 0, to: 640 } }, core: null, refuse: null })

// --- a field absent from core is not invented in the profile ---
check('a field core does not have is left alone',
  planFor({ tokens: int(3) }, { bonusCoins: int(99) }),
  { changes: { tokens: { from: 0, to: 3 } }, core: null, refuse: null })

// --- EMILY: no tokens either side, but real coins to restore ---
check('coins restored where tokens were always zero',
  planFor(
    { tokens: int(0), tokensEarned: int(0), coinsSpent: int(0), bonusCoins: int(110) },
    { tokens: int(0), tokensEarned: int(0), coinsSpent: int(0), bonusCoins: int(0) },
  ),
  { changes: { bonusCoins: { from: 0, to: 110 } }, core: null, refuse: null })

// --- never silently raise someone's spend ---
check('coinsSpent is reconciled like any other field',
  planFor({ coinsSpent: int(50) }, { coinsSpent: int(0) }),
  { changes: { coinsSpent: { from: 0, to: 50 } }, core: null, refuse: null })

// --- Rob chose zero. A zero override has to reach core too, or the app goes
// --- on reading 3.0001e+24 and his coin display never changes.
const robZero = planFor(rob, robProfile, 0)
check('a zero override still repairs core',
  robZero.core, { bonusCoins: { from: 3.00010038013016e24, to: 0 } })
check('  and proposes no profile change, the profile already being zero',
  Object.keys(robZero.changes).includes('bonusCoins'), false)
check('  and does not refuse',
  robZero.refuse, null)
check('  while still reconciling his tokens',
  robZero.changes.tokens, { from: 0, to: 11 })

// --- an override that agrees with core leaves core alone ---
check('an override matching core writes nothing to core',
  planFor({ bonusCoins: int(200) }, { bonusCoins: int(0) }, 200),
  { changes: { bonusCoins: { from: 0, to: 200 } }, core: null, refuse: null })

console.log(failed ? `\n${failed} FAILED` : '\nall 13 pass')
process.exit(failed ? 1 : 0)
