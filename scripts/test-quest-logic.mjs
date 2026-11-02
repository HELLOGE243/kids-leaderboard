/**
 * The daily quest's judgement half, tested without a model or a network.
 *
 *   node scripts/test-quest-logic.mjs
 *
 * Everything the nightly job decides for itself - whether a passage is at the
 * right level, whether six questions are fit to ask, where the answer sits -
 * is a pure function in functions/questLogic.js, so all of it can be checked
 * here for nothing. The expensive checks the job also runs (can this be
 * answered without reading the passage? is this suitable for a ten-year-old?)
 * need a model and are not covered here.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const Q = require('../functions/questLogic.js')

let pass = 0
const fails = []

function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`pass  ${name}`) } else {
    fails.push(name)
    console.log(`FAIL  ${name}${detail ? `\n        ${detail}` : ''}`)
  }
}

function eq(name, got, want) {
  const same = JSON.stringify(got) === JSON.stringify(want)
  ok(name, same, same ? '' : `got ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`)
}

// --- text, as a reader meets it -------------------------------------------

eq('tags come out', Q.stripHtml('<p>Hello <b>there</b></p>'), 'Hello there')
eq('a script does not become words', Q.stripHtml('<script>var a = 1</script><p>Hi</p>'), 'Hi')
eq('entities become characters', Q.stripHtml('<p>Tom&rsquo;s dog &amp; cat</p>'), "Tom's dog & cat")
eq('words are counted, not tags', Q.wordCount('<p>one two three</p>'), 3)
eq('hyphenated words count once', Q.wordCount('a well-known fact'), 3)

// Abbreviations are the whole reason sentences() is not a one-liner: a page
// of dialogue is full of them, and counting each as a sentence end halves the
// average sentence length.
eq('an abbreviation does not end a sentence', Q.sentences('Mr. Holmes said so. He was right.'), 2)
eq('initials do not end a sentence', Q.sentences('It was J. R. Hartley. He called.'), 2)
eq('one sentence with no full stop still counts', Q.sentences('No full stop here'), 1)
eq('nothing readable is no sentences', Q.sentences('<p> </p>'), 0)

eq('syllables: one', Q.syllablesIn('cat'), 1)
eq('syllables: two', Q.syllablesIn('running'), 2)
eq('syllables: three', Q.syllablesIn('remember'), 3)
eq('syllables: the silent e comes off', Q.syllablesIn('hope'), 1)
eq('syllables: a word is never zero', Q.syllablesIn('rhythm'), 1)
// Recorded rather than fixed: the vowel-group rule counts "beautiful" as four
// and "fire" as one. The formula averages over several hundred words, where
// errors in both directions cancel, and the alternative is shipping a
// pronunciation dictionary for a number used to make one yes-or-no decision.
eq('syllables: a known overcount, left alone', Q.syllablesIn('beautiful'), 4)

// --- reading level --------------------------------------------------------

/**
 * A passage of about `target` words, built by repeating paragraphs.
 *
 * The bands want 400-900 words, which is more than is worth typing twice into
 * a test file. Repetition leaves the reading level where it was - the formula
 * is an average over sentences - so a passage built this way exercises the
 * word-count gate and the grade gate independently, which is the point.
 */
function passageOf(paragraphs, target) {
  const out = []
  let count = 0
  for (let i = 0; count < target; i++) {
    const p = paragraphs[i % paragraphs.length]
    out.push(p)
    count += Q.wordCount(p)
  }
  return out.join('\n')
}

const Y6_PARAS = `
<p>The old lighthouse stood on the rocks at the end of the bay. Every night
its lamp turned slowly and threw a long white beam across the water. Sailors
far out at sea could see it and knew where the rocks were. Without the light
many ships would have been wrecked.</p>
<p>Tom lived in the cottage beside it. His father kept the lamp burning. Each
evening Tom carried oil up the winding stairs. There were ninety-two steps and
he counted them every time. At the top the air was cold and the glass was
always wet.</p>
<p>One winter night a storm came in from the west. The wind was so strong that
it shook the walls. Tom's father went up to the lamp and did not come down for
many hours. Tom waited by the fire and listened to the sea. In the morning the
storm had passed and the light was still burning.</p>
<p>Years later Tom became the keeper himself. He never forgot the number of
the steps, and he never let the lamp go out. Ships passed safely in the dark
because somebody was awake on the rocks.</p>
`.trim().split(/\n(?=<p>)/)

