/**
 * The model-dependent half of the night, checked without a model.
 *
 *   node scripts/test-quest-model-contract.mjs
 *
 * The nightly job asks Claude for three things - a news report, eight
 * questions, and two judgements - and then parses, gates and rotates whatever
 * comes back. test-quest-job.mjs covers that machinery with placeholder
 * content ("Option A0"), which proves the plumbing and nothing about whether
 * the plumbing fits real prose.
 *
 * So this file holds a reply written by hand, to the job's real prompt, about
 * a real extract of Treasure Island: eight questions in the Cambridge mix,
 * with the wording and the distractors a model would actually produce. It then
 * runs them through the real path - firstJson, questionStructurallyOk, the
 * rotation, paperStructurallyOk - and checks the paper that comes out is one
 * that could be set.
 *
 * ## What this cannot check, and why
 *
 * The giveaway gate asks a model to answer each question with the passage
 * withheld, and throws the question away if it gets it right. That judgement
 * cannot be checked here, because the questions below were written by the same
 * author as the answers: anything standing in for the model already knows
 * which option is correct. So the probe is stubbed to "could not tell" and
 * what is verified is the gate's mechanism, not its judgement.
 *
 * Whether the gate is any good is the one thing that needs a deployed job and
 * a real model, and nothing in this repository can stand in for it.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const questJob = require('../functions/questJob.js')
const QL = require('../functions/questLogic.js')
const QT = require('../functions/questText.js')

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

// The extract the questions were written about: Treasure Island, chapter II,
// the morning Black Dog walks into the Admiral Benbow. Trimmed to the part the
// questions touch, and kept verbatim because it is public domain.
const PASSAGE_PARAS = [
  'It was a bitter cold winter, with long, hard frosts and heavy gales; and it was plain from the first that my poor father was little likely to see the spring. He sank daily, and my mother and I had all the inn upon our hands, and were kept busy enough without paying much regard to our unpleasant guest.',
  'It was one January morning, very early--a pinching, frosty morning--the cove all grey with hoar-frost, the ripple lapping softly on the stones, the sun still low and only touching the hilltops and shining far to seaward. The captain had risen earlier than usual and set out down the beach, his cutlass swinging under the broad skirts of the old blue coat, his brass telescope under his arm, his hat tilted back upon his head.',
  'Well, mother was upstairs with father and I was laying the breakfast-table against the captain’s return when the parlour door opened and a man stepped in on whom I had never set my eyes before. He was a pale, tallowy creature, wanting two fingers of the left hand, and though he wore a cutlass, he did not look much like a fighter.',
  'I had always my eye open for seafaring men, with one leg or two, and I remember this one puzzled me. He was not sailorly, and yet he had a smack of the sea about him too. I asked him what was for his service, and he said he would take rum; but as I was going out of the room to fetch it, he sat down upon a table and motioned me to draw near. I paused where I was, with my napkin in my hand.',
  '“Come here, sonny,” says he. “Come nearer here.” I took a step nearer. “Is this here table for my mate Bill?” he asked with a kind of leer. I told him I did not know his mate Bill, and this was for a person who stayed in our house whom we called the captain.',
  '“Well,” said he, “my mate Bill would be called the captain, as like as not. He has a cut on one cheek and a mighty pleasant way with him, particularly in drink, has my mate Bill. We’ll put it, for argument like, that your captain has a cut on one cheek--and we’ll put it, if you like, that that cheek’s the right one. Ah, well! I told you. Now, is my mate Bill in this here house?”',
]

/**
 * The reply, written by hand to the real prompt.
 *
 * Eight questions to keep six, which is the margin the job generates for. The
 * distractors are things a careless reader of this passage would believe, not
 * nonsense - which is the rule the prompt spends most of its words on and the
 * one most likely to be ignored.
 */
