/*
 * Which archived papers are missing from a student's own record.
 *
 * Pure. No Firestore, no clock, no network - it takes the student document and
 * their archived submissions and returns a description of what to add.
 *
 * WHY THIS IS NOT WRITTEN INLINE IN THE HANDLER
 *
 * A hand-in is written twice: to the student's own document, which is rewritten
 * whole on every save, and to `submissions`, which is immutable once created.
 * The archive exists for the day the first copy is lost - and on 22 Nov a Year 4
 * student's document was overwritten with every work array empty while 30 of her
 * papers sat safely in the archive.
 *
 * Putting them back is a write to a live child's record, and the dangerous
 * mistake is not a crash - it is a restore that silently duplicates a paper, or
 * drops one, or files a checkpoint quiz as homework. Those are decisions about
 * data, so they are made here where every branch can be tested without touching
 * the database.
 *
 * Answers are copied across verbatim. Both collections store them in the same
 * wrapped form (see packNested in src/data/firebase.js: Firestore cannot hold an
 * array inside an array, so inner arrays are wrapped in a single-key object), so
 * nothing needs unwrapping and nothing can be mangled on the way. This module
 * must never reshape an answer - if it ever needs to, that is a sign the two
 * collections have drifted apart and the restore is no longer a copy.
 */

/*
 * Where each kind of archived paper belongs in the student document.
 *
 * This is the exact inverse of the map backfillArchive uses when it walks the
 * student document to rebuild the archive, and it has to stay that way: a kind
 * that round-trips to a different field would mean a restored paper landing
 * somewhere the app does not look for it.
 *
 * `checkpoint` is the odd one. A checkpoint attempt is keyed by `quizId` in the
 * student's record, but the archive stores it as `quizSetId`, because the
 * archive has one shape for every kind of paper. So the field is renamed on the
 * way back - that rename is the whole reason this is a table and not a string.
 */
const HOMES = {
  homework: { field: 'homeworkAttempts', key: 'quizSetId' },
  redo: { field: 'homeworkRedos', key: 'quizSetId' },
  checkpoint: { field: 'quizAttempts', key: 'quizId' },
}

/** @param {object} doc a studentData document @param {string} field */
const arrayOf = (doc, field) => (Array.isArray(doc && doc[field]) ? doc[field] : [])

/**
 * @param {object} studentDoc   the student's current studentData document
 * @param {Array<object>} submissions  their archived submissions
 * @returns {{adds: object, restored: Array, skipped: Array, unknown: Array}}
 *   adds: field name -> the records to append, in date order
 */
function restorePlan(studentDoc, submissions) {
  const doc = studentDoc && typeof studentDoc === 'object' ? studentDoc : {}
  const rows = Array.isArray(submissions) ? submissions : []

  // Everything the record already holds, so a paper is never added twice.
  // Both tests matter: `id` catches the same paper filed again, and the quiz
  // key catches the same paper sat twice and archived under two ids - which
  // happened, three times over, to one Reading paper. Restoring both copies
  // would show a student two attempts at a paper the app allows once.
  const seen = {}
  for (const { field, key } of Object.values(HOMES)) {
    const ids = new Set()
    const quizzes = new Set()
    for (const a of arrayOf(doc, field)) {
      if (a && a.id) ids.add(String(a.id))
      if (a && a[key]) quizzes.add(String(a[key]))
    }
    seen[field] = { ids, quizzes }
  }

  const adds = {}
  const restored = []
  const skipped = []
  const unknown = []

  // Oldest first, so the restored arrays read in the order the papers were sat
  // rather than the order the archive happened to return them.
  const ordered = rows.slice().sort((a, b) => String(a && a.date || '').localeCompare(String(b && b.date || '')))

  /* Which copy wins when the archive holds a paper twice.
   *
   * The app allows one attempt at a paper, so only one copy may go back - but
   * the archive can hold several, because a paper handed in from a reloading
   * tab was filed more than once. Three copies of one Reading paper exist for
   * this reason.
   *
   * The one that goes back is the best mark, which is what recoverArchived
   * already does on the student's own device: "the best of them is the one that
   * counts, which is also what a teacher would choose". Restoring the first by
   * date instead would quietly mark a child down for a duplicate that was never
   * their second go at anything.
   */
  const best = new Map()
  for (const r of ordered) {
    if (!r || !r.id) continue
    const home = HOMES[r.kind]
    if (!home) continue
    const quiz = String(r.quizSetId || '')
    if (!quiz) continue
    const at = `${home.field}|${quiz}`
    const held = best.get(at)
    // Strictly greater, so the earliest of equally good copies wins and the
    // choice does not depend on the order the archive was read in.
    if (!held || (Number(r.score) || 0) > (Number(held.score) || 0)) best.set(at, r)
  }

  for (const r of ordered) {
    if (!r || !r.id) continue
    const home = HOMES[r.kind]
    if (!home) { unknown.push({ id: r.id, kind: r.kind || null }); continue }
    const { field, key } = home
    const quiz = String(r.quizSetId || '')
    const mine = seen[field]

    // A skip says which paper and what mark, not just that something was
    // skipped: the only way to check a refusal is right is to see the paper it
    // refused and the mark that went with it.
    const about = { id: String(r.id), field, quizSetId: quiz, score: Number(r.score) || 0, total: Number(r.total) || 0, date: r.date || '' }
    if (mine.ids.has(String(r.id))) { skipped.push({ ...about, why: 'already in the record' }); continue }
    if (quiz && mine.quizzes.has(quiz)) { skipped.push({ ...about, why: 'another attempt at that paper is already there' }); continue }
    const winner = quiz ? best.get(`${field}|${quiz}`) : null
    if (winner && String(winner.id) !== String(r.id)) {
      skipped.push({ ...about, why: `the archive holds a better copy of that paper (${Number(winner.score) || 0}/${Number(winner.total) || 0})` })
      continue
    }

    const attempt = {
      id: String(r.id),
      [key]: quiz,
      studentId: String(r.studentId || ''),
      answers: r.answers || [],
      questionTimes: r.questionTimes || [],
      score: Number(r.score) || 0,
      total: Number(r.total) || 0,
      date: r.date || '',
      term: r.term || null,
      orgId: r.orgId || null,
      screenLeaves: Number(r.screenLeaves) || 0,
      lockedOut: !!r.lockedOut,
      // Said on the record, so a teacher reading it later knows this copy came
      // back from the archive rather than from the student sitting the paper.
      restoredFromArchive: true,
    }

    ;(adds[field] = adds[field] || []).push(attempt)
    mine.ids.add(String(r.id))
    if (quiz) mine.quizzes.add(quiz)
    restored.push({ id: r.id, field, quizSetId: quiz, score: attempt.score, total: attempt.total, date: attempt.date })
  }

  return { adds, restored, skipped, unknown }
}

module.exports = { restorePlan, HOMES }
