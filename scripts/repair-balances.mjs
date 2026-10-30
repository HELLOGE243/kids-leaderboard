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
 * --set-bonus is the one case where core is written as well as the profile.
 * Core is what the app reads, so a corrupt figure left there is a corrupt
 * figure on the screen however tidy the profile beside it is.
 *
 * It writes nothing without --apply, and prints exactly what it would do.
 *
 * Authentication: set CS_TEACHER_NAME and CS_TEACHER_PASSWORD. The Firebase
 * web key is read from src/data/firebase.js, which is where the app keeps it -
 * it is public by design, shipped to every browser - so CS_API_KEY is only
 * needed to override it. Your password is the one real credential here.
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
  apiKey: process.env.CS_API_KEY || webApiKey(),
}
const CREDS_FILE = argOf('creds')
if (CREDS_FILE) {
  creds = { ...creds, ...JSON.parse(readFileSync(CREDS_FILE, 'utf8')) }
}
const { name: CS_TEACHER_NAME, password: CS_TEACHER_PASSWORD, apiKey: CS_API_KEY } = creds
if (!CS_TEACHER_NAME || !CS_TEACHER_PASSWORD) {
  console.error('Your teacher sign-in is missing. Either:')
  console.error("  CS_TEACHER_NAME='Rob' CS_TEACHER_PASSWORD='...' node scripts/repair-balances.mjs")
  console.error('  node scripts/repair-balances.mjs --creds creds.json')
  console.error('where creds.json holds {"name": "...", "password": "..."}.')
  process.exit(1)
}
if (!CS_API_KEY) {
  console.error('Could not read the Firebase web key from src/data/firebase.js.')
  console.error('Pass CS_API_KEY, or apiKey in --creds.')
  process.exit(1)
}

/**
 * The Firebase web API key, read out of the app's own source.
 *
 * This one is not a secret - it is shipped to every browser that loads the
 * site, and it identifies the project rather than authorising anything. Only
 * the teacher password below is a credential. Reading it from here means one
 * less thing to paste, and one less live-looking string in a shell history.
 */
function webApiKey() {
  try {
    const src = readFileSync(new URL('../src/data/firebase.js', import.meta.url), 'utf8')
    return src.match(/apiKey:\s*"([^"]+)"/)?.[1] || undefined
  } catch {
    return undefined
  }
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

  const { changes, core: coreFix, refuse } = planFor(f, profile, OVERRIDES[id])

  if (refuse) { skipped.push({ id, name, refuse }); continue }
  if (Object.keys(changes).length || coreFix) {
    plan.push({ id, name, changes, core: coreFix, profile, coreBefore: f, doc })
  }
}

console.log(`\n${plan.length} student(s) to reconcile, ${skipped.length} refused\n`)
for (const { name, id, changes, core: coreFix } of plan.slice(0, 200)) {
  const parts = Object.entries(changes).map(([k, c]) => `${k} ${c.from} -> ${c.to}`)
  console.log(`  ${String(name).slice(0, 22).padEnd(24)} ${id}  ${parts.join(', ') || '(profile already right)'}`)
  // On its own line: this is the only write that changes a figure rather than
  // copying one across, so it is the one worth reading twice.
  for (const [k, c] of Object.entries(coreFix || {})) {
    console.log(`  ${' '.repeat(24)} ${' '.repeat(id.length)}  CORE ${k} ${c.from} -> ${c.to}`)
  }
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
  plan.map(({ id, name, changes, core: coreFix, profile, coreBefore }) => ({
    id, name, changes, core: coreFix, profileBefore: profile, coreBefore,
  })),
  null, 2))
console.log(`
backed up ${plan.length} profiles to ${BACKUP}`)

// A write into appData/core is a write into the one document the whole app
// reads. If its update mask were ever wrong - a mask of `students` rather than
// a path into it - the body would replace all eighty-four records with one. So
// the map is kept whole on disk first, and the count is checked after.
const needsCore = plan.some((p) => p.core)
const coreCount = Object.keys(students).length
if (needsCore) {
  const CORE_BACKUP = `core-students-before-${Date.now()}.json`
  writeFileSync(CORE_BACKUP, JSON.stringify(students, null, 2))
  console.log(`backed up all ${coreCount} core records to ${CORE_BACKUP}`)
}

let done = 0
let coreDone = 0
for (const { id, changes, core: coreFix, profile } of plan) {
  // Core first. If this write succeeds and the profile write then fails, the
  // two disagree by the figure already on screen; the other order leaves the
  // app showing a number nothing agrees with.
  if (coreFix) {
    const paths = Object.keys(coreFix).map((k) => `students.\`${id}\`.${k}`)
    const fields = {}
    for (const [k, c] of Object.entries(coreFix)) fields[k] = asField(c.to)
    const curl = `${DOCS}/appData/core?`
      + paths.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&')
    const cr = await fetch(curl, {
      method: 'PATCH',
      headers: { ...H, 'content-type': 'application/json' },
      body: JSON.stringify({ fields: { students: { mapValue: { fields: { [id]: { mapValue: { fields } } } } } } }),
    })
    if (!cr.ok) { console.error(`  ! core ${id}: ${cr.status} ${await cr.text()}`); continue }
    const after = Object.keys((await get(`${DOCS}/appData/core`)).fields.students.mapValue.fields).length
    if (after !== coreCount) {
      console.error(`
!! core held ${coreCount} students and now holds ${after}. Stopping.`)
      console.error('!! restore students from the core-students-before-*.json just written.')
      process.exit(1)
    }
    coreDone++
  }

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
console.log(`\nwrote ${done} of ${plan.length} profiles, and ${coreDone} core record(s)`)