const MODEL_REPLY = JSON.stringify([
  {
    type: 'gist',
    question: 'What happens in this part of the story?',
    options: [
      'A stranger comes to the inn and asks after the captain while he is out',
      'The captain quarrels with a stranger who comes into the parlour',
      'The narrator is sent down to the beach to find the captain',
      'The captain leaves the inn for good after a cold night',
    ],
    correct: 0,
    explanation: 'The captain sets out down the beach in the second paragraph and the stranger arrives afterwards, asking where he has gone.',
  },
  {
    type: 'detail',
    question: 'What was the narrator doing when the stranger came in?',
    options: [
      'Laying the breakfast-table for the captain',
      'Carrying rum through to the parlour',
      'Sitting upstairs with his mother and father',
      'Watching the captain walk off down the beach',
    ],
    correct: 0,
    explanation: 'The third paragraph says he was laying the breakfast-table against the captain’s return when the parlour door opened.',
  },
  {
    type: 'detail',
    question: 'What did the narrator notice about the stranger’s left hand?',
    options: [
      'Two of its fingers were missing',
      'It was holding a brass telescope',
      'It was wrapped against the frost',
      'It rested the whole time on his cutlass',
    ],
    correct: 0,
    explanation: 'He is described as "wanting two fingers of the left hand" when he steps into the parlour.',
  },
  {
    type: 'vocabulary',
    question: 'The narrator says the stranger "had a smack of the sea about him". What does "smack" mean here?',
    options: [
      'A trace of something, enough to notice',
      'A sharp blow with an open hand',
      'A small boat used for fishing',
      'A loud noise made with the lips',
    ],
    correct: 0,
    explanation: 'It sits against "he was not sailorly, and yet", so it means a hint of the sea rather than a blow or a boat.',
  },
  {
    type: 'inference',
    question: 'Why does the stranger say "we’ll put it, if you like, that that cheek’s the right one"?',
    options: [
      'He is supplying details himself to check he has the right man',
      'He is correcting a mistake the narrator has just made',
      'He is describing a different sailor he once knew',
      'He is trying to make the narrator laugh at the captain',
    ],
    correct: 0,
    explanation: 'The narrator never mentions a cut cheek; the stranger offers the detail and then says "Ah, well! I told you", so he is confirming the captain is his mate Bill.',
  },
  {
    type: 'purpose',
    question: 'Why does the narrator tell us about his father’s illness before the stranger arrives?',
    options: [
      'To explain why the family paid little attention to the captain',
      'To show that the winter weather was unusually dangerous',
      'To suggest that the captain was the cause of the illness',
      'To explain why the inn had no other guests that January',
    ],
    correct: 0,
    explanation: 'The first paragraph says they were "kept busy enough without paying much regard to our unpleasant guest".',
  },
  {
    type: 'detail',
    question: 'What did the stranger ask to be given when he first sat down?',
    options: [
      'Rum',
      'Breakfast',
      'A napkin',
      'Hot water',
    ],
    correct: 0,
    explanation: 'The fourth paragraph says he said he would take rum when asked what was for his service.',
  },
  {
    type: 'inference',
    question: 'What does the narrator’s description of the stranger suggest about him?',
    options: [
      'He is connected with the sea but is not a working sailor',
      'He has spent his whole life at sea as a fighting man',
      'He has never been near the sea and is pretending',
      'He is a local man the narrator simply failed to recognise',
    ],
    correct: 0,
    explanation: 'He "was not sailorly, and yet he had a smack of the sea about him too", and though he wore a cutlass he "did not look much like a fighter".',
  },
])

// Every answer is at index 0 above, deliberately: a model writing a list tends
// to put the right answer first, and the rotation is what stops that reaching
// a child. If the rotation stopped working, this file would notice.

function stubDb() {
  const store = new Map()
  const q = () => ({
    where: q, orderBy: q, limit: q, select: q,
    get: async () => ({ size: 0, docs: [], forEach: () => {} }),
  })
  return {
    store,
    collection: (name) => ({
      ...q(),
      doc: (id) => ({
        set: async (v, opt) => {
          const k = `${name}/${id}`
          store.set(k, opt && opt.merge ? { ...(store.get(k) || {}), ...v } : v)
        },
        get: async () => ({ exists: store.has(`${name}/${id}`), data: () => store.get(`${name}/${id}`) }),
      }),
    }),
  }
}

const probes = []
const reply = (text) => ({
  status: 200,
  body: JSON.stringify({ content: [{ type: 'thinking', thinking: '...' }, { type: 'text', text }] }),
})

const db = stubDb()
const job = questJob.make({
  db,
  callClaude: async (body) => {
    const prompt = String(body.messages[0].content)
    probes.push(prompt)
    if (/Is it suitable/.test(prompt)) return reply('{"suitable": true}')
    // Stubbed, and the file header says why: the author of the questions
    // cannot honestly sit the test.
    if (/Guess the answer from general knowledge/.test(prompt)) return reply('I cannot tell without the text.')
    if (/multiple-choice questions/.test(prompt)) return reply(MODEL_REPLY)
    throw new Error(`unexpected prompt: ${prompt.slice(0, 60)}`)
  },
})

