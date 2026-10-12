import { useEffect, useMemo, useState } from 'react'
import { loadSubmissionsForStudent } from '../data/firebase.js'

/**
 * What a parent sees.
 *
 * A parent has no account and no record of their own: they proved control of
 * the email their children are registered to, and the children travelled back
 * with the session. So everything here is read from the children's own records,
 * and nothing on this screen writes anything anywhere.
 *
 * @param {object} props
 * @param {{email: string, children: Array<{id: string, name: string}>}} props.session
 * @param {() => void} props.onLogout
 */
function ParentPortal({ session, onLogout }) {
  const children = session.children || []
  const [activeId, setActiveId] = useState(children[0]?.id || null)
  const [records, setRecords] = useState({})
  const [loading, setLoading] = useState(true)

  // Each child's record, read once. A parent reads; nothing here writes, so
  // there is no listener to keep and nothing to put back.
  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all(children.map((child) =>
      loadSubmissionsForStudent(child.id).then((papers) => [child.id, papers])))
      .then((pairs) => {
        if (!alive) return
        setRecords(Object.fromEntries(pairs))
        setLoading(false)
      })
    return () => { alive = false }
  }, [session.email])

  const active = children.find((c) => c.id === activeId) || children[0]

  // Everything they have sat, newest first - papers and revisions together,
  // because a parent is looking at what their child did this week, not at how
  // the site files it.
  const sittings = useMemo(() => (records[activeId] || []).map((paper) => ({
    id: paper.id,
    kind: paper.kind === 'redo' ? 'Revision' : 'Paper',
    title: paper.quizTitle || paper.quizSetId,
    score: Number(paper.score) || 0,
    total: Number(paper.total) || 0,
    date: paper.date || '',
    screenLeaves: Number(paper.screenLeaves) || 0,
    lockedOut: !!paper.lockedOut,
  })), [records, activeId])

  if (!children.length) {
    return (
      <div className="page-center landing-page">
        <h1 className="landing-title">No students found</h1>
        <p className="landing-text">No student is registered to {session.email}.</p>
        <button className="btn landing-btn" onClick={onLogout}>Sign out</button>
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
              onClick={() => setActiveId(child.id)}
            >
              {child.firstName || child.name}
              {child.yearGroup ? <span className="pp-child-year">Year {child.yearGroup}</span> : null}
            </button>
          ))}
        </div>
      )}

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
                <li key={row.id} className="pp-row">
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
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}

export default ParentPortal
