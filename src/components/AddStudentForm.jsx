import { useMemo, useState } from 'react'
import SYDNEY_SCHOOLS from '../data/sydneySchools.js'
import { authedFetch } from '../data/auth.js'

const FUNCTIONS_BASE = 'https://australia-southeast1-cleverspacev2.cloudfunctions.net'
const YEARS = ['Year 3', 'Year 4', 'Year 5', 'Year 6', 'Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12']

/** Formats as the student sign-up form does: 04XX XXX XXX. */
function formatPhone(raw) {
  let d = raw.replace(/[^\d]/g, '')
  if (d.startsWith('61')) d = '0' + d.slice(2)
  if (d && !d.startsWith('0')) d = '0' + d
  d = d.slice(0, 10)
  if (d.length <= 4) return d
  if (d.length <= 7) return `${d.slice(0, 4)} ${d.slice(4)}`
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`
}

/**
 * Adds a student from the teacher dashboard with the same details sign-up
 * collects, so reports and parent messages work from day one. The parent email
 * is recorded as unverified, since nobody entered a code.
 */
export default function AddStudentForm({ orgId, onClose, onCreated }) {
  const [f, setF] = useState({ name: '', firstName: '', lastName: '', yearGroup: '', schoolName: '', parentPhone: '', parentEmail: '', password: '' })
  const [schoolOpen, setSchoolOpen] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key) => (e) => { setF({ ...f, [key]: e.target.value }); setError('') }

  const schools = useMemo(() => {
    const q = f.schoolName.trim().toLowerCase()
    return q.length < 2 ? [] : SYDNEY_SCHOOLS.filter((s) => s.toLowerCase().includes(q)).slice(0, 8)
  }, [f.schoolName])

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await authedFetch(`${FUNCTIONS_BASE}/teacherStudents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', orgId, profile: f }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) { setError(body.error || 'Could not add the student.'); setBusy(false); return }
      onCreated?.(body)
    } catch {
      setError('Could not reach the server.')
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay qtag-overlay" onClick={busy ? undefined : onClose}>
      <div className="qtag-modal as-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add a student</h3>
        <p className="qtag-sub">The same details sign-up asks for. The account works straight away — no approval needed.</p>
        <form className="as-form" onSubmit={submit}>
          <label className="as-field as-wide">Sign-in nickname
            <input className="qtag-search" value={f.name} onChange={set('name')} placeholder="What they type to sign in" autoFocus />
          </label>
          <label className="as-field">First name<input className="qtag-search" value={f.firstName} onChange={set('firstName')} /></label>
          <label className="as-field">Last name<input className="qtag-search" value={f.lastName} onChange={set('lastName')} /></label>
          <label className="as-field">Year group
            <select className="qtag-search" value={f.yearGroup} onChange={set('yearGroup')}>
              <option value="">Select…</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="as-field as-school">School
            <input className="qtag-search" value={f.schoolName} onChange={(e) => { set('schoolName')(e); setSchoolOpen(true) }} onBlur={() => setTimeout(() => setSchoolOpen(false), 180)} placeholder="Search schools" autoComplete="off" />
            {schoolOpen && schools.length > 0 && (
              <div className="as-school-list">
                {schools.map((s) => <button type="button" key={s} onMouseDown={() => { setF((cur) => ({ ...cur, schoolName: s })); setSchoolOpen(false) }}>{s}</button>)}
              </div>
            )}
          </label>
          <label className="as-field">Parent mobile
            <input className="qtag-search" value={f.parentPhone} onChange={(e) => { setF({ ...f, parentPhone: formatPhone(e.target.value) }); setError('') }} placeholder="04XX XXX XXX" inputMode="numeric" />
          </label>
          <label className="as-field">Parent email
            <input className="qtag-search" type="email" value={f.parentEmail} onChange={set('parentEmail')} placeholder="Reports and alerts go here" />
          </label>
          <label className="as-field as-wide">Password
            <input className="qtag-search" value={f.password} onChange={set('password')} placeholder="Give this to the student; they can change it later" />
          </label>
          {error && <p className="qtag-error as-wide">{error}</p>}
          <div className="qtag-modal-actions as-wide">
            <button type="button" className="qtag-btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="qtag-btn qtag-btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add student'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
