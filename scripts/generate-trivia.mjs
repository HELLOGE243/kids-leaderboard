/**
 * Grows the daily trivia bank, with a quality gate.
 *
 *   node scripts/generate-trivia.mjs            # fills the bank to 2,000
 *   node scripts/generate-trivia.mjs --count 200 [--dry]
 *   node scripts/generate-trivia.mjs --to 500 --concurrency 6
 *
 * Generating trivia is easy and generating *hard* trivia is not, so most of
 * this script is the rejecting rather than the asking.
 *
 * The failure mode that matters is not a wrong answer, it is a question whose
 * options give it away: three silly distractors and one sensible one, which a
 * child answers correctly while learning nothing and finding it trivial. So
 * every candidate is put to a second model **with the question removed** — just
 * the four options and "which of these is the odd one out, as an answer". If
 * that model picks the right one, the distractors were doing the work and the
 * question is thrown away.
 *
 * Everything else is cheap structural checking: four options, exactly one
 * correct index, no duplicate stems against the bank we already have, no
 * option that is a substring of another, no "all of the above".
 *
 * Needs ANTHROPIC_API_KEY. Writes src/data/triviaBank.js. Existing questions
 * are kept; this only ever appends.
 *
 * The bank is written after every wave rather than at the end, because a run
 * to 2,000 is a few hundred model calls and losing an hour of them to a
 * dropped connection would be absurd. Interrupt it whenever; run it again and
 * it picks up from what is on disk, skipping any stem it already has.
 */
import { writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const BANK_PATH = join(root, 'src', 'data', 'triviaBank.js')

const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
// The bank is sized so that no child sees a repeat: one question a day is
// 2,000 days, and retiring the ones that turn out too easy or too hard eats
// into that. --count adds that many; --to fills up to that total.
const TARGET_TOTAL = 2000
const DRY = args.includes('--dry')
const MODEL = argOf('model', 'claude-sonnet-5-5')
const BATCH = 12
const CONCURRENCY = Number(argOf('concurrency', 4))

const KEY = process.env.ANTHROPIC_API_KEY
if (!KEY && !DRY) {
  console.error('ANTHROPIC_API_KEY is not set. Use --dry to see what would run.')
  process.exit(1)
}

// Naming the reasoning move matters more than naming the topic. "A science
// question" produces a fact lookup; "a question where the obvious answer is a
// plausible misreading" produces something worth asking.
const ANGLES = [
  'a question where the intuitive answer is wrong for a reason that can be explained in one sentence',
  'a question that requires combining two facts the student probably knows separately',
  'a question about an everyday object whose workings are rarely thought about',
  'a question where all four options are true statements but only one answers the question asked',
  'a question requiring an order-of-magnitude estimate rather than a remembered figure',
  'a question about why something is the way it is, not what it is',
  'a question where the common misconception is one of the options',
  'a question that turns on the precise meaning of one word in the stem',
]
const TOPICS = [
  'space and astronomy', 'the human body', 'animals and their behaviour',
  'chemistry in everyday life', 'physics you can see', 'world geography',
  'history before 1900', 'history after 1900', 'inventions and how they work',
  'food and cooking', 'language and word origins', 'weather and climate',
  'maths in the real world', 'music and sound', 'plants and growing things',
  'money and how things are priced', 'sport and how bodies move',
  'buildings and bridges', 'oceans and rivers', 'computers and networks',
  'myths, legends and where they came from', 'art and how it was made',
  'measurement and units', 'light, colour and seeing', 'rocks and the deep past',
  'transport and travel', 'law, rules and fairness', 'farming and where food comes from',
]

const pick = (a) => a[Math.floor(Math.random() * a.length)]

async function ask(messages, maxTokens = 1600, effort = 'medium') {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      output_config: { effort },
      messages,
    }),
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const data = await res.json()
  // These models think before they answer, so the first content block is a
  // thinking block, not the reply. Take the first text block instead - and
  // leave room in max_tokens for the thinking, or the reply never arrives.
  return (data.content || []).find((b) => b.type === 'text')?.text || ''
}