const paper = {
  genre: 'fiction',
  band: 'y6',
  title: 'Treasure Island, II. Black Dog Appears and Disappears',
  workTitle: 'Treasure Island',
  workId: 120,
  chapter: 'II. Black Dog Appears and Disappears',
  source: 'Project Gutenberg',
  sourceUrl: 'https://www.gutenberg.org/ebooks/120',
  attribution: 'Robert Louis Stevenson. Public domain.',
  licence: 'public-domain',
  text: QT.asHtml(PASSAGE_PARAS),
}
paper.wordCount = QL.wordCount(paper.text)
paper.readability = { fk: QL.fkGrade(paper.text), band: 'y6' }
paper.minutes = QL.readingMinutes(paper.wordCount)

// --- the extract is what it claims to be --------------------------------

ok('the extract sits in the lower band', !QL.passageFitsBand(paper.text, 'y6'),
  String(QL.passageFitsBand(paper.text, 'y6')))
console.log(`      ${paper.wordCount} words, grade ${paper.readability.fk}`)

// --- the reply parses and survives every gate ---------------------------

const parsed = await job.writeQuestions(paper)
eq('the hand-written reply parses as eight questions', parsed.length, 8)
ok('the prompt asked for the passage with its tags stripped',
  !/<p>/.test(probes.find((p) => /multiple-choice/.test(p))),
  'the passage reached the model as HTML')
ok('the prompt carries the type plan', /1\. gist[\s\S]*4\. inference[\s\S]*6\. purpose/.test(
  probes.find((p) => /multiple-choice/.test(p))))

const seen = new Set()
const rejected = []
for (const q of parsed) {
  const bad = QL.questionStructurallyOk(q, seen)
  if (bad) rejected.push(`${q.type}: ${bad}`)
  else seen.add(QL.questionStem(q.question))
}
eq('every hand-written question passes the structural gate', rejected, [])

// --- a whole paper, built the way the job builds one --------------------

const built = await job.buildPaper('fiction', 'y6', { keys: new Set(), chaptersByWork: {} })
// buildPaper sources its own passage from the live archive, so this needs the
// network; what matters is that it comes back with a paper and no faults.
ok('buildPaper returns a paper', !!built.paper, JSON.stringify(built.why))
if (built.paper) {
  eq('the paper has no structural faults', QL.paperStructurallyOk(built.paper), [])
  eq('it keeps six of the eight questions', built.paper.questions.length, 6)

  // The hand-written reply puts every answer at index 0. If that reached a
  // child, pressing A every time would score full marks.
  const positions = built.paper.questions.map((q) => q.correct)
  eq('the answers are rotated to a position taken in turn', positions, [0, 1, 2, 3, 0, 1])
  ok('no question keeps the answer where the model put it',
    positions.filter((p) => p === 0).length === 2, JSON.stringify(positions))

  // Rotating must move the options, not relabel them: the text under the new
  // index has to be the text that was correct before.
  const byStem = new Map(parsed.map((q) => [QL.questionStem(q.question), q]))
  const kept = built.paper.questions.every((q) => {
    const before = byStem.get(QL.questionStem(q.question))
    return before && q.options[q.correct] === before.options[before.correct].trim()
  })
  ok('rotation keeps the right answer right on real wording', kept)

  const types = built.paper.questions.map((q) => q.type)
  ok('the required types all survive', ['gist', 'inference', 'vocabulary', 'purpose']
    .every((t) => types.includes(t)), types.join(', '))
  console.log(`      kept: ${types.join(', ')}`)
}

// --- the news brief says what it must ----------------------------------

try {
  await job.newsPiece('y9', { keys: new Set(), chaptersByWork: {} })
} catch (e) { /* the stub refuses news, which is the point: only the brief matters */ }
const newsPrompt = probes.find((p) => /Write a short news report/.test(p))
ok('the news brief exists', !!newsPrompt)
if (newsPrompt) {
  ok('it forbids deaths of named people', /death or injury of any named person/.test(newsPrompt))
  ok('it forbids violent crime', /violent crime/.test(newsPrompt))
  ok('it forbids war casualties', /war, armed conflict or casualty figures/.test(newsPrompt))
  ok('it forbids anything about a named child', /named child/.test(newsPrompt))
  ok('it demands sources be read first', /at least three independent sources/.test(newsPrompt))
  ok('it forbids reproducing a source', /do not reproduce sentences from any source/.test(newsPrompt))
  ok('it states the word range', /Length: 600-900 words/.test(newsPrompt), newsPrompt.match(/Length:[^\n]*/)?.[0])
  ok('it states the reading level', /Year 9/.test(newsPrompt))
}

console.log(`\n${pass} pass, ${fails.length} fail`)
if (fails.length) {
  console.log(fails.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
