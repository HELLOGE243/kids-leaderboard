import { useState, useEffect, useCallback } from 'react'
import { getArchivedSubmissions, getAttemptDrafts, restoreArchivedSubmission,
  returnAttemptInProgress, preloadAllStudents, resetQuizForStudent, getCurrentAttempts } from '../data/store.js'

/**
 * The submission archive: every paper as it was handed in, kept apart from the
 * students' own records so that a bad write there cannot take the answers with
 * it, plus the papers that were open but never submitted.
 *
 * Meant for the day something goes wrong during a sitting: download the lot,
 * or put one paper back into a student's record.
 */
export default function SubmissionArchive() {
  const [submissions, setSubmissions] = useState(null)
  const [drafts, setDrafts] = useState([])
  const [attempts, setAttempts] = useState([])
  const [filter, setFilter] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    const [subs, dfts, atts] = await Promise.all([getArchivedSubmissions(), getAttemptDrafts(), getCurrentAttempts()])
    setSubmissions(subs)
    setDrafts(dfts)
    setAttempts(atts)
    setBusy(false)
  }, [])

  useEffect(() => { load() }, [load])

  function download() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), submissions, drafts }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cleverspace-submissions-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * Clears one student's attempt at one paper so they can sit it again. The
   * archived copy is untouched - it cannot be deleted by anyone - so a reset
   * after a malfunction never loses what they had already answered.
   */
  async function reset(record) {
    const who = record.studentName || record.studentId
    const what = record.quizTitle || record.quizSetId
    if (!window.confirm(`Reset ${who}'s attempt at "${what}"? Their score and answers are cleared and they can sit it again. The archived copy is kept.`)) return
    setBusy(true)
    await preloadAllStudents()
    resetQuizForStudent(record.quizSetId, record.studentId)
    setStatus(`${who} can sit "${what}" again. Their archived paper is still here.`)
    await load()
  }

  /**
   * Hands the paper back as it stood, for the sitting that ended by accident.
   * The attempt comes out of their record so the quiz unlocks, their answers go
   * back in as work in progress, and the clock picks up where it stopped.
   */
  async function returnInProgress(record) {
    const who = record.studentName || record.studentId
    const what = record.quizTitle || record.quizSetId
    const draft = drafts.find((d) => String(d.studentId) === String(record.studentId) && d.quizSetId === record.quizSetId) || null
    if (!window.confirm(
      `Give "${what}" back to ${who} as unfinished work?

`
      + 'Their answers and the time they had left are returned, and the mark from '
      + 'the interrupted sitting is removed so they can carry on. The archived copy is kept.'
    )) return
    setBusy(true)
    await preloadAllStudents()
    const { ok, elapsedMs } = returnAttemptInProgress(record, draft)
    const mins = Math.round((elapsedMs || 0) / 60000)
    setStatus(ok
      ? `${who} can carry on with "${what}" — ${mins} ${mins === 1 ? 'minute' : 'minutes'} already used. They pick it up next time they sign in.`
      : `Could not return "${what}" to ${who}.`)
    await load()
  }

  async function restore(record) {
    setBusy(true)
    await preloadAllStudents()
    const done = restoreArchivedSubmission(record)
    setStatus(done
      ? `Restored ${record.studentName || record.studentId} — ${record.quizTitle || record.quizSetId}.`
      : `${record.studentName || record.studentId} already has an attempt for ${record.quizTitle || record.quizSetId}; nothing changed.`)
    setBusy(false)
  }

  if (submissions === null) return <p className="text-dim" style={{ fontSize: '0.8rem' }}>Reading the archive…</p>

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <span className="td2-muted td2-small">
          {submissions.length} submitted {submissions.length === 1 ? 'paper' : 'papers'}
          {drafts.length > 0 && ` · ${drafts.length} in progress or never handed in`}
        </span>
        <button className="btn btn-outline btn-small" style={{ fontSize: '0.5rem', padding: '6px 12px' }} onClick={load} disabled={busy}>
          {busy ? 'Working…' : 'Refresh'}
        </button>
        <button className="btn btn-small" style={{ fontSize: '0.5rem', padding: '6px 12px' }} onClick={download} disabled={busy || submissions.length === 0}>
          Download everything (JSON)
        </button>
      </div>

      {status && <p style={{ fontSize: '0.75rem', color: 'var(--accent)', marginBottom: 10 }}>{status}</p>}

      <p className="td2-h2" style={{ fontSize: '0.7rem', marginTop: 4 }}>Reset a paper</p>
      <p className="td2-muted td2-small" style={{ margin: '4px 0 10px' }}>
        Clears one student's attempt so they can sit that paper again — for the day a quiz misbehaves
        mid-sitting. What they had already answered stays in the archive below.
      </p>
      <input
        className="input"
        placeholder="Filter by student or paper…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ fontSize: '0.7rem', padding: '6px 10px', marginBottom: 10, maxWidth: 320 }}
      />
      {attempts.length === 0 ? (
        <p className="text-dim" style={{ fontSize: '0.8rem', marginBottom: 16 }}>No attempts on record.</p>
      ) : (
        <table className="table w-full" style={{ marginBottom: 20 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', fontSize: '0.6rem' }}>Student</th>
              <th style={{ textAlign: 'left', fontSize: '0.6rem' }}>Paper</th>
              <th style={{ textAlign: 'center', fontSize: '0.6rem', width: 70 }}>Score</th>
              <th style={{ textAlign: 'center', fontSize: '0.6rem', width: 130 }}>Sat</th>
              <th style={{ textAlign: 'center', fontSize: '0.6rem', width: 80 }} />
            </tr>
          </thead>
          <tbody>
            {attempts
              .filter((a) => !filter || `${a.studentName} ${a.quizTitle}`.toLowerCase().includes(filter.toLowerCase()))
              .slice(0, 100)
              .map((a) => (
                <tr key={`${a.studentId}-${a.quizSetId}`}>
                  <td style={{ fontSize: '0.75rem' }}>{a.studentName}</td>
                  <td style={{ fontSize: '0.75rem' }}>{a.quizTitle}</td>
                  <td style={{ textAlign: 'center', fontSize: '0.75rem' }}>{a.score}/{a.total}</td>
                  <td style={{ textAlign: 'center', fontSize: '0.7rem' }}>{a.date ? new Date(a.date).toLocaleString() : '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className="btn btn-outline btn-small"
                      style={{ fontSize: '0.45rem', padding: '3px 8px', borderColor: 'var(--warning)', color: 'var(--warning)' }}
                      disabled={busy}
                      onClick={() => reset(a)}
                    >Reset</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      <p className="td2-h2" style={{ fontSize: '0.7rem' }}>Archived papers</p>

      {submissions.length === 0 ? (
        <p className="text-dim" style={{ fontSize: '0.8rem' }}>Nothing archived yet. Every paper handed in from now on is recorded here.</p>
      ) : (
        <table className="table w-full">
          <thead>
            <tr>
              <th style={{ textAlign: 'left', fontSize: '0.6rem' }}>Student</th>
              <th style={{ textAlign: 'left', fontSize: '0.6rem' }}>Paper</th>
              <th style={{ textAlign: 'center', fontSize: '0.6rem', width: 70 }}>Score</th>
              <th style={{ textAlign: 'center', fontSize: '0.6rem', width: 130 }}>Handed in</th>
              <th style={{ textAlign: 'center', fontSize: '0.6rem', width: 150 }}>Recovery</th>
            </tr>
          </thead>
          <tbody>
            {submissions.slice(0, 200).map((s) => (
              <tr key={s.id}>
                <td style={{ fontSize: '0.75rem' }}>{s.studentName || s.studentId}</td>
                <td style={{ fontSize: '0.75rem' }}>{s.quizTitle || s.quizSetId}</td>
                <td style={{ textAlign: 'center', fontSize: '0.75rem' }}>{s.score}/{s.total}</td>
                <td style={{ textAlign: 'center', fontSize: '0.7rem' }}>{s.date ? new Date(s.date).toLocaleString() : '—'}</td>
                <td style={{ textAlign: 'center' }}>
                  <button
                    className="btn btn-outline btn-small"
                    style={{ fontSize: '0.45rem', padding: '3px 8px', marginRight: 4 }}
                    disabled={busy}
                    title="Put this paper back into the student's record if it has gone missing"
                    onClick={() => restore(s)}
                  >Restore</button>
                  <button
                    className="btn btn-outline btn-small"
                    style={{ fontSize: '0.45rem', padding: '3px 8px', marginRight: 4, borderColor: 'var(--accent)', color: 'var(--accent)' }}
                    disabled={busy}
                    title="Give the paper back unfinished, with their answers and the time they had left"
                    onClick={() => returnInProgress(s)}
                  >Return in progress</button>
                  <button
                    className="btn btn-outline btn-small"
                    style={{ fontSize: '0.45rem', padding: '3px 8px', borderColor: 'var(--warning)', color: 'var(--warning)' }}
                    disabled={busy}
                    title="Clear this attempt so the student can sit the paper again"
                    onClick={() => reset(s)}
                  >Reset</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {drafts.length > 0 && (
        <>
          <p className="td2-h2" style={{ marginTop: 20, fontSize: '0.7rem' }}>Open or abandoned papers</p>
          <table className="table w-full">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', fontSize: '0.6rem' }}>Student</th>
                <th style={{ textAlign: 'left', fontSize: '0.6rem' }}>Paper</th>
                <th style={{ textAlign: 'center', fontSize: '0.6rem', width: 90 }}>Answered</th>
                <th style={{ textAlign: 'center', fontSize: '0.6rem', width: 150 }}>Last saved</th>
                <th style={{ textAlign: 'center', fontSize: '0.6rem', width: 110 }} />
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => (
                <tr key={`${d.studentId}_${d.quizSetId}`}>
                  <td style={{ fontSize: '0.75rem' }}>{d.studentId}</td>
                  <td style={{ fontSize: '0.75rem' }}>{d.quizTitle || d.quizSetId}</td>
                  <td style={{ textAlign: 'center', fontSize: '0.75rem' }}>
                    {(d.answers || []).filter((a) => Array.isArray(a) ? a.some((x) => x !== -1) : (a !== -1 && a !== '' && a != null)).length} of {(d.answers || []).length}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '0.7rem' }}>{d.savedAt ? new Date(d.savedAt).toLocaleString() : '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className="btn btn-outline btn-small"
                      style={{ fontSize: '0.45rem', padding: '3px 8px', borderColor: 'var(--accent)', color: 'var(--accent)' }}
                      disabled={busy}
                      title="Give the paper back unfinished, with their answers and the time they had left"
                      onClick={() => returnInProgress(d)}
                    >Return in progress</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
