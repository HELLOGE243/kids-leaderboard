/**
 * Getting an extract out of a Gutenberg text file, tested without the network.
 *
 *   node scripts/test-quest-text.mjs
 *
 * The fixtures here are small, but every one of them is a shape a real book
 * actually used, and most were written only after the parser got that book
 * wrong. The comments say which.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const T = require('../functions/questText.js')
const Q = require('../functions/questLogic.js')

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

const para = (n, words) => `${`Sentence ${n} runs along for a while and then stops. `.repeat(Math.ceil(words / 11))}`

// --- the wrapper comes off ------------------------------------------------

const WRAPPED = [
  'The Project Gutenberg eBook of Something',
  'This eBook is for the use of anyone anywhere at no cost.',
  '*** START OF THE PROJECT GUTENBERG EBOOK SOMETHING ***',
  '',
  'The real first line.',
  '',
  'The real last line.',
  '',
  '*** END OF THE PROJECT GUTENBERG EBOOK SOMETHING ***',
  'Updated editions will replace the previous one.',
].join('\n')

const stripped = T.stripGutenbergBoilerplate(WRAPPED)
ok('the licence header is removed', !/for the use of anyone/.test(stripped), stripped.slice(0, 60))
ok('the licence footer is removed', !/Updated editions/.test(stripped))
ok('the book itself is kept', /The real first line/.test(stripped) && /The real last line/.test(stripped))

// "START OF THIS" was the older wording and still appears in older files.
ok('the older START OF THIS wording is handled',
  !/boilerplate/i.test(T.stripGutenbergBoilerplate('boilerplate\n*** START OF THIS PROJECT GUTENBERG EBOOK X ***\nreal text')))

// A file with no markers at all must come back whole rather than empty: the
// licence prose then shows up as a candidate extract and is rejected by the
// grade gate like anything else.
eq('a file with no markers is returned whole', T.stripGutenbergBoilerplate('just a book'), 'just a book')

ok('a transcriber note is dropped',
  !/Transcriber/i.test(T.stripGutenbergBoilerplate(
    '*** START OF THE PROJECT GUTENBERG EBOOK X ***\n[Transcriber’s Note: italics are shown with underscores.]\nChapter text here.')))

// --- chapter headings, in the styles real books used ----------------------

// Treasure Island: a bare Roman numeral with the title on the next line.
const BARE_NUMERAL_BOOK = ['I', '', 'The Old Sea-dog', '', para(1, 200), '',
  'II', '', 'Black Dog Appears', '', para(2, 200), '',
  'III', '', 'The Black Spot', '', para(3, 200)].join('\n')
const bareCh = T.splitIntoChapters(BARE_NUMERAL_BOOK)
eq('a bare numeral book splits into its chapters', bareCh.length, 3)
eq('the title on the following line joins the heading', bareCh[0].heading, 'I. The Old Sea-dog')
ok('the title is not left in the body', !/Old Sea-dog/.test(bareCh[0].body), bareCh[0].body.slice(0, 40))

// Sherlock Holmes: the numeral and the title on one line.
const SAME_LINE_BOOK = ['I. A SCANDAL IN BOHEMIA', '', para(1, 200), '',
  'II. THE RED-HEADED LEAGUE', '', para(2, 200), '',
  'III. A CASE OF IDENTITY', '', para(3, 200)].join('\n')
const sameCh = T.splitIntoChapters(SAME_LINE_BOOK)
eq('a numeral and title on one line splits', sameCh.length, 3)
eq('the whole line is the heading', sameCh[0].heading, 'I. A SCANDAL IN BOHEMIA')

const KEYWORD_BOOK = ['CHAPTER 1. The Beginning', '', para(1, 200), '',
  'CHAPTER 2. The Middle', '', para(2, 200), '',
  'CHAPTER 3. The End', '', para(3, 200)].join('\n')
eq('CHAPTER headings split', T.splitIntoChapters(KEYWORD_BOOK).length, 3)

// --- the table of contents is not a set of chapters ----------------------

// Treasure Island lists its chapters with dot leaders, and the first version
// of the parser read the contents as thirty-four headings - thirty-three with
// nothing under them and one holding the entire novel.
const CONTENTS_BOOK = [
  '     CONTENTS',
  '',
  '     I.  THE OLD SEA-DOG . . . . . . . . . 1',
  '     II.  BLACK DOG APPEARS . . . . . . . 12',
  '     III.  THE BLACK SPOT . . . . . . . . 24',
  '',
  'I', '', 'The Old Sea-dog', '', para(1, 200), '',
  'II', '', 'Black Dog Appears', '', para(2, 200), '',
  'III', '', 'The Black Spot', '', para(3, 200),
].join('\n')
const withContents = T.splitIntoChapters(CONTENTS_BOOK)
eq('the contents list does not become chapters', withContents.length, 3)
eq('the first real chapter is the first section', withContents[0].heading, 'I. The Old Sea-dog')
ok('no section swallows the whole book',
  withContents.every((c) => Q.wordCount(c.body) < 900),
  withContents.map((c) => Q.wordCount(c.body)).join(','))

// A contents line that wraps has no dot leaders on its first line, so it can
// only be caught by there being nothing underneath it - which is why the
// tiers are compared by usable sections and not by raw heading count.
const WRAPPED_CONTENTS = [
  '     XXXII.  THE TREASURE-HUNT--THE VOICE',
  '     AMONG THE TREES . . . . . . . . . 240',
  '',
  'I', '', 'The Old Sea-dog', '', para(1, 200), '',
  'II', '', 'Black Dog', '', para(2, 200), '',
  'III', '', 'The Spot', '', para(3, 200),
].join('\n')
eq('a wrapped contents entry does not win the tier', T.splitIntoChapters(WRAPPED_CONTENTS).length, 3)

// --- parts versus chapters ----------------------------------------------

// Treasure Island is in six parts and thirty-four chapters. Split at the
// parts it gives sections of fifteen thousand words, which is not an extract.
const PARTS_AND_CHAPTERS = [
  'PART ONE--The Old Buccaneer', '',
  'I', '', 'First', '', para(1, 200), '',
  'II', '', 'Second', '', para(2, 200), '',
  'PART TWO--The Sea-cook', '',
  'III', '', 'Third', '', para(3, 200), '',
  'IV', '', 'Fourth', '', para(4, 200),
].join('\n')
const pc = T.splitIntoChapters(PARTS_AND_CHAPTERS)
ok('chapters beat parts where a book has both', pc.length === 4, `${pc.length} sections: ${pc.map((c) => c.heading).join(' | ')}`)

// --- a book with no headings at all -------------------------------------

const NO_HEADINGS = [para(1, 300), '', para(2, 300), '', para(3, 300)].join('\n')
const flat = T.splitIntoChapters(NO_HEADINGS)
eq('a book with no headings is one section', flat.length, 1)
eq('that section is unnamed', flat[0].heading, '')

// --- paragraphs and runs ------------------------------------------------

eq('paragraphs are blank-line separated', T.paragraphsOf('one\nline\n\ntwo').length, 2)
eq('a wrapped paragraph becomes one line', T.paragraphsOf('one\nline\n\ntwo')[0], 'one line')

const paras = [para(1, 100), para(2, 100), para(3, 100), para(4, 100)]
const run = T.runFrom(paras, 0, 250, 200)
ok('a run reaches its target in whole paragraphs', run && run.words >= 250, JSON.stringify(run && run.words))
ok('a run stops at a paragraph boundary', run && run.paragraphs.length === 3, JSON.stringify(run && run.paragraphs.length))
eq('a run that cannot reach the floor is refused', T.runFrom(paras, 3, 250, 200), null)

eq('html escapes what it wraps', T.asHtml(['a < b & c']), '<p>a &lt; b &amp; c</p>')
eq('each paragraph gets its own tag', T.asHtml(['one', 'two']), '<p>one</p><p>two</p>')

// --- picking an extract -------------------------------------------------

// A narrative in real paragraphs, long enough for an upper-school extract.
//
// Two things were learned writing this fixture. A run is made of whole
// paragraphs, so an unbroken 700-word block cannot be trimmed to fit a band -
// the first version was refused for being 98 words too long. And prose that
// reads as plain storytelling measures at grade 10 once its sentences run to
// twenty-five words, so this is a Y9 extract and not the Y6 one it was
// written to be. The gate was right and the fixture was wrong.
const STORY_PARA = [
  'The old lighthouse stood on the rocks at the end of the bay, and every night its lamp turned slowly and threw a long white beam across the water.',
  'Sailors far out at sea could see the light and knew exactly where the rocks were waiting, and without it a great many ships would have been wrecked.',
  'Tom lived in the small stone cottage beside the tower, where his father kept the lamp burning from dusk until the first grey light of morning.',
  'Each evening Tom carried the heavy oil can up the winding stairs, counting the ninety-two steps as he climbed, because he had always counted them.',
  'At the top of the tower the air was bitterly cold and the glass was covered in moisture, so the first task was always to wipe it clean and clear.',
  'One winter night a storm arrived from the west with such force that it shook the walls of the cottage and tore the shutters from their hinges.',
  'Tom waited beside the fire for many hours, listening to the sea breaking over the rocks, while his father stayed at the lamp and did not come down.',
  'By morning the storm had passed out to sea, the light was still burning steadily, and every vessel in the bay had come through the night unharmed.',
]
const storyChapter = (n) => [
  `CHAPTER ${n}. The Light at Night`, '',
  ...[...STORY_PARA, ...STORY_PARA, ...STORY_PARA].map((t) => `${t}\n`),
].join('\n')
const SIMPLE = [storyChapter(1), storyChapter(2), storyChapter(3)].join('\n')

const got = T.pickExtract(SIMPLE, 'y9')
ok('an extract is found and measured', got.extract && got.extract.words >= 600,
  got.extract ? `${got.extract.words} words, grade ${got.extract.fk}` : got.reason)
ok('the extract is html paragraphs', got.extract && got.extract.html.startsWith('<p>'))
ok('the extract names the chapter it came from', got.extract && /The Light at Night/.test(got.extract.chapter),
  got.extract && got.extract.chapter)
ok('the measured grade is reported with it', got.extract && typeof got.extract.fk === 'number',
  got.extract && String(got.extract.fk))

// The same text is refused for the lower band, on grade rather than length.
const tooHard = T.pickExtract(SIMPLE, 'y6')
ok('the same text is refused for the lower band', tooHard.extract === null, tooHard.reason)

// Nothing in a short book can fit a band, and the refusal says what it saw
// rather than only that it failed.
const refusal = T.pickExtract('CHAPTER 1. Tiny\n\nToo short.', 'y6')
ok('a book with nothing usable is refused', refusal.extract === null)
ok('the refusal explains itself', /nothing fit y6/.test(refusal.reason), refusal.reason)
ok('an unknown band is refused', /unknown band/.test(T.pickExtract(SIMPLE, 'y12').reason))

// A chapter already used does not come up again.
// Every chapter of this fixture is the same chapter, so marking all three
// used leaves the book with nothing to offer.
const allUsed = new Set([1, 2, 3].map((n) => `CHAPTER ${n}. The Light at Night`))
const used = T.pickExtract(SIMPLE, 'y9', { usedChapters: allUsed })
ok('a chapter already used is skipped', used.extract === null, used.extract && used.extract.chapter)
// One used chapter still leaves the others.
const oneUsed = T.pickExtract(SIMPLE, 'y9', { usedChapters: new Set(['CHAPTER 1. The Light at Night']) })
ok('only the used chapter is skipped', oneUsed.extract && /CHAPTER 2/.test(oneUsed.extract.chapter),
  oneUsed.extract ? oneUsed.extract.chapter : oneUsed.reason)

console.log(`\n${pass} pass, ${fails.length} fail`)
if (fails.length) {
  console.log(fails.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
