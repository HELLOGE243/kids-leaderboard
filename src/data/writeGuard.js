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
 *
 * WHY THAT WAS STILL NOT ENOUGH - 27 Nov
 *
 * Hannah lost 25 homework attempts, forty vocabulary words, forty dojo cards
 * and her whole profile while every rule above was deployed and running. Three
 * other students were damaged the same way. The guard did not fail to run: it
 * ran, inspected the write, and allowed it. Two reasons, and both are fixed
 * here.
 *
 * First, the work rule refused an array going from some number to EXACTLY none.
 * The record the app invents when a student's own has not loaded yet is built
 * around the very item being written, so it always carries at least one - 25
 * attempts became 2, never 0, and the rule never fired. It was structurally
 * incapable of catching the thing it was written for. The fix is not a longer
 * list of protected arrays, it is a different question: does this write drop a
 * top-level key the stored record has? A record is only ever added to, so the
 * answer is never legitimately yes - see lostKeys.
 *
 * Second, the merge did not go through the guard at all. A record marked
 * `_partial` is merged over the stored one rather than replacing it, which
 * sounds safe and was not: the merge copied each incoming key straight over the
 * stored one, so a stand-in holding a one-item array replaced a twenty-five-item
 * array and lost nothing any rule was watching for. A partial record is by
 * definition only the part being written, so its arrays are now unioned into
 * the stored ones instead of replacing them - see mergePartialOverStored, which
 * is that merge, moved in here so it is covered by the same tests as the
 * refusals.
 */

/** The arrays that hold work a student cannot get back by doing it again. */
export const WORK_KEYS = ['homeworkAttempts', 'homeworkRedos', 'quizAttempts', 'scores']

/**
 * Whether a key is the app's own bookkeeping rather than part of the record.
 *
 * Every one of them is written by the storage layer and holds nothing a student
 * did: `_savedAt` is the snapshot's clock, `_partial` is the flag this module
 * exists to police, `_overflow` is the manifest that appears and disappears as
 * a record crosses a megabyte, `_migrated` is a one-way marker. Losing any of
 * them loses no work, and `_overflow` in particular is SUPPOSED to vanish when
 * a record shrinks - so the key-loss rule must not call that a wipe.
 */
const isBookkeeping = (key) => key.startsWith('_')

