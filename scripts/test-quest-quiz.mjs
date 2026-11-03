/**
 * A generated paper becoming an ordinary quiz set, tested on its own.
 *
 *   node scripts/test-quest-quiz.mjs
 *
 * This mapping is the whole reason the quest needs no player, no result
 * screen and no editor of its own, and it is the one place where the
 * generator's words for things (`question`, `correct`) become the words every
 * other screen on the site uses (`prompt`, `correctIndex`). Getting it wrong
 * does not throw: it silently marks the wrong answer right, or shows a child
 * a question with no passage. So it is tested field by field.
 *
 * Pure in, pure out - no model, no database, no clock.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const QQ = require('../functions/questQuiz.js')

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

/** A paper shaped the way the generator leaves one. */
function paper(over = {}) {
  return {
    id: 'rq-abc12345',
    genre: 'fiction',
    band: 'y6',
    title: 'Chapter I',
    workTitle: 'Oliver Twist',
    chapter: 'CHAPTER I',
    source: 'Project Gutenberg',
    sourceUrl: 'https://www.gutenberg.org/ebooks/730',
    attribution: 'From Oliver Twist by Charles Dickens. Public domain.',
    licence: 'public-domain',
    text: '<p>Among other public buildings in a certain town.</p>',
    wordCount: 420,
    minutes: 3,
    readability: { fk: 7.8, words: 420, sentences: 21 },
    questions: [
      {
        type: 'gist', question: 'What is the passage mainly about?',
        options: ['A town', 'A ship', 'A farm', 'A school'], correct: 0,
        explanation: 'The opening names the town.',
      },
      {
        type: 'vocabulary', question: 'What does "certain" mean here?',
        options: ['Sure', 'Particular', 'Loud', 'Kind'], correct: 1,
        explanation: 'It means a particular one, unnamed.',
      },
    ],
    ...over,
  }
}

// --- the id ---------------------------------------------------------------

eq('the set id is the paper id with a prefix', QQ.quizSetIdFor('rq-abc12345'), 'quest-rq-abc12345')
ok('a quest set is recognised by its id', QQ.isQuestQuizSetId('quest-rq-abc12345'))
ok('an imported set is not', !QQ.isQuestQuizSetId('imp-9f2a1b'))
ok('nothing is not', !QQ.isQuestQuizSetId(undefined))
// Deterministic, because a paper reused in March must land on the set that
// already holds its attempts and its teacher's corrections.
eq('the same paper always maps to the same set',
  QQ.quizSetIdFor('rq-1'), QQ.quizSetIdFor('rq-1'))

// --- the passage ----------------------------------------------------------

{
  const html = QQ.passageHtml(paper())
  ok('the passage keeps its own markup', html.includes('<p>Among other public buildings'))
  ok('the source is named inside the passage', html.includes('Charles Dickens'))
  ok('the credit is marked up as a credit', html.includes('class="qp-attrib"'))
  // A paper with nothing to credit must not grow an empty line of italics.
  eq('no credit means no credit line',
    QQ.passageHtml({ text: '<p>Hi</p>', attribution: '' }), '<p>Hi</p>')
  eq('whitespace is not a credit',
    QQ.passageHtml({ text: '<p>Hi</p>', attribution: '   ' }), '<p>Hi</p>')
}

// --- the set --------------------------------------------------------------

