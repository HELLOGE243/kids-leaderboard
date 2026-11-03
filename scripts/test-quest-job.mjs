/**
 * A whole night of the reading quest, driven against fakes.
 *
 *   node scripts/test-quest-job.mjs
 *
 * Firestore, Claude and Project Gutenberg are all replaced with stubs, so this
 * exercises the parts no pure-function test can reach: the six slots, the
 * banking, the dedup, the fallback to the bank when a slot fails, and what
 * happens when a check vetoes a passage or a question. It costs nothing and
 * touches nothing.
 *
 * What it cannot tell you is whether the questions are any good. That needs a
 * real model and a teacher reading a week of them.
 *
 * Nor can it tell you whether a query will run. The fake store filters and
 * sorts in memory and asks nothing of indexes, so the bank fallback passed
 * here while the real query - two equality filters and an order-by - would
 * have failed with FAILED_PRECONDITION on the first night it was needed. The
 * composite index is declared in firestore.indexes.json; nothing in this file
 * would notice if it were removed.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const questJob = require('../functions/questJob.js')
const QL = require('../functions/questLogic.js')

let pass = 0
const fails = []
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`pass  ${name}`) } else {
    fails.push(name); console.log(`FAIL  ${name}${detail ? `\n        ${detail}` : ''}`)
  }
}
const eq = (name, got, want) => {
  const same = JSON.stringify(got) === JSON.stringify(want)
  ok(name, same, same ? '' : `got ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`)
}

// --- a book the stub Gutenberg serves ------------------------------------

// Calibrated rather than guessed: the blend measures grade 7 and fits the
// lower band, the denser lines measure grade 11 and fit the upper one. A
// fixture that fits neither makes every assertion below vacuous.
const EASY = [
  'The lamp at the top of the tower turned slowly all through the night.',
  'Tom carried the oil up the stairs in a can that had a long spout.',
  'He counted ninety-two steps each time he climbed up to the bright lamp.',
  'The light went far out to sea so that the ships could find the way.',
]
const DENSE = [
  'At the summit the freezing air gathered moisture across the enormous curving glass panels.',
  'The beam travelled many kilometres across the water, warning distant vessels about the dangerous rocks.',
  'During one December storm the powerful westerly wind rattled the shutters of their stone cottage.',
  'By morning the dangerous weather had retreated and every anchored vessel remained completely undamaged.',
]
const BLEND = EASY.flatMap((e, i) => [e, DENSE[i]])

const chapterOf = (n, lines, paragraphs) => [
  `CHAPTER ${n}. The Light`, '',
  ...Array.from({ length: paragraphs }, () => `${lines.join(' ')}\n`),
].join('\n')

const FAKE_BOOK = [
  '*** START OF THE PROJECT GUTENBERG EBOOK THE LIGHT ***',
  '',
  // Lower-band chapters, then upper-band ones, so one book serves both.
  chapterOf(1, BLEND, 8),
  chapterOf(2, BLEND, 8),
  chapterOf(3, DENSE, 16),
  chapterOf(4, DENSE, 16),
  chapterOf(5, BLEND, 8),
  chapterOf(6, DENSE, 16),
  '',
  '*** END OF THE PROJECT GUTENBERG EBOOK THE LIGHT ***',
].join('\n')

// --- a fake Firestore ----------------------------------------------------

function fakeDb() {
  const store = new Map()   // 'collection/id' -> document
  const calls = { sets: 0, selects: 0, queries: 0 }

  const docsIn = (name) => [...store.entries()]
    .filter(([k]) => k.startsWith(`${name}/`))
    .map(([, v]) => v)

  const snapOf = (rows) => ({
    size: rows.length,
    docs: rows.map((r) => ({ data: () => r, id: r.id })),
    forEach: (fn) => rows.forEach((r) => fn({ data: () => r, id: r.id })),
  })

  const query = (name, filters, order, limit) => ({
    where: (field, op, value) => query(name, [...filters, { field, value }], order, limit),
    orderBy: (field, dir) => query(name, filters, { field, dir }, limit),
    limit: (n) => query(name, filters, order, n),
    select: () => { calls.selects++; return query(name, filters, order, limit) },
    get: async () => {
      calls.queries++
      let rows = docsIn(name).filter((r) => filters.every((f) => r[f.field] === f.value))
      if (order) {
        rows = [...rows].sort((a, b) => String(a[order.field] || '').localeCompare(String(b[order.field] || '')))
        if (order.dir === 'desc') rows.reverse()
      }
      if (limit) rows = rows.slice(0, limit)
      return snapOf(rows)
    },
  })

  return {
    calls,
    store,
    collection: (name) => ({
      ...query(name, [], null, null),
      doc: (id) => ({
        set: async (value, options) => {
          calls.sets++
          const key = `${name}/${id}`
          const prev = store.get(key)
          store.set(key, options && options.merge ? { ...(prev || {}), ...value } : value)
        },
        get: async () => {
          const v = store.get(`${name}/${id}`)
          return { exists: !!v, data: () => v }
        },
      }),
    }),
  }
}

// --- a fake Claude -------------------------------------------------------

/**
 * Replies keyed off what the prompt is asking for.
 *
 * `behaviour` lets a test make one thing go wrong at a time: an unsuitable
 * passage, a question answerable without reading, malformed JSON.
 */