const Y6_TEXT = passageOf(Y6_PARAS, 480)

const grade6 = Q.fkGrade(Y6_TEXT)
ok('a simple narrative reads as a lower-school passage', grade6 !== null && grade6 < 8,
  `grade ${grade6}`)

const Y9_PARAS = `
<p>A language seldom dies in a single generation. It fades when parents decide,
often with good reason, that their children will do better speaking the
language of their more powerful neighbours. Within two generations the older
tongue lives on only in the memory of people who have nobody left to speak it
with.</p>
<p>What goes with it is far more than a list of words. The names of local
plants, the rules about who owes what to whom, the shape of a coastline held in
a song: none of it was ever written down, so none of it can simply be looked
up again.</p>
<p>Linguists think that a language is lost somewhere in the world every two
weeks. Of the seven thousand still spoken, most have fewer speakers than a
country football ground holds, and many have never been written at all, so no
book exists from which they could be built again.</p>
<p>Recording them is a race against time, done by a small field with little
money and few people in it. Each one of them works against the growing age of
the last fluent speakers, and when those speakers die the chance has gone for
good.</p>
`.trim().split(/\n(?=<p>)/)

const Y9_TEXT = passageOf(Y9_PARAS, 700)
// Hard writing at a lower-school length: inside the y6 word range, so the
// only thing that can reject it is the reading level itself.
const HARD_BUT_SHORT = passageOf(Y9_PARAS, 450)

const grade9 = Q.fkGrade(Y9_TEXT)
ok('an academic essay reads as an upper-school passage', grade9 !== null && grade9 >= 8,
  `grade ${grade9}`)
ok('the two sample passages are ordered as expected', grade9 > grade6,
  `y6 ${grade6}, y9 ${grade9}`)

eq('a passage at the right level is accepted', Q.passageFitsBand(Y9_TEXT, 'y9'), null)
ok('the y9 essay is refused as a y6 passage', Q.passageFitsBand(Y9_TEXT, 'y6') !== null,
  String(Q.passageFitsBand(Y9_TEXT, 'y6')))
ok('a short passage is refused with its length', /short of 400/.test(String(Q.passageFitsBand('<p>Too little here.</p>', 'y6'))),
  String(Q.passageFitsBand('<p>Too little here.</p>', 'y6')))
ok('an unknown band is refused', /unknown band/.test(String(Q.passageFitsBand(Y6_TEXT, 'y12'))))

// --- which band a student reads ------------------------------------------

eq('year 3 reads the lower paper', Q.bandFromYearGroup('Year 3'), 'y6')
eq('year 6 reads the lower paper', Q.bandFromYearGroup(6), 'y6')
eq('year 7 still reads the lower paper', Q.bandFromYearGroup('7'), 'y6')
eq('year 8 moves up', Q.bandFromYearGroup('Year 8'), 'y9')
eq('year 11 reads the upper paper', Q.bandFromYearGroup('11'), 'y9')
// A missing year group must not throw a child out of the quest altogether.
eq('an unknown year group gets the lower paper', Q.bandFromYearGroup(''), 'y6')
eq('a null year group gets the lower paper', Q.bandFromYearGroup(null), 'y6')

// --- one question --------------------------------------------------------

const goodQ = {
  type: 'inference',
  question: 'What does the passage suggest about the keeper?',
  options: ['He resented the work', 'He took the duty seriously', 'He feared the sea', 'He wanted to leave'],
  correct: 1,
  explanation: 'He never let the lamp go out, which is stated in the final paragraph.',
}

