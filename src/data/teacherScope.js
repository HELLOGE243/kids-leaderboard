/**
 * What a teacher is allowed to see, worked out from the groups they hold.
 *
 * A teacher is not an administrator. They take groups - the handful of students
 * in front of them - and the work they can open is their students' work, in
 * their classes. Everything on this screen was previously scoped to the
 * organisation instead, which meant one teacher with two groups could open the
 * writing paper of every class in the school.
 *
 * Two different questions, and they are not the same question:
 *
 *   - which *papers* may be listed: the ones set in the classes her groups sit
 *     in. A paper belongs to a course, and a course belongs to one class.
 *   - whose *submissions* may be read: the students in her groups, and nobody
 *     else in those classes. The class is the whole cohort; another teacher
 *     takes the rest of it.
 *
 * Pure, and takes the groups rather than reading them, so every branch can be
 * tested without a browser or a database.
 */

/**
 * @param {Array<{id: string, classId: string, studentIds: string[]}>} groups
 *   every teaching group there is
 * @param {string[] | null | undefined} groupIds the groups this teacher holds.
 *   `null` or `undefined` means no scoping at all - an administrator - and is
 *   deliberately different from `[]`, a teacher who holds no groups yet and
 *   should therefore see nothing.
 * @returns {{studentIds: Set<string>, classIds: Set<string>} | null}
 */
export function teacherScope(groups, groupIds) {
  if (groupIds === null || groupIds === undefined) return null
  const wanted = new Set(groupIds.map(String))
  const studentIds = new Set()
  const classIds = new Set()
  for (const group of groups || []) {
    if (!group || !wanted.has(String(group.id))) continue
    for (const sid of group.studentIds || []) studentIds.add(String(sid))
    if (group.classId) classIds.add(String(group.classId))
  }
  return { studentIds, classIds }
}

/**
 * May this paper be listed?
 *
 * A paper with no class at all - one not yet put in a course, or in a course
 * with no class - is refused to a scoped teacher rather than shown to
 * everybody. An unplaced paper is an administrator's loose end, and the safe
 * reading of "I do not know whose this is" is not "it is yours".
 */
export function classInScope(scope, classId) {
  if (!scope) return true
  if (!classId) return false
  return scope.classIds.has(String(classId))
}

/** May this student's work be read? */
export function studentInScope(scope, studentId) {
  if (!scope) return true
  if (!studentId) return false
  return scope.studentIds.has(String(studentId))
}
