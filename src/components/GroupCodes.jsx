import { useCallback, useEffect, useState } from 'react'
import { adminAction } from '../data/auth.js'

/**
 * The codes that hand a teaching group to a teacher, with the group.
 *
 * A class is the whole cohort; what a teacher is given is a group inside it.
 * A code is one way to take it on, which suits handing codes out at the start
 * of term; an admin can also give a group to a teacher outright, which suits
 * one person setting the whole thing up. There was only ever a way to take a
 * group off a teacher, never a way to put one on.
 *
 * Holding the group is what lets them open those students' work, so this shows
 * who is holding each one. Giving and taking both end that teacher's session:
 * the groups are named in their token, which is minted at sign-in, so until
 * they sign in again the token would not know.
 *
 * @param {object} props
 * @param {string} props.classId only the groups in this class
 */
function GroupCodes({ classId }) {
  const [groups, setGroups] = useState(null)
  const [teachers, setTeachers] = useState([])
  const [busy, setBusy] = useState('')
  const [copied, setCopied] = useState('')
  const [assigning, setAssigning] = useState('')

  const load = useCallback(async () => {
    const res = await adminAction('groupHolders')
    if (res?.ok) {
      setGroups((res.groups || []).filter((g) => g.classId === classId))
      setTeachers(res.allTeachers || [])
    }
  }, [classId])

  useEffect(() => { load() }, [load])

  async function newCode(groupId) {
    setBusy(groupId)
    await adminAction('setGroupCode', { groupId })
    setBusy('')
    load()
  }

  async function give(groupId, teacherId) {
    if (!teacherId) return
    setBusy(groupId)
    await adminAction('addTeacherToGroup', { groupId, teacherId })
    setBusy('')
    setAssigning('')
    load()
  }

  async function remove(groupId, teacherId) {
    setBusy(groupId)
    await adminAction('removeTeacherFromGroup', { groupId, teacherId })
    setBusy('')
    load()
  }

  if (!groups) return <p className="cs-hint">Loading group codes…</p>
  if (!groups.length) {
    return <p className="cs-hint">No groups in this class yet. Make one above and it gets a code to hand to its teacher.</p>
  }

  return (
    <div className="gc-list">
      {groups.map((g) => (
        <div key={g.id} className="gc-row">
          <div className="gc-main">
            <span className="gc-name">{g.name}</span>
            <span className="gc-meta">{g.students} student{g.students === 1 ? '' : 's'}</span>
          </div>

          <div className="gc-code-wrap">
            {g.code ? (
              <button
                className="td2-class-code-value"
                title="Copy"
                onClick={() => {
                  navigator.clipboard?.writeText(g.code)
                  setCopied(g.id)
                  setTimeout(() => setCopied(''), 1200)
                }}
              >{copied === g.id ? 'Copied' : g.code}</button>
            ) : <span className="td2-class-code-value is-none">none yet</span>}
            <button className="cs-btn" disabled={busy === g.id} onClick={() => newCode(g.id)}>
              {g.code ? 'New code' : 'Give it one'}
            </button>
          </div>

          <div className="gc-holders">
            {g.teachers.length === 0
              ? <span className="gc-nobody">nobody yet</span>
              : g.teachers.map((t) => (
                <span key={t.id} className="td2-class-holder">
                  {t.name}
                  <button className="td2-class-holder-x" title="Take this group back"
                    disabled={busy === g.id} onClick={() => remove(g.id, t.id)}>×</button>
                </span>
              ))}
            {assigning === g.id ? (
              <select
                className="td2-select gc-assign-pick"
                defaultValue=""
                autoFocus
                disabled={busy === g.id}
                onChange={(e) => give(g.id, e.target.value)}
                onBlur={() => setAssigning('')}
              >
                <option value="">Choose a teacher…</option>
                {teachers
                  .filter((t) => !g.teachers.some((h) => String(h.id) === String(t.id)))
                  .map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            ) : (
              <button
                className="cs-btn gc-assign"
                disabled={busy === g.id}
                title="Give this group to a teacher without a code"
                onClick={() => setAssigning(g.id)}
              >+ Give to a teacher</button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default GroupCodes
