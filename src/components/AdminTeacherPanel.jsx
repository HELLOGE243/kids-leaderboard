import { useState, useEffect, useCallback } from 'react'
import { adminAction } from '../data/auth.js'

/**
 * Admin — teacher accounts.
 *
 * Password state lives server-side (credentials/ is unreadable to clients), so
 * status, approval and resets all go through the admin endpoint rather than
 * reading or writing a password field in shared data.
 */
export default function AdminTeacherPanel({ teachers, requestConfirm, onDeleteTeacher, onChanged }) {
  const [hasPassword, setHasPassword] = useState({})
  const [status, setStatus] = useState('')

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

  async function run(action, teacherId, doneMsg) {
    setStatus('Working…')
    const res = await adminAction(action, { teacherId })
    if (!res?.ok) { setStatus(res?.error || 'Failed.'); return }
    setStatus(doneMsg)
    await load()
    onChanged?.()
  }

  const btn = { padding: '3px 6px', fontSize: '0.4rem' }

  return (
    <div className="card mt-16" style={{ borderColor: 'var(--accent)' }}>
      <p className="pixel-heading text-accent">Admin — Teacher Accounts</p>
      {status && <p className="text-dim" style={{ fontSize: '0.8rem', marginBottom: 8 }}>{status}</p>}
      {teachers.length === 0 ? (
        <p className="text-dim" style={{ fontSize: '0.85rem' }}>No teacher accounts yet.</p>
      ) : (
        <div className="td-student-table">
          <div className="td-st-header">
            <span className="td-st-cell" style={{ flex: 1 }}>Name</span>
            <span className="td-st-cell" style={{ width: 90, textAlign: 'center' }}>Status</span>
            <span className="td-st-cell" style={{ width: 80, textAlign: 'center' }}>Password</span>
            <span className="td-st-cell" style={{ width: 170, textAlign: 'right' }}>Actions</span>
          </div>
          {teachers.map((t) => {
            const pending = t.approved === false
            const pw = hasPassword[t.id]
            return (
              <div key={t.id} className="td-st-row">
                <span className="td-st-cell" style={{ flex: 1 }}>{t.name}</span>
                <span className="td-st-cell" style={{ width: 90, textAlign: 'center', fontSize: '0.6rem', color: pending ? 'var(--warning, #ffab00)' : 'var(--success)' }}>
                  {pending ? 'Pending' : 'Approved'}
                </span>
                <span className="td-st-cell" style={{ width: 80, textAlign: 'center', fontSize: '0.6rem', color: pw ? 'var(--success)' : 'var(--text-dim)' }}>
                  {pw === undefined ? '…' : pw ? 'Set' : 'None'}
                </span>
                <span className="td-st-cell" style={{ width: 170, textAlign: 'right', display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  {pending && (
                    <button className="btn btn-small" style={btn} onClick={() => run('approveTeacher', t.id, `Approved ${t.name}.`)}>
                      Approve
                    </button>
                  )}
                  {pw && (
                    <button className="btn btn-outline btn-small" style={btn} onClick={() => requestConfirm(`Reset password for "${t.name}"? They will set a new one at next sign-in.`, () => run('resetTeacher', t.id, `Password reset for ${t.name}.`), 'Reset')}>
                      Reset PW
                    </button>
                  )}
                  <button className="btn btn-danger btn-small" style={btn} onClick={() => requestConfirm(`Delete teacher "${t.name}"? This cannot be undone.`, () => onDeleteTeacher(t.id))}>
                    Delete
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
