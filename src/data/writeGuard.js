/*
 * Whether a write to a student's record is safe to make.
 *
 * Pure. No Firestore, no clock, no network - it takes two records and returns
 * either an empty string, meaning go ahead, or a sentence saying why not. The
 * sentence is written to be read in a console by somebody working out what went
 * wrong at eight in the morning, so it carries the numbers.
 *
 * WHY THIS IS ITS OWN MODULE
 *
 * A record is written as a whole document, so every write says "this is
 * everything the student has" and anything the incoming copy does not mention
 * is gone. That makes these few lines the only thing standing between a stale
 * snapshot and a term's work, and until now they lived in the middle of the
 * Firestore client where they could not be tested without a database.
 *
 * They were also wrong, in a way that cost a Year 4 student her whole record on
 * 22 Nov: the guard began `if (!stored) return ''`, and `stored` was null both
 * when the student genuinely had no document yet and when the read that was
 * meant to fetch it had failed. The first is a new student and writing is
 * correct. The second is a record that exists and could not be seen, and
 * writing a one-key stub over it emptied every work array she had. Her papers
 * came back from the submission archive; her dojo cards and profile did not,
 * because the archive holds handed-in papers and nothing else.
 *
 * So the two cases are now separate inputs, and the second has a rule of its
 * own - uncheckedWriteRefusal below.
 */

/** The arrays that hold work a student cannot get back by doing it again. */
export const WORK_KEYS = ['homeworkAttempts', 'homeworkRedos', 'quizAttempts', 'scores']

/**
 * Whether this write would destroy work, and must not be made.
 *
 * A record is written as a whole document, so a write says "this is everything
 * the student has" - and anything the incoming copy does not mention is gone.
 * That is fine when the copy is current and wrong when it is not, and there is
 * one way for it not to be: a snapshot is taken when a save is made and
 * committed when the queue reaches it, which can be hours later if the tab was
 * suspended in between. A laptop closed mid-morning and opened at night writes
 * the morning's record over the evening's.
 *
 * @param {object|null} stored    the record as it is on the server
 * @param {object} incoming       the record about to be written
 * @returns {string} why the write must not be made, or '' to go ahead
 */
export function wouldDestroyWork(stored, incoming) {
  if (!stored) return ''
  const storedAt = Number(stored._savedAt) || 0
  const incomingAt = Number(incoming._savedAt) || 0
  // A second of slack: two saves in the same moment are not a rollback.
  if (storedAt && incomingAt && storedAt > incomingAt + 1000) {
    return `snapshot is ${Math.round((storedAt - incomingAt) / 1000)}s behind the stored record`
  }
  // Emptying an array of work outright. A teacher clearing a paper so it can
  // be sat again does this legitimately when it was the only one, so it is
  // refused only for a record that is also thinner than the stored one -
  // which is a stub standing in for a record, not a record.
  const thinner = Object.keys(incoming).length < Object.keys(stored).length
  for (const key of WORK_KEYS) {
    const had = Array.isArray(stored[key]) ? stored[key].length : 0
    const has = Array.isArray(incoming[key]) ? incoming[key].length : 0
    if (had > 0 && has === 0 && thinner) {
      return `${key} would go from ${had} to none, from a record missing `
        + `${Object.keys(stored).length - Object.keys(incoming).length} of its keys`
    }
  }
  return ''
}

/**
 * Whether to write at all when the record on the server could not be read.
 *
 * This is the case that wiped Evelyn Chen's record. A read that fails leaves
 * nothing to compare against, and the old code took that as permission: a write
 * that cannot be checked was held to be better than a student's work sitting
 * only in a tab, with the submission archive as the backstop. Half of that was
 * true - the archive did give her papers back - but it is not a backstop for
 * anything that is not a handed-in paper, and the write it allowed through was
 * not a save of her work. It was a stub holding a single key.
 *
 * The rule, in two parts:
 *
 *   - A record the app itself marked `_partial` - built before the student's
 *     record had arrived, holding only what is being written - must never be
 *     written as the whole document. It is merged over the stored record when
 *     that can be read, and when it cannot there is nothing to merge over, so
 *     there is nothing safe to do but wait. This alone would have stopped the
 *     wipe.
 *
 *   - Otherwise the last record this tab successfully wrote stands in for the
 *     server's copy. It is not authoritative - another device may have written
 *     since - but it is a true lower bound on what the student had, so a write
 *     that empties work against it is a rollback whatever the server holds.
 *
 * Refusing means the write throws, which puts it back through the queue's
 * retry. The work stays in the tab and in memory, and is written as soon as a
 * read succeeds - so nothing is lost by waiting, which is the thing the old
 * comment was worried about.
 *
 * @param {object} incoming    the record about to be written
 * @param {object|null} lastWritten  the last record this tab wrote, if any
 * @returns {string} why the write must not be made, or '' to go ahead
 */
export function uncheckedWriteRefusal(incoming, lastWritten) {
  const record = incoming && typeof incoming === 'object' ? incoming : {}
  if (record._partial) {
    return 'the stored record could not be read, and a partial record must not '
      + 'be written as the whole document'
  }
  const refusal = wouldDestroyWork(lastWritten, record)
  if (refusal) return `the stored record could not be read, and against what this tab last wrote, ${refusal}`
  return ''
}
