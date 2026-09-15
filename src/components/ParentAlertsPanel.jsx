import { useEffect, useState } from 'react'
import { getNotificationPrefs, setNotificationPrefs, getStudentById, fullName } from '../data/store.js'
import { loadParentNotifications } from '../data/firebase.js'
import { authedFetch } from '../data/auth.js'

const FUNCTIONS_BASE = 'https://australia-southeast1-cleverspacev2.cloudfunctions.net'

const KINDS = [
  { id: 'deadline', label: 'Homework deadline passed', hint: 'When a week closes: quizzes done, average, anything missed or late.' },
  { id: 'lockout', label: 'Quiz auto-submitted', hint: 'Straight away when a student is locked out for leaving the quiz screen.' },
  { id: 'test', label: 'Test finished', hint: 'Checkpoint and trial test scores with class percentile.' },
  { id: 'weekly', label: 'Weekly summary', hint: 'Friday evening: each course’s progress for the week.' },
]

const STATUS_LABEL = {
  pending: 'Waiting to send', preview: 'Preview (not sent)', sent: 'Sent', failed: 'Failed', skipped: 'Skipped', unreachable: 'No contact',
}

const DEFAULTS = { live: false, lockout: true, test: true, deadline: true, weekly: true }

/** Teacher settings and log for automatic parent messages. */
export default function ParentAlertsPanel({ orgId }) {
  const [, bump] = useState(0)
  const prefs = { ...DEFAULTS, ...(getNotificationPrefs(orgId).parentAlerts || {}) }
  const [log, setLog] = useState(null)
  const [open, setOpen] = useState(null)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState(null)

  const refreshLog = () => loadParentNotifications(100).then(setLog).catch((e) => setLog({ error: e.message }))
  useEffect(() => { refreshLog() }, [])

  function update(fields) {
    setNotificationPrefs(orgId, { parentAlerts: { ...prefs, ...fields } })
    bump((n) => n + 1)
  }

  async function runNow() {
    setRunning(true)
    setRunResult(null)
    try {
      const res = await authedFetch(`${FUNCTIONS_BASE}/parentNotifyRun`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const body = await res.json().catch(() => ({}))
      setRunResult(res.ok ? body : { error: body.error || `Failed (${res.status})` })
    } catch {
      setRunResult({ error: 'Could not reach the server.' })
    }
    setRunning(false)
    refreshLog()
  }

  const confirmLive = () => {
    if (prefs.live) { update({ live: false }); return }
    if (window.confirm('Start sending messages to parents for real? Check the previews below first.')) update({ live: true })
  }

  return (
    <div className="pa">
      <div className={`pa-mode ${prefs.live ? 'is-live' : ''}`}>
        <div>
          <b>{prefs.live ? 'Live — parents receive these messages' : 'Preview mode — nothing is sent'}</b>
          <p>{prefs.live ? 'Messages go out by email (and SMS once set up), outside 8pm–7am.' : 'Messages are written and listed below so you can check them before switching on.'}</p>
        </div>
        <button className={`pa-btn ${prefs.live ? '' : 'pa-btn-primary'}`} onClick={confirmLive}>{prefs.live ? 'Switch to preview' : 'Go live'}</button>
      </div>

      <div className="pa-kinds">
        {KINDS.map((k) => (
          <label key={k.id} className="pa-kind">
            <input type="checkbox" checked={!!prefs[k.id]} onChange={(e) => update({ [k.id]: e.target.checked })} />
            <span><b>{k.label}</b><small>{k.hint}</small></span>
          </label>
        ))}
      </div>

      <div className="pa-log-head">
        <h3>Messages</h3>
        <button className="pa-btn" onClick={runNow} disabled={running}>{running ? 'Checking…' : 'Check now'}</button>
      </div>
      {runResult && (
        <p className="pa-note">
          {runResult.error ? `⚠ ${runResult.error}` : runResult.skipped === 'quiet-hours' ? 'Checked. It’s quiet hours (8pm–7am), so messages wait until morning.' : `Checked — processed ${runResult.processed || 0} message(s).`}
          {!runResult.error && !runResult.email && ' Email isn’t set up yet, so messages show as “No contact” until it is.'}
        </p>
      )}
      {!log ? <p className="pa-note">Loading…</p> : log.error ? <p className="pa-note">⚠ {log.error}</p> : log.length === 0 ? (
        <p className="pa-note">No messages yet. They appear here as deadlines pass and tests are finished.</p>
      ) : (
        <div className="pa-list">
          {log.map((m) => {
            const student = getStudentById(m.studentId)
            return (
              <div key={m.id} className="pa-item">
                <button className="pa-item-row" onClick={() => setOpen(open === m.id ? null : m.id)}>
                  <span className={`pa-status pa-status-${m.status}`}>{STATUS_LABEL[m.status] || m.status}</span>
                  <span className="pa-item-subject">{m.subject}</span>
                  <span className="pa-item-meta">{student ? fullName(student) : m.studentId} · {new Date(m.createdAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                </button>
                {open === m.id && (
                  <div className="pa-item-body">
                    {m.reason && <p className="pa-note">{m.reason}</p>}
                    {m.error && <p className="pa-note">⚠ {m.error}</p>}
                    {m.channels && <p className="pa-note">To: {Object.entries(m.channels).map(([k, v]) => `${k} ${v.to}`).join(' · ')}</p>}
                    <div className="pa-email" dangerouslySetInnerHTML={{ __html: m.html || '' }} />
                    {m.sms && <p className="pa-sms"><b>SMS:</b> {m.sms}</p>}
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
