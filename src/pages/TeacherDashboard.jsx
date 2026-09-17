import { useState, useMemo, useEffect } from 'react'
import ShopAdmin from './ShopAdmin.jsx'
import ReportPage from './ReportPage.jsx'
import QuizBuilder from './QuizBuilder.jsx'
import CourseBuilder from './CourseBuilder.jsx'
import WritingReview from './WritingReview.jsx'
import NotificationsPanel from './NotificationsPanel.jsx'
import AddStudentForm from '../components/AddStudentForm.jsx'
import { authedFetch } from '../data/auth.js'
import { refreshSharedData } from '../data/firebase.js'

const FUNCTIONS_BASE = 'https://australia-southeast1-cleverspacev2.cloudfunctions.net'
import NewsfeedManager from './NewsfeedManager.jsx'
import ClassDashboard from './ClassDashboard.jsx'
import AdminTeacherPanel from '../components/AdminTeacherPanel.jsx'
import '../teacher-dashboard.css'
import { uploadImage } from '../data/imageStore.js'
import '../teacher-fonts.css'
import {
  createOrganisation,
  getOrganisation,
  createStudent,
  deleteStudent,
  archiveStudent,
  unarchiveStudent,
  createClass,
  updateClass,
  deleteClass,
  getClassesForOrg,
  getStudentsInOrg,
  getStudentById,
  updateStudent,
  setCoinsBalance,
  assignStudentToClass,
  removeStudentFromClass,
  findStudentInOrgByName,
  addScore,
  updateScore,
  deleteScore,
  createTestEvent,
  getTestEventsForClass,
  updateTestEvent,
  deleteTestEvent,
  getPurchasesForOrg,
  setPurchaseStatus,
  getAllTeachers,
  deleteTeacher,
  getFirstOrg,
  approveStudent,
  getScoresForTestEvent,
  updateOrganisationName,
  updateOrganisation,
  getActiveTerm,
  snapshotLeaderboards,
  setBattlegroundsApproval,
  onDataChange,
  fullName,
  backfillQuestionIds,
  moveEmbeddedImagesToStorage,
  preloadAllStudents,
  getRecentLockouts,
  getStudentsMissingParentEmail,
  loadContacts,
  getAllStudentReports,
  resolveQuestionReport,
  resolveExplanationReport,
  getImportedQuizSet,
} from '../data/store.js'

const REPORT_LABELS = {
  wrong_answer: '❌ Answer is wrong', typo: '✏️ Spelling or typo', image: '🖼️ Picture problem', options: '🔢 Options broken',
  unclear: "🤔 Doesn't make sense", incorrect: '❌ Explanation wrong', confusing: '🤔 Explanation confusing',
  video: '🎬 Video problem', offensive: '🚫 Inappropriate', other: '💬 Other',
}
const REPORT_SOURCES = { quiz: 'during quiz', review: 'in review', dojo: 'Revision Hall', revision: 'daily revision' }

function reportQuestion(r) {
  const set = getImportedQuizSet(r.quizSetId)
  if (!set) return { set: null, index: r.questionIndex, question: null }
  let index = r.questionId ? set.questions.findIndex((q) => q.id === r.questionId) : -1
  if (index === -1) index = r.questionIndex
  return { set, index, question: set.questions[index] || null }
}

