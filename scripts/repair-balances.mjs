/**
 * Reconciles student balances between the two places they are kept.
 *
 *   node scripts/repair-balances.mjs                 # dry run, changes nothing
 *   node scripts/repair-balances.mjs --apply         # writes
 *   node scripts/repair-balances.mjs --apply --only 61864531
 *   node scripts/repair-balances.mjs --apply --set-bonus 61864531=1710
 *
 * Balances live twice: in each student's own document under `profile`, and in
 * a copy on appData/core that the rest of the app reads. Across this school
 * they disagree - most migrated students carry a profile of zeroes beside a
 * core record holding the real figures, because the migration created the
 * shape and never filled it.
 *
 * This copies core into the empty profiles, so the two agree and the app can
 * stop being one profile write away from zeroing somebody's coins. It does not
 * invent a number: where core itself is absurd - one bonusCoins field holds
 * 3.0001e+24, which is a sum that was concatenated as text rather than added -
 * it refuses to touch that student unless --set-bonus says what to put there.
 *
 * It writes nothing without --apply, and prints exactly what it would do.
 *
 * Authentication: set CS_TEACHER_NAME and CS_TEACHER_PASSWORD, and CS_API_KEY
 * for the Firebase web key. Nothing is read from the repo.
 */
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const argOf = (n) => { const i = args.indexOf(`--${n}`); return i === -1 ? null : args[i + 1] }
const ONLY = argOf('only')

// --set-bonus id=value, repeatable
const OVERRIDES = {}
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--set-bonus') {
    const [id, v] = String(args[i + 1] || '').split('=')
    if (id && v !== undefined) OVERRIDES[id] = Number(v)
  }
}

import { readFileSync, writeFileSync } from 'node:fs'
import { planFor } from './lib/balance-plan.mjs'

const FN = 'https://australia-southeast1-cleverspacev2.cloudfunctions.net'
const DOCS = 'https://firestore.googleapis.com/v1/projects/cleverspacev2/databases/(default)/documents'

// Credentials come from the environment, or from a JSON file given with
// --creds. The file is the safer of the two: a key on a command line ends up
// in shell history and in the transcript of whatever ran it, and this one
// unlocks the whole database.
let creds = {
  name: process.env.CS_TEACHER_NAME,
  password: process.env.CS_TEACHER_PASSWORD,
  apiKey: process.env.CS_API_KEY,
}
const CREDS_FILE = argOf('creds')
if (CREDS_FILE) {
  creds = { ...creds, ...JSON.parse(readFileSync(CREDS_FILE, 'utf8')) }
}
const { name: CS_TEACHER_NAME, password: CS_TEACHER_PASSWORD, apiKey: CS_API_KEY } = creds
if (!CS_TEACHER_NAME || !CS_TEACHER_PASSWORD || !CS_API_KEY) {
  console.error('Credentials missing. Either set CS_TEACHER_NAME, CS_TEACHER_PASSWORD')
  console.error('and CS_API_KEY, or pass --creds path/to/creds.json holding')
  console.error('{"name": "...", "password": "...", "apiKey": "..."}')
  process.exit(1)
}

const post = async (url, body) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`${url} -> ${r.status} ${await r.text()}`)
  return r.json()
}

const { token } = await post(`${FN}/authLogin`, {
  role: 'teacher', name: CS_TEACHER_NAME, password: CS_TEACHER_PASSWORD,
})
const { idToken } = await post(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${CS_API_KEY}`,
  { token, returnSecureToken: true })
const H = { Authorization: `Bearer ${idToken}` }

const get = async (url) => {
  const r = await fetch(url, { headers: H })
  if (!r.ok) throw new Error(`${url} -> ${r.status}`)
  return r.json()
}

const asField = (n) => Number.isInteger(n) ? { integerValue: String(n) } : { doubleValue: n }

console.log(APPLY ? 'APPLYING CHANGES' : 'dry run - nothing will be written')

const core = await get(`${DOCS}/appData/core`)
const students = core.fields.students.mapValue.fields

const plan = []
const skipped = []
for (const [id, wrapper] of Object.entries(students)) {
  if (ONLY && id !== ONLY) continue
  const f = wrapper.mapValue.fields
  if (f.archived?.booleanValue) continue
  const name = f.name?.stringValue || id

  let doc
  try { doc = await get(`${DOCS}/studentData/${id}`) } catch { continue }
  if (!doc.fields?._migrated?.booleanValue) continue
  const profile = doc.fields.profile?.mapValue?.fields || {}

  const { changes, refuse } = planFor(f, profile, OVERRIDES[id])

  if (refuse) { skipped.push({ id, name, refuse }); continue }
  if (Object.keys(changes).length) plan.push({ id, name, changes, profile, doc })
}

console.log(`\n${plan.length} student(s) to reconcile, ${skipped.length} refused\n`)
for (const { name, id, changes } of plan.slice(0, 200)) {
  const parts = Object.entries(changes).map(([k, c]) => `${k} ${c.from} -> ${c.to}`)
  console.log(`  ${String(name).slice(0, 22).padEnd(24)} ${id}  ${parts.join(', ')}`)
}
if (skipped.length) {
  console.log('\nrefused - core itself is wrong, pass --set-bonus id=value to decide:')
  for (const s of skipped) console.log(`  ${String(s.name).slice(0, 22).padEnd(24)} ${s.id}  ${s.refuse}`)
}

if (!APPLY) {
  console.log('\nRun again with --apply to write these.')
  process.exit(0)
}

// Everything about to change, as it stands now, written down first. The
// repair is reversible only if what it overwrote was recorded.
const BACKUP = argOf('backup') || `balances-before-${Date.now()}.json`
writeFileSync(BACKUP, JSON.stringify(
  plan.map(({ id, name, changes, profile }) => ({ id, name, changes, profileBefore: profile })),
  null, 2))
console.log(`
backed up ${plan.length} profiles to ${BACKUP}`)

let done = 0
for (const { id, changes, profile } of plan) {
  const next = { ...profile }
  for (const [k, c] of Object.entries(changes)) next[k] = asField(c.to)
  const url = `${DOCS}/studentData/${id}?` + ['profile'].map((f) => `updateMask.fieldPaths=${f}`).join('&')
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { ...H, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { profile: { mapValue: { fields: next } } } }),
  })
  if (!r.ok) { console.error(`  ! ${id}: ${r.status} ${await r.text()}`); continue }
  done++
}
console.log(`\nwrote ${done} of ${plan.length}`)
