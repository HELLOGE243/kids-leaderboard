import { useState, useMemo, useEffect } from 'react'
import { getOverdueStudents, updateStudentContact, getSmsLog, getNotificationPrefs, setNotificationPrefs, getOrganisation, onDataChange } from '../data/store.js'
import { sendBulkOverdueSMS } from '../utils/smsService.js'

function NotificationsPanel({ orgId, onBack }) {
  const [refresh, setRefresh] = useState(0)
  const [tab, setTab] = useState('overdue')
  const [sending, setSending] = useState(false)
  const [sendResults, setSendResults] = useState(null)
  const [editingContact, setEditingContact] = useState(null)
  const [phoneInput, setPhoneInput] = useState('')
  const [emailInput, setEmailInput] = useState('')

  useEffect(() => {
    const unsub = onDataChange(() => setRefresh(r => r + 1))
    return unsub
  }, [])

  const org = useMemo(() => getOrganisation(orgId), [orgId, refresh])
  const overdue = useMemo(() => getOverdueStudents(orgId), [orgId, refresh])
  const smsLog = useMemo(() => getSmsLog(orgId), [orgId, refresh])
  const prefs = useMemo(() => getNotificationPrefs(orgId), [orgId, refresh])

  function startEditContact(s) {
    setEditingContact(s.studentId)
    setPhoneInput(s.parentPhone)
    setEmailInput(s.parentEmail || '')
  }

  function saveContact(studentId) {
    updateStudentContact(studentId, { parentPhone: phoneInput, parentEmail: emailInput })
    setEditingContact(null)
  }

  async function handleSendAll() {
    const withPhone = overdue.filter(s => s.parentPhone)
    if (!withPhone.length) return
    setSending(true)
    const results = await sendBulkOverdueSMS(withPhone, orgId, org?.name || 'School')
    setSendResults(results)
    setSending(false)
  }

  const withPhone = overdue.filter(s => s.parentPhone)
  const withoutPhone = overdue.filter(s => !s.parentPhone)

  return (
    <div className="notif-page">
      <div className="notif-header">
        <button className="btn btn-outline" onClick={onBack}>← Back</button>
        <h2 className="notif-title">📲 Notifications</h2>
      </div>

      <div className="notif-tabs">
        <button className={`notif-tab ${tab === 'overdue' ? 'notif-tab-active' : ''}`} onClick={() => setTab('overdue')}>Overdue ({overdue.length})</button>
        <button className={`notif-tab ${tab === 'log' ? 'notif-tab-active' : ''}`} onClick={() => setTab('log')}>SMS Log ({smsLog.length})</button>
        <button className={`notif-tab ${tab === 'settings' ? 'notif-tab-active' : ''}`} onClick={() => setTab('settings')}>Settings</button>
      </div>

      {tab === 'overdue' && (
        <div className="notif-section">
          {overdue.length === 0 ? (
            <div className="notif-empty">
              <span className="notif-empty-icon">✅</span>
              <p>No students with overdue homework!</p>
            </div>
          ) : (
            <>
              <div className="notif-summary">
                <span>{overdue.length} student{overdue.length !== 1 ? 's' : ''} with overdue homework</span>
                <span className="notif-summary-phone">{withPhone.length} with phone, {withoutPhone.length} without</span>
              </div>

              <div className="notif-student-list">
                {overdue.map(s => (
                  <div key={s.studentId} className="notif-student-row">
                    <div className="notif-student-info">
                      <span className="notif-student-name">{s.name}</span>
                      <span className="notif-student-overdue">{s.overdue} overdue</span>
                    </div>
                    {editingContact === s.studentId ? (
                      <div className="notif-contact-edit">
                        <input className="notif-contact-input" value={phoneInput} onChange={e => setPhoneInput(e.target.value)} placeholder="Parent phone (+61...)" />
                        <input className="notif-contact-input" value={emailInput} onChange={e => setEmailInput(e.target.value)} placeholder="Parent email" />
                        <button className="btn btn-small" onClick={() => saveContact(s.studentId)}>Save</button>
                        <button className="btn btn-outline btn-small" onClick={() => setEditingContact(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div className="notif-contact-view">
                        <span className="notif-contact-phone">{s.parentPhone || 'No phone'}</span>
                        <button className="notif-edit-btn" onClick={() => startEditContact(s)}>✏️</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {withPhone.length > 0 && (
                <button className="btn notif-send-btn" onClick={handleSendAll} disabled={sending}>
                  {sending ? '⏳ Sending...' : `📲 Send Overdue Reminders (${withPhone.length} students)`}
                </button>
              )}

              {sendResults && (
                <div className="notif-results">
                  <div className="notif-results-title">Send Results</div>
                  {sendResults.map((r, i) => (
                    <div key={i} className={`notif-result-row ${r.success ? 'notif-result-ok' : r.status === 'skipped' ? 'notif-result-skip' : 'notif-result-fail'}`}>
                      <span>{r.name}</span>
                      <span>{r.success ? '✓ Sent' : r.status === 'skipped' ? '⏭ Skipped' : `✗ ${r.error}`}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'log' && (
        <div className="notif-section">
          {smsLog.length === 0 ? (
            <div className="notif-empty">
              <span className="notif-empty-icon">📭</span>
              <p>No SMS messages sent yet.</p>
            </div>
          ) : (
            <div className="notif-log">
              {smsLog.map(l => (
                <div key={l.id} className={`notif-log-row ${l.status === 'sent' ? 'notif-log-ok' : 'notif-log-fail'}`}>
                  <div className="notif-log-meta">
                    <span className="notif-log-phone">{l.phone}</span>
                    <span className="notif-log-date">{new Date(l.sentAt).toLocaleString()}</span>
                    <span className={`notif-log-status ${l.status === 'sent' ? 'notif-log-status-ok' : ''}`}>{l.status}</span>
                  </div>
                  <div className="notif-log-msg">{l.message}</div>
                  {l.error && <div className="notif-log-err">{l.error}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'settings' && (
        <div className="notif-section">
          <div className="notif-settings">
            <div className="notif-setting-row">
              <span className="notif-setting-label">SMS Notifications</span>
              <button className={`notif-toggle ${prefs.smsEnabled ? 'notif-toggle-on' : ''}`} onClick={() => setNotificationPrefs(orgId, { smsEnabled: !prefs.smsEnabled })}>
                {prefs.smsEnabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
            <div className="notif-setting-row">
              <span className="notif-setting-label">Overdue reminder after (days)</span>
              <select className="notif-setting-select" value={prefs.overdueReminderDays || 3} onChange={e => setNotificationPrefs(orgId, { overdueReminderDays: parseInt(e.target.value) })}>
                {[1, 2, 3, 5, 7].map(d => <option key={d} value={d}>{d} day{d !== 1 ? 's' : ''}</option>)}
              </select>
            </div>
            <div className="notif-setting-info">
              <p>To enable SMS, deploy the Firebase Cloud Function and set the <code>VITE_SMS_FUNCTION_URL</code> in your <code>.env</code> file.</p>
              <p>SMS messages are sent via Twilio. Configure Twilio credentials in the Firebase Function config.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationsPanel
