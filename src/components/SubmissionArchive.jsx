import { useState, useEffect, useCallback, useMemo } from 'react'
import AnswerInjector from './AnswerInjector.jsx'
import { getArchivedSubmissions, getAttemptDrafts, restoreArchivedSubmission,
  returnAttemptInProgress,
  findDuplicateSubmissions,
  useArchivedCopy, preloadAllStudents, resetQuizForStudent, getCurrentAttempts } from '../data/store.js'

/**
 * The submission archive: every paper as it was handed in, kept apart from the
 * students' own records so that a bad write there cannot take the answers with
 * it, plus the papers that were open but never submitted.
 *
 * Meant for the day something goes wrong during a sitting: download the lot,
 * or put one paper back into a student's record.
 */
export default function SubmissionArchive({ teacherName }) {
  const [submissions, setSubmissions] = useState(null)
  const [drafts, setDrafts] = useState([])
  const [attempts, setAttempts] = useState([])
  const [dupes, setDupes] = useState([])
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    const [subs, dfts, atts, dup] = await Promise.all([
      getArchivedSubmissions(), getAttemptDrafts(), getCurrentAttempts(), findDuplicateSubmissions(),
    ])
    setSubmissions(subs)
    setDrafts(dfts)
    setAttempts(atts)
    setDupes(dup)
    setBusy(false)
  }, [])

  useEffect(() => { load() }, [load])

  /**
   * The drafts that really are unfinished.
   *
   * A draft is written every few seconds while a paper is open and nothing
   * removes it on hand-in, so almost every draft belongs to a paper that was
   * finished long ago - 215 of 218 of them, when this was measured. Listing
   * those as abandoned put a "Return in progress" button beside a mark that was
   * correctly earned. A draft counts as open only if that paper was never handed
   * in, or if the student has been writing since they last handed it in.
   */
  const openDrafts = useMemo(() => {
    const handedIn = new Map()
    for (const sub of submissions || []) {
      const key = `${sub.studentId}_${sub.quizSetId}`
      const when = sub.date || ''
      if (when > (handedIn.get(key) || '')) handedIn.set(key, when)
    }
    return drafts.filter((d) => {
      const when = handedIn.get(`${d.studentId}_${d.quizSetId}`)
      return !when || (d.savedAt || '') > when
    })
  }, [drafts, submissions])

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

  /** Makes one archived copy the sitting that counts for this student. */
  async function chooseCopy(group, copy) {
    const when = copy.date ? new Date(copy.date).toLocaleTimeString() : ''
    if (!window.confirm(
      `Count ${group.studentName}'s ${when} sitting of "${group.quizTitle}" — ${copy.score}/${copy.total}?

`
      + 'It replaces whatever their record holds for this paper. Every archived copy is kept either way.'
    )) return
    setBusy(true)
    await preloadAllStudents()
    useArchivedCopy(copy)
    setStatus(`${group.studentName}: "${group.quizTitle}" now counts as ${copy.score}/${copy.total}.`)
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
      {editing && (
        <AnswerInjector
          studentId={editing.studentId}
          studentName={editing.studentName || editing.studentId}
          quizSetId={editing.quizSetId}
          teacherName={teacherName}
          onClose={() => setEditing(null)}
          onSaved={() => load()}
        />
      )}
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

      {dupes.length > 0 && (
        <div style={{ border: '1px solid var(--warning)', borderRadius: 6, padding: '12px 14px', marginBottom: 18 }}>
          <p className="td2-h2" style={{ fontSize: '0.7rem', color: 'var(--warning)', marginTop: 0 }}>
            Handed in more than once — {dupes.length} to resolve
          </p>
          <p className="td2-muted td2-small" style={{ margin: '4px 0 12px' }}>
            The same paper was filed twice or more. Choose the sitting that counts; the others stay in the
            archive as a record. Marks, rankings and percentiles follow the one you choose.
          </p>
          {dupes.map((g) => (
            <div key={`${g.studentId}-${g.quizSetId}-${g.kind}`} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>
                {g.studentName} — {g.quizTitle}{g.kind === 'redo' ? ' (revision)' : ''}
              </div>
              {g.copies.map((cp) => {
                const counts = g.counted && g.counted.id === cp.id
                return (
                  <div key={cp.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '3px 0', fontSize: '0.72rem' }}>
                    <span style={{ minWidth: 150 }}>{cp.date ? new Date(cp.date).toLocaleString() : '—'}</span>
                    <span style={{ minWidth: 70 }}>{cp.score}/{cp.total}</span>
                    <span style={{ minWidth: 90, opacity: 0.7 }}>{cp.lockedOut ? 'left the page' : 'handed in'}</span>
                    {counts
                      ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}>counts now</span>
                      : (
                        <button
                          className="btn btn-outline btn-small"
                          style={{ fontSize: '0.45rem', padding: '3px 8px' }}
                          disabled={busy}
                          onClick={() => chooseCopy(g, cp)}
                        >Make this the one</button>
                      )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

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
                      style={{ fontSize: '0.45rem', padding: '3px 8px', marginRight: 4 }}
                      disabled={busy}
                      title="Set this student's answers and mark the paper again"
                      onClick={() => setEditing(a)}
                    >Set answers</button>
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

      {openDrafts.length > 0 && (
        <>
          <p className="td2-h2" style={{ marginTop: 20, fontSize: '0.7rem' }}>Open or abandoned papers</p>
          <p className="td2-muted td2-small" style={{ margin: '4px 0 8px' }}>
            Papers a student has open, or walked away from without handing in.
            {drafts.length > openDrafts.length
              ? ` ${drafts.length - openDrafts.length} further saved draft(s) belong to papers that were handed in, and are not shown.`
              : ''}
          </p>
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
              {openDrafts.map((d) => (
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