function fakeClaude(behaviour) {
  const b = behaviour || {}
  const log = []
  const reply = (text) => ({
    status: 200,
    body: JSON.stringify({ content: [{ type: 'thinking', thinking: '...' }, { type: 'text', text }] }),
  })

  /** Questions of exactly the types named, in that order. */
  const ofTypes = (types) => JSON.stringify(
    types.map((t, i) => ({
      type: t,
      question: `A ${t} question, number ${i + 1}: what does the passage say about the lamp?`,
      options: [`One ${t} ${i}`, `Two ${t} ${i}`, `Three ${t} ${i}`, `Four ${t} ${i}`],
      correct: i % 4,
      explanation: `The paragraph about the stairs settles this ${t} question, number ${i + 1}.`,
    })),
  )

  const questions = (count) => JSON.stringify(
    Array.from({ length: count }, (_, i) => ({
      type: QL.QUESTION_PLAN[i % QL.QUESTION_PLAN.length],
      question: `Question ${i + 1}: what does the passage say about the keeper and his lamp?`,
      options: [`First option ${i}`, `Second option ${i}`, `Third option ${i}`, `Fourth option ${i}`],
      correct: i === 2 ? 0 : ((i % 3) + 1),
      explanation: `The passage settles this in the paragraph about the stairs and the lamp, number ${i + 1}.`,
    })),
  )

  return {
    log,
    call: async (body) => {
      const prompt = String(body.messages[0].content)
      log.push({ prompt: prompt.slice(0, 60), tools: (body.tools || []).map((t) => t.type) })

      if (/Is it suitable/.test(prompt)) {
        if (b.unsuitable) return reply('{"suitable": false, "why": "a character is injured in detail"}')
        return reply('{"suitable": true}')
      }
      if (/Guess the answer from general knowledge/.test(prompt)) {
        // The job treats a correct guess as a giveaway. Answering "A" marks
        // the one question whose answer sits at index 0; a reply with no
        // letter in it is what the job reads as "could not tell", which is
        // the branch that keeps the question. An earlier version of this stub
        // answered "D" and silently removed the only inference question,
        // failing every paper.
        return reply(b.giveaway ? 'A' : 'none of them')
      }
      if (/multiple-choice questions/.test(prompt)) {
        if (b.badQuestionJson) return reply('I could not write those questions.')
        // A top-up round names its types and says why it is being asked.
        const topUp = /could be answered without reading/.test(prompt)
        if (topUp) {
          b.topUps = (b.topUps || 0) + 1
          if (b.topUpFails) return reply('I could not write those either.')
          const types = QL.REQUIRED_TYPES.filter((t) => new RegExp(`two ${t} questions`).test(prompt))
          b.toppedUpTypes = types
          return reply(ofTypes(types.flatMap((t) => [t, t])))
        }
        // An exact set of types for the first round, to build the awkward
        // case: six good questions that between them still miss a type the
        // paper check demands.
        if (b.firstRoundTypes) return reply(ofTypes(b.firstRoundTypes))
        if (b.withhold) {
          // Everything except the withheld type, which is what the giveaway
          // gate taking the only inference question looks like from here.
          return reply(ofTypes(QL.QUESTION_PLAN.filter((t) => t !== b.withhold)))
        }
        return reply(questions(b.fewQuestions ? 3 : 8))
      }
      if (/Write a short news report/.test(prompt)) {
        if (b.badNewsJson) return reply('Here is a report, but not as JSON.')
        if (b.newsNoSources) {
          return reply(JSON.stringify({ headline: 'A reef recovers', paragraphs: [BLEND.join(' ')], sources: [] }))
        }
        // Written to the band the brief asks for: the blend measures grade 7
        // and suits the lower band at five paragraphs, the denser lines
        // measure grade 11 and suit the upper one at twelve.
        const upper = /Year 9/.test(prompt)
        return reply(JSON.stringify({
          headline: 'Coral cover rises on the northern reef',
          paragraphs: upper
            ? Array.from({ length: 12 }, () => DENSE.join(' '))
            : Array.from({ length: 5 }, () => BLEND.join(' ')),
          sources: ['https://example.org/a', 'https://example.org/b', 'https://example.org/c'],
        }))
      }
      throw new Error(`fakeClaude got an unexpected prompt: ${prompt.slice(0, 80)}`)
    },
  }
}

