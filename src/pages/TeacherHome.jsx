import { useEffect, useMemo, useState } from 'react'
import { getClassesForTeacher, getClassById, onDataChange, isDataReady } from '../data/store.js'
import { joinClassByCode, refreshTeacherClasses } from '../data/auth.js'
import ClassDashboard from './ClassDashboard.jsx'
import WritingReview from './WritingReview.jsx'

/**
 * What a teacher sees.
 *
 * A teacher is not an administrator: they do not build quizzes, write courses,
 * run the shop or move the term on. They teach the classes they have taken on
 * with a code, and this is those classes - how the students are getting on,
 * the writing waiting to be marked, and the questions the students have asked
 * them.
 *
 * The classes ride in the sign-in token, so the list is re-read from the server
 * on load rather than trusted from the last visit.
 *
 * @param {object} props
 * @param {{id: string, name: string, orgId: string}} props.teacher
 * @param {() => void} props.onLogout
 */
function TeacherHome({ teacher, onLogout }) {
  const [refresh, setRefresh] = useState(0)
  const [ready, setReady] = useState(false)
  const [openClass, setOpenClass] = useState(null)
  const [marking, setMarking] = useState(false)
  const [code, setCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [joinBusy, setJoinBusy] = useState(false)
  const [joined, setJoined] = useState('')

  useEffect(() => onDataChange(() => setRefresh((r) => r + 1)), [])

  // Which classes are theirs, according to the server rather than the token
  // this browser happens to be holding.
  useEffect(() => {
    let alive = true
    refreshTeacherClasses().then((res) => {
      if (!alive) return
      if (res.expired) return onLogout()
      setReady(true)
      setRefresh((r) => r + 1)
    })
    return () => { alive = false }
  }, [])

  const classes = useMemo(
    () => (ready && isDataReady() ? getClassesForTeacher(teacher.id) : []),
    [teacher.id, ready, refresh])

  async function submitCode(e) {
    e.preventDefault()
    const entered = code.trim().toUpperCase()
    if (!entered) return setJoinError('Enter the class code.')
    setJoinBusy(true)
    setJoinError('')
    const res = await joinClassByCode(entered)
    setJoinBusy(false)
    if (!res.ok) return setJoinError(res.error)
    setCode('')
    setJoined(res.already ? `You already teach ${res.className}.` : `${res.className} is now yours.`)
    setRefresh((r) => r + 1)
  }

  if (openClass && getClassById(openClass)) {
    return <ClassDashboard classId={openClass} orgId={teacher.orgId} onBack={() => setOpenClass(null)} />
  }

  if (marking) {
    return <WritingReview orgId={teacher.orgId} teacherId={teacher.id} onBack={() => setMarking(false)} />
  }

  return (
    <div className="th-page">
      <header className="td2-topbar">
        <div className="td2-brand">
          <img src="/avant-logo.png" alt="" className="th-logo" />
          <span className="td2-org-name" style={{ cursor: 'default' }}>Teacher</span>
        </div>
        <div className="td2-profile">
          <span className="td2-avatar" title={`Signed in as ${teacher.name}`}>
            {String(teacher.name || '?').slice(0, 1).toUpperCase()}
          </span>
          <button className="td2-btn-ghost td2-btn-sm" onClick={onLogout}>Log out</button>
        </div>
      </header>

      <main className="td2-main">
        <div className="td2-greeting">
          <h1 className="td2-hello">Hey, {teacher.name}!</h1>
        </div>

        <section className="td2-card">
          <div className="td2-card-head">
            <h2 className="td2-h2">Your classes</h2>
            <button className="td2-btn td2-btn-sm" onClick={() => setMarking(true)}>Writing to mark</button>
          </div>

          {!ready ? (
            <p className="td2-muted">Checking which classes are yours…</p>
          ) : classes.length === 0 ? (
            <p className="td2-muted">
              No classes yet. Enter the code your administrator gave you and the class appears here.
            </p>
          ) : (
            <div className="th-classes">
              {classes.map((cls) => (
                <button key={cls.id} className="th-class" onClick={() => setOpenClass(cls.id)}>
                  <span className="th-class-name">{cls.name}</span>
                  <span className="th-class-meta">
                    {cls.yearGroup ? `${cls.yearGroup} · ` : ''}
                    {(cls.studentIds || []).length} student{(cls.studentIds || []).length === 1 ? '' : 's'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="td2-card">
          <h2 className="td2-h2">Take on a class</h2>
          <p className="td2-muted td2-small" style={{ margin: '6px 0 12px' }}>
            Your administrator gives you a code for each class you teach.
          </p>
          <form className="th-join" onSubmit={submitCode}>
            <input
              className="td2-input th-code"
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase().slice(0, 6)); setJoinError(''); setJoined('') }}
              placeholder="ABC234"
              autoComplete="off"
              spellCheck="false"
            />
            <button className="td2-btn" type="submit" disabled={joinBusy}>{joinBusy ? 'Joining…' : 'Join'}</button>
          </form>
          {joinError && <p className="th-join-error">{joinError}</p>}
          {joined && <p className="th-join-ok">{joined}</p>}
        </section>
      </main>
    </div>
  )
}

export default TeacherHome