function TeacherDashboard({ teacher, isAdmin, onLogout }) {
  const [refresh, setRefresh] = useState(0)
  const forceRefresh = () => setRefresh((r) => r + 1)

  useEffect(() => {
    const unsub = onDataChange(() => setRefresh(r => r + 1))
    // Safety net behind the live listeners: new sign-ups, orders and reports
    // show up on their own even if a listener drops (sleeping laptop, flaky
    // network) - this dashboard is often left open all day.
    const poll = setInterval(() => { refreshSharedData() }, 45000)
    return () => { unsub(); clearInterval(poll) }
  }, [])

  // One-off: give permanent ids to questions saved before ids existed.
  useEffect(() => {
    backfillQuestionIds()
    // One-off: embedded course/class/logo pictures were filling the shared records.
    moveEmbeddedImagesToStorage().then((n) => { if (n) forceRefresh() })
  }, [])

  // Student reports live in each student's document; load them all once.
  const [reportsLoaded, setReportsLoaded] = useState(false)
  const [showResolvedReports, setShowResolvedReports] = useState(false)
  useEffect(() => {
    let alive = true
    // Parent contacts are teacher-only and load separately; both must be in
    // before the attention panel counts lockouts and missing contacts.
    Promise.all([loadContacts(), preloadAllStudents()]).finally(() => { if (alive) { setReportsLoaded(true); setRefresh((r) => r + 1) } })
    return () => { alive = false }
  }, [])

  const org = teacher.orgId ? getOrganisation(teacher.orgId) : (isAdmin ? getFirstOrg() : null)
  const classes = org ? getClassesForOrg(org.id) : []
  const students = org ? getStudentsInOrg(org.id) : []

  // State
  const [orgName, setOrgName] = useState('')
  const [className, setClassName] = useState('')
  const [classYear, setClassYear] = useState('')
  const [activeClass, setActiveClass] = useState(null)
  const [classSort, setClassSort] = useState({ key: 'name', asc: true })
  const [studentName, setStudentName] = useState('')
  const [addError, setAddError] = useState('')
  const [newStudentName, setNewStudentName] = useState('')
  const [createStudentError, setCreateStudentError] = useState('')
  const [editingStudent, setEditingStudent] = useState(null)
  const [editStudentName, setEditStudentName] = useState('')
  const [editTokens, setEditTokens] = useState('')
  const [editCoins, setEditCoins] = useState('')
  const [editingScoreId, setEditingScoreId] = useState(null)
  const [editScoreValue, setEditScoreValue] = useState('')
  const [manualScoreValue, setManualScoreValue] = useState('')
  const [manualScoreEvent, setManualScoreEvent] = useState('')
  const [newEventName, setNewEventName] = useState('')
  const [newEventTotal, setNewEventTotal] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [showShopAdmin, setShowShopAdmin] = useState(false)
  const [showQuizBuilder, setShowQuizBuilder] = useState(false)
  const [showCourseBuilder, setShowCourseBuilder] = useState(false)
  const [showWritingReview, setShowWritingReview] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [addingStudent, setAddingStudent] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [showNewsfeed, setShowNewsfeed] = useState(false)
  const [showClassDashboard, setShowClassDashboard] = useState(null)
  const [editQuizId, setEditQuizId] = useState(null)
  const [viewEventId, setViewEventId] = useState(null)
  const [eventScoreEdits, setEventScoreEdits] = useState({})
  const [newEventTerm, setNewEventTerm] = useState('')
  const [newEventWeek, setNewEventWeek] = useState('W1')

  // Report database
  const [editingOrgName, setEditingOrgName] = useState(false)
  const [editOrgNameValue, setEditOrgNameValue] = useState('')
  const [reportSearch, setReportSearch] = useState('')
  const [reportViewStudent, setReportViewStudent] = useState(null)
  const [studentRollTab, setStudentRollTab] = useState('active')
  const [termSwitchStep, setTermSwitchStep] = useState(null)
  const [menuFor, setMenuFor] = useState(null)
  const [rollSearch, setRollSearch] = useState('')


  // --- Handlers ---
  function requestConfirm(message, onConfirm, confirmLabel) { setConfirmAction({ message, onConfirm, confirmLabel }) }
  function handleConfirm() { if (confirmAction) confirmAction.onConfirm(); setConfirmAction(null) }

  function openStudentProfile(studentId) {
    const s = getStudentById(studentId)
    if (!s) return
    setEditingStudent(studentId)
    setEditStudentName(s.name)
    setEditTokens(String(s.tokens))
    setEditCoins(String(s.coins))
    setEditingScoreId(null)
    setManualScoreValue('')
    setManualScoreEvent('')
  }

  function handleSaveName() { if (!editingStudent) return; updateStudent(editingStudent, { name: editStudentName.trim() }); forceRefresh() }
  function handleSaveTokens() { if (!editingStudent) return; updateStudent(editingStudent, { tokens: parseInt(editTokens, 10) || 0 }); forceRefresh() }
  function handleSaveCoins() { if (!editingStudent) return; setCoinsBalance(editingStudent, parseInt(editCoins, 10) || 0); forceRefresh() }

  function handleManualScore() {
    if (!editingStudent || !activeClass) return
    const value = parseInt(manualScoreValue, 10)
    if (isNaN(value) || value <= 0) return
    if (manualScoreEvent) {
      const ev = testEvents.find((e) => e.id === manualScoreEvent)
      if (ev && ev.totalMarks && value > ev.totalMarks) return
    }
    addScore(editingStudent, activeClass, value, manualScoreEvent || null)
    setManualScoreValue('')
    setManualScoreEvent('')
    forceRefresh()
  }

  function startEditScore(score) { setEditingScoreId(score.id); setEditScoreValue(String(score.value)) }
  function handleSaveScore() { if (!editingScoreId) return; updateScore(editingScoreId, { value: parseInt(editScoreValue, 10) || 0 }); setEditingScoreId(null); forceRefresh() }

  function handleCreateEvent(e) {
    e.preventDefault()
    if (!newEventName.trim() || !activeClass || !newEventTotal) return
    const activeTerm = org ? getActiveTerm(org.id) : 'T1'
    createTestEvent(activeClass, newEventName.trim(), parseInt(newEventTotal, 10), newEventTerm || activeTerm, newEventWeek)
    setNewEventName('')
    setNewEventTotal('')
    setNewEventTerm('')
    setNewEventWeek('W1')
    forceRefresh()
  }
  function handleCreateOrg(e) { e.preventDefault(); if (!orgName.trim()) return; const newOrg = createOrganisation(orgName.trim(), teacher.id); teacher.orgId = newOrg.id; setOrgName(''); forceRefresh() }
  function handleCreateClass(e) { e.preventDefault(); if (!className.trim() || !org) return; createClass(className.trim(), org.id, teacher.id, classYear.trim()); setClassName(''); setClassYear(''); forceRefresh() }
  function toggleClassSort(key) { setClassSort((prev) => prev.key === key ? { key, asc: !prev.asc } : { key, asc: true }) }

  function handleCreateStudent(e) {
    e.preventDefault()
    const name = newStudentName.trim()
    if (!name || !org) return
    const duplicate = students.find((s) => s.name.toLowerCase() === name.toLowerCase() || fullName(s).toLowerCase() === name.toLowerCase())
    if (duplicate) { setCreateStudentError(`"${fullName(duplicate)}" already exists (${duplicate.id}). Add anyway?`); return }
    createStudent(name, org.id)
    setNewStudentName('')
    setCreateStudentError('')
    forceRefresh()
  }

  /**
   * Deletion reaches the parts the browser cannot: the password record, the
   * sign-in account and the per-quiz stats that feed other students'
   * percentiles. Archiving is the reversible option and keeps all of it.
   */
  async function removeStudentEverywhere(studentId) {
    setDeleteBusy(true)
    try {
      const res = await authedFetch(`${FUNCTIONS_BASE}/teacherStudents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', studentId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) {
        // Fall back to the local delete so the teacher is never stuck.
        deleteStudent(studentId)
      }
    } catch {
      deleteStudent(studentId)
    }
    setDeleteBusy(false)
    forceRefresh()
  }

  function handleForceCreateStudent() { const name = newStudentName.trim(); if (!name || !org) return; createStudent(name, org.id); setNewStudentName(''); setCreateStudentError(''); forceRefresh() }

  function handleAddStudent(e) {
    e.preventDefault()
    if (!studentName.trim() || !activeClass) return
    const student = findStudentInOrgByName(org.id, studentName.trim())
    if (!student) { setAddError('Student not found in your org.'); return }
    assignStudentToClass(activeClass, student.id)
    setStudentName('')
    setAddError('')
    forceRefresh()
  }

  function handleRemove(classId, studentId) { removeStudentFromClass(classId, studentId); forceRefresh() }


  // Computed
  const orgPurchases = org ? getPurchasesForOrg(org.id) : []
  const pendingOrders = orgPurchases.filter((p) => !p.status || p.status === 'pending')
  const onHoldOrders = orgPurchases.filter((p) => p.status === 'on-hold')
  const fulfilledOrders = orgPurchases.filter((p) => p.status === 'fulfilled')
  const cancelledOrders = orgPurchases.filter((p) => p.status === 'cancelled')
  const activeTerm = org ? getActiveTerm(org.id) : 'T1'
  const testEvents = activeClass ? getTestEventsForClass(activeClass).filter((e) => !e.term || e.term === activeTerm) : []
  const activeStudents = students.filter((s) => !s.archived && s.approved !== false)
  const archivedStudents = students.filter((s) => s.archived)
  const pendingApprovalStudents = students.filter((s) => !s.archived && s.approved === false)
  const activeClassData = classes.find((c) => c.id === activeClass)
  const activeClassStudents = activeClassData ? activeClassData.studentIds.map((sid) => students.find((s) => s.id === sid)).filter(s => s && !s.archived) : []
  const unassignedToActiveClass = activeClassData ? activeStudents.filter((s) => !activeClassData.studentIds.includes(s.id)) : []
  const allAssignedIds = new Set(classes.flatMap((cls) => cls.studentIds))
  const unassignedStudents = activeStudents.filter((s) => !allAssignedIds.has(s.id))


  // Report search
  const reportResults = reportSearch.trim()
    ? students.filter((s) => fullName(s).toLowerCase().includes(reportSearch.toLowerCase()))
    : []

  // --- RENDER ---
  if (reportViewStudent) return <ReportPage studentId={reportViewStudent} onBack={() => setReportViewStudent(null)} />
  if (showCourseBuilder && org) return <CourseBuilder orgId={org.id} onBack={() => setShowCourseBuilder(false)} onEditQuiz={(quizSetId) => { setShowCourseBuilder(false); setEditQuizId(quizSetId); setShowQuizBuilder(true) }} />
  if (showQuizBuilder && org) return <QuizBuilder orgId={org.id} onBack={() => { setShowQuizBuilder(false); setEditQuizId(null) }} initialEditQuizId={editQuizId} onSave={editQuizId ? () => { setShowQuizBuilder(false); setEditQuizId(null); setShowCourseBuilder(true) } : undefined} />
  if (showWritingReview && org) return <WritingReview orgId={org.id} teacherId={teacher.id} onBack={() => setShowWritingReview(false)} />
  if (showNotifications && org) return <NotificationsPanel orgId={org.id} onBack={() => setShowNotifications(false)} />
  if (showNewsfeed && org) return <NewsfeedManager orgId={org.id} onBack={() => setShowNewsfeed(false)} />
  if (showShopAdmin && org) return <ShopAdmin orgId={org.id} onBack={() => setShowShopAdmin(false)} />
  if (showClassDashboard && org) return <ClassDashboard classId={showClassDashboard} orgId={org.id} onBack={() => setShowClassDashboard(null)} />

  const navItems = [
    ['Courses', () => setShowCourseBuilder(true)],
    ['Quizzes', () => setShowQuizBuilder(true)],
    ['Writing Review', () => setShowWritingReview(true)],
    ['Notifications', () => setShowNotifications(true)],
    ['Newsfeed', () => setShowNewsfeed(true)],
    ['Shop', () => setShowShopAdmin(true)],
  ]
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const studentClasses = (sid) => classes.filter((c) => c.studentIds.includes(sid))
  const rollList = (studentRollTab === 'archived' ? archivedStudents : studentRollTab === 'pending' ? pendingApprovalStudents : activeStudents)
    .filter((s) => !rollSearch.trim() || fullName(s).toLowerCase().includes(rollSearch.trim().toLowerCase()))
  const sortedClasses = [...classes].sort((a, b) => {
    const dir = classSort.asc ? 1 : -1
    if (classSort.key === 'yearGroup') return dir * (a.yearGroup || '').localeCompare(b.yearGroup || '')
    if (classSort.key === 'students') return dir * (a.studentIds.length - b.studentIds.length)
    return dir * a.name.localeCompare(b.name)
  })
  // Integrity and contact gaps (both need every student document preloaded).
  const lockouts = reportsLoaded ? getRecentLockouts(org?.id, 7) : []
  const missingParentEmail = reportsLoaded ? getStudentsMissingParentEmail(org?.id) : []
  const attentionCount = pendingApprovalStudents.length + pendingOrders.length + onHoldOrders.length + lockouts.length + (missingParentEmail.length ? 1 : 0)
  const allReports = org ? getAllStudentReports(org.id) : []
  const openReports = allReports.filter((r) => !r.resolved)
  const shownReports = showResolvedReports ? allReports : openReports

  function pickImage(onData) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (ev) => {
      const file = ev.target.files[0]
      if (!file) return
      // Stored as a link, not embedded: embedded pictures filled the shared record.
      uploadImage(file).then(onData).catch((e) => alert(`Image upload failed: ${e.message}`))
    }
    input.click()
  }

  return (
    <div className="td2">
      {/* Top bar */}
      <header className="td2-topbar">
        <div className="td2-brand">
          {org && (
            <div className="td2-logo" style={{ backgroundImage: `url(${org.logo || '/logo.svg'})` }} title="Change logo"
              onClick={() => pickImage((data) => { updateOrganisation(org.id, { logo: data }); forceRefresh() })} />
          )}
          {org && (editingOrgName ? (
            <form onSubmit={(e) => { e.preventDefault(); if (editOrgNameValue.trim()) { updateOrganisationName(org.id, editOrgNameValue.trim()); forceRefresh() } setEditingOrgName(false) }}>
              <input value={editOrgNameValue} onChange={(e) => setEditOrgNameValue(e.target.value)} className="td2-input" autoFocus
                onBlur={() => { if (editOrgNameValue.trim()) { updateOrganisationName(org.id, editOrgNameValue.trim()); forceRefresh() } setEditingOrgName(false) }} />
            </form>
          ) : (
            <button className="td2-org-name" onClick={() => { setEditOrgNameValue(org.name); setEditingOrgName(true) }} title="Rename organisation">{org.name}</button>
          ))}
        </div>
        {org && (
          <nav className="td2-nav">
            {navItems.map(([label, go]) => <button key={label} className="td2-nav-link" onClick={go}>{label}</button>)}
          </nav>
        )}
        <div className="td2-profile">
          <span className="td2-avatar" title={`Signed in as ${teacher.name}`}>{teacher.name.slice(0, 1).toUpperCase()}</span>
          <button className="td2-btn-ghost td2-btn-sm" onClick={() => requestConfirm('Are you sure you want to log out?', onLogout, 'Log Out')}>Log out</button>
        </div>
      </header>

      <main className="td2-main">
        <div className="td2-greeting">
          <h1 className="td2-hello">Hey, {teacher.name}!</h1>
          {org && (
            <div className="td2-term">
              <span className="td2-term-label" title="Controls what students and parents see">Term</span>
              <div className="td2-segment">
                {['T1', 'T2', 'T3', 'T4'].map((t) => (
                  <button key={t} className={`td2-segment-btn ${activeTerm === t ? 'is-active' : ''}`} disabled={activeTerm === t}
                    onClick={() => setTermSwitchStep({ target: t, step: 1 })}>{t}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Create Org */}
        {!org && (
          <section className="td2-card">
            <h2 className="td2-h2">Create organisation</h2>
            <p className="td2-muted">Get a code for students to join.</p>
            <form onSubmit={handleCreateOrg} className="td2-row">
              <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Organisation name" className="td2-input td2-grow" />
              <button type="submit" className="td2-btn">Create</button>
            </form>
          </section>
        )}

        {org && (
          <>
            {/* Stats */}
            <div className="td2-stats">
              {[
                ['Classes', classes.length, 'td2-classes'],
                ['Students', activeStudents.length, 'td2-students'],
                ['Pending sign-ups', pendingApprovalStudents.length, 'td2-attention'],
                ['Shop orders', pendingOrders.length, 'td2-attention'],
                ['Question reports', openReports.length, 'td2-reports'],
              ].map(([label, val, target]) => (
                <button key={label} className={`td2-stat ${label !== 'Classes' && label !== 'Students' && val > 0 ? 'is-alert' : ''}`} onClick={() => scrollTo(target)}>
                  <span className="td2-stat-val">{val}</span>
                  <span className="td2-stat-lbl">{label}</span>
                </button>
              ))}
            </div>

            <div className="td2-grid">
              {/* Classes */}
              <section className="td2-card" id="td2-classes">
                <div className="td2-card-head">
                  <h2 className="td2-h2">Classes</h2>
                  <select className="td2-select" value={`${classSort.key}:${classSort.asc}`} onChange={(e) => { const [key, asc] = e.target.value.split(':'); setClassSort({ key, asc: asc === 'true' }) }}>
                    <option value="name:true">Name A–Z</option>
                    <option value="name:false">Name Z–A</option>
                    <option value="yearGroup:true">Year group</option>
                    <option value="students:false">Most students</option>
                  </select>
                </div>
                <form onSubmit={handleCreateClass} className="td2-row">
                  <input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="New class name" className="td2-input td2-grow" />
                  <input value={classYear} onChange={(e) => setClassYear(e.target.value)} placeholder="Year" className="td2-input td2-input-sm" />
                  <button type="submit" className="td2-btn">Add class</button>
                </form>
                {classes.length === 0 ? (
                  <p className="td2-empty">No classes yet — add one above.</p>
                ) : (
                  <div className="td2-class-grid">
                    {sortedClasses.map((cls) => {
                      const activeInClass = cls.studentIds.filter((id) => activeStudents.some((s) => s.id === id)).length
                      const evCount = getTestEventsForClass(cls.id).length
                      return (
                        <div key={cls.id} className={`td2-class ${activeClass === cls.id ? 'is-open' : ''}`}>
                          <div className="td2-class-img" style={cls.image ? { backgroundImage: `url(${cls.image})` } : {}} />
                          <div className="td2-class-body">
                            <div className="td2-class-name">{cls.name}</div>
                            <div className="td2-class-meta">
                              {cls.yearGroup ? `Year ${cls.yearGroup} · ` : ''}{activeInClass} student{activeInClass !== 1 ? 's' : ''} · {evCount} event{evCount !== 1 ? 's' : ''}
                            </div>
                            <div className="td2-class-actions">
                              <button className="td2-btn td2-btn-sm" onClick={() => setShowClassDashboard(cls.id)}>Open dashboard</button>
                              <button className="td2-btn-ghost td2-btn-sm" onClick={() => { const opening = activeClass !== cls.id; setActiveClass(opening ? cls.id : null); if (opening) setTimeout(() => scrollTo('td2-class-manage'), 50) }}>{activeClass === cls.id ? 'Close' : 'Manage'}</button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              {addingStudent && org && (
        <AddStudentForm
          orgId={org.id}
          onClose={() => setAddingStudent(false)}
          onCreated={() => { setAddingStudent(false); forceRefresh() }}
        />
      )}

      {/* Needs attention */}
              <section className="td2-card" id="td2-attention">
                <div className="td2-card-head">
                  <h2 className="td2-h2">Needs attention</h2>
                  {attentionCount > 0 && <span className="td2-badge">{attentionCount}</span>}
                </div>
                {attentionCount === 0 && <p className="td2-empty">All clear — nothing waiting on you.</p>}

                {pendingApprovalStudents.length > 0 && (
                  <div className="td2-group">
                    <div className="td2-group-title">Sign-ups to approve</div>
                    {pendingApprovalStudents.map((s) => (
                      <div key={s.id} className="td2-item">
                        <span className="td2-grow td2-strong">{fullName(s)}</span>
                        <button className="td2-btn td2-btn-sm" onClick={() => { approveStudent(s.id); forceRefresh() }}>Approve</button>
                        <button className="td2-btn-danger td2-btn-sm" onClick={() => requestConfirm(`Reject "${fullName(s)}"? This will delete their account.`, () => { deleteStudent(s.id); forceRefresh() }, 'Reject')}>Reject</button>
                      </div>
                    ))}
                  </div>
                )}

                {lockouts.length > 0 && (
                  <div className="td2-group">
                    <div className="td2-group-title">Auto-submitted this week</div>
                    {lockouts.slice(0, 8).map((l) => (
                      <div key={l.id} className="td2-item">
                        <div className="td2-grow">
                          <div><span className="td2-strong">{l.studentName}</span> · {l.title}</div>
                          <div className="td2-muted td2-small">Left the quiz screen {l.screenLeaves} times · scored {l.score}/{l.total} · {new Date(l.date).toLocaleDateString()}</div>
                        </div>
                        <button className="td2-btn td2-btn-sm" onClick={() => setReportViewStudent(l.studentId)}>View report</button>
                      </div>
                    ))}
                    {lockouts.length > 8 && <div className="td2-muted td2-small">+{lockouts.length - 8} more</div>}
                  </div>
                )}

                {missingParentEmail.length > 0 && (
                  <div className="td2-group">
                    <div className="td2-group-title">Parents we can't reach</div>
                    <div className="td2-item">
                      <span className="td2-grow">
                        <span className="td2-strong">{missingParentEmail.length} student{missingParentEmail.length === 1 ? ' has' : 's have'} no parent email</span>
                        <span className="td2-muted td2-small"> — reports and alerts can't be sent: {missingParentEmail.slice(0, 5).map((s) => s.name).join(', ')}{missingParentEmail.length > 5 ? '…' : ''}</span>
                      </span>
                      <button className="td2-btn td2-btn-sm" onClick={() => setShowNotifications(true)}>Add contacts</button>
                    </div>
                  </div>
                )}

                {pendingOrders.length > 0 && (
                  <div className="td2-group">
                    <div className="td2-group-title">Shop orders</div>
                    {pendingOrders.map((order) => {
                      const s = students.find((st) => st.id === order.studentId)
                      return (
                        <div key={order.id} className="td2-item">
                          <div className="td2-grow">
                            <div><span className="td2-strong">{s ? fullName(s) : order.studentId}</span> · {order.itemName} <span className="td2-coin">{order.price}c</span></div>
                            <div className="td2-muted td2-small">{new Date(order.date).toLocaleString()}</div>
                          </div>
                          <button className="td2-btn td2-btn-sm" onClick={() => { setPurchaseStatus(order.id, 'fulfilled'); forceRefresh() }}>Fulfil</button>
                          <button className="td2-btn-ghost td2-btn-sm" onClick={() => { setPurchaseStatus(order.id, 'on-hold'); forceRefresh() }}>Hold</button>
                          <button className="td2-btn-danger td2-btn-sm" onClick={() => { setPurchaseStatus(order.id, 'cancelled'); forceRefresh() }}>Cancel</button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {onHoldOrders.length > 0 && (
                  <div className="td2-group">
                    <div className="td2-group-title">Orders on hold</div>
                    {onHoldOrders.map((order) => {
                      const s = students.find((st) => st.id === order.studentId)
                      return (
                        <div key={order.id} className="td2-item">
                          <span className="td2-grow"><span className="td2-strong">{s ? fullName(s) : order.studentId}</span> · {order.itemName} <span className="td2-coin">{order.price}c</span></span>
                          <button className="td2-btn td2-btn-sm" onClick={() => { setPurchaseStatus(order.id, 'fulfilled'); forceRefresh() }}>Fulfil</button>
                          <button className="td2-btn-ghost td2-btn-sm" onClick={() => { setPurchaseStatus(order.id, 'pending'); forceRefresh() }}>Back</button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {(fulfilledOrders.length > 0 || cancelledOrders.length > 0) && (
                  <details className="td2-details">
                    <summary>Order history ({fulfilledOrders.length + cancelledOrders.length})</summary>
                    {[...fulfilledOrders, ...cancelledOrders].map((order) => {
                      const s = students.find((st) => st.id === order.studentId)
                      return (
                        <div key={order.id} className="td2-item td2-item-done">
                          <span className="td2-grow">{s ? fullName(s) : order.studentId} · {order.itemName} <span className="td2-muted td2-small">({order.status})</span></span>
                          <button className="td2-btn-ghost td2-btn-sm" onClick={() => { setPurchaseStatus(order.id, 'pending'); forceRefresh() }}>Reopen</button>
                        </div>
                      )
                    })}
                  </details>
                )}
              </section>
            </div>

            {/* Student error reports */}
            <section className="td2-card" id="td2-reports">
              <div className="td2-card-head td2-wrap">
                <div className="td2-row td2-row-tight">
                  <h2 className="td2-h2">Question reports</h2>
                  {openReports.length > 0 && <span className="td2-badge">{openReports.length} unresolved</span>}
                </div>
                {allReports.length > openReports.length && (
                  <button className="td2-btn-ghost td2-btn-sm" onClick={() => setShowResolvedReports((v) => !v)}>
                    {showResolvedReports ? 'Hide resolved' : `Show resolved (${allReports.length - openReports.length})`}
                  </button>
                )}
              </div>
              {!reportsLoaded ? (
                <p className="td2-empty">Loading reports…</p>
              ) : shownReports.length === 0 ? (
                <p className="td2-empty">No problems reported — questions look good. ✅</p>
              ) : (
                <div className="td2-reports">
                  {shownReports.map((r) => {
                    const { set, index, question } = reportQuestion(r)
                    const student = students.find((s) => s.id === r.studentId)
                    const snippet = (question?.prompt || question?.text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
                    const optionText = r.option != null && question?.options?.[r.option] != null
                      ? `${String.fromCharCode(65 + r.option)}: ${String(question.options[r.option]).replace(/<[^>]*>/g, '').trim() || '(blank)'}`
                      : null
                    return (
                      <div key={r.id} className={`td2-report${r.resolved ? ' is-resolved' : ''}`}>
                        <div className="td2-report-main">
                          <div className="td2-report-top">
                            <span className="td2-report-type">{REPORT_LABELS[r.errorType] || r.errorType}</span>
                            {r.kind === 'explanation' && <span className="td2-chip">Explanation</span>}
                            <span className="td2-muted td2-small">
                              {set ? (set.friendlyTitle || set.rawTitle) : 'Unknown quiz'} · Q{(index ?? 0) + 1}
                              {r.source ? ` · ${REPORT_SOURCES[r.source] || r.source}` : ''}
                            </span>
                          </div>
                          {snippet && <div className="td2-report-q">“{snippet.length > 160 ? snippet.slice(0, 160) + '…' : snippet}”</div>}
                          {optionText && <div className="td2-small"><span className="td2-muted">Option flagged:</span> {optionText}</div>}
                          {r.details && <div className="td2-report-note">{r.details}</div>}
                          <div className="td2-muted td2-small">{student ? fullName(student) : 'A student'} · {new Date(r.date).toLocaleString()}</div>
                        </div>
                        <div className="td2-report-actions">
                          {set && <button className="td2-btn-ghost td2-btn-sm" onClick={() => { setEditQuizId(set.id); setShowQuizBuilder(true) }}>Open quiz</button>}
                          {r.resolved ? (
                            <span className="td2-muted td2-small">Resolved</span>
                          ) : (
                            <button className="td2-btn td2-btn-sm" onClick={() => {
                              if (r.kind === 'question') resolveQuestionReport(r.id, r.studentId)
                              else resolveExplanationReport(r.id, r.studentId)
                              forceRefresh()
                            }}>Mark resolved</button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Expanded class management */}
            {activeClassData && (
              <section className="td2-card td2-anchor" id="td2-class-manage">
                <div className="td2-card-head">
                  <div className="td2-row td2-row-tight">
                    <div className="td2-class-thumb" style={activeClassData.image ? { backgroundImage: `url(${activeClassData.image})` } : {}} title="Change class image"
                      onClick={() => pickImage((data) => { updateClass(activeClass, { image: data }); forceRefresh() })}>
                      {!activeClassData.image && '+'}
                    </div>
                    <div>
                      <h2 className="td2-h2">{activeClassData.name}</h2>
                      {activeClassData.yearGroup && <div className="td2-muted td2-small">Year {activeClassData.yearGroup}</div>}
                    </div>
                  </div>
                  <div className="td2-row td2-row-tight">
                    <button className="td2-btn-danger td2-btn-sm" onClick={() => requestConfirm(`Delete class "${activeClassData.name}"?`, () => { const id = activeClass; setActiveClass(null); deleteClass(id); forceRefresh() })}>Delete class</button>
                    <button className="td2-btn-ghost td2-btn-sm" onClick={() => setActiveClass(null)}>Close</button>
                  </div>
                </div>

                <div className="td2-split">
                  <div>
                    <div className="td2-group-title">Class roll ({activeClassStudents.length})</div>
                    <div className="td2-search-wrap">
                      <input value={studentName} onChange={(e) => { setStudentName(e.target.value); setAddError('') }} placeholder="Search a student to add…" className="td2-input td2-full" />
                      {studentName.trim() && (() => {
                        const matches = unassignedToActiveClass.filter((s) => fullName(s).toLowerCase().includes(studentName.trim().toLowerCase()))
                        return (
                          <div className="td2-dropdown">
                            {matches.length === 0 ? <div className="td2-dropdown-empty">No matching students</div> : matches.map((s) => (
                              <button key={s.id} className="td2-dropdown-item" onClick={() => { assignStudentToClass(activeClass, s.id); setStudentName(''); setAddError(''); forceRefresh() }}>
                                <span className="td2-strong">{fullName(s)}</span>
                                <span className="td2-muted td2-small">{s.coins}c · {s.tokens}t</span>
                              </button>
                            ))}
                          </div>
                        )
                      })()}
                    </div>
                    {addError && <p className="td2-error">{addError}</p>}
                    {activeClassStudents.length === 0 ? <p className="td2-empty">No students in this class.</p> : activeClassStudents.map((s, i) => (
                      <div key={s.id} className="td2-item">
                        <span className="td2-muted td2-num">{i + 1}</span>
                        <span className="td2-grow td2-strong">{fullName(s)}</span>
                        <span className="td2-muted td2-small">{s.coins}c · {s.tokens}t</span>
                        <button className="td2-btn-ghost td2-btn-sm" onClick={() => requestConfirm(`Remove "${fullName(s)}" from class?`, () => handleRemove(activeClass, s.id), 'Remove')}>Remove</button>
                      </div>
                    ))}
                  </div>

                  <div>
                    <div className="td2-group-title">Test events · {activeTerm}</div>
                    <form onSubmit={handleCreateEvent} className="td2-row td2-wrap">
                      <input value={newEventName} onChange={(e) => setNewEventName(e.target.value)} placeholder="Event name" className="td2-input td2-grow" />
                      <input value={newEventTotal} onChange={(e) => setNewEventTotal(e.target.value)} placeholder="Marks" type="number" min="1" className="td2-input td2-input-sm" />
                      <select value={newEventTerm || activeTerm} onChange={(e) => setNewEventTerm(e.target.value)} className="td2-select">
                        {['T1', 'T2', 'T3', 'T4'].map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <select value={newEventWeek} onChange={(e) => setNewEventWeek(e.target.value)} className="td2-select">
                        {Array.from({ length: 10 }, (_, i) => <option key={i} value={`W${i + 1}`}>W{i + 1}</option>)}
                      </select>
                      <button type="submit" className="td2-btn">Create</button>
                    </form>
                    {testEvents.length === 0 && <p className="td2-empty">No events this term.</p>}
                    {testEvents.map((ev) => {
                      const isOpen = viewEventId === ev.id
                      const evScores = isOpen ? getScoresForTestEvent(ev.id) : []
                      const saveEdit = (s, sc) => {
                        const val = parseInt(eventScoreEdits[s.id], 10)
                        if (isNaN(val) || val < 0) return
                        if (sc) updateScore(sc.id, { value: val })
                        else addScore(s.id, activeClass, val, ev.id)
                        setEventScoreEdits((prev) => { const next = { ...prev }; delete next[s.id]; return next })
                        forceRefresh()
                      }
                      return (
                        <div key={ev.id} className={`td2-event ${isOpen ? 'is-open' : ''}`}>
                          <div className="td2-item td2-clickable" onClick={() => { setViewEventId(isOpen ? null : ev.id); setEventScoreEdits({}) }}>
                            <span className="td2-grow td2-strong">{ev.name}</span>
                            {ev.week && <span className="td2-chip">{ev.week}</span>}
                            <span className="td2-muted td2-small">/{ev.totalMarks || '?'}</span>
                            <input type="date" value={ev.date.slice(0, 10)} className="td2-input td2-input-date" onClick={(e) => e.stopPropagation()}
                              onChange={(e) => { updateTestEvent(ev.id, { date: new Date(e.target.value + 'T00:00:00').toISOString() }); forceRefresh() }} />
                            <button className="td2-icon-btn" title="Delete event" onClick={(e) => { e.stopPropagation(); requestConfirm(`Delete "${ev.name}" and all linked scores?`, () => { deleteTestEvent(ev.id); setViewEventId(null); forceRefresh() }) }}>🗑</button>
                            <span className="td2-muted">{isOpen ? '▴' : '▾'}</span>
                          </div>
                          {isOpen && (
                            <div className="td2-table-wrap">
                              <table className="td2-table">
                                <thead><tr><th>Student</th><th className="td2-center">Score</th><th /></tr></thead>
                                <tbody>
                                  {activeClassStudents.map((s) => {
                                    const sc = evScores.find((x) => x.studentId === s.id)
                                    const isEditing = eventScoreEdits[s.id] !== undefined
                                    const startEdit = () => setEventScoreEdits((prev) => ({ ...prev, [s.id]: sc ? String(sc.value) : '' }))
                                    return (
                                      <tr key={s.id}>
                                        <td>{fullName(s)}</td>
                                        <td className="td2-center">
                                          {isEditing ? (
                                            <input type="number" className="td2-input td2-input-score" value={eventScoreEdits[s.id]} min={0} max={ev.totalMarks || undefined} autoFocus
                                              onChange={(e) => {
                                                let v = e.target.value
                                                if (v !== '' && ev.totalMarks && parseInt(v, 10) > ev.totalMarks) v = String(ev.totalMarks)
                                                setEventScoreEdits((prev) => ({ ...prev, [s.id]: v }))
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') saveEdit(s, sc)
                                                if (e.key === 'Escape') setEventScoreEdits((prev) => { const next = { ...prev }; delete next[s.id]; return next })
                                              }} />
                                          ) : (
                                            <button className="td2-score" onClick={startEdit}>{sc ? `${sc.value}/${ev.totalMarks || '?'}` : '—'}</button>
                                          )}
                                        </td>
                                        <td className="td2-right">
                                          {isEditing ? (
                                            <button className="td2-btn td2-btn-sm" onClick={() => saveEdit(s, sc)}>Save</button>
                                          ) : (
                                            <>
                                              <button className="td2-btn-ghost td2-btn-sm" onClick={startEdit}>{sc ? 'Edit' : 'Add'}</button>
                                              {sc && <button className="td2-icon-btn" title="Delete score" onClick={() => requestConfirm(`Delete score for "${fullName(s)}" on "${ev.name}"?`, () => { deleteScore(sc.id); forceRefresh() })}>🗑</button>}
                                            </>
                                          )}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </section>
            )}

            {/* Students */}
            <section className="td2-card" id="td2-students">
              <div className="td2-card-head td2-wrap">
                <h2 className="td2-h2">Students</h2>
                <div className="td2-tabs">
                  {[['active', 'Active', activeStudents.length], ['pending', 'Pending', pendingApprovalStudents.length], ['archived', 'Archived', archivedStudents.length]].map(([key, label, n]) => (
                    <button key={key} className={`td2-tab ${studentRollTab === key ? 'is-active' : ''}`} onClick={() => setStudentRollTab(key)}>
                      {label} <span className="td2-tab-count">{n}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="td2-row td2-wrap">
                <input value={rollSearch} onChange={(e) => setRollSearch(e.target.value)} placeholder="Search students…" className="td2-input td2-grow" />
                <button type="button" className="td2-btn" onClick={() => setAddingStudent(true)}>+ Add student</button>
              </div>
              {createStudentError && (
                <div className="td2-warning">
                  <span className="td2-grow">{createStudentError}</span>
                  <button className="td2-btn td2-btn-sm" onClick={handleForceCreateStudent}>Add anyway</button>
                </div>
              )}

              {rollList.length === 0 ? (
                <p className="td2-empty">{rollSearch.trim() ? 'No students match your search.' : `No ${studentRollTab} students.`}</p>
              ) : (
                <div className="td2-table-wrap">
                  <table className="td2-table td2-roll">
                    <thead>
                      <tr><th>Name</th><th>Classes</th><th className="td2-right">Coins</th><th className="td2-right">Tokens</th><th className="td2-center" title="Battlegrounds access">Battlegrounds</th><th /></tr>
                    </thead>
                    <tbody>
                      {rollList.map((s) => (
                        <tr key={s.id} className={studentRollTab === 'archived' ? 'is-dim' : ''}>
                          <td>
                            {studentRollTab === 'pending'
                              ? <span className="td2-strong">{fullName(s)}</span>
                              : <button className="td2-link" onClick={() => openStudentProfile(s.id)}>{fullName(s)}</button>}
                          </td>
                          <td>
                            <div className="td2-chips">
                              {studentClasses(s.id).map((c) => <span key={c.id} className="td2-chip">{c.name}</span>)}
                              {studentClasses(s.id).length === 0 && <span className="td2-muted td2-small">—</span>}
                            </div>
                          </td>
                          <td className="td2-right td2-coin">{s.coins}</td>
                          <td className="td2-right td2-token">{s.tokens}</td>
                          <td className="td2-center">
                            {studentRollTab === 'active' && (
                              <button className={`td2-switch ${s.battlegroundsApproved ? 'is-on' : ''}`} role="switch" aria-checked={!!s.battlegroundsApproved}
                                title={s.battlegroundsApproved ? 'Lock Battlegrounds' : 'Unlock Battlegrounds'}
                                onClick={() => { setBattlegroundsApproval(s.id, !s.battlegroundsApproved); forceRefresh() }}><span /></button>
                            )}
                          </td>
                          <td className="td2-right">
                            {studentRollTab === 'pending' ? (
                              <div className="td2-row td2-row-tight td2-justify-end">
                                <button className="td2-btn td2-btn-sm" onClick={() => { approveStudent(s.id); forceRefresh() }}>Approve</button>
                                <button className="td2-btn-danger td2-btn-sm" onClick={() => requestConfirm(`Reject "${fullName(s)}"? This will delete their account.`, () => { deleteStudent(s.id); forceRefresh() }, 'Reject')}>Reject</button>
                              </div>
                            ) : (
                              <div className="td2-menu-wrap">
                                <button className="td2-icon-btn" aria-label="More actions" onClick={() => setMenuFor(menuFor === s.id ? null : s.id)}>⋯</button>
                                {menuFor === s.id && (
                                  <>
                                    <div className="td2-menu-backdrop" onClick={() => setMenuFor(null)} />
                                    <div className="td2-menu td2-menu-right">
                                      <button className="td2-menu-item" onClick={() => { setMenuFor(null); openStudentProfile(s.id) }}>Edit details</button>
                                      <button className="td2-menu-item" onClick={() => { setMenuFor(null); setReportViewStudent(s.id) }}>View report</button>
                                      {studentRollTab === 'archived' ? (
                                        <button className="td2-menu-item" onClick={() => { setMenuFor(null); unarchiveStudent(s.id); forceRefresh() }}>Restore account</button>
                                      ) : (
                                        <button className="td2-menu-item" onClick={() => { setMenuFor(null); requestConfirm(`Archive "${fullName(s)}"? They can no longer sign in, but every result is kept and still counts towards class percentiles. You can restore them any time from the Archived tab.`, () => { archiveStudent(s.id); setEditingStudent(null); forceRefresh() }, 'Archive') }}>Archive</button>
                                      )}
                                      <button className="td2-menu-item td2-menu-danger" onClick={() => { setMenuFor(null); requestConfirm(`Permanently delete "${fullName(s)}"? Their account, results, homework and revision cards are wiped, and their results stop counting towards class percentiles. Archive instead to keep the results.`, () => { removeStudentEverywhere(s.id); setEditingStudent(null) }) }}>Delete</button>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Admin */}
            {isAdmin && (
              <details className="td2-card td2-admin">
                <summary className="td2-h2">Admin · Teacher accounts</summary>
                <AdminTeacherPanel
                  teachers={getAllTeachers()}
                  requestConfirm={requestConfirm}
                  onDeleteTeacher={(id) => { deleteTeacher(id); forceRefresh() }}
                  onChanged={forceRefresh}
                />
              </details>
            )}
          </>
        )}
      </main>

      {/* Student edit */}
      {editingStudent && (() => {
        const s = getStudentById(editingStudent)
        if (!s) return null
        return (
          <div className="modal-overlay" onClick={() => setEditingStudent(null)}>
            <div className="td2-modal" onClick={(e) => e.stopPropagation()}>
              <div className="td2-card-head">
                <h2 className="td2-h2">Edit {fullName(s)}</h2>
                <button className="td2-icon-btn" aria-label="Close" onClick={() => setEditingStudent(null)}>✕</button>
              </div>
              {[
                ['Name', 'text', editStudentName, setEditStudentName, handleSaveName],
                ['Coins', 'number', editCoins, setEditCoins, handleSaveCoins],
                ['Tokens', 'number', editTokens, setEditTokens, handleSaveTokens],
              ].map(([label, type, value, set, save]) => (
                <label key={label} className="td2-field">
                  <span className="td2-field-label">{label}</span>
                  <input type={type} value={value} onChange={(e) => set(e.target.value)} className="td2-input td2-grow" />
                  <button type="button" className="td2-btn td2-btn-sm" onClick={save}>Save</button>
                </label>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Term Switch Confirmation */}
      {termSwitchStep && termSwitchStep.step === 1 && (
        <div className="modal-overlay">
          <div className="modal">
            <p className="pixel-heading text-accent" style={{ marginBottom: 8 }}>Switch Global Term</p>
            <p className="modal-text">
              You are about to switch the global term from <strong>{activeTerm}</strong> to <strong>{termSwitchStep.target}</strong>.
            </p>
            <p className="text-dim" style={{ fontSize: '0.75rem', marginBottom: 16 }}>
              This will change what all students and parents see across leaderboards, assignment courses, and test events.
            </p>
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={() => setTermSwitchStep({ ...termSwitchStep, step: 2 })}>Continue</button>
              <button className="btn btn-outline" onClick={() => setTermSwitchStep(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {termSwitchStep && termSwitchStep.step === 2 && (
        <div className="modal-overlay">
          <div className="modal">
            <p className="pixel-heading" style={{ marginBottom: 8, color: 'var(--danger)' }}>Are you sure?</p>
            <p className="modal-text">
              Confirm switching to <strong>{termSwitchStep.target}</strong>. All student-facing content will update immediately.
            </p>
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={() => { snapshotLeaderboards(org.id, activeTerm); updateOrganisation(org.id, { activeTerm: termSwitchStep.target }); setTermSwitchStep(null); forceRefresh() }}>
                Yes, Switch to {termSwitchStep.target}
              </button>
              <button className="btn btn-outline" onClick={() => setTermSwitchStep(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="modal-overlay">
          <div className="modal">
            <p className="modal-text">{confirmAction.message}</p>
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={handleConfirm}>{confirmAction.confirmLabel || 'Yes, Delete'}</button>
              <button className="btn btn-outline" onClick={() => setConfirmAction(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TeacherDashboard
