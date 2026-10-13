import { useEffect, useMemo, useState } from 'react'
import { getGroupsForTeacher, onDataChange, isDataReady, preloadGroupStudents } from '../data/store.js'
import { joinGroupByCode, refreshTeacherGroups } from '../data/auth.js'
import ClassDashboard from './ClassDashboard.jsx'
import QuestionInbox from '../components/QuestionInbox.jsx'
import WritingReview from './WritingReview.jsx'

/**
 * What a teacher sees.
 *
 * A teacher is not an administrator: they do not build quizzes, write courses,
 * run the shop or move the term on. They take the groups they have been given a
 * code for - a group being the handful of students in front of them, rather
 * than the whole class around them - and this is those groups: how they are
 * getting on, the writing waiting to be marked, and the questions they have
 * asked.
 *
 * The groups ride in the sign-in token, so the list is re-read from the server
 * on load rather than trusted from the last visit.
 *
 * @param {object} props
 * @param {{id: string, name: string, orgId: string}} props.teacher
 * @param {() => void} props.onLogout
 */
function TeacherHome({ teacher, onLogout }) {
  const [refresh, setRefresh] = useState(0)
  const [ready, setReady] = useState(false)
  const [openGroup, setOpenGroup] = useState(null)
  const [marking, setMarking] = useState(false)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [code, setCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [joinBusy, setJoinBusy] = useState(false)
  const [joined, setJoined] = useState('')

  useEffect(() => onDataChange(() => setRefresh((r) => r + 1)), [])

  // Which groups are theirs, according to the server rather than the token this
  // browser happens to be holding.
  useEffect(() => {
    let alive = true
    refreshTeacherGroups().then((res) => {
      if (!alive) return
      if (res.expired) return onLogout()
      setReady(true)
      setRefresh((r) => r + 1)
    })
    return () => { alive = false }
  }, [])

  const groups = useMemo(
    () => (ready && isDataReady() ? getGroupsForTeacher(teacher.id) : []),
    [teacher.id, ready, refresh])

  // Marking reads whichever students are loaded, so their groups are pulled in
  // first - not the whole school, which the rules would refuse anyway.
  async function openMarking() {
    setLoadingStudents(true)
    await preloadGroupStudents(groups.map((g) => g.id))
    setLoadingStudents(false)
    setMarking(true)
  }

  async function submitCode(e) {
    e.preventDefault()
    const entered = code.trim().toUpperCase()
    if (!entered) return setJoinError('Enter the group code.')
    setJoinBusy(true)
    setJoinError('')
    const res = await joinGroupByCode(entered)
    setJoinBusy(false)
    if (!res.ok) return setJoinError(res.error)
    setCode('')
    setJoined(res.already ? `You already take ${res.groupName}.` : `${res.groupName} is now yours.`)
    setRefresh((r) => r + 1)
  }

  const open = groups.find((g) => g.id === openGroup)
  if (open) {
    // The class dashboard, narrowed to the students in this group.
    return (
      <ClassDashboard
        classId={open.classId}
        orgId={teacher.orgId}
        groupId={open.id}
        onBack={() => setOpenGroup(null)}
      />
    )
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
            <h2 className="td2-h2">Your groups</h2>
            <button className="td2-btn td2-btn-sm" disabled={loadingStudents || !groups.length} onClick={openMarking}>
              {loadingStudents ? 'Loading…' : 'Writing to mark'}
            </button>
          </div>

          {!ready ? (
            <p className="td2-muted">Checking which groups are yours…</p>
          ) : groups.length === 0 ? (
            <p className="td2-muted">
              No groups yet. Enter the code your administrator gave you and the group appears here.
            </p>
          ) : (
            <div className="th-classes">
              {groups.map((group) => (
                <button key={group.id} className="th-class" onClick={() => setOpenGroup(group.id)}>
                  <span className="th-class-name">{group.name}</span>
                  <span className="th-class-meta">
                    {group.className ? `${group.className} · ` : ''}
                    {(group.studentIds || []).length} student{(group.studentIds || []).length === 1 ? '' : 's'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {groups.length > 0 && <QuestionInbox teacher={teacher} />}

        <section className="td2-card">
          <h2 className="td2-h2">Take on a group</h2>
          <p className="td2-muted td2-small" style={{ margin: '6px 0 12px' }}>
            Your administrator gives you a code for each group you take.
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
