import { useState, useEffect, useCallback } from 'react'
import { getArchivedSubmissions, getAttemptDrafts, restoreArchivedSubmission, preloadAllStudents } from '../data/store.js'

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
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    const [subs, dfts] = await Promise.all([getArchivedSubmissions(), getAttemptDrafts()])
    setSubmissions(subs)
    setDrafts(dfts)
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
              <th style={{ textAlign: 'center', fontSize: '0.6rem', width: 90 }}>Recovery</th>
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
                    style={{ fontSize: '0.45rem', padding: '3px 8px' }}
                    disabled={busy}
                    title="Put this paper back into the student's record if it has gone missing"
                    onClick={() => restore(s)}
                  >Restore</button>
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
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
