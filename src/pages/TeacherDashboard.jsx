import { useState, useMemo, useEffect } from 'react'
import ShopAdmin from './ShopAdmin.jsx'
import ReportPage from './ReportPage.jsx'
import QuizBuilder from './QuizBuilder.jsx'
import CourseBuilder from './CourseBuilder.jsx'
import WritingReview from './WritingReview.jsx'
import NotificationsPanel from './NotificationsPanel.jsx'
import NewsfeedManager from './NewsfeedManager.jsx'
import ClassDashboard from './ClassDashboard.jsx'
import AdminTeacherPanel from '../components/AdminTeacherPanel.jsx'
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
} from '../data/store.js'

function TeacherDashboard({ teacher, isAdmin, onLogout }) {
  const [refresh, setRefresh] = useState(0)
  const forceRefresh = () => setRefresh((r) => r + 1)

  useEffect(() => {
    const unsub = onDataChange(() => setRefresh(r => r + 1))
    return unsub
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

  return (
    <div className="td-page">
      {/* Header */}
      <div className="header">
        <h1 className="pixel-title">Hey, {teacher.name}!</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {org && <button className="btn" style={{ padding: '12px 24px', fontSize: '0.7rem' }} onClick={() => setShowCourseBuilder(true)}>Courses</button>}
          {org && <button className="btn" style={{ padding: '12px 24px', fontSize: '0.7rem' }} onClick={() => setShowQuizBuilder(true)}>Quizzes</button>}
          {org && <button className="btn" style={{ padding: '12px 24px', fontSize: '0.7rem' }} onClick={() => setShowWritingReview(true)}>Writing Review</button>}
          {org && <button className="btn" style={{ padding: '12px 24px', fontSize: '0.7rem' }} onClick={() => setShowNotifications(true)}>📲 Notifications</button>}
          {org && <button className="btn" style={{ padding: '12px 24px', fontSize: '0.7rem' }} onClick={() => setShowNewsfeed(true)}>📰 Newsfeed</button>}
          {org && <button className="btn" style={{ padding: '12px 24px', fontSize: '0.7rem' }} onClick={() => setShowShopAdmin(true)}>Edit Shop</button>}
          <button className="btn-logout" onClick={() => requestConfirm('Are you sure you want to log out?', onLogout, 'Log Out')}>Log Out</button>
        </div>
      </div>

      {/* Create Org */}
      {!org && (
        <div className="card">
          <p className="pixel-heading">Create Organisation</p>
          <p className="text-dim mb-8">Get a code for students to join.</p>
          <form onSubmit={handleCreateOrg} className="form-row">
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Organisation name" className="input flex-1" />
            <button type="submit" className="btn btn-small">Create</button>
          </form>
        </div>
      )}

      {org && (
        <>
          {/* Org Bar — horizontal */}
          <div className="td-org-bar">
            <div
              className="td-org-logo"
              style={{ backgroundImage: `url(${org.logo || '/logo.svg'})`, borderStyle: 'solid' }}
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = 'image/*'
                input.onchange = (ev) => {
                  const file = ev.target.files[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = (re) => { updateOrganisation(org.id, { logo: re.target.result }); forceRefresh() }
                  reader.readAsDataURL(file)
                }
                input.click()
              }}
            >
            </div>
            {editingOrgName ? (
              <form onSubmit={(e) => { e.preventDefault(); if (editOrgNameValue.trim()) { updateOrganisationName(org.id, editOrgNameValue.trim()); forceRefresh() } setEditingOrgName(false) }} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <input value={editOrgNameValue} onChange={(e) => setEditOrgNameValue(e.target.value)} className="input" style={{ fontSize: '1.05rem', width: 200 }} autoFocus onBlur={() => { if (editOrgNameValue.trim()) { updateOrganisationName(org.id, editOrgNameValue.trim()); forceRefresh() } setEditingOrgName(false) }} />
              </form>
            ) : (
              <span className="bold" style={{ fontSize: '1.05rem', cursor: 'pointer' }} onClick={() => { setEditOrgNameValue(org.name); setEditingOrgName(true) }} title="Click to edit">{org.name} ✏️</span>
            )}
            <div className="td-org-stats">
              <div className="td-stat"><span className="td-stat-val">{classes.length}</span><span className="td-stat-lbl">Classes</span></div>
              <div className="td-stat"><span className="td-stat-val">{activeStudents.length}</span><span className="td-stat-lbl">Students</span></div>
              <div className="td-stat"><span className="td-stat-val">{pendingApprovalStudents.length}</span><span className="td-stat-lbl">Pending</span></div>
              <div className="td-stat"><span className="td-stat-val">{pendingOrders.length}</span><span className="td-stat-lbl">Orders</span></div>
            </div>
          </div>

          {/* Global Term */}
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <p className="pixel-heading" style={{ margin: 0 }}>Global Term</p>
            <span className="text-dim" style={{ fontSize: '0.7rem' }}>Controls what students and parents see.</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="font-pixel-sm" style={{ color: 'var(--accent)' }}>Current: {activeTerm}</span>
              <div className="td-term-selector">
                {['T1', 'T2', 'T3', 'T4'].map((t) => (
                  <button
                    key={t}
                    className={`td-term-btn ${activeTerm === t ? 'td-term-btn-active' : ''}`}
                    disabled={activeTerm === t}
                    onClick={() => setTermSwitchStep({ target: t, step: 1 })}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Two-column layout */}
          <div className="td-columns">
            {/* LEFT COLUMN */}
            <div className="td-col-left">

              {/* Student Roll */}
              <div className="card">
                <p className="pixel-heading">Student Roll</p>
                <form onSubmit={handleCreateStudent} className="form-row mb-8">
                  <input value={newStudentName} onChange={(e) => { setNewStudentName(e.target.value); setCreateStudentError('') }} placeholder="Add student nickname" className="input flex-1" />
                  <button type="submit" className="btn btn-small">Add</button>
                </form>
                {createStudentError && (
                  <div className="warning-box mb-8">
                    <span className="warning-text">{createStudentError}</span>
                    <button className="btn btn-small" style={{ background: 'var(--warning)', borderColor: 'var(--warning)', color: '#1a1a2e' }} onClick={handleForceCreateStudent}>Add Anyway</button>
                  </div>
                )}

                <div className="portal-panel-tabs" style={{ marginBottom: 8 }}>
                  <button className={`portal-panel-tab ${studentRollTab === 'active' ? 'portal-panel-tab-active' : ''}`} onClick={() => setStudentRollTab('active')}>
                    Active ({activeStudents.length})
                  </button>
                  <button className={`portal-panel-tab ${studentRollTab === 'pending' ? 'portal-panel-tab-active' : ''}`} onClick={() => setStudentRollTab('pending')} style={{ position: 'relative' }}>
                    Pending ({pendingApprovalStudents.length})
                    {pendingApprovalStudents.length > 0 && <span className="td-pending-badge">{pendingApprovalStudents.length}</span>}
                  </button>
                  <button className={`portal-panel-tab ${studentRollTab === 'archived' ? 'portal-panel-tab-active' : ''}`} onClick={() => setStudentRollTab('archived')}>
                    Archived ({archivedStudents.length})
                  </button>
                </div>

                {studentRollTab === 'active' && (
                  activeStudents.length === 0 ? (
                    <p className="text-dim" style={{ fontSize: '0.85rem' }}>No active students.</p>
                  ) : (
                    <div className="td-student-table">
                      <div className="td-st-header">
                        <span className="td-st-cell td-st-name">Name</span>
                        <span className="td-st-cell td-st-status">Status</span>
                        <span className="td-st-cell td-st-actions"></span>
                      </div>
                      {activeStudents.map((s) => (
                        <div key={s.id} className={`td-st-row ${editingStudent === s.id ? 'td-st-row-active' : ''}`}>
                          <span className="td-st-cell td-st-name text-accent bold" style={{ cursor: 'pointer' }} onClick={() => openStudentProfile(s.id)}>{fullName(s)}</span>
                          <span className="td-st-cell td-st-status">
                            <span style={{ fontSize: '0.55rem', color: 'var(--success)' }}>Active</span>
                          </span>
                          <span className="td-st-cell td-st-actions">
                            <button className="btn btn-outline btn-small" style={{ padding: '3px 8px', fontSize: '0.4rem' }} onClick={() => openStudentProfile(s.id)}>Edit</button>
                            <button className={`btn btn-small`} style={{ padding: '3px 8px', fontSize: '0.4rem', background: s.battlegroundsApproved ? '#5c1a2a' : 'var(--bg-deep)', borderColor: s.battlegroundsApproved ? '#7a2040' : 'var(--border)', color: s.battlegroundsApproved ? '#fff' : 'var(--text-dim)' }} onClick={() => { setBattlegroundsApproval(s.id, !s.battlegroundsApproved); forceRefresh() }} title={s.battlegroundsApproved ? 'Lock Battlegrounds' : 'Unlock Battlegrounds'}>⚔️</button>
                            <button className="btn btn-small" style={{ padding: '3px 8px', fontSize: '0.4rem', background: 'var(--text-dim)', borderColor: 'var(--text-dim)', color: '#1a1a2e' }} onClick={() => requestConfirm(`Archive "${fullName(s)}"? They can still log in but won't appear in classes.`, () => { archiveStudent(s.id); setEditingStudent(null); forceRefresh() }, 'Archive')}>Arc</button>
                            <button className="btn btn-danger btn-small" style={{ padding: '3px 8px', fontSize: '0.4rem' }} onClick={() => requestConfirm(`Delete "${fullName(s)}"? All scores, assignments, and data will be permanently wiped.`, () => { deleteStudent(s.id); setEditingStudent(null); forceRefresh() })}>Del</button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {studentRollTab === 'pending' && (
                  pendingApprovalStudents.length === 0 ? (
                    <p className="text-dim" style={{ fontSize: '0.85rem' }}>No pending sign-ups.</p>
                  ) : (
                    <div className="td-student-table">
                      <div className="td-st-header">
                        <span className="td-st-cell td-st-name">Name</span>
                        <span className="td-st-cell td-st-status">Status</span>
                        <span className="td-st-cell td-st-actions"></span>
                      </div>
                      {pendingApprovalStudents.map((s) => (
                        <div key={s.id} className="td-st-row td-st-row-pending">
                          <span className="td-st-cell td-st-name text-accent bold">{fullName(s)}</span>
                          <span className="td-st-cell td-st-status">
                            <span style={{ fontSize: '0.55rem', color: 'var(--warning)' }}>Pending</span>
                          </span>
                          <span className="td-st-cell td-st-actions">
                            <button className="btn btn-small" style={{ padding: '3px 8px', fontSize: '0.4rem', background: 'var(--success)', borderColor: 'var(--success)', color: '#1a1a2e' }} onClick={() => { approveStudent(s.id); forceRefresh() }}>Approve</button>
                            <button className="btn btn-danger btn-small" style={{ padding: '3px 8px', fontSize: '0.4rem' }} onClick={() => requestConfirm(`Reject "${fullName(s)}"? This will delete their account.`, () => { deleteStudent(s.id); forceRefresh() })}>Reject</button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {studentRollTab === 'archived' && (
                  archivedStudents.length === 0 ? (
                    <p className="text-dim" style={{ fontSize: '0.85rem' }}>No archived students.</p>
                  ) : (
                    <div className="td-student-table">
                      <div className="td-st-header">
                        <span className="td-st-cell td-st-name">Name</span>
                        <span className="td-st-cell td-st-status">Status</span>
                        <span className="td-st-cell td-st-actions"></span>
                      </div>
                      {archivedStudents.map((s) => (
                        <div key={s.id} className={`td-st-row ${editingStudent === s.id ? 'td-st-row-active' : ''}`} style={{ opacity: 0.7 }}>
                          <span className="td-st-cell td-st-name text-accent bold" style={{ cursor: 'pointer' }} onClick={() => openStudentProfile(s.id)}>{fullName(s)}</span>
                          <span className="td-st-cell td-st-status">
                            <span style={{ fontSize: '0.55rem', color: 'var(--text-dim)' }}>Archived</span>
                          </span>
                          <span className="td-st-cell td-st-actions">
                            <button className="btn btn-small" style={{ padding: '3px 8px', fontSize: '0.4rem', background: 'var(--success)', borderColor: 'var(--success)', color: '#1a1a2e' }} onClick={() => { unarchiveStudent(s.id); forceRefresh() }}>Restore</button>
                            <button className="btn btn-danger btn-small" style={{ padding: '3px 8px', fontSize: '0.4rem' }} onClick={() => requestConfirm(`Permanently delete "${fullName(s)}"? All scores, homework, and data will be wiped.`, () => { deleteStudent(s.id); setEditingStudent(null); forceRefresh() })}>Del</button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {/* Inline Student Edit */}
                {editingStudent && (() => {
                  const s = getStudentById(editingStudent)
                  if (!s) return null
                  return (
                    <div className="edit-panel" style={{ marginTop: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <span className="pixel-heading" style={{ margin: 0 }}>Edit — {fullName(s)}</span>
                        <button className="btn btn-outline btn-small" onClick={() => setEditingStudent(null)}>Close</button>
                      </div>
                      <div className="form-row mb-8">
                        <span className="font-pixel-sm" style={{ width: 70 }}>Name</span>
                        <input value={editStudentName} onChange={(e) => setEditStudentName(e.target.value)} className="input flex-1" />
                        <button className="btn btn-success btn-small" onClick={handleSaveName}>Save</button>
                      </div>
                      <div className="form-row mb-8">
                        <span className="font-pixel-sm" style={{ width: 70 }}>Coins</span>
                        <input type="number" value={editCoins} onChange={(e) => setEditCoins(e.target.value)} className="input flex-1" />
                        <button className="btn btn-success btn-small" onClick={handleSaveCoins}>Save</button>
                      </div>
                      <div className="form-row">
                        <span className="font-pixel-sm" style={{ width: 70 }}>Tokens</span>
                        <input type="number" value={editTokens} onChange={(e) => setEditTokens(e.target.value)} className="input flex-1" />
                        <button className="btn btn-success btn-small" onClick={handleSaveTokens}>Save</button>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* Class Management */}
              <div className="card">
                <p className="pixel-heading">Class Management</p>
                <form onSubmit={handleCreateClass} className="form-row mb-8">
                  <input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Class name" className="input flex-1" />
                  <input value={classYear} onChange={(e) => setClassYear(e.target.value)} placeholder="Year group" className="input" style={{ width: 90 }} />
                  <button type="submit" className="btn btn-small">Add</button>
                </form>

                {classes.length > 0 && (
                  <div className="td-class-table">
                    <div className="td-ct-header">
                      <span className="td-ct-cell td-ct-name td-sortable" onClick={() => toggleClassSort('name')}>Class {classSort.key === 'name' ? (classSort.asc ? '▲' : '▼') : ''}</span>
                      <span className="td-ct-cell td-ct-year td-sortable" onClick={() => toggleClassSort('yearGroup')}>Year {classSort.key === 'yearGroup' ? (classSort.asc ? '▲' : '▼') : ''}</span>
                      <span className="td-ct-cell td-ct-count td-sortable" onClick={() => toggleClassSort('students')}>Students {classSort.key === 'students' ? (classSort.asc ? '▲' : '▼') : ''}</span>
                      <span className="td-ct-cell td-ct-events td-sortable" onClick={() => toggleClassSort('events')}>Events {classSort.key === 'events' ? (classSort.asc ? '▲' : '▼') : ''}</span>
                      <span className="td-ct-cell td-ct-actions"></span>
                    </div>
                    {[...classes].sort((a, b) => {
                      const dir = classSort.asc ? 1 : -1
                      if (classSort.key === 'name') return dir * a.name.localeCompare(b.name)
                      if (classSort.key === 'yearGroup') return dir * (a.yearGroup || '').localeCompare(b.yearGroup || '')
                      if (classSort.key === 'students') {
                        const aActive = a.studentIds.filter(id => activeStudents.some(s => s.id === id)).length
                        const bActive = b.studentIds.filter(id => activeStudents.some(s => s.id === id)).length
                        return dir * (aActive - bActive)
                      }
                      if (classSort.key === 'events') return dir * (getTestEventsForClass(a.id).length - getTestEventsForClass(b.id).length)
                      return 0
                    }).map((cls) => {
                      const evCount = getTestEventsForClass(cls.id).length
                      const activeInClass = cls.studentIds.filter(id => activeStudents.some(s => s.id === id)).length
                      const archivedInClass = cls.studentIds.filter(id => archivedStudents.some(s => s.id === id)).length
                      return (
                        <div key={cls.id} className={`td-ct-row ${activeClass === cls.id ? 'td-ct-row-active' : ''}`} onClick={() => setActiveClass(activeClass === cls.id ? null : cls.id)}>
                          <span className="td-ct-cell td-ct-name bold">{cls.name}</span>
                          <span className="td-ct-cell td-ct-year">{cls.yearGroup || '—'}</span>
                          <span className="td-ct-cell td-ct-count">
                            {activeInClass}
                            {archivedInClass > 0 && <span className="text-dim" style={{ fontSize: '0.55rem', marginLeft: 4 }}>+{archivedInClass} arc</span>}
                          </span>
                          <span className="td-ct-cell td-ct-events">{evCount}</span>
                          <span className="td-ct-cell td-ct-actions" style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-small" style={{ padding: '3px 8px', fontSize: '0.4rem' }} onClick={(e) => { e.stopPropagation(); setShowClassDashboard(cls.id) }}>Dashboard</button>
                            <button className="btn btn-danger btn-small" style={{ padding: '3px 8px', fontSize: '0.4rem' }} onClick={(e) => { e.stopPropagation(); requestConfirm(`Delete class "${cls.name}"?`, () => { if (activeClass === cls.id) setActiveClass(null); deleteClass(cls.id); forceRefresh() }) }}>x</button>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Expanded class details */}
                {activeClassData && (
                  <div className="td-class-detail">
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 12 }}>
                      <div
                        className="td-class-img"
                        style={activeClassData.image ? { backgroundImage: `url(${activeClassData.image})` } : {}}
                        onClick={() => {
                          const input = document.createElement('input')
                          input.type = 'file'
                          input.accept = 'image/*'
                          input.onchange = (e) => {
                            const file = e.target.files[0]
                            if (!file) return
                            const reader = new FileReader()
                            reader.onload = (ev) => {
                              updateClass(activeClass, { image: ev.target.result })
                              forceRefresh()
                            }
                            reader.readAsDataURL(file)
                          }
                          input.click()
                        }}
                      >
                        {!activeClassData.image && <span className="td-class-img-placeholder">+</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p className="pixel-heading">{activeClassData.name} — Roll</p>
                        {activeClassData.yearGroup && <p className="text-dim" style={{ fontSize: '0.7rem', marginTop: 2 }}>{activeClassData.yearGroup}</p>}
                      </div>
                    </div>
                    <div style={{ position: 'relative', marginBottom: 8 }}>
                      <input
                        value={studentName}
                        onChange={(e) => { setStudentName(e.target.value); setAddError('') }}
                        placeholder="Search student to add..."
                        className="input w-full"
                      />
                      {studentName.trim() && (() => {
                        const matches = unassignedToActiveClass.filter((s) =>
                          fullName(s).toLowerCase().includes(studentName.trim().toLowerCase())
                        )
                        return matches.length > 0 ? (
                          <div className="search-dropdown">
                            {matches.map((s) => (
                              <div key={s.id} className="search-dropdown-item" onClick={() => {
                                assignStudentToClass(activeClass, s.id)
                                setStudentName('')
                                setAddError('')
                                forceRefresh()
                              }}>
                                <span className="bold">{fullName(s)}</span>
                                <span className="text-dim" style={{ fontSize: '0.65rem' }}>{s.coins}c | {s.tokens}t</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="search-dropdown">
                            <div className="search-dropdown-empty">No matching students</div>
                          </div>
                        )
                      })()}
                    </div>
                    {addError && <p className="error-text mb-8">{addError}</p>}

                    {activeClassStudents.length === 0 ? (
                      <p className="text-dim" style={{ fontSize: '0.85rem' }}>No students in this class.</p>
                    ) : (
                      <div>
                        {activeClassStudents.map((s, i) => (
                          <div key={s.id} className="list-item">
                            <span className="text-dim" style={{ width: 20 }}>{i + 1}.</span>
                            <span className="bold flex-1">{fullName(s)}</span>
                            <span className="text-dim" style={{ fontSize: '0.75rem' }}>{s.coins}c | {s.tokens}t</span>
                            <button className="btn btn-outline btn-small" style={{ padding: '3px 8px', fontSize: '0.4rem' }} onClick={() => requestConfirm(`Remove "${fullName(s)}" from class?`, () => handleRemove(activeClass, s.id))}>x</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Test Events */}
                    <p className="pixel-heading mt-16">Test Events</p>
                    <form onSubmit={handleCreateEvent} className="form-row mb-8" style={{ flexWrap: 'wrap' }}>
                      <input value={newEventName} onChange={(e) => setNewEventName(e.target.value)} placeholder="Event name" className="input flex-1" />
                      <input value={newEventTotal} onChange={(e) => setNewEventTotal(e.target.value)} placeholder="Total marks" type="number" min="1" className="input" style={{ width: 100 }} />
                      <select value={newEventTerm || activeTerm} onChange={(e) => setNewEventTerm(e.target.value)} className="input" style={{ width: 70 }}>
                        {['T1', 'T2', 'T3', 'T4'].map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <select value={newEventWeek} onChange={(e) => setNewEventWeek(e.target.value)} className="input" style={{ width: 80 }}>
                        {Array.from({ length: 10 }, (_, i) => <option key={i} value={`W${i + 1}`}>W{i + 1}</option>)}
                      </select>
                      <button type="submit" className="btn btn-small">Create</button>
                    </form>
                    {testEvents.length > 0 && testEvents.map((ev) => {
                      const isOpen = viewEventId === ev.id
                      const evScores = isOpen ? getScoresForTestEvent(ev.id) : []
                      return (
                        <div key={ev.id}>
                          <div className="list-item" style={{ cursor: 'pointer' }} onClick={() => { setViewEventId(isOpen ? null : ev.id); setEventScoreEdits({}) }}>
                            <span className="flex-1 bold" style={{ wordBreak: 'break-word', minWidth: 0 }}>{ev.name}</span>
                            {ev.week && <span className="text-dim font-pixel-sm" style={{ marginRight: 8 }}>{ev.week}</span>}
                            <span className="text-dim font-pixel-sm">/{ev.totalMarks || '?'}</span>
                            <input
                              type="date"
                              value={ev.date.slice(0, 10)}
                              onChange={(e) => { e.stopPropagation(); updateTestEvent(ev.id, { date: new Date(e.target.value + 'T00:00:00').toISOString() }); forceRefresh() }}
                              onClick={(e) => e.stopPropagation()}
                              className="select"
                              style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                            />
                            <button className="btn btn-danger btn-small" style={{ padding: '3px 8px', fontSize: '0.4rem' }} onClick={(e) => { e.stopPropagation(); requestConfirm(`Delete "${ev.name}" and all linked scores?`, () => { deleteTestEvent(ev.id); setViewEventId(null); forceRefresh() }) }}>x</button>
                            <span className="text-dim" style={{ fontSize: '0.7rem', marginLeft: 4 }}>{isOpen ? '▲' : '▼'}</span>
                          </div>
                          {isOpen && (
                            <div className="card" style={{ marginTop: 0, borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0, padding: '8px 12px' }}>
                              <table className="table w-full">
                                <thead>
                                  <tr>
                                    <th style={{ textAlign: 'left' }}>Student</th>
                                    <th style={{ textAlign: 'center', width: 100 }}>Score</th>
                                    <th style={{ textAlign: 'center', width: 60 }}>Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {activeClassStudents.map((s) => {
                                    const sc = evScores.find((x) => x.studentId === s.id)
                                    const isEditing = eventScoreEdits[s.id] !== undefined
                                    return (
                                      <tr key={s.id}>
                                        <td>{fullName(s)}</td>
                                        <td style={{ textAlign: 'center' }}>
                                          {isEditing ? (
                                            <input
                                              type="number"
                                              className="input"
                                              style={{ width: 70, textAlign: 'center', padding: '2px 4px', fontSize: '0.8rem' }}
                                              value={eventScoreEdits[s.id]}
                                              min={0}
                                              max={ev.totalMarks || undefined}
                                              onChange={(e) => {
                                                let v = e.target.value
                                                if (v !== '' && ev.totalMarks && parseInt(v, 10) > ev.totalMarks) v = String(ev.totalMarks)
                                                setEventScoreEdits((prev) => ({ ...prev, [s.id]: v }))
                                              }}
                                              autoFocus
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                  const val = parseInt(eventScoreEdits[s.id], 10)
                                                  if (isNaN(val) || val < 0) return
                                                  if (sc) { updateScore(sc.id, { value: val }); }
                                                  else { addScore(s.id, activeClass, val, ev.id); }
                                                  setEventScoreEdits((prev) => { const next = { ...prev }; delete next[s.id]; return next })
                                                  forceRefresh()
                                                }
                                                if (e.key === 'Escape') setEventScoreEdits((prev) => { const next = { ...prev }; delete next[s.id]; return next })
                                              }}
                                            />
                                          ) : (
                                            <span style={{ color: sc ? 'var(--text)' : 'var(--text-dim)', cursor: 'pointer' }} onClick={() => setEventScoreEdits((prev) => ({ ...prev, [s.id]: sc ? String(sc.value) : '' }))}>
                                              {sc ? `${sc.value}/${ev.totalMarks || '?'}` : '—'}
                                            </span>
                                          )}
                                        </td>
                                        <td style={{ textAlign: 'center', display: 'flex', gap: 4, justifyContent: 'center' }}>
                                          {isEditing ? (
                                            <button className="btn btn-small" style={{ padding: '2px 8px', fontSize: '0.4rem' }} onClick={() => {
                                              const val = parseInt(eventScoreEdits[s.id], 10)
                                              if (isNaN(val) || val < 0) return
                                              if (sc) { updateScore(sc.id, { value: val }); }
                                              else { addScore(s.id, activeClass, val, ev.id); }
                                              setEventScoreEdits((prev) => { const next = { ...prev }; delete next[s.id]; return next })
                                              forceRefresh()
                                            }}>Save</button>
                                          ) : (
                                            <>
                                              <button className="btn btn-outline btn-small" style={{ padding: '2px 8px', fontSize: '0.4rem' }} onClick={() => setEventScoreEdits((prev) => ({ ...prev, [s.id]: sc ? String(sc.value) : '' }))}>
                                                {sc ? 'Edit' : 'Add'}
                                              </button>
                                              {sc && (
                                                <button className="btn btn-danger btn-small" style={{ padding: '2px 6px', fontSize: '0.4rem' }} onClick={() => requestConfirm(`Delete score for "${fullName(s)}" on "${ev.name}"?`, () => { deleteScore(sc.id); forceRefresh() })}>x</button>
                                              )}
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
                )}
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="td-col-right">

              {/* Shop Orders */}
              <div className="card">
                <p className="pixel-heading">Shop Orders {pendingOrders.length > 0 && <span className="text-accent">({pendingOrders.length})</span>}</p>

                {orgPurchases.length === 0 && <p className="text-dim" style={{ fontSize: '0.85rem' }}>No orders yet.</p>}

                {pendingOrders.length > 0 && pendingOrders.map((order) => {
                  const s = students.find((st) => st.id === order.studentId)
                  return (
                    <div key={order.id} className="td-order-row" style={{ borderLeft: '3px solid var(--warning)', background: 'rgba(255,171,0,0.08)' }}>
                      <div className="flex-1" style={{ minWidth: 0 }}>
                        <span className="bold">{s ? fullName(s) : order.studentId}</span>
                        <span className="text-dim"> — </span>
                        <span>{order.itemName}</span>
                        <span className="text-coin font-pixel-sm" style={{ marginLeft: 6 }}>{order.price}c</span>
                        <div className="text-dim" style={{ fontSize: '0.65rem' }}>{new Date(order.date).toLocaleString()}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button className="btn btn-success btn-small" style={{ padding: '4px 8px' }} onClick={() => { setPurchaseStatus(order.id, 'fulfilled'); forceRefresh() }}>✓</button>
                        <button className="btn btn-small" style={{ padding: '4px 8px', borderColor: 'var(--token)', background: 'transparent', color: 'var(--token)' }} onClick={() => { setPurchaseStatus(order.id, 'on-hold'); forceRefresh() }}>Hold</button>
                        <button className="btn btn-danger btn-small" style={{ padding: '4px 8px' }} onClick={() => { setPurchaseStatus(order.id, 'cancelled'); forceRefresh() }}>✕</button>
                      </div>
                    </div>
                  )
                })}

                {onHoldOrders.length > 0 && (
                  <details open style={{ marginTop: 8 }}>
                    <summary className="font-pixel-sm" style={{ cursor: 'pointer', marginBottom: 6, color: 'var(--token)' }}>On Hold ({onHoldOrders.length})</summary>
                    {onHoldOrders.map((order) => {
                      const s = students.find((st) => st.id === order.studentId)
                      return (
                        <div key={order.id} className="td-order-row" style={{ borderLeft: '3px solid var(--token)', background: 'rgba(0,255,245,0.05)' }}>
                          <div className="flex-1">
                            <span className="bold">{s ? fullName(s) : order.studentId}</span><span className="text-dim"> — </span><span>{order.itemName}</span>
                            <span className="text-coin font-pixel-sm" style={{ marginLeft: 6 }}>{order.price}c</span>
                          </div>
                          <div style={{ display: 'flex', gap: 3 }}>
                            <button className="btn btn-success btn-small" style={{ padding: '4px 8px' }} onClick={() => { setPurchaseStatus(order.id, 'fulfilled'); forceRefresh() }}>✓</button>
                            <button className="btn btn-outline btn-small" style={{ padding: '4px 8px', fontSize: '0.4rem' }} onClick={() => { setPurchaseStatus(order.id, 'pending'); forceRefresh() }}>Back</button>
                          </div>
                        </div>
                      )
                    })}
                  </details>
                )}

                {fulfilledOrders.length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary className="font-pixel-sm" style={{ cursor: 'pointer', marginBottom: 6, color: 'var(--success)' }}>Fulfilled ({fulfilledOrders.length})</summary>
                    {fulfilledOrders.map((order) => {
                      const s = students.find((st) => st.id === order.studentId)
                      return (
                        <div key={order.id} className="td-order-row" style={{ opacity: 0.5 }}>
                          <span className="flex-1" style={{ textDecoration: 'line-through' }}>{s ? fullName(s) : order.studentId} — {order.itemName}</span>
                          <button className="btn btn-outline btn-small" style={{ padding: '3px 6px', fontSize: '0.4rem' }} onClick={() => { setPurchaseStatus(order.id, 'pending'); forceRefresh() }}>Undo</button>
                        </div>
                      )
                    })}
                  </details>
                )}

                {cancelledOrders.length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary className="font-pixel-sm" style={{ cursor: 'pointer', marginBottom: 6, color: 'var(--danger)' }}>Cancelled ({cancelledOrders.length})</summary>
                    {cancelledOrders.map((order) => {
                      const s = students.find((st) => st.id === order.studentId)
                      return (
                        <div key={order.id} className="td-order-row" style={{ opacity: 0.4 }}>
                          <span className="flex-1" style={{ textDecoration: 'line-through' }}>{s ? fullName(s) : order.studentId} — {order.itemName}</span>
                          <button className="btn btn-outline btn-small" style={{ padding: '3px 6px', fontSize: '0.4rem' }} onClick={() => { setPurchaseStatus(order.id, 'pending'); forceRefresh() }}>Restore</button>
                        </div>
                      )
                    })}
                  </details>
                )}

                {orgPurchases.length > 0 && pendingOrders.length === 0 && onHoldOrders.length === 0 && (
                  <p className="text-dim" style={{ fontSize: '0.8rem' }}>All orders handled!</p>
                )}
              </div>

              {/* Report Database */}
              <div className="card">
                <p className="pixel-heading">Report Database</p>
                <div style={{ position: 'relative' }}>
                  <input
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    placeholder="Search student nickname..."
                    className="input w-full"
                  />
                  {reportSearch.trim() && (
                    <div className="search-dropdown">
                      {reportResults.length === 0 ? (
                        <div className="search-dropdown-empty">No students found.</div>
                      ) : reportResults.map((s) => (
                        <div key={s.id} className="search-dropdown-item" onClick={() => { setReportViewStudent(s.id); setReportSearch('') }}>
                          <span className="bold">{fullName(s)}</span>
                          <span className="text-dim" style={{ fontSize: '0.65rem' }}>{s.coins}c | {s.tokens}t</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* Admin: Teacher Management */}
          {isAdmin && (
            <AdminTeacherPanel
              teachers={getAllTeachers()}
              requestConfirm={requestConfirm}
              onDeleteTeacher={(id) => { deleteTeacher(id); forceRefresh() }}
              onChanged={forceRefresh}
            />
          )}
        </>
      )}

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