eq('a well-formed question is accepted', Q.questionStructurallyOk(goodQ, new Set()), null)
eq('three options is refused', Q.questionStructurallyOk({ ...goodQ, options: ['a', 'b', 'c'] }, new Set()), 'not four options')
eq('a blank option is refused', Q.questionStructurallyOk({ ...goodQ, options: ['a', '', 'c', 'd'] }, new Set()), 'blank option')
eq('a correct index off the end is refused', Q.questionStructurallyOk({ ...goodQ, correct: 4 }, new Set()), 'bad correct index')
eq('no explanation is refused', Q.questionStructurallyOk({ ...goodQ, explanation: 'Because.' }, new Set()), 'no explanation')
eq('a stub stem is refused', Q.questionStructurallyOk({ ...goodQ, question: 'Why?' }, new Set()), 'stem too short')
eq('an unplanned type is refused', Q.questionStructurallyOk({ ...goodQ, type: 'trivia' }, new Set()), 'unknown type trivia')
eq('duplicate options are refused',
  Q.questionStructurallyOk({ ...goodQ, options: ['same', 'same', 'c', 'd'] }, new Set()), 'duplicate options')
eq('all of the above is refused',
  Q.questionStructurallyOk({ ...goodQ, options: ['a', 'b', 'c', 'all of the above'] }, new Set()),
  'all/none of the above')

// An option far longer than its rivals is the answer, and a child who has
// noticed that has stopped reading the passage.
eq('one very long option is refused',
  Q.questionStructurallyOk({
    ...goodQ,
    options: ['Short', 'Brief', 'Tiny', 'A considerably longer option that explains itself at length and is plainly the one'],
  }, new Set()),
  'one option much longer')
eq('options of similar length are fine',
  Q.questionStructurallyOk({
    ...goodQ,
    options: ['He resented the work he did', 'He took the duty seriously', 'He feared the sea at night', 'He wanted to leave soon'],
  }, new Set()),
  null)

eq('a question asked before is refused',
  Q.questionStructurallyOk(goodQ, new Set([Q.questionStem(goodQ.question)])), 'asked before')
eq('the stem ignores punctuation and case',
  Q.questionStem('What does the passage SUGGEST, about the keeper?'),
  Q.questionStem('what does the passage suggest about the keeper'))

// --- a whole paper -------------------------------------------------------

const sixQuestions = Q.QUESTION_PLAN.map((type, i) => ({
  type,
  question: `Question number ${i + 1} about the passage, asked at length?`,
  options: [`Option A${i}`, `Option B${i}`, `Option C${i}`, `Option D${i}`],
  correct: i % 4,
  explanation: `The passage says so in paragraph ${i + 1}, which is where this comes from.`,
}))

const goodPaper = {
  genre: 'fiction',
  band: 'y9',
  title: 'A language dies',
  attribution: 'Written for CleverSpace.',
  licence: 'original',
  text: Y9_TEXT,
  questions: sixQuestions,
}

eq('a complete paper is accepted', Q.paperStructurallyOk(goodPaper), [])
eq('five questions is refused',
  Q.paperStructurallyOk({ ...goodPaper, questions: sixQuestions.slice(0, 5) }).filter((f) => /questions, want/.test(f)),
  ['5 questions, want 6'])

// The type mix is the difference between a paper and a quiz, so a set of six
// detail questions must be refused even though every one of them is sound.
const allDetail = Q.paperStructurallyOk({
  ...goodPaper,
  questions: sixQuestions.map((q, i) => ({ ...q, type: 'detail', question: `Detail question ${i} about the passage?` })),
})
ok('six detail questions are refused for the missing types',
  ['no gist question', 'no inference question', 'no vocabulary question', 'no purpose question']
    .every((f) => allDetail.includes(f)),
  JSON.stringify(allDetail))

