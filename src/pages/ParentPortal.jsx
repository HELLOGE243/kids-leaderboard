import { useEffect, useMemo, useState } from 'react'
import { loadSubmissionsForStudent, loadStudentFirestore } from '../data/firebase.js'
import { refreshQuizSetFromCloud } from '../data/store.js'
import ReviewedQuestion from '../components/ReviewedQuestion.jsx'
import ReportPage from './ReportPage.jsx'
import { linkChild } from '../data/auth.js'

/**
 * What a parent sees.
 *
 * A parent has no account and no record of their own: they paired an email
 * address with their children's student ids, and the children travelled back
 * with the session. Everything here is read from the children's own records,
 * and nothing on this screen writes anything anywhere.
 *
 * @param {object} props
 * @param {{email: string, children: Array<{id: string, name: string}>}} props.session
 * @param {() => void} props.onLogout
 */
function ParentPortal({ session, onLogout }) {
  // Children arrive with the session and are added to in place, because
  // linking one issues a new token and signs in again underneath us.
  const [children, setChildren] = useState(session.children || [])
  const [linking, setLinking] = useState('')
  const [linkError, setLinkError] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  const [activeId, setActiveId] = useState((session.children || [])[0]?.id || null)
  const [papers, setPapers] = useState({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('papers')
  const [open, setOpen] = useState(null)       // the paper being read
  const [openSet, setOpenSet] = useState(null) // its questions

  // Each child's filed papers, for the list, and their own record, which is
  // what the report is built from. A parent reads; nothing here writes.
  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all(children.map((child) =>
      Promise.all([
        loadSubmissionsForStudent(child.id),
        loadStudentFirestore(child.id).catch(() => null),
      ]).then(([filed]) => [child.id, filed])))
      .then((pairs) => {
        if (!alive) return
        setPapers(Object.fromEntries(pairs))
        setLoading(false)
      })
    return () => { alive = false }
  }, [session.email])

  const active = children.find((c) => c.id === activeId) || children[0]

  const sittings = useMemo(() => (papers[activeId] || []).map((paper) => ({
    id: paper.id,
    kind: paper.kind === 'redo' ? 'Revision' : 'Paper',
    title: paper.quizTitle || paper.quizSetId,
    quizSetId: paper.quizSetId,
    answers: paper.answers || [],
    score: Number(paper.score) || 0,
    total: Number(paper.total) || 0,
    date: paper.date || '',
    screenLeaves: Number(paper.screenLeaves) || 0,
    lockedOut: !!paper.lockedOut,
  })), [papers, activeId])

  // Opening a paper needs its questions, which are not on the filed copy - that
  // keeps the answers, not the paper. One read, the first time it is asked for.
  async function openPaper(row) {
    setOpen(row)
    setOpenSet(null)
    const set = await refreshQuizSetFromCloud(row.quizSetId)
    setOpenSet(set || { questions: [] })
  }


  async function submitLink(e) {
    e.preventDefault()
    const id = linking.trim()
    if (!id) return setLinkError('Enter the student ID.')
    setLinkBusy(true)
    setLinkError('')
    const res = await linkChild(id)
    setLinkBusy(false)
    if (!res.ok) return setLinkError(res.error)
    setChildren(res.children)
    setLinking('')
    if (!activeId) setActiveId(res.children[0]?.id || null)
  }

  const addChildForm = (
    <form className="pp-link" onSubmit={submitLink}>
      <label className="pp-link-label" htmlFor="pp-link-id">Add a child</label>
      <p className="pp-link-help">
        Their student ID is on their own home screen, under their name.
      </p>
      <div className="pp-link-row">
        <input
          id="pp-link-id"
          className="input"
          value={linking}
          onChange={(e) => { setLinking(e.target.value.replace(/[^0-9]/g, '').slice(0, 12)); setLinkError('') }}
          placeholder="e.g. 61864531"
          inputMode="numeric"
        />
        <button className="btn" type="submit" disabled={linkBusy}>{linkBusy ? 'Linking…' : 'Link'}</button>
      </div>
      {linkError && <p className="pp-link-error">{linkError}</p>}
    </form>
  )

  if (!children.length) {
    return (
      <div className="pp-page">
        <header className="pp-header">
          <img src="/avant-logo.png" alt="AVANT OC &amp; Selective" className="pp-logo" />
          <div className="pp-header-mid"><span className="pp-signed-in">Signed in as {session.email}</span></div>
          <button className="btn-logout btn-signout" onClick={onLogout}>Sign out</button>
        </header>
        <main className="pp-main">
          <h1 className="pp-title">Link your child</h1>
          <p className="pp-empty" style={{ marginBottom: 18 }}>
            Enter the student ID shown on your child&rsquo;s home screen and their results will appear here.
          </p>
          {addChildForm}
        </main>
      </div>
    )
  }

  // ---- one paper, read right through ---------------------------------------
  if (open) {
    const pct = open.total > 0 ? Math.round((open.score / open.total) * 100) : null
    return (
      <div className="pp-page">
        <header className="pp-header">
          <button className="btn btn-outline" onClick={() => { setOpen(null); setOpenSet(null) }}>← Back</button>
          <div className="pp-header-mid">
            <span className="pp-row-title">{open.title}</span>
            <span className="pp-signed-in">
              {active?.firstName || active?.name}
              {open.date ? ` · ${new Date(open.date).toLocaleDateString()}` : ''}
            </span>
          </div>
          {open.total > 0 && (
            <span className="pp-row-pct">{pct}% <span className="pp-row-raw">{open.score}/{open.total}</span></span>
          )}
        </header>
        <main className="pp-main">
          {!openSet ? (
            <p className="pp-empty">Fetching the paper…</p>
          ) : !(openSet.questions || []).length ? (
            <p className="pp-empty">This paper is no longer available.</p>
          ) : (
            openSet.questions.map((q, i) => (
              <ReviewedQuestion key={q.id || i} question={q} answer={open.answers[i]} index={i} />
            ))
          )}
        </main>
      </div>
    )
  }

  return (
    <div className="pp-page">
      <header className="pp-header">
        <img src="/avant-logo.png" alt="AVANT OC &amp; Selective" className="pp-logo" />
        <div className="pp-header-mid">
          <span className="pp-signed-in">Signed in as {session.email}</span>
        </div>
        <button className="btn-logout btn-signout" onClick={onLogout}>Sign out</button>
      </header>

      {children.length > 1 && (
        <div className="pp-children">
          {children.map((child) => (
            <button
              key={child.id}
              className={`pp-child${child.id === activeId ? ' is-active' : ''}`}
              onClick={() => { setActiveId(child.id); setOpen(null) }}
            >
              {child.firstName || child.name}
              {child.yearGroup ? <span className="pp-child-year">Year {child.yearGroup}</span> : null}
            </button>
          ))}
        </div>
      )}

      <div className="pp-tabs">
        <button className={`pp-tab${tab === 'papers' ? ' is-active' : ''}`} onClick={() => setTab('papers')}>Papers</button>
        <button className={`pp-tab${tab === 'report' ? ' is-active' : ''}`} onClick={() => setTab('report')}>Report</button>
      </div>

      {tab === 'report' ? (
        <main className="pp-main pp-report">
          <ReportPage studentId={activeId} onBack={() => setTab('papers')} />
        </main>
      ) : (
        <main className="pp-main">
          <h1 className="pp-title">
            {active?.firstName || active?.name}
            <span className="pp-title-sub">{sittings.length} completed</span>
          </h1>

          {loading ? (
            <p className="pp-empty">Fetching their results…</p>
          ) : sittings.length === 0 ? (
            <p className="pp-empty">Nothing completed yet. Results appear here as soon as a paper is handed in.</p>
          ) : (
            <ul className="pp-list">
              {sittings.map((row) => {
                const pct = row.total > 0 ? Math.round((row.score / row.total) * 100) : null
                return (
                  <li key={row.id}>
                    <button className="pp-row pp-row-btn" onClick={() => openPaper(row)}>
                      <div className="pp-row-main">
                        <span className="pp-row-title">{row.title}</span>
                        <span className="pp-row-meta">
                          {row.kind}
                          {row.date ? ` · ${new Date(row.date).toLocaleDateString()}` : ''}
                        </span>
                      </div>
                      <div className="pp-row-score">
                        {row.total > 0 ? (
                          <>
                            <span className="pp-row-pct">{pct}%</span>
                            <span className="pp-row-raw">{row.score}/{row.total}</span>
                          </>
                        ) : (
                          <span className="pp-row-raw">Awaiting marking</span>
                        )}
                      </div>
                      {(row.lockedOut || row.screenLeaves > 0) && (
                        <span className="pp-row-flag" title="Left the quiz screen during the paper">
                          {row.lockedOut ? 'Auto-submitted' : `Left the screen ${row.screenLeaves}×`}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {addChildForm}
        </main>
      )}
    </div>
  )
}

export default ParentPortal
