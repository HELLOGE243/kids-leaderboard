/**
 * Puts balances back the way repair-balances.mjs found them.
 *
 *   node scripts/restore-balances.mjs balances-before-1762000000000.json
 *   node scripts/restore-balances.mjs balances-before-*.json --apply
 *   node scripts/restore-balances.mjs balances-before-*.json --apply --only 61864531
 *
 * The repair writes down every value it is about to overwrite before it
 * overwrites anything. This reads one of those files and writes the recorded
 * `before` values back - the whole profile map as it stood, and any core field
 * the repair changed returned to the figure it held.
 *
 * It is deliberately dumber than the repair: no rules, no judgement, no
 * refusals. It restores what the file says and nothing else. A value the
 * repair never touched is a value this will not mention.
 *
 * Like the repair, it writes nothing without --apply.
 *
 * Authentication is the same: CS_TEACHER_NAME and CS_TEACHER_PASSWORD in the
 * environment, or --creds creds.json holding {"name": ..., "password": ...}.
 */
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const argOf = (n) => { const i = args.indexOf(`--${n}`); return i === -1 ? null : args[i + 1] }
const ONLY = argOf('only')
const FILE = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--creds' && args[args.indexOf(a) - 1] !== '--only')

import { readFileSync } from 'node:fs'

if (!FILE) {
  console.error('Which backup? node scripts/restore-balances.mjs balances-before-<timestamp>.json')
  process.exit(1)
}

const DOCS = 'https://firestore.googleapis.com/v1/projects/cleverspacev2/databases/(default)/documents'
const FN = 'https://australia-southeast1-cleverspacev2.cloudfunctions.net'

function webApiKey() {
  try {
    const src = readFileSync(new URL('../src/data/firebase.js', import.meta.url), 'utf8')
    return src.match(/apiKey:\s*"([^"]+)"/)?.[1] || undefined
  } catch {
    return undefined
  }
}

let creds = {
  name: process.env.CS_TEACHER_NAME,
  password: process.env.CS_TEACHER_PASSWORD,
  apiKey: process.env.CS_API_KEY || webApiKey(),
}
const CREDS_FILE = argOf('creds')
if (CREDS_FILE) creds = { ...creds, ...JSON.parse(readFileSync(CREDS_FILE, 'utf8')) }
if (!creds.name || !creds.password) {
  console.error('Your teacher sign-in is missing - CS_TEACHER_NAME and CS_TEACHER_PASSWORD, or --creds creds.json.')
  process.exit(1)
}
if (!creds.apiKey) {
  console.error('Could not read the Firebase web key from src/data/firebase.js. Pass CS_API_KEY.')
  process.exit(1)
}

const backup = JSON.parse(readFileSync(FILE, 'utf8'))
if (!Array.isArray(backup)) {
  console.error(`${FILE} is not a repair backup - expected an array of records.`)
  process.exit(1)
}

const records = ONLY ? backup.filter((r) => r.id === ONLY) : backup
console.log(APPLY ? 'RESTORING' : 'dry run - nothing will be written')
console.log(`\n${FILE}: ${backup.length} record(s), ${records.length} to restore\n`)

for (const r of records) {
  const parts = Object.entries(r.changes || {}).map(([k, c]) => `${k} ${c.to} -> back to ${c.from}`)
  console.log(`  ${String(r.name).slice(0, 22).padEnd(24)} ${r.id}  ${parts.join(', ') || '(profile unchanged)'}`)
  for (const [k, c] of Object.entries(r.core || {})) {
    console.log(`  ${' '.repeat(24)} ${' '.repeat(String(r.id).length)}  CORE ${k} ${c.to} -> back to ${c.from}`)
  }
}

if (!APPLY) {
  console.log('\nRun again with --apply to write these back.')
  process.exit(0)
}

const post = async (url, body) => {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${await res.text()}`)
  return res.json()
}

const { token } = await post(`${FN}/authLogin`, { role: 'teacher', name: creds.name, password: creds.password })
const { idToken } = await post(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${creds.apiKey}`,
  { token, returnSecureToken: true })
const H = { Authorization: `Bearer ${idToken}` }

// The corrupt figure this whole repair exists to remove is 3.0001e+24, which
// has no fractional part and so passes Number.isInteger - and would then be
// sent as an integerValue of "3.00010038013016e+24", which Firestore rejects.
// Safe-integer is the test that matters here, not integer.
const asField = (n) => Number.isSafeInteger(n) ? { integerValue: String(n) } : { doubleValue: n }

let profiles = 0
let cores = 0
for (const r of records) {
  if (r.core) {
    const paths = Object.keys(r.core).map((k) => `students.\`${r.id}\`.${k}`)
    const fields = {}
    for (const [k, c] of Object.entries(r.core)) fields[k] = asField(c.from)
    const url = `${DOCS}/appData/core?`
      + paths.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&')
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { ...H, 'content-type': 'application/json' },
      body: JSON.stringify({ fields: { students: { mapValue: { fields: { [r.id]: { mapValue: { fields } } } } } } }),
    })
    if (!res.ok) { console.error(`  ! core ${r.id}: ${res.status} ${await res.text()}`); continue }
    cores++
  }

  // The profile goes back whole, exactly as it was read, rather than field by
  // field: that is what the backup recorded, and a partial profile is how this
  // mess started.
  const url = `${DOCS}/studentData/${r.id}?updateMask.fieldPaths=profile`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...H, 'content-type': 'application/json' },
    body: JSON.stringify({ fields: { profile: { mapValue: { fields: r.profileBefore || {} } } } }),
  })
  if (!res.ok) { console.error(`  ! ${r.id}: ${res.status} ${await res.text()}`); continue }
  profiles++
}
console.log(`\nrestored ${profiles} of ${records.length} profiles, and ${cores} core record(s)`)