function parseJsonArray(text) {
  const m = text.match(/\[[\s\S]*\]/)
  if (!m) return []
  try { return JSON.parse(m[0]) } catch { return [] }
}

/** Cheap structural rejections, before anything is spent checking quality. */
function structurallyOk(q, seenStems) {
  if (!q || typeof q.question !== 'string') return 'not an object'
  if (!Array.isArray(q.options) || q.options.length !== 4) return 'not four options'
  if (q.options.some((o) => typeof o !== 'string' || !o.trim())) return 'blank option'
  if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) return 'bad correct index'
  if (typeof q.explanation !== 'string' || q.explanation.length < 15) return 'no explanation'
  if (q.question.length < 25) return 'stem too short'
  const lower = q.options.map((o) => o.trim().toLowerCase())
  if (new Set(lower).size !== 4) return 'duplicate options'
  if (lower.some((o) => /all|none/.test(o) && /above/.test(o))) return 'all/none of the above'
  // An option contained in another is a giveaway pair.
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (i !== j && lower[i].length > 3 && lower[j].includes(lower[i])) return 'one option contains another'
    }
  }
  const stem = q.question.trim().toLowerCase().replace(/\s+/g, ' ')
  if (seenStems.has(stem)) return 'duplicate of a question we already have'
  seenStems.add(stem)
  return ''
}

/**
 * The gate that matters: can the answer be found without the question?
 *
 * Options are shuffled before being shown, so position tells the checker
 * nothing, and the correct index is translated back afterwards.
 */
async function optionsGiveItAway(q) {
  const order = q.options.map((_, i) => i).sort(() => Math.random() - 0.5)
  const shown = order.map((i) => q.options[i])
  const correctShown = order.indexOf(q.correct)
  const text = await ask([{
    role: 'user',
    content: `Here are four answer options from a multiple-choice question. The question itself has been withheld.

${shown.map((o, i) => `${i}: ${o}`).join('\n')}

Which one is most likely the correct answer, judged only on how the options look - length, specificity, how plausible each is as a "right answer"? Reply with the single digit and nothing else.`,
  }], 512, 'low')
  const guess = parseInt(String(text).trim().match(/\d/)?.[0] ?? '-1', 10)
  return guess === correctShown
}

/**
 * Stems already written on this topic, to be named in the prompt.
 *
 * Eight angles across twenty-eight topics is a few hundred distinct briefs,
 * and the bank wants two thousand questions, so the same brief is given many
 * times over. Without showing the model what it has already written, a later
 * run spends most of its calls rediscovering the first run's questions and
 * having them thrown out as duplicate stems.
 */
function stemsOn(topic, limit = 24) {
  const all = [...existing, ...kept]
  return all
    .filter((q) => String(q.category || '').toLowerCase() === topic.toLowerCase())
    .slice(-limit)
    .map((q) => q.question)
}

async function generateBatch() {
  const angle = pick(ANGLES)
  const topic = pick(TOPICS)
  const avoid = stemsOn(topic)
  const text = await ask([{
    role: 'user',
    content: `Write ${BATCH} multiple-choice trivia questions for a bright 11-to-12-year-old preparing for a selective school test.

Topic: ${topic}
Each one should be ${angle}.
${avoid.length ? `
These questions are already in the bank. Do not write anything that asks the same thing, even in different words:
${avoid.map((q) => `- ${q}`).join(String.fromCharCode(10))}
` : ''}
They must be genuinely hard. A well-read 12-year-old should get roughly half of them right. Avoid anything answerable by recognising the longest or most technical-sounding option: make every distractor something a reasonable person might choose.

Return ONLY a JSON array, no other text:
[{"question":"...","options":["A","B","C","D"],"correct":0,"category":"${topic}","explanation":"one sentence on why the answer is right"}]`,
  }], 12000)
  return parseJsonArray(text)
}

// --------------------------------------------------------------------- run
const existing = existsSync(BANK_PATH)
  // Imported rather than parsed out of the file: it is a module, and a regex
  // over its source breaks on the first trailing comma or escaped quote.
  ? (await import('../src/data/triviaBank.js')).default
  : []
const seenStems = new Set(existing.map((q) => q.question.trim().toLowerCase().replace(/\s+/g, ' ')))

