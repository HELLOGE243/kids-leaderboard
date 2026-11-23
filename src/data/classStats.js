/*
 * What the class did on one question.
 *
 * Pure, and deliberately ignorant of how a question is marked: the scoring
 * rules live in store.js and are passed in. That keeps this testable without a
 * database or a quiz set, which matters because both functions here answer a
 * question a student reads about themselves against everyone else.
 *
 * WHY THESE ARE NOT COMPUTED FROM ANSWERS ANY MORE
 *
 * A paper's cohort is served from the `quizStats` aggregate - one small
 * document per student per paper - as soon as anyone else has sat it, which is
 * the normal case rather than the exception. Those rows carry a score and a
 * time and no answer list, because publishing every child's answers to every
 * other child's browser would be both a privacy problem and a large download
 * for a number that fits in one byte per question.
 *
 * So the review screen asked "did the class get this right" of rows that had no
 * way to say, and got two different wrong answers depending on where it asked
 * from: a dash reading "no class data yet" on one screen, and a confident 0% on
 * the other - which told a student nobody in the class had answered a question
 * correctly when most of them had.
 *
 * The fix is to record right-or-wrong per question at the moment a paper is
 * marked, and carry that into the aggregate alongside the per-question times.
 * One number per question, no answers, so nothing is published that was not
 * already a mark.
 */

/**
 * Right or wrong for each question of a paper, as a list to store.
 *
 * 1 is full marks, 0 is not, and **null is "there is nothing to be right about
 * yet"** - which is not a nicety. A writing question is worth zero out of zero
 * until a teacher marks it, so the obvious test, `score >= outOf`, reads 0 >= 0
 * and calls every unmarked piece of writing correct. Counted into a class
 * percentage that would quietly inflate every paper with writing in it.
 *
 * @param {Array} questions  the paper's questions, in order
 * @param {Array} answers    what this student answered, by the same index
 * @param {(q: object, answer: any, i: number) => number} score  marks awarded
 * @param {(q: object, i: number) => number} outOf               marks available
 * @returns {Array<1|0|null>} one entry per question
 */
export function questionCorrectness(questions, answers, score, outOf) {
  return (Array.isArray(questions) ? questions : []).map((q, i) => {
    // The index goes through as well as the question: a writing question's
    // marks are held against its position in the paper, not against the
    // question itself, so without it this cannot tell a marked piece of
    // writing from an unmarked one.
    const total = Number(outOf(q, i)) || 0
    if (total <= 0) return null
    const got = Number(score(q, Array.isArray(answers) ? answers[i] : undefined, i)) || 0
    return got >= total ? 1 : 0
  })
}

/**
 * The share of the class who got one question right, as a percentage.
 *
 * Reads the recorded list first and falls back to marking an answer list, so a
 * paper sat before this was recorded still reports what it can from whatever
 * attempts are held locally rather than going blank.
 *
 * @param {Array} attempts   the cohort's attempts at this paper
 * @param {number} qIndex    the question's position in the paper
 * @param {(answer: any) => boolean} isCorrect  marks one answer to this question
 * @returns {number|null} the percentage, or null when nobody can be counted
 */
export function classCorrectPct(attempts, qIndex, isCorrect) {
  let asked = 0
  let right = 0
  for (const a of Array.isArray(attempts) ? attempts : []) {
    const recorded = Array.isArray(a?.questionCorrect) ? a.questionCorrect[qIndex] : undefined
    if (recorded === 1 || recorded === 0) {
      asked++
      right += recorded
      continue
    }
    // Recorded as "not markable yet" - an unmarked piece of writing. It is not
    // a wrong answer and must not be counted as one.
    if (recorded === null) continue
    // No record, so mark the answers if this attempt carries them. Rows from
    // the aggregate do not, and are passed over rather than counted as wrong:
    // counting them is exactly the bug this replaced.
    if (Array.isArray(a?.answers)) {
      asked++
      if (isCorrect(a.answers[qIndex])) right++
    }
  }
  return asked > 0 ? Math.round((right / asked) * 100) : null
}