/** Whether a stored value holds nothing, so dropping its key loses nothing. */
function isEmpty(value) {
  if (value === null || value === undefined) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

/**
 * The top-level keys this write would delete from the stored record.
 *
 * This is the rule that would have caught all four of the records damaged in
 * November, and it rests on one fact about this app: nothing in it ever removes
 * a top-level key from a student's record. Cards are added, attempts are
 * appended, a profile is updated in place. Grep for it - the only `delete`
 * calls on student data are inside nested objects (a revision card dropping its
 * copy of a question) or on the shared roster, never on a record's own keys.
 *
 * So a write that does not mention a key the stored record has is not an edit.
 * It is a record that was assembled without knowing the key existed, which is
 * exactly what the stand-in record is, and exactly what a wipe looks like from
 * here. Hannah's write dropped `profile`, `vocabBank` and `dojoCustomReview`;
 * this names all three before it happens.
 *
 * Keys holding nothing are let past. An empty array deleted is an empty array,
 * and refusing on those would make the rule fire on noise and get it switched
 * off - which is the only way a guard really fails.
 *
 * @param {object|null} stored    the record as it is on the server
 * @param {object|null} incoming  the record about to be written
 * @returns {string[]} the keys that would be lost, in the stored record's order
 */
export function lostKeys(stored, incoming) {
  if (!stored || typeof stored !== 'object') return []
  const has = incoming && typeof incoming === 'object' ? incoming : {}
  return Object.keys(stored).filter((key) => (
    !isBookkeeping(key)
    && !(key in has)
    && !isEmpty(stored[key])
  ))
}

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

  // Dropping a key outright. This is the rule that catches a stand-in record
  // whatever its arrays happen to hold, and it is asked before them because it
  // is the better question: a record that has forgotten a key was not built
  // from the student's own record at all.
  const lost = lostKeys(stored, incoming)
  if (lost.length) {
    const named = lost.slice(0, 4).join(', ') + (lost.length > 4 ? `, and ${lost.length - 4} more` : '')
    return `the incoming record does not mention ${lost.length} key(s) the stored one holds `
      + `(${named}), and a record is written whole, so they would be deleted`
  }

  // Losing items from an array of work. A teacher clearing a paper so it can be
  // sat again does this legitimately, so it is refused only for a record that
  // is also thinner than the stored one - which is a stub standing in for a
  // record, not a record.
  //
  // Any loss counts, not only a loss down to none. Going to exactly none was
  // the old test, and it is why Hannah's 25 attempts became 2 with the guard
  // watching: the stand-in record is built around the item being written, so it
  // is never empty. The key-loss rule above catches most of these first; this
  // is what is left when the only keys dropped were empty ones.
  const thinner = Object.keys(incoming).length < Object.keys(stored).length
  for (const key of WORK_KEYS) {
    const had = Array.isArray(stored[key]) ? stored[key].length : 0
    const has = Array.isArray(incoming[key]) ? incoming[key].length : 0
    if (had > 0 && has < had && thinner) {
      return `${key} would go from ${had} to ${has || 'none'}, from a record missing `
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

/**
 * What an item is, for deciding whether two copies of it are the same item.
 *
 * Every array in a record holds objects the app gives an identity of some kind,
 * and it is not consistent about the name: a dojo card has `cardId`, a quiz
 * attempt has `quizSetId`, a vocabulary entry has `word`. The JSON fallback is
 * for the ones that have none, where identical content is the only identity
 * available - two attempts with every field equal are one attempt.
 */
function identity(item) {
  if (!item || typeof item !== 'object') return JSON.stringify(item)
  for (const field of ['id', 'cardId', 'setId', 'quizSetId', 'attemptId', 'word']) {
    if (item[field] !== undefined && item[field] !== null) return `${field}:${item[field]}`
  }
  return JSON.stringify(item)
}

/**
 * A partial record folded into the stored one.
 *
 * `_partial` means the app built this record before the student's own had
 * arrived: it holds the thing being written and whatever else happened to be in
 * hand, and it is NOT a claim about anything it does not mention. The old merge
 * read it as one anyway - it copied every incoming key straight over the stored
 * one, so a stand-in holding a one-item array replaced a term's worth.
 *
 * So arrays are unioned rather than replaced. The stored items keep their order
 * and their contents, and anything the partial record holds that is not already
 * there is appended. For the case this exists for - a card or an attempt being
 * added to a record that has not loaded - the result is the stored array plus
 * the new item, which is what the save meant in the first place.
 *
 * The cost of unioning, stated plainly: a removal made through a partial record
 * will not stick, and the item will be back on the next save. That is the right
 * way round. A removal through a partial record is a removal from an array the
 * app invented a moment ago and therefore believes is empty, so there was
 * nothing there to remove; and a removal that has to be made twice is a
 * nuisance, while a removal that takes forty vocabulary words with it is a
 * phone call to a parent.
 *
 * Everything that is not an array still takes the incoming value: that is how a
 * profile field or a progress map gets updated, and a stand-in that does not
 * mention them leaves the stored ones alone.
 *
 * @param {object} stored    the record as it is on the server
 * @param {object} incoming  the partial record about to be folded in
 * @returns {object} a new record; neither input is modified
 */
export function mergePartialOverStored(stored, incoming) {
  const out = { ...(stored || {}) }
  for (const [key, value] of Object.entries(incoming || {})) {
    if (key === '_partial') continue
    const had = out[key]
    if (Array.isArray(had) && Array.isArray(value)) {
      const seen = new Set(had.map(identity))
      const added = value.filter((item) => !seen.has(identity(item)))
      out[key] = added.length ? [...had, ...added] : had
      continue
    }
    out[key] = value
  }
  return out
}