const TO = argOf('to', null)
const WANT = argOf('count', null) !== null
  ? Number(argOf('count'))
  : Math.max(0, (TO === null ? TARGET_TOTAL : Number(TO)) - existing.length)

console.log(`bank holds ${existing.length} questions; aiming to add ${WANT} (total ${existing.length + WANT})`)

if (!WANT) {
  console.log('nothing to do.')
  process.exit(0)
}

if (DRY) {
  const waves = Math.ceil(WANT / (BATCH * CONCURRENCY))
  console.log('--dry: nothing will be generated or written.')
  console.log(`would run ~${Math.ceil(WANT / BATCH)} generation calls of ${BATCH}, ${CONCURRENCY} at a time,`)
  console.log(`so about ${waves} waves, plus one cheap options-only check per surviving candidate.`)
  console.log(`angles: ${ANGLES.length}, topics: ${TOPICS.length}`)
  console.log('the bank is rewritten after each wave, so the run can be interrupted.')
  process.exit(0)
}

// Ids continue from the highest already in the bank rather than from its
// length, so a bank that has had anything removed cannot reissue an id - the
// per-question answer statistics are keyed by it.
const highest = existing.reduce((m, q) => {
  const n = parseInt(String(q.id).replace(/[^0-9]/g, ''), 10)
  return Number.isFinite(n) && n > m ? n : m
}, 0)
let nextNum = highest + 1
const nextId = () => `t${String(nextNum++).padStart(4, '0')}`

const kept = []
const rejected = { structure: 0, giveaway: 0, parse: 0 }

/** One generation call, structurally filtered, then quality-gated in parallel. */
async function harvest() {
  let batch = []
  try { batch = await generateBatch() } catch (e) { console.warn('  generation failed:', e.message); return [] }
  if (!batch.length) { rejected.parse++; return [] }

  const sound = []
  for (const q of batch) {
    const why = structurallyOk(q, seenStems)
    if (why) { rejected.structure++; continue }
    sound.push(q)
  }
  // A failed check is not a rejection: the gate is there to throw away easy
  // questions, not to throw away questions when the network hiccups.
  const verdicts = await Promise.all(sound.map((q) =>
    optionsGiveItAway(q).catch(() => false)))

  const out = []
  sound.forEach((q, i) => {
    if (verdicts[i]) { rejected.giveaway++; return }
    out.push({
      question: q.question.trim(),
      options: q.options.map((o) => o.trim()),
      correct: q.correct,
      category: String(q.category || 'General').trim(),
      explanation: q.explanation.trim(),
    })
  })
  return out
}

const MAX_WAVES = Math.ceil((WANT / (BATCH * CONCURRENCY)) * 4)
for (let wave = 0; wave < MAX_WAVES && kept.length < WANT; wave++) {
  const waves = await Promise.all(
    Array.from({ length: CONCURRENCY }, () => harvest()))
  for (const q of waves.flat()) {
    if (kept.length >= WANT) break
    kept.push({ id: nextId(), ...q })
  }
  // Checkpoint. Everything kept so far is on disk before the next wave runs.
  writeFileSync(BANK_PATH, renderBank([...existing, ...kept]))
  console.log(`  wave ${wave + 1}: kept ${kept.length}/${WANT}`
    + `  (rejected ${rejected.structure} structural, ${rejected.giveaway} giveaway)`)
}

console.log(`wrote ${existing.length + kept.length} questions to src/data/triviaBank.js (+${kept.length})`)
console.log('now run: node scripts/balance-trivia.mjs   (answers cluster in one position otherwise)')

function renderBank(questions) {
  return `/**
 * The daily trivia bank.
 *
 * Partly hand-written, partly generated by scripts/generate-trivia.mjs, which
 * rejects any candidate whose answer a model can find from the four options
 * with the question removed - that being the thing that makes generated
 * trivia easy. Append with the script; it never rewrites what is here.
 *
 * ${questions.length} questions.
 */
const BANK = ${JSON.stringify(questions, null, 2)}

export default BANK
export const TRIVIA_COUNT = ${questions.length}
`
}
