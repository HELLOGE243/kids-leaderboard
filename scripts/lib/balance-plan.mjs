/**
 * The decision half of scripts/repair-balances.mjs, kept apart from the half
 * that talks to the network.
 *
 * Something that is going to rewrite eighty-four children's balances has to be
 * testable without credentials and without a live database, which it cannot be
 * while the rule and the connection live in the same file.
 */

/** The balance fields kept in both places. */
export const PROFILE_KEYS = ['tokens', 'tokensEarned', 'coinsSpent', 'bonusCoins']

/**
 * At or above this a figure is not a balance, it is a bug.
 *
 * One live bonusCoins field holds 3.0001e+24 - the shape of a sum that was
 * concatenated as text rather than added. Copying that into the profile would
 * spread the corruption to the one place still holding a sane value.
 */
export const ABSURD = 1e9

/** Firestore wraps numbers by type; this unwraps either spelling. */
export function num(field) {
  if (!field) return null
  if (field.integerValue !== undefined) return Number(field.integerValue)
  if (field.doubleValue !== undefined) return Number(field.doubleValue)
  return null
}

/**
 * What, if anything, to change for one student.
 *
 * Normally only the profile is wrong and core holds the truth, so `changes`
 * describes a profile write and `core` is null. Where an override has been
 * supplied, it is core that was wrong - that is the only reason to override -
 * so the figure has to be written to both, or the app goes on reading the
 * broken one. `core` carries that second write.
 *
 * @param {object} coreFields their fields on appData/core
 * @param {object} profileFields their profile map in studentData
 * @param {number} [bonusOverride] what to write instead of a core bonusCoins
 * @returns {{changes: object, core: object|null, refuse: string|null}}
 */
export function planFor(coreFields, profileFields, bonusOverride) {
  const changes = {}
  let core = null
  let refuse = null
  for (const key of PROFILE_KEYS) {
    const overridden = bonusOverride !== undefined && key === 'bonusCoins'
    const coreStored = num(coreFields[key])
    const coreVal = overridden ? bonusOverride : coreStored
    const profVal = num(profileFields[key])
    if (coreVal === null) continue
    if (Math.abs(coreVal) >= ABSURD) {
      refuse = `${key} in core is ${coreVal}, which is not a balance`
      continue
    }
    if (overridden && coreStored !== coreVal) {
      core = { ...core, [key]: { from: coreStored, to: coreVal } }
    }
    // A missing profile field is a zero, not "leave it alone": that is exactly
    // the state most of these records are in.
    if (coreVal !== (profVal ?? 0)) changes[key] = { from: profVal ?? 0, to: coreVal }
  }
  return { changes, core, refuse }
}
