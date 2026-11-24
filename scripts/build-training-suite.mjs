/**
 * Builds one Training Dojo suite from a real question, through the real proxy.
 *
 *   node scripts/build-training-suite.mjs --set imp-003177 --q 3
 *   node scripts/build-training-suite.mjs --set imp-016380 --q 2 --subject thinking
 *   node scripts/build-training-suite.mjs ... --out demo/suite.json
 *
 * Reads the question from the live quiz sets and writes the suite to a file.
 * It writes NOTHING to Firestore - the collections this feature will use do
 * not exist yet, and a demo has no business being the thing that creates them.
 *
 * Authentication is the teacher sign-in every other script here uses; the
 * Claude call goes through the app's own /api/claude proxy, so it is counted,
 * capped and model-restricted exactly as a student's call would be.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  buildAnalysePrompt, parseAnalysis, buildStagesPrompt, parseStages,
  mergeHeuristics, canTrain, suiteKey, STAGE_BATCH,
} from '../src/data/trainingDojo.js'
import { parseJsonLoose } from '../src/utils/jsonLoose.js'

const args = process.argv.slice(2)
const argOf = (n, d = null) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1] }
const SET = argOf('set')
const QNUM = Number(argOf('q', '1'))
const SUBJECT = argOf('subject', 'math')
const OUT = argOf('out', 'demo/suite.json')
const LIB = argOf('library', 'demo/heuristics.json')
const MODEL = argOf('model', 'claude-sonnet-5')

if (!SET) {
  console.error('Which question? e.g. --set imp-003177 --q 3 --subject math')
  process.exit(1)
}

const FN = 'https://australia-southeast1-cleverspacev2.cloudfunctions.net'
const DOCS = 'https://firestore.googleapis.com/v1/projects/cleverspacev2/databases/(default)/documents'
const PROXY = 'https://cleverspacev2.web.app/api/claude/v1/messages'

const creds = JSON.parse(readFileSync('creds.json', 'utf8').replace(/^﻿/, '').trim())
const apiKey = creds.apiKey
  || readFileSync('src/data/firebase.js', 'utf8').match(/apiKey:\s*"([^"]+)"/)?.[1]

const post = async (url, body, headers = {}) => {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  const txt = await r.text()
  if (!r.ok) throw new Error(`${url} -> ${r.status} ${txt.slice(0, 300)}`)
  return JSON.parse(txt)
}

const { token } = await post(`${FN}/authLogin`, { role: 'teacher', name: creds.name, password: creds.password })
const { idToken } = await post(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
  { token, returnSecureToken: true })
const AUTH = { Authorization: `Bearer ${idToken}` }

const get = async (url) => {
  const r = await fetch(url, { headers: AUTH })
  if (!r.ok) throw new Error(`${url} -> ${r.status}`)
  return r.json()
}

// --- Firestore's typed JSON, back into a plain question ------------------
const un = (v) => {
  if (v == null) return null
  if (v.stringValue !== undefined) return v.stringValue
  if (v.integerValue !== undefined) return Number(v.integerValue)
  if (v.doubleValue !== undefined) return Number(v.doubleValue)
  if (v.booleanValue !== undefined) return v.booleanValue
  if (v.nullValue !== undefined) return null
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(un)
  if (v.mapValue !== undefined) {
    const out = {}
    for (const [k, x] of Object.entries(v.mapValue.fields || {})) out[k] = un(x)
    return out
  }
  return null
}

const setDoc = await get(`${DOCS}/quizSets/${SET}`)
const questions = un(setDoc.fields.questions) || []
const question = questions[QNUM - 1]
const setTitle = un(setDoc.fields.friendlyTitle) || SET
const year = un(setDoc.fields.year) || ''
if (!question) {
  console.error(`${SET} has ${questions.length} questions, so there is no Q${QNUM}.`)
  process.exit(1)
}
if (!canTrain(question, SUBJECT)) {
  console.error(`Q${QNUM} of ${SET} is a ${question.type || 'multiple-choice'} and cannot be trained as ${SUBJECT}.`)
  process.exit(1)
}

console.log(`${setTitle} ${year} - Q${QNUM} (${SUBJECT})`)
console.log(String(question.text || question.prompt || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160))

// --- the three calls -----------------------------------------------------
let usage = { input: 0, output: 0, calls: 0 }

async function ask(prompt, maxTokens) {
  const body = await post(PROXY, {
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  }, AUTH)
  usage.calls++
  usage.input += body?.usage?.input_tokens || 0
  usage.output += body?.usage?.output_tokens || 0
  // A reply cut off at the token ceiling is not short JSON, it is broken JSON.
  // Saying so beats a parse error forty lines deep.
  if (body?.stop_reason === 'max_tokens') {
    throw new Error(`the model ran out of room at ${maxTokens} tokens - ask for fewer steps, or raise the cap`)
  }
  const out = (body.content || []).find((b) => b.type === 'text')?.text || ''
  // Models fence JSON even when told not to.
  const fenced = out.match(/```(?:json)?\s*([\s\S]*?)```/)
  // Not JSON.parse: the prompts now ask for LaTeX, and a model writing rac
  // inside a JSON string emits a single backslash, which is not a legal JSON
  // escape. parseJsonLoose is what the app uses for the same reason.
  return parseJsonLoose(fenced ? fenced[1] : out)
}

let library = []
try { library = JSON.parse(readFileSync(LIB, 'utf8')) } catch { library = [] }
const forSubject = library.filter((h) => h.subject === SUBJECT && !h.archived)

console.log(`\n1/3 analysing (${forSubject.length} heuristics already known)...`)
const analysis = parseAnalysis(await ask(buildAnalysePrompt(question, SUBJECT, forSubject, year), 3000), forSubject)
if (!analysis.ok) { console.error('  refused:', analysis.error); process.exit(1) }
console.log(`  ${analysis.breakdown.length} steps, ${analysis.heuristics.length} heuristics`)

const merged = mergeHeuristics(library, analysis.heuristics, SUBJECT)
for (const h of merged.added) console.log(`  + new heuristic: ${h.name}`)
for (const id of merged.ids) if (!merged.added.some((a) => a.id === id)) console.log(`  = reused: ${id}`)

const stages = []
const dropped = []
const total = analysis.breakdown.length
for (let i = 0; i < total; i += STAGE_BATCH) {
  const slice = analysis.breakdown.slice(i, i + STAGE_BATCH)
  console.log(`\n${2 + i / STAGE_BATCH}/3 writing stages ${i + 1}-${i + slice.length}...`)
  const res = parseStages(await ask(buildStagesPrompt(question, slice, i, total, year), 4000), slice, i)
  if (!res.ok) { console.error('  refused:', res.error); process.exit(1) }
  stages.push(...res.stages)
  dropped.push(...(res.dropped || []))
  console.log(`  ${res.stages.length} kept${res.dropped?.length ? `, ${res.dropped.length} dropped` : ''}`)
}
for (const d of dropped) console.log(`  dropped ${d}`)

const suite = {
  schemaVersion: 1,
  sourceId: SET,
  questionKey: suiteKey(question, QNUM - 1),
  subject: SUBJECT,
  setTitle,
  year,
  heuristicIds: merged.ids,
  stages,
  generatedAt: new Date().toISOString(),
  model: MODEL,
  // Kept so the demo page can show the question the suite was built from.
  origin: {
    text: question.text || '',
    prompt: question.prompt || '',
    options: question.options || [],
    correctIndex: question.correctIndex,
  },
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(suite, null, 2))
mkdirSync(dirname(LIB), { recursive: true })
writeFileSync(LIB, JSON.stringify(merged.library, null, 2))

console.log(`\n${stages.length} stages -> ${OUT}`)
console.log(`${merged.library.length} heuristics -> ${LIB}`)
console.log(`${usage.calls} calls, ${usage.input} in / ${usage.output} out tokens`)
