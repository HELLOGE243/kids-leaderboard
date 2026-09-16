import { useMemo, useState } from 'react'
import {
  getClassSkillSummary, getClassGroups, createClassGroup, updateClassGroup, deleteClassGroup,
  getCoursesForOrg, getClassById, getStudentById, fullName, TAG_SUBJECTS,
} from '../data/store.js'

// Where a class's tagged results turn into teaching decisions: which skills the
// class is weakest at, who is struggling with each one, and a way to turn that
// list straight into a teaching group.

const band = (pct) => (pct == null ? '' : pct >= 80 ? 'great' : pct >= 65 ? 'good' : pct >= 50 ? 'fair' : 'low')

export default function ClassSkills({ classId, orgId, onOpenStudent }) {
  const [, bump] = useState(0)
  const refresh = () => bump((n) => n + 1)
  const [courseId, setCourseId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [openSkill, setOpenSkill] = useState(null)
  const [editing, setEditing] = useState(null) // { id?, name, studentIds }

  const cls = getClassById(classId)
  const courses = useMemo(() => getCoursesForOrg(orgId).filter((c) => c.classId === classId), [orgId, classId])
  const groups = getClassGroups(classId)
  const summary = useMemo(
    () => getClassSkillSummary(classId, { courseId: courseId || null, groupId: groupId || null }),
    [classId, courseId, groupId, openSkill, editing],
  )
  const { students, skills } = summary

  const startGroup = (studentIds = []) => setEditing({ name: '', studentIds })
  const saveGroup = () => {
    if (!editing.name.trim() || !editing.studentIds.length) return
    if (editing.id) updateClassGroup(editing.id, { name: editing.name, studentIds: editing.studentIds })
    else createClassGroup(classId, editing.name, editing.studentIds)
    setEditing(null)
    refresh()
  }

  const subjectName = (id) => TAG_SUBJECTS.find((s) => s.id === id)?.name || id

  return (
    <div className="cs-panel">
      <div className="cs-filters">
        <label>Course
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">All courses</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Students
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Whole class ({(cls?.studentIds || []).length})</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.studentIds.length})</option>)}
          </select>
        </label>
        <button className="cs-btn" onClick={() => startGroup([])}>+ New group</button>
        {groupId && (
          <>
            <button className="cs-btn" onClick={() => { const g = groups.find((x) => x.id === groupId); setEditing({ id: g.id, name: g.name, studentIds: [...g.studentIds] }) }}>Edit group</button>
            <button className="cs-btn cs-btn-danger" onClick={() => { if (window.confirm('Delete this group? Student results are not affected.')) { deleteClassGroup(groupId); setGroupId(''); refresh() } }}>Delete</button>
          </>
        )}
      </div>

      {skills.length === 0 ? (
        <p className="cs-empty">
          No skill results yet. Skills appear once students answer questions that carry skill tags —
          tag a quiz set with <b>✨ Tag all with AI</b> in the Quiz Builder, then results build up as students work.
        </p>
      ) : (
        <>
          <p className="cs-hint">Weakest skills first. A skill appears once the group has answered at least 5 marks of it.</p>
          <div className="cs-list">
            {skills.map((s) => (
              <div key={s.tagId} className="cs-skill">
                <button className="cs-skill-row" onClick={() => setOpenSkill(openSkill === s.tagId ? null : s.tagId)}>
                  <span className="cs-skill-name">{s.name}<small>{subjectName(s.subject)}</small></span>
                  <span className="cs-skill-bar"><span className={`cs-band-${band(s.pct)}`} style={{ width: `${s.pct}%` }} /></span>
                  <span className={`cs-skill-pct cs-text-${band(s.pct)}`}>{s.pct}%</span>
                  <span className="cs-skill-meta">{s.total} marks · {s.answered} student{s.answered === 1 ? '' : 's'}</span>
                  <span className={`cs-skill-strug${s.struggling.length ? ' is-warn' : ''}`}>{s.struggling.length} below 60%</span>
                </button>
                {openSkill === s.tagId && (
                  <div className="cs-skill-body">
                    {s.struggling.length === 0 ? <p className="cs-hint">Nobody in this group is below 60% on this skill.</p> : (
                      <>
                        <div className="cs-strug-list">
                          {s.struggling.map((st) => (
                            <button key={st.id} className="cs-strug" onClick={() => onOpenStudent?.(st.id)}>
                              <b>{st.name}</b> <span className={`cs-text-${band(st.pct)}`}>{st.pct}%</span> <small>of {st.total} marks</small>
                            </button>
                          ))}
                        </div>
                        <button className="cs-btn cs-btn-primary" onClick={() => setEditing({ name: s.name, studentIds: s.struggling.map((x) => x.id) })}>
                          Make a group from these {s.struggling.length}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <h4 className="cs-h4">Students</h4>
      <div className="cs-students">
        {students.map((st) => {
          const weakest = st.skills.filter((s) => s.total >= 3).slice(0, 3)
          return (
            <button key={st.id} className="cs-student" onClick={() => onOpenStudent?.(st.id)}>
              <span className="cs-student-name">{st.name}</span>
              {weakest.length === 0
                ? <span className="cs-hint">No tagged results yet</span>
                : <span className="cs-student-skills">{weakest.map((s) => <span key={s.tagId} className={`cs-chip cs-chip-${band(s.pct)}`}>{s.name} {s.pct}%</span>)}</span>}
            </button>
          )
        })}
      </div>

      {editing && (
        <div className="modal-overlay qtag-overlay" onClick={() => setEditing(null)}>
          <div className="qtag-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing.id ? 'Edit group' : 'New group'}</h3>
            <input className="qtag-search cs-group-name" autoFocus placeholder="Group name (e.g. Inference focus)" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <p className="qtag-sub">{editing.studentIds.length} of {(cls?.studentIds || []).length} students selected</p>
            <div className="qtag-review-list">
              {(cls?.studentIds || []).map((id) => {
                const student = getStudentById(id)
                const on = editing.studentIds.includes(id)
                return (
                  <label key={id} className="cs-pick">
                    <input type="checkbox" checked={on} onChange={(e) => setEditing({ ...editing, studentIds: e.target.checked ? [...editing.studentIds, id] : editing.studentIds.filter((x) => x !== id) })} />
                    <span>{student ? fullName(student) : id}</span>
                  </label>
                )
              })}
            </div>
            <div className="qtag-modal-actions">
              <button className="qtag-btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="qtag-btn qtag-btn-primary" onClick={saveGroup} disabled={!editing.name.trim() || !editing.studentIds.length}>{editing.id ? 'Save group' : 'Create group'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
