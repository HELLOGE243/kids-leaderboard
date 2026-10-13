import { useMemo, useState } from 'react'
import {
  getClassGroups, getClassById, getStudentById, fullName,
  createClassGroup, updateClassGroup, deleteClassGroup,
} from '../data/store.js'
import GroupCodes from './GroupCodes.jsx'

/**
 * The class, as the groups it is actually taught in.
 *
 * A class of thirty is a roll; a group of six is a lesson. The groups come
 * first on the page because they are how the teaching is organised, and each
 * one carries its own students with their results beside them - so "how is my
 * Tuesday group going" is one glance rather than a sort of the whole roll.
 *
 * Making and changing groups is an admin's: a group decides which teacher may
 * open which children's work, so editing one edits somebody's reach.
 *
 * @param {object} props
 * @param {string} props.classId
 * @param {Array} props.students rows from getClassDashboardData
 * @param {boolean} [props.canEdit] admins only
 * @param {string|null} [props.fixedGroupId] a teacher opened one group
 * @param {(studentId: string) => void} props.onOpenStudent
 */
function ClassGroupsPanel({ classId, students, canEdit = false, fixedGroupId = null, onOpenStudent }) {
  const [, bump] = useState(0)
  const refresh = () => bump((n) => n + 1)
  const [editing, setEditing] = useState(null)   // { id?, name, studentIds }
  const [showCodes, setShowCodes] = useState(false)

  const cls = getClassById(classId)
  const groups = useMemo(() => {
    const all = getClassGroups(classId)
    return fixedGroupId ? all.filter((g) => g.id === fixedGroupId) : all
  }, [classId, fixedGroupId, editing])

  const byId = useMemo(() => Object.fromEntries(students.map((s) => [String(s.id), s])), [students])
  const grouped = new Set(groups.flatMap((g) => (g.studentIds || []).map(String)))
  const ungrouped = fixedGroupId ? [] : students.filter((s) => !grouped.has(String(s.id)))

  function saveGroup() {
    if (!editing.name.trim() || !editing.studentIds.length) return
    if (editing.id) updateClassGroup(editing.id, { name: editing.name, studentIds: editing.studentIds })
    else createClassGroup(classId, editing.name, editing.studentIds)
    setEditing(null)
    refresh()
  }

  const scoreClass = (pct) => (pct >= 70 ? 'cd-score-high' : pct >= 50 ? 'cd-score-mid' : pct > 0 ? 'cd-score-low' : '')

  const studentRow = (row) => (
    <button key={row.id} className="cg-student" onClick={() => onOpenStudent?.(row.id)}>
      <span className="cg-student-name">{row.name}</span>
      <span className="cg-student-done">
        <span className="cd-progress-bar">
          <span className="cd-progress-fill" style={{ width: `${row.total > 0 ? (row.completed / row.total) * 100 : 0}%` }} />
        </span>
        <span className="cd-progress-text">{row.completed}/{row.total}</span>
      </span>
      <span className={`cg-student-score ${scoreClass(row.avgPct)}`}>{row.avgPct > 0 ? `${row.avgPct}%` : '—'}</span>
    </button>
  )

  const groupCard = (group) => {
    const rows = (group.studentIds || []).map((id) => byId[String(id)]).filter(Boolean)
    const marked = rows.filter((r) => r.avgPct > 0)
    const avg = marked.length ? Math.round(marked.reduce((n, r) => n + r.avgPct, 0) / marked.length) : null
    return (
      <section key={group.id} className="cg-card">
        <header className="cg-card-head">
          <div className="cg-card-title">
            <h4 className="cg-name">{group.name}</h4>
            <span className="cg-meta">
              {rows.length} student{rows.length === 1 ? '' : 's'}
              {avg != null ? ` · ${avg}% average` : ''}
            </span>
          </div>
          {canEdit && (
            <div className="cg-card-actions">
              <button className="cs-btn" onClick={() => setEditing({ id: group.id, name: group.name, studentIds: [...(group.studentIds || [])] })}>Edit</button>
              <button className="cs-btn cs-btn-danger" onClick={() => {
                if (window.confirm(`Delete "${group.name}"? Student results are not affected, and any teacher holding it loses these students.`)) {
                  deleteClassGroup(group.id); refresh()
                }
              }}>Delete</button>
            </div>
          )}
        </header>
        <div className="cg-students">
          {rows.length === 0 ? <p className="cs-hint">Nobody in this group yet.</p> : rows.map(studentRow)}
        </div>
      </section>
    )
  }

  return (
    <div className="cg-panel">
      <div className="cg-head">
        <h3 className="cd-section-title">{fixedGroupId ? 'Your group' : 'Groups'}</h3>
        {canEdit && (
          <div className="cg-head-actions">
            <button className="cs-btn" onClick={() => setShowCodes((v) => !v)}>
              {showCodes ? 'Hide codes' : 'Group codes'}
            </button>
            <button className="cs-btn" onClick={() => setEditing({ name: '', studentIds: [] })}>+ New group</button>
          </div>
        )}
      </div>

      {canEdit && showCodes && (
        <div className="cg-codes">
          <p className="cs-hint">A teacher types one of these to take on that group and see those students.</p>
          <GroupCodes classId={classId} />
        </div>
      )}

      {groups.length === 0 && (
        <p className="cs-hint">
          {canEdit
            ? 'No groups yet. Make one and it gets a code to hand to the teacher who takes it.'
            : 'No groups in this class yet.'}
        </p>
      )}

      <div className="cg-grid">{groups.map(groupCard)}</div>

      {ungrouped.length > 0 && (
        <section className="cg-card cg-card-loose">
          <header className="cg-card-head">
            <div className="cg-card-title">
              <h4 className="cg-name">Not in a group</h4>
              <span className="cg-meta">
                {ungrouped.length} student{ungrouped.length === 1 ? '' : 's'} · no teacher can see these
              </span>
            </div>
          </header>
          <div className="cg-students">{ungrouped.map(studentRow)}</div>
        </section>
      )}

      {editing && (
        <div className="modal-overlay qtag-overlay" onClick={() => setEditing(null)}>
          <div className="qtag-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing.id ? 'Edit group' : 'New group'}</h3>
            <input
              className="qtag-search cs-group-name"
              autoFocus
              placeholder="Group name (e.g. Tuesday 4pm)"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <p className="qtag-sub">{editing.studentIds.length} of {(cls?.studentIds || []).length} students selected</p>
            <div className="qtag-review-list">
              {(cls?.studentIds || []).map((sid) => {
                const student = getStudentById(sid)
                if (!student) return null
                const on = editing.studentIds.includes(sid)
                return (
                  <label key={sid} className="cs-pick">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setEditing({
                        ...editing,
                        studentIds: on
                          ? editing.studentIds.filter((x) => x !== sid)
                          : [...editing.studentIds, sid],
                      })}
                    />
                    <span>{fullName(student)}</span>
                  </label>
                )
              })}
            </div>
            <div className="qtag-modal-actions">
              <button className="qtag-btn" onClick={() => setEditing(null)}>Cancel</button>
              <button
                className="qtag-btn qtag-btn-primary"
                onClick={saveGroup}
                disabled={!editing.name.trim() || !editing.studentIds.length}
              >{editing.id ? 'Save group' : 'Create group'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ClassGroupsPanel