{
  const set = QQ.quizSetFromPaper(paper(), '2026-11-03')

  eq('the set is named after the paper', set.id, 'quest-rq-abc12345')
  eq('the student sees the piece title', set.friendlyTitle, 'Chapter I')
  // Two bands of one genre are otherwise indistinguishable in a teacher's list.
  eq('the teacher sees the slot too', set.rawTitle, 'Fiction · Year 6 · Chapter I')
  ok('it is marked as a quest paper', set.questPaper === true)
  eq('it remembers the paper it came from', set.questPaperId, 'rq-abc12345')
  eq('it knows the day', set.questDay, '2026-11-03')
  eq('it keeps the slot', [set.genre, set.band], ['fiction', 'y6'])
  // Reading is not a race, and a chapter outlasts a tab.
  ok('it is untimed and resumable', set.homeworkMode === true)
  ok('it belongs to no folder', set.folderId === null)
  eq('the licence travels', set.licence, 'public-domain')
  eq('the measured grade travels', set.readability.fk, 7.8)

  eq('one question per generated question', set.questions.length, 2)
  eq('questions are numbered from one', set.questions.map((q) => q.number), [1, 2])
  eq('ids are stable within the paper',
    set.questions.map((q) => q.id), ['rq-abc12345-q1', 'rq-abc12345-q2'])
  ok('every question is multiple choice',
    set.questions.every((q) => q.type === 'multiple-choice'))

  // The rename that matters: the player draws `prompt` and marks against
  // `correctIndex`, and knows nothing of `question` or `correct`.
  eq('the question becomes the prompt', set.questions[0].prompt, 'What is the passage mainly about?')
  eq('the answer becomes an index', set.questions.map((q) => q.correctIndex), [0, 1])
  eq('the options come across', set.questions[1].options, ['Sure', 'Particular', 'Loud', 'Kind'])
  eq('the explanation comes across', set.questions[1].explanation, 'It means a particular one, unnamed.')
  // What the question tests is better said by the generator than guessed at.
  eq('what it tests becomes a tag', set.questions.map((q) => q.tags),
    [['comprehension:gist'], ['comprehension:vocabulary']])

  // This is what makes the existing comprehension layout work unchanged.
  ok('every question carries the passage',
    set.questions.every((q) => q.text.includes('Among other public buildings')))
  ok('every question carries the credit',
    set.questions.every((q) => q.text.includes('Charles Dickens')))

  // Shared references would mean a teacher editing question 1's options also
  // edited the generator's banked copy.
  const src = paper()
  const built = QQ.quizSetFromPaper(src, '2026-11-03')
  built.questions[0].options[0] = 'changed'
  eq('the options are copied, not shared', src.questions[0].options[0], 'A town')
}

// --- the awkward papers ---------------------------------------------------

{
  // A paper that failed its gates should never reach here, but a set with no
  // questions must still be a well-formed document rather than a crash.
  const empty = QQ.quizSetFromPaper(paper({ questions: [] }), '2026-11-03')
  eq('no questions is an empty list, not a throw', empty.questions, [])

  const missing = QQ.quizSetFromPaper(paper({ questions: undefined }), '2026-11-03')
  eq('absent questions are an empty list too', missing.questions, [])

  // An answer index must survive being zero, which is the one falsy index.
  const zero = QQ.quizSetFromPaper(paper({
    questions: [{ question: 'q', options: ['a', 'b'], correct: 0, explanation: 'e' }],
  }), '2026-11-03')
  eq('a first-position answer stays at nought', zero.questions[0].correctIndex, 0)

  const news = QQ.quizSetFromPaper(paper({
    genre: 'news', band: 'y9', title: 'Floods in Queensland', licence: 'original',
  }), '2026-11-04')
  eq('a news paper is labelled for a teacher', news.rawTitle, 'News · Year 9 · Floods in Queensland')
  eq('a news paper keeps its licence', news.licence, 'original')

  const odd = QQ.quizSetFromPaper(paper({ genre: 'poem', band: 'y12' }), '2026-11-03')
  eq('an unknown slot is printed rather than dropped', odd.rawTitle, 'poem · y12 · Chapter I')
}

// --- the day's index entry ------------------------------------------------

{
  const entry = QQ.dayEntryFromPaper(paper(), '2026-11-03')

  eq('the entry names its set', entry.quizSetId, 'quest-rq-abc12345')
  eq('the entry counts the questions', entry.questionCount, 2)
  eq('the entry carries the card', [entry.genre, entry.band, entry.title],
    ['fiction', 'y6', 'Chapter I'])
  eq('the entry keeps the reading time', [entry.wordCount, entry.minutes], [420, 3])
  eq('the entry keeps the measured grade', entry.readability.fk, 7.8)
  eq('the entry records the day', entry.setOn, '2026-11-03')

  // The whole reason the entry is thin: a second copy of the questions is the
  // copy that goes stale the first time somebody fixes a wrong answer.
  ok('the entry carries no questions', entry.questions === undefined)
  ok('the entry carries no passage', entry.text === undefined)

  // A report we wrote ourselves must be checkable, so its sources travel.
  const sourced = QQ.dayEntryFromPaper(paper({ sources: ['https://a', 'https://b'] }), '2026-11-03')
  eq('cited sources travel', sourced.sources, ['https://a', 'https://b'])
  eq('no sources is null, not undefined', QQ.dayEntryFromPaper(paper(), '2026-11-03').sources, null)
}

console.log(`\n${pass} pass, ${fails.length} fail`)
if (fails.length) {
  console.log(fails.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
