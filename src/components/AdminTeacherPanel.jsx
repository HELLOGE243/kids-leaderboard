import { useState, useEffect, useCallback } from 'react'
import { adminAction } from '../data/auth.js'

/**
 * Admin — teacher accounts.
 *
 * Teacher accounts are issued, not requested: an admin fills in a name and a
 * password here and hands them over. Nobody can sign themselves up as a
 * teacher, because a teacher account reaches real children's work.
 *
 * Password state lives server-side (credentials/ is unreadable to clients), so
 * creating, resetting and promoting all go through the admin endpoint rather
 * than writing a password field into shared data.
 */
export default function AdminTeacherPanel({ teachers, requestConfirm, onDeleteTeacher, onChanged }) {
  const [hasPassword, setHasPassword] = useState({})
  const [status, setStatus] = useState('')
  const [newName, setNewName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  // What was just handed out, shown once so it can be written down.
  const [issued, setIssued] = useState(null)
  const [settingPwFor, setSettingPwFor] = useState(null)
  const [pwValue, setPwValue] = useState('')

  const applyStatus = useCallback((res) => {
    if (res?.ok) {
      setHasPassword(res.hasPassword || {})
      setStatus('')
    } else {
      setStatus(res?.error === 'network' ? 'Could not reach the server.' : (res?.error || 'Could not load status.'))
    }
  }, [])

  const load = useCallback(() => adminAction('status').then(applyStatus), [applyStatus])

  useEffect(() => {
    let cancelled = false
    adminAction('status').then((res) => { if (!cancelled) applyStatus(res) })
    return () => { cancelled = true }
  }, [applyStatus])

  async function run(action, payload, doneMsg) {
    setStatus('Working…')
    const res = await adminAction(action, payload)
    if (!res?.ok) { setStatus(res?.error || 'Failed.'); return false }
    setStatus(doneMsg)
    await load()
    onChanged?.()
    return true
  }

  async function createTeacher(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return setStatus('Enter a name.')
    if (newPassword.length < 6) return setStatus('The password needs at least 6 characters.')
    setBusy(true)
    const res = await adminAction('createTeacher', { teacherName: name, password: newPassword })
    setBusy(false)
    if (!res?.ok) return setStatus(res?.error || 'Could not create that account.')
    setIssued({ name, password: newPassword })
    setNewName('')
    setNewPassword('')
    setStatus('')
    await load()
    onChanged?.()
  }

  async function savePassword(teacherId, teacherName) {
    if (pwValue.length < 6) return setStatus('The password needs at least 6 characters.')
    const ok = await run('setTeacherPassword', { teacherId, password: pwValue },
      `New password set for ${teacherName}. They are signed out everywhere.`)
    if (ok) { setIssued({ name: teacherName, password: pwValue }); setSettingPwFor(null); setPwValue('') }
  }

  const btn = { padding: '3px 6px', fontSize: '0.4rem' }

  return (
    <div className="card mt-16" style={{ borderColor: 'var(--accent)' }}>
      <p className="pixel-heading text-accent">Admin — Teacher Accounts</p>
      {status && <p className="text-dim" style={{ fontSize: '0.8rem', marginBottom: 8 }}>{status}</p>}

      <form onSubmit={createTeacher} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input
          className="td2-input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Teacher's name"
          style={{ minWidth: 160 }}
        />
        <input
          className="td2-input"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Password to hand over"
          style={{ minWidth: 180 }}
        />
        <button className="btn btn-small" style={btn} type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create teacher'}
        </button>
      </form>

      {issued && (
        <div className="card" style={{ marginBottom: 12, borderColor: 'var(--success)' }}>
          <p style={{ fontSize: '0.8rem', marginBottom: 4 }}>
            Give these to <b>{issued.name}</b> — the password is not shown again.
          </p>
          <p style={{ fontSize: '0.9rem', fontFamily: 'monospace' }}>
            {issued.name} · {issued.password}
          </p>
          <button className="btn btn-outline btn-small" style={btn} onClick={() => setIssued(null)}>Done</button>
        </div>
      )}

      {teachers.length === 0 ? (
        <p className="text-dim" style={{ fontSize: '0.85rem' }}>No teacher accounts yet.</p>
      ) : (
        <div className="td-student-table">
          <div className="td-st-header">
            <span className="td-st-cell" style={{ flex: 1 }}>Name</span>
            <span className="td-st-cell" style={{ width: 90, textAlign: 'center' }}>Status</span>
            <span className="td-st-cell" style={{ width: 70, textAlign: 'center' }}>Role</span>
            <span className="td-st-cell" style={{ width: 80, textAlign: 'center' }}>Password</span>
            <span className="td-st-cell" style={{ width: 240, textAlign: 'right' }}>Actions</span>
          </div>
          {teachers.map((t) => {
            const pending = t.approved === false
            const pw = hasPassword[t.id]
            const isAdmin = t.admin === true
            return (
              <div key={t.id}>
                <div className="td-st-row">
                  <span className="td-st-cell" style={{ flex: 1 }}>{t.name}</span>
                  <span className="td-st-cell" style={{ width: 90, textAlign: 'center', fontSize: '0.6rem', color: pending ? 'var(--warning, #ffab00)' : 'var(--success)' }}>
                    {pending ? 'Pending' : 'Active'}
                  </span>
                  <span className="td-st-cell" style={{ width: 70, textAlign: 'center', fontSize: '0.6rem', color: isAdmin ? 'var(--accent)' : 'var(--text-dim)' }}>
                    {isAdmin ? 'Admin' : 'Teacher'}
                  </span>
                  <span className="td-st-cell" style={{ width: 80, textAlign: 'center', fontSize: '0.6rem', color: pw ? 'var(--success)' : 'var(--text-dim)' }}>
                    {pw === undefined ? '…' : pw ? 'Set' : 'None'}
                  </span>
                  <span className="td-st-cell" style={{ width: 240, textAlign: 'right', display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    {pending && (
                      <button className="btn btn-small" style={btn} onClick={() => run('approveTeacher', { teacherId: t.id }, `Approved ${t.name}.`)}>
                        Approve
                      </button>
                    )}
                    <button className="btn btn-outline btn-small" style={btn}
                      onClick={() => { setSettingPwFor(settingPwFor === t.id ? null : t.id); setPwValue('') }}>
                      Set PW
                    </button>
                    <button className="btn btn-outline btn-small" style={btn}
                      onClick={() => requestConfirm(
                        isAdmin
                          ? `Take admin away from "${t.name}"? They keep teaching their classes.`
                          : `Make "${t.name}" an admin? They will be able to change quizzes, courses, classes and accounts.`,
                        () => run('setTeacherAdmin', { teacherId: t.id, admin: !isAdmin },
                          `${t.name} is now ${isAdmin ? 'a teacher' : 'an admin'}.`),
                        isAdmin ? 'Demote' : 'Promote')}>
                      {isAdmin ? 'Demote' : 'Make admin'}
                    </button>
                    <button className="btn btn-danger btn-small" style={btn}
                      onClick={() => requestConfirm(`Delete teacher "${t.name}"? This cannot be undone.`, () => onDeleteTeacher(t.id))}>
                      Delete
                    </button>
                  </span>
                </div>
                {settingPwFor === t.id && (
                  <div className="td-st-row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                    <input
                      className="td2-input"
                      value={pwValue}
                      onChange={(e) => setPwValue(e.target.value)}
                      placeholder="New password"
                      style={{ minWidth: 180 }}
                      autoFocus
                    />
                    <button className="btn btn-small" style={btn} onClick={() => savePassword(t.id, t.name)}>Save</button>
                    <button className="btn btn-outline btn-small" style={btn} onClick={() => setSettingPwFor(null)}>Cancel</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
