/**
 * Turning a generated reading paper into an ordinary quiz set.
 *
 * The quest used to own its own screen: its own reader, its own question
 * panel, its own result page. That meant a second implementation of
 * everything the homework player already does - the timer, resume after a
 * closed tab, the answer grid, flagging, the review, the archive, asking a
 * teacher, the coin award - and none of it as good, because the homework
 * player has had two terms of use and the quest screen had none.
 *
 * So a paper is written out as a quiz set instead. Imported comprehension
 * papers already carry the passage in `text` and the question in `prompt`,
 * and every screen that draws a question - the player, the review, the
 * parent's report - already splits them. A quest paper written in that shape
 * needs no new UI at all, and gains a teacher's editor for free.
 *
 * Nothing here touches the network or the clock, so the whole mapping is
 * testable without a model or a database.
 */

const PREFIX = 'quest-'

const GENRE_LABEL = { news: 'News', essay: 'Essay', fiction: 'Fiction' }
const BAND_LABEL = { y6: 'Year 6', y9: 'Year 9' }

/**
 * The quiz set id for a paper, which is the paper's own id with a prefix.
 *
 * Deterministic on purpose. A paper reused from the bank on a later day must
 * land on the same quiz set, or every reuse would strand the attempts sat
 * against the old one and duplicate the teacher's edits.
 */
function quizSetIdFor(paperId) {
  return `${PREFIX}${String(paperId)}`
}

/** True for a quiz set this module wrote, by its id alone. */
function isQuestQuizSetId(id) {
  return String(id || '').startsWith(PREFIX)
}

/**
 * The passage as the player will show it, with the source underneath.
 *
 * Attribution travels inside the passage rather than beside it because the
 * player draws `text` and nothing else. A public-domain chapter still names
 * its author, and a report we wrote ourselves must say so.
 */
function passageHtml(paper) {
  const body = String(paper.text || '')
  const credit = String(paper.attribution || '').trim()
  if (!credit) return body
  return `${body}\n<p class="qp-attrib"><em>${credit}</em></p>`
}

/**
 * One generated paper as a quiz set.
 *
 * The passage is repeated into every question's `text`, which is how an
 * imported comprehension paper is stored and the reason no screen needs
 * changing. Six copies of 900 words is about 30 KB - a long way under
 * Firestore's document ceiling, and the cost of the questions reading the
 * same way as every other paper on the site.
 *
 * @param {object} paper a paper from the generator or the bank
 * @param {string} dayKey the Sydney date this paper is set for
 * @returns {object} an imported-quiz-set document
 */
function quizSetFromPaper(paper, dayKey) {
  const genre = String(paper.genre || '')
  const band = String(paper.band || '')
  const slot = `${GENRE_LABEL[genre] || genre} · ${BAND_LABEL[band] || band}`
  const passage = passageHtml(paper)

  return {
    id: quizSetIdFor(paper.id),
    batchId: `quest-${dayKey}`,
    // The student sees the piece's own title; a teacher scanning a list of
    // quiz sets needs to know which slot it filled, and the two bands of one
    // genre are otherwise indistinguishable.
    rawTitle: `${slot} · ${paper.title}`,
    friendlyTitle: String(paper.title || 'Reading'),
    term: '',
    year: '',
    week: '',
    folderId: null,

    // What marks this as a quest paper rather than a teacher's own import.
    // The listings that show a teacher their library filter on it, so six new
    // sets a day do not bury the papers they built themselves.
    questPaper: true,
    questPaperId: String(paper.id),
    questDay: String(dayKey),
    genre,
    band,

    // Reading is not a race, and a 900-word chapter is longer than a tab
    // stays open. Homework mode is untimed and resumable, which is what a
    // reading task wants.
    homeworkMode: true,

    licence: paper.licence || null,
    sourceUrl: paper.sourceUrl || null,
    readability: paper.readability || null,
    wordCount: paper.wordCount || null,
    minutes: paper.minutes || null,

    questions: (paper.questions || []).map((q, i) => ({
      // Stable within the paper, so a teacher's edit, an attempt and a
      // revision card all go on pointing at the same question.
      id: `${paper.id}-q${i + 1}`,
      number: i + 1,
      type: 'multiple-choice',
      text: passage,
      prompt: String(q.question || ''),
      options: [...(q.options || [])],
      correctIndex: Number(q.correct) || 0,
      explanation: String(q.explanation || ''),
      // The generator already says what each question tests, and that is a
      // better tag than anything guessed from the wording.
      tags: q.type ? [`comprehension:${q.type}`] : [],
    })),
  }
}

/**
 * The day's index entry for a paper: everything a card needs and nothing more.
 *
 * The questions and the passage deliberately do not travel here. They live in
 * the quiz set, which is the one a teacher edits and the one a student sits -
 * and a second copy in the day's document would be the copy that goes stale
 * the first time somebody fixes a wrong answer.
 */
function dayEntryFromPaper(paper, dayKey) {
  return {
    id: paper.id,
    quizSetId: quizSetIdFor(paper.id),
    genre: paper.genre,
    band: paper.band,
    title: paper.title,
    source: paper.source,
    sourceUrl: paper.sourceUrl,
    attribution: paper.attribution,
    licence: paper.licence,
    wordCount: paper.wordCount,
    minutes: paper.minutes,
    readability: paper.readability,
    questionCount: (paper.questions || []).length,
    sources: paper.sources || null,
    setOn: String(dayKey),
  }
}

module.exports = {
  PREFIX,
  quizSetIdFor,
  isQuestQuizSetId,
  passageHtml,
  quizSetFromPaper,
  dayEntryFromPaper,
}