// Gutenberg, stubbed. Every book id serves the same calibrated text.
let fetches = 0
globalThis.fetch = async (url) => {
  fetches++
  if (!String(url).includes('gutenberg.org')) throw new Error(`unexpected fetch: ${url}`)
  return { ok: true, status: 200, text: async () => FAKE_BOOK }
}

const run = async (behaviour) => {
  const db = fakeDb()
  const claude = fakeClaude(behaviour)
  const job = questJob.make({ db, callClaude: claude.call })
  const report = await job.runNight('2026-11-03')
  return { db, claude, job, report }
}

// --- a night that goes well ---------------------------------------------

{
  fetches = 0
  const { db, report, claude } = await run()

  eq('all six slots are set', report.set, 6)
  eq('all six were generated rather than reused', report.made.length, 6)
  eq('nothing was missed', report.missed, [])

  const bank = [...db.store.keys()].filter((k) => k.startsWith('readingQuests/'))
  eq('six papers are banked', bank.length, 6)

  const daily = db.store.get('dailyQuest/2026-11-03')
  ok('the day is written', !!daily)
  eq('the day holds six papers', daily.papers.length, 6)
  eq('the day is labelled', daily.day, '2026-11-03')

  const slots = daily.papers.map((p) => `${p.genre}/${p.band}`).sort()
  eq('one paper per genre and band', slots,
    ['essay/y6', 'essay/y9', 'fiction/y6', 'fiction/y9', 'news/y6', 'news/y9'])

  // The day's document is an index now: a card's worth of each paper, and the
  // id of the quiz set that holds the passage and the questions. Everything
  // below that needs the paper itself reads the banked copy, and everything
  // that needs what a student will sit reads the set.
  const banked = (entry) => db.store.get(`readingQuests/${entry.id}`)
  const setFor = (entry) => db.store.get(`quizSets/${entry.quizSetId}`)

  ok('no paper carries its questions in the day index',
    daily.papers.every((p) => p.questions === undefined && p.text === undefined))
  ok('every card names its quiz set', daily.papers.every((p) => p.quizSetId === `quest-${p.id}`))
  eq('every card says how many questions', daily.papers.map((p) => p.questionCount), [6, 6, 6, 6, 6, 6])

  // Every paper must survive the same check the job applies before banking.
  const faults = daily.papers.flatMap((p) => QL.paperStructurallyOk(banked(p)).map((f) => `${p.genre}/${p.band}: ${f}`))
  eq('every paper passes the structural check', faults, [])

  eq('every paper has six questions', daily.papers.map((p) => banked(p).questions.length), [6, 6, 6, 6, 6, 6])

  // The answer is rotated to a position taken in turn as each is written, so a
  // child pressing the same button every time scores a quarter.
  const positions = daily.papers.flatMap((p) => banked(p).questions.map((q) => q.correct)).sort()
  eq('answers are spread across the four positions', [...new Set(positions)], [0, 1, 2, 3])

  // --- the quiz set is the paper a student actually sits ------------------
  eq('one quiz set per paper',
    [...db.store.keys()].filter((k) => k.startsWith('quizSets/')).length, 6)
  ok('every set is marked as a quest paper', daily.papers.every((p) => setFor(p).questPaper === true))
  ok('every set is untimed and resumable', daily.papers.every((p) => setFor(p).homeworkMode === true))
  ok('every set is dated', daily.papers.every((p) => setFor(p).questDay === '2026-11-03'))
  eq('every set has six questions', daily.papers.map((p) => setFor(p).questions.length), [6, 6, 6, 6, 6, 6])
  ok('every question is multiple choice',
    daily.papers.every((p) => setFor(p).questions.every((q) => q.type === 'multiple-choice')))
  ok('every question carries the passage',
    daily.papers.every((p) => setFor(p).questions.every((q) => q.text.includes(banked(p).text.slice(0, 60)))))
  ok('the passage credits its source',
    daily.papers.every((p) => setFor(p).questions[0].text.includes(banked(p).attribution)))
  // The generator says `question`/`correct`; a quiz set says `prompt`/
  // `correctIndex`, and the whole point of the mapping is that nothing
  // downstream has to know about the first pair.
  ok('the question travels as the prompt',
    daily.papers.every((p) => setFor(p).questions.every((q, i) => q.prompt === banked(p).questions[i].question)))
  ok('the answer travels as the index',
    daily.papers.every((p) => setFor(p).questions.every((q, i) => q.correctIndex === banked(p).questions[i].correct)))
  ok('every question has a stable id',
    daily.papers.every((p) => setFor(p).questions.every((q, i) => q.id === `${p.id}-q${i + 1}`)))
  ok('the explanations come across',
    daily.papers.every((p) => setFor(p).questions.every((q) => q.explanation.length > 0)))

  const news = daily.papers.filter((p) => p.genre === 'news')
  ok('the news pieces are our own text', news.every((p) => p.licence === 'original'))
  ok('the news pieces cite their sources', news.every((p) => p.sources && p.sources.length >= 3))
  const books = daily.papers.filter((p) => p.genre !== 'news')
  ok('book extracts are marked public domain', books.every((p) => p.licence === 'public-domain'))
  ok('book extracts link to the work', books.every((p) => /gutenberg.org\/ebooks\//.test(p.sourceUrl)))
  ok('book extracts name the author', books.every((p) => /\.\s*Public domain\.$/.test(p.attribution)),
    books.map((p) => p.attribution).join(' | '))

  ok('every passage is at its own band',
    daily.papers.every((p) => !QL.passageFitsBand(banked(p).text, p.band)),
    daily.papers.map((p) => `${p.band}:${QL.passageFitsBand(banked(p).text, p.band)}`).join(' | '))

  // Web search is for the news slot and nowhere else: a book extract needs no
  // search, and a search on every call is a bill nobody asked for.
  const searching = claude.log.filter((c) => c.tools.length)
  eq('only the news calls use web search', searching.length, 2)
  ok('the search tool is the current one', searching.every((c) => c.tools[0] === 'web_search_20260209'),
    JSON.stringify(searching.map((c) => c.tools)))

  ok('books were fetched, not imagined', fetches >= 4, `${fetches} fetches`)
}

// --- the same book is not mined twice ------------------------------------

{
  const { db, job } = await run()
  // A second night reads the index the first night wrote, so the chapters
  // already used must not come back.
  const index = await job.readIndex()
  ok('the second night sees the first night in the index', index.count === 6, `count ${index.count}`)

  // Only the bank, not the day document beside it in the same fake store.
  const bankRows = [...db.store.entries()]
    .filter(([k]) => k.startsWith('readingQuests/'))
    .map(([, v]) => v)
  const extracts = bankRows.filter((p) => p.genre !== 'news')
  ok('each banked extract records its chapter', extracts.every((p) => !!p.chapter),
    JSON.stringify(extracts.map((p) => p.chapter)))

  // Uniqueness is per work, not per chapter name: the stub serves the same
  // text for every catalogue number, so two different books legitimately
  // both offer a "CHAPTER 1". What must not repeat is the source key.
  const keys = bankRows.map((p) => p.sourceKey)
  ok('every banked paper has a source key', keys.every(Boolean), JSON.stringify(keys))
  eq('no two papers share a source key', new Set(keys).size, keys.length)
}

// --- a passage the suitability check vetoes ------------------------------

{
  const { report, db } = await run({ unsuitable: true })
  eq('an unsuitable night sets nothing', report.set, 0)
  eq('nothing unsuitable is banked', [...db.store.keys()].filter((k) => k.startsWith('readingQuests/')).length, 0)
  ok('no day document is written', !db.store.get('dailyQuest/2026-11-03'))
  ok('every slot says why it failed', report.missed.length === 6
    && report.missed.every((m) => m.why.join(' ').includes('unsuitable')),
    JSON.stringify(report.missed.slice(0, 1)))
}

// --- questions that give themselves away --------------------------------

{
  const { report } = await run({ giveaway: true })
  // The stub answers "A", so every question whose answer is at index 0 is
  // treated as answerable without the passage and dropped. Eight questions
  // with answers cycling through four positions leaves six, which is exactly
  // the margin the job generates for.
  eq('a night still completes when a question is dropped', report.set, 6)
  const dropped = report.made.flatMap((m) => m.dropped || [])
  ok('the dropped questions are reported', dropped.some((d) => /answerable without the passage/.test(d)),
    JSON.stringify(dropped.slice(0, 2)))
}

// --- a short first round is topped up rather than thrown away -----------

// A passage that has been downloaded, measured and passed as suitable is too
// expensive to discard because the first round of questions came back short.
{
  const { report } = await run({ fewQuestions: true })
  eq('three questions becomes a paper after a top-up', report.set, 6)
  const notes = report.made.flatMap((m) => m.dropped || []).join(' ')
  ok('the top-up is recorded', /topping up: 3 kept/.test(notes), notes.slice(0, 200))
}

// The failure this exists to prevent: the giveaway gate takes the only
// question of a required type, and a perfectly good passage dies for it.
{
  const { report } = await run({ withhold: 'inference' })
  eq('a missing required type is asked for again, not fatal', report.set, 6)
  const notes = report.made.flatMap((m) => m.dropped || []).join(' ')
  ok('the missing type is named', /missing inference/.test(notes), notes.slice(0, 200))
}

// A full paper that still misses a required type has to drop something to
// make room, and the thing it drops must be the kind there is a spare of.
{
  const { report } = await run({
    firstRoundTypes: ['gist', 'detail', 'detail', 'detail', 'inference', 'vocabulary'],
  })
  eq('a full paper missing a type is still set', report.set, 6)
  const notes = report.made.flatMap((m) => m.dropped || []).join(' ')
  ok('room was made by dropping a detail question',
    /made room for a purpose question by dropping a detail one/.test(notes), notes.slice(0, 300))
}

// --- too few questions, and the top-up cannot help ----------------------

{
  const { report } = await run({ fewQuestions: true, topUpFails: true })
  eq('three questions is not a paper when the top-up fails too', report.set, 0)
  ok('the shortfall is named', report.missed.every((m) => m.why.join(' ').includes('questions, want 6')),
    JSON.stringify(report.missed.slice(0, 1)))
  ok('the top-up is recorded as tried',
    report.missed.every((m) => m.why.join(' ').includes('topping up')),
    JSON.stringify(report.missed.slice(0, 1)))
}

// --- a model that does not reply with JSON ------------------------------

{
  const { report } = await run({ badQuestionJson: true })
  eq('a reply that is not JSON sets nothing', report.set, 0)
  ok('it says no questions came back', report.missed.every((m) => m.why.join(' ').includes('no questions came back')),
    JSON.stringify(report.missed.slice(0, 1)))
}

// --- a news report with no sources --------------------------------------

{
  const { report, db } = await run({ newsNoSources: true })
  // The book slots are unaffected, so the night still sets four.
  eq('the book slots still fill', report.set, 4)
  const daily = db.store.get('dailyQuest/2026-11-03')
  ok('no news paper is set', daily.papers.every((p) => p.genre !== 'news'))
  ok('the news slots say why', report.missed.length === 2
    && report.missed.every((m) => m.why.join(' ').includes('cited no sources')),
    JSON.stringify(report.missed))
}

// --- the bank covers a slot that fails ----------------------------------

{
  // A good night first, so the bank has something in it.
  const db = fakeDb()
  const good = questJob.make({ db, callClaude: fakeClaude().call })
  await good.runNight('2026-11-03')
  const banked = [...db.store.keys()].filter((k) => k.startsWith('readingQuests/')).length
  eq('the bank is stocked by the first night', banked, 6)

  // Then a night where nothing can be generated at all.
  const bad = questJob.make({ db, callClaude: fakeClaude({ badQuestionJson: true }).call })
  const report = await bad.runNight('2026-11-04')

  ok('a failed night falls back to the bank', report.set === 6, `set ${report.set}`)
  eq('every slot was reused rather than made', report.reused.length, 6)
  const daily = db.store.get('dailyQuest/2026-11-04')
  eq('the second day is set from the bank', daily.papers.length, 6)
  eq('no paper is set twice in one day', new Set(daily.papers.map((p) => p.id)).size, 6)
  const reset = [...db.store.values()].filter((p) => p.timesSet === 2).length
  eq('a reused paper records being set again', reset, 6)

  // A reused paper lands on the quiz set it already had, because the attempts
  // sat against it and the teacher's edits are both keyed to that id.
  eq('reuse writes no second set',
    [...db.store.keys()].filter((k) => k.startsWith('quizSets/')).length, 6)
  ok('a reused set is dated to the day it is set again',
    daily.papers.every((p) => db.store.get(`quizSets/${p.quizSetId}`).questDay === '2026-11-04'))
}

// --- a teacher's edit survives the paper being set again -----------------

{
  const db = fakeDb()
  const job = questJob.make({ db, callClaude: fakeClaude().call })
  await job.runNight('2026-11-03')

  const first = db.store.get('dailyQuest/2026-11-03').papers[0]
  const key = `quizSets/${first.quizSetId}`

  // A teacher finds a wrong answer and fixes it, the way they would fix any
  // other paper: in the quiz editor, on the quiz set.
  const edited = db.store.get(key)
  edited.questions[0].prompt = 'What did the teacher decide this should ask?'
  edited.questions[0].correctIndex = 3
  edited.friendlyTitle = 'Renamed by a teacher'
  db.store.set(key, edited)

  // Months later the bank fills a slot with that same paper.
  const bad = questJob.make({ db, callClaude: fakeClaude({ badQuestionJson: true }).call })
  await bad.runNight('2026-11-04')

  const after = db.store.get(key)
  eq("the teacher's question is still there", after.questions[0].prompt,
    'What did the teacher decide this should ask?')
  eq("the teacher's answer is still there", after.questions[0].correctIndex, 3)
  eq("the teacher's title is still there", after.friendlyTitle, 'Renamed by a teacher')
  eq('but the set knows which day it is set for', after.questDay, '2026-11-04')
}

// --- a teacher pulling a paper ------------------------------------------

{
  const db = fakeDb()
  const job = questJob.make({ db, callClaude: fakeClaude().call })
  await job.runNight('2026-11-03')
  // A second day, so the bank holds more than the six currently set and a
  // pulled slot has something to be refilled from.
  await job.runNight('2026-11-04')

  const before = db.store.get('dailyQuest/2026-11-04')
  const victim = before.papers.find((p) => p.genre === 'fiction')
  const out = await job.pullPaper('2026-11-04', victim.id)

  ok('the paper is pulled', out.pulled === true, JSON.stringify(out))
  eq('the slot is named', out.slot, `fiction/${victim.band}`)

  const after = db.store.get('dailyQuest/2026-11-04')
  ok('the pulled paper is gone from the day', after.papers.every((p) => p.id !== victim.id))
  eq('the day still holds six papers', after.papers.length, 6)
  ok('it was replaced rather than left short', !!out.replacedWith, JSON.stringify(out))

  // Marked, not deleted: the bank is the record of what was made.
  const banked = db.store.get(`readingQuests/${victim.id}`)
  ok('the paper is still in the bank', !!banked)
  ok('the bank records that it was pulled', banked.pulled === true && banked.pulledOn === '2026-11-04',
    JSON.stringify({ pulled: banked.pulled, on: banked.pulledOn }))

  // And it must not come back, as a replacement or on a later night.
  const again = await job.pullPaper('2026-11-04', victim.id)
  eq('pulling it twice does nothing', again.pulled, false)
  ok('the second attempt says why', /not set for that day/.test(again.why), again.why)

  const third = questJob.make({ db, callClaude: fakeClaude({ badQuestionJson: true }).call })
  const report = await third.runNight('2026-11-05')
  const day3 = db.store.get('dailyQuest/2026-11-05')
  ok('a pulled paper is never set again', (day3?.papers || []).every((p) => p.id !== victim.id),
    JSON.stringify(report.reused))

  eq('pulling from a day with no quest is refused', (await job.pullPaper('2026-01-01', 'rq-nope')).pulled, false)
  eq('pulling a paper that is not set is refused', (await job.pullPaper('2026-11-04', 'rq-nope')).pulled, false)
}

// --- the copyright rule is applied to the list, not trusted from it -----

{
  const { job } = await run()
  const works = job.candidateWorks('fiction', 'y9', { chaptersByWork: {}, keys: new Set() })
  ok('there are works to draw on', works.length > 10, `${works.length} works`)
  const clearBefore = new Date().getFullYear() - 70
  ok('every candidate author is out of copyright here',
    works.every((w) => w.died <= clearBefore),
    JSON.stringify(works.filter((w) => w.died > clearBefore).map((w) => `${w.title} (${w.died})`)))
  ok('essays are available too', job.candidateWorks('essay', 'y9', { chaptersByWork: {}, keys: new Set() }).length > 3)
}

console.log(`\n${pass} pass, ${fails.length} fail`)
if (fails.length) {
  console.log(fails.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