ok('an unknown genre is refused', Q.paperStructurallyOk({ ...goodPaper, genre: 'poetry' }).includes('unknown genre poetry'))
ok('a missing attribution is refused', Q.paperStructurallyOk({ ...goodPaper, attribution: '' }).includes('no attribution'))

// Provenance is not decoration: a passage we cannot say the origin of is one
// we cannot defend having copied.
ok('copied text with no source link is refused',
  Q.paperStructurallyOk({ ...goodPaper, licence: 'public-domain', sourceUrl: '' })
    .includes('copied text with no source link'))
eq('our own text needs no source link',
  Q.paperStructurallyOk({ ...goodPaper, licence: 'original', sourceUrl: '' }), [])
ok('an unknown licence is refused',
  Q.paperStructurallyOk({ ...goodPaper, licence: 'all-rights-reserved' })
    .includes('unknown licence all-rights-reserved'))
ok('a passage at the wrong level is refused by the paper check',
  Q.paperStructurallyOk({ ...goodPaper, band: 'y6', text: HARD_BUT_SHORT }).some((f) => /reads at grade/.test(f)),
  JSON.stringify(Q.paperStructurallyOk({ ...goodPaper, band: 'y6', text: HARD_BUT_SHORT })))
ok('hard writing at a lower-school length is refused on grade alone',
  /reads at grade/.test(String(Q.passageFitsBand(HARD_BUT_SHORT, 'y6'))),
  String(Q.passageFitsBand(HARD_BUT_SHORT, 'y6')))

// --- answer position ----------------------------------------------------

const base = { options: ['a', 'b', 'c', 'd'], correct: 0 }
eq('rotating to the same place changes nothing', Q.rotateAnswerTo(base, 0), { options: ['a', 'b', 'c', 'd'], correct: 0 })
eq('rotating by one moves every option along', Q.rotateAnswerTo(base, 1), { options: ['d', 'a', 'b', 'c'], correct: 1 })
eq('rotating by three', Q.rotateAnswerTo(base, 3), { options: ['b', 'c', 'd', 'a'], correct: 3 })
eq('rotating from the end wraps', Q.rotateAnswerTo({ options: ['a', 'b', 'c', 'd'], correct: 3 }, 0),
  { options: ['d', 'a', 'b', 'c'], correct: 0 })

// Every starting position to every target: the right answer must still be the
// right answer afterwards, or the rotation has silently changed the paper.
let rotationsHeld = true
for (let from = 0; from < 4; from++) {
  for (let to = 0; to < 4; to++) {
    const q = { options: ['w', 'x', 'y', 'z'], correct: from }
    const r = Q.rotateAnswerTo(q, to)
    if (r.options[r.correct] !== q.options[q.correct]) rotationsHeld = false
    if (r.correct !== to) rotationsHeld = false
    if (new Set(r.options).size !== 4) rotationsHeld = false
  }
}
ok('all 16 rotations keep the right answer right', rotationsHeld)

// --- dedup --------------------------------------------------------------

eq('the same chapter of the same book collides',
  Q.sourceKey({ genre: 'fiction', workTitle: 'Treasure Island', chapter: 'Chapter 1' }),
  Q.sourceKey({ genre: 'fiction', workTitle: 'treasure island', chapter: 'chapter 1' }))
ok('a different chapter of the same book does not',
  Q.sourceKey({ genre: 'fiction', workTitle: 'Treasure Island', chapter: 'Chapter 1' })
  !== Q.sourceKey({ genre: 'fiction', workTitle: 'Treasure Island', chapter: 'Chapter 2' }))
ok('the same news story collides whatever the chapter',
  Q.sourceKey({ genre: 'news', title: 'Reef grows back' })
  === Q.sourceKey({ genre: 'news', title: 'Reef  grows  back!' }))

// --- minutes ------------------------------------------------------------

eq('a short piece still takes a minute', Q.readingMinutes(40), 1)
eq('720 words at a reading pace is four minutes', Q.readingMinutes(720), 4)

console.log(`\n${pass} pass, ${fails.length} fail`)
if (fails.length) {
  console.log(fails.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
