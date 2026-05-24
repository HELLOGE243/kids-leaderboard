import { useState } from 'react'
import ProgressGraph from '../components/ProgressGraph.jsx'
import {
  createOrganisation,
  getOrganisation,
  createStudent,
  deleteStudent,
  createClass,
  deleteClass,
  getClassesForOrg,
  getStudentsInOrg,
  getStudentById,
  updateStudent,
  setCoinsBalance,
  assignStudentToClass,
  removeStudentFromClass,
  findStudentInOrgByName,
  getScoresForStudentInClass,
  addScore,
  updateScore,
  deleteScore,
  createTestEvent,
  getTestEventsForClass,
  updateTestEvent,
  deleteTestEvent,
} from '../data/store.js'

function TeacherDashboard({ teacher, onLogout }) {
  const [refresh, setRefresh] = useState(0)
  const forceRefresh = () => setRefresh((r) => r + 1)

  const org = teacher.orgId ? getOrganisation(teacher.orgId) : null
  const classes = org ? getClassesForOrg(org.id) : []
  const students = org ? getStudentsInOrg(org.id) : []

  // State
  const [orgName, setOrgName] = useState('')
  const [className, setClassName] = useState('')
  const [activeClass, setActiveClass] = useState(null)
  const [studentName, setStudentName] = useState('')
  const [addError, setAddError] = useState('')
  const [newStudentName, setNewStudentName] = useState('')
  const [createStudentError, setCreateStudentError] = useState('')
  const [editingStudent, setEditingStudent] = useState(null)
  const [editTokens, setEditTokens] = useState('')
  const [editCoins, setEditCoins] = useState('')
  const [editingScoreId, setEditingScoreId] = useState(null)
  const [editScoreValue, setEditScoreValue] = useState('')
  const [manualScoreValue, setManualScoreValue] = useState('')
  const [manualScoreEvent, setManualScoreEvent] = useState('')
  const [newEventName, setNewEventName] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)

  // --- Handlers ---
  function requestConfirm(message, onConfirm) { setConfirmAction({ message, onConfirm }) }
  function handleConfirm() { if (confirmAction) confirmAction.onConfirm(); setConfirmAction(null) }

  function openStudentProfile(studentId) {
    const s = getStudentById(studentId)
    if (!s) return
    setEditingStudent(studentId)
    setEditTokens(String(s.tokens))
    setEditCoins(String(s.coins))
    setEditingScoreId(null)
    setManualScoreValue('')
    setManualScoreEvent('')
  }

  function handleSaveTokens() { if (!editingStudent) return; updateStudent(editingStudent, { tokens: parseInt(editTokens, 10) || 0 }); forceRefresh() }
  function handleSaveCoins() { if (!editingStudent) return; setCoinsBalance(editingStudent, parseInt(editCoins, 10) || 0); forceRefresh() }

  function handleManualScore() {
    if (!editingStudent || !activeClass) return
    const value = parseInt(manualScoreValue, 10)
    if (isNaN(value) || value <= 0) return
    addScore(editingStudent, activeClass, value, manualScoreEvent || null)
    setManualScoreValue('')
    setManualScoreEvent('')
    forceRefresh()
  }

  function startEditScore(score) { setEditingScoreId(score.id); setEditScoreValue(String(score.value)) }
  function handleSaveScore() { if (!editingScoreId) return; updateScore(editingScoreId, { value: parseInt(editScoreValue, 10) || 0 }); setEditingScoreId(null); forceRefresh() }

  function handleCreateEvent(e) { e.preventDefault(); if (!newEventName.trim() || !activeClass) return; createTestEvent(activeClass, newEventName.trim()); setNewEventName(''); forceRefresh() }
  function handleCreateOrg(e) { e.preventDefault(); if (!orgName.trim()) return; const newOrg = createOrganisation(orgName.trim(), teacher.id); teacher.orgId = newOrg.id; setOrgName(''); forceRefresh() }
  function handleCreateClass(e) { e.preventDefault(); if (!className.trim() || !org) return; createClass(className.trim(), org.id, teacher.id); setClassName(''); forceRefresh() }

  function handleCreateStudent(e) {
    e.preventDefault()
    const name = newStudentName.trim()
    if (!name || !org) return
    const duplicate = students.find((s) => s.name.toLowerCase() === name.toLowerCase())
    if (duplicate) { setCreateStudentError(`"${duplicate.name}" already exists (${duplicate.id}). Add anyway?`); return }
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
  const testEvents = activeClass ? getTestEventsForClass(activeClass) : []
  const activeClassData = classes.find((c) => c.id === activeClass)
  const activeClassStudents = activeClassData ? activeClassData.studentIds.map((sid) => students.find((s) => s.id === sid)).filter(Boolean) : []
  const unassignedToActiveClass = activeClassData ? students.filter((s) => !activeClassData.studentIds.includes(s.id)) : []
  const allAssignedIds = new Set(classes.flatMap((cls) => cls.studentIds))
  const unassignedStudents = students.filter((s) => !allAssignedIds.has(s.id))

  // --- RENDER ---
  return (
    <div className="page">
      {/* Header */}
      <div className="header">
        <h1 className="pixel-title">Hey, {teacher.name}!</h1>
        <button className="btn btn-outline btn-small" onClick={onLogout}>Logout</button>
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
          {/* Org Card */}
          <div className="org-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span className="bold" style={{ fontSize: '1.1rem' }}>{org.name}</span>
              <span className="org-code">CODE: {org.id}</span>
            </div>
            <div style={{ display: 'flex', gap: '16px' }} className="font-pixel-sm text-dim">
              <span>{classes.length} Classes</span>
              <span>{students.length} Students</span>
              <span>{unassignedStudents.length} Unassigned</span>
            </div>
          </div>

          {/* Add Student */}
          <div className="card">
            <p className="pixel-heading">Add a Student</p>
            <form onSubmit={handleCreateStudent} className="form-row">
              <input value={newStudentName} onChange={(e) => { setNewStudentName(e.target.value); setCreateStudentError('') }} placeholder="Student nickname" className="input flex-1" />
              <button type="submit" className="btn btn-small">Create</button>
            </form>
            {createStudentError && (
              <div className="warning-box">
                <span className="warning-text">{createStudentError}</span>
                <button className="btn btn-small" style={{ background: 'var(--warning)', borderColor: 'var(--warning)', color: '#1a1a2e' }} onClick={handleForceCreateStudent}>Add Anyway</button>
              </div>
            )}
          </div>

          {/* Unassigned */}
          {unassignedStudents.length > 0 && (
            <div className="card">
              <p className="pixel-heading">Unassigned Students</p>
              {unassignedStudents.map((s) => (
                <div key={s.id} className="unassigned-item">
                  <span className="bold flex-1">{s.name}</span>
                  <span className="text-dim" style={{ fontSize: '0.8rem' }}>{s.id}</span>
                  <button className="btn btn-danger btn-small" onClick={() => requestConfirm(`Delete "${s.name}" (${s.id})? Cannot be undone.`, () => { deleteStudent(s.id); forceRefresh() })}>Del</button>
                </div>
              ))}
            </div>
          )}

          {/* Classes */}
          <div className="card">
            <p className="pixel-heading">Classes</p>
            <form onSubmit={handleCreateClass} className="form-row">
              <input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="New class name" className="input flex-1" />
              <button type="submit" className="btn btn-small">Add</button>
            </form>
            {classes.length > 0 && (
              <div className="class-grid">
                {classes.map((cls) => (
                  <div
                    key={cls.id}
                    className={`class-card ${activeClass === cls.id ? 'class-card-active' : ''}`}
                    onClick={() => setActiveClass(activeClass === cls.id ? null : cls.id)}
                  >
                    <span className="font-pixel-sm">{cls.name}</span>
                    <span className="text-dim" style={{ fontSize: '0.75rem' }}>{cls.studentIds.length} students</span>
                    <button
                      className="btn btn-danger btn-small"
                      style={{ position: 'absolute', top: '4px', right: '4px', padding: '2px 6px', fontSize: '0.6rem' }}
                      onClick={(e) => { e.stopPropagation(); requestConfirm(`Delete class "${cls.name}"?`, () => { if (activeClass === cls.id) setActiveClass(null); deleteClass(cls.id); forceRefresh() }) }}
                    >x</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Test Events */}
          {activeClassData && (
            <div className="card">
              <p className="pixel-heading">Test Events — {activeClassData.name}</p>
              <form onSubmit={handleCreateEvent} className="form-row">
                <input value={newEventName} onChange={(e) => setNewEventName(e.target.value)} placeholder="Event name (e.g. Week 3 Quiz)" className="input flex-1" />
                <button type="submit" className="btn btn-small">Create</button>
              </form>
              {testEvents.length > 0 && (
                <div className="mt-8">
                  {testEvents.map((ev) => (
                    <div key={ev.id} className="list-item">
                      <span className="flex-1 bold">{ev.name}</span>
                      <input
                        type="date"
                        value={ev.date.slice(0, 10)}
                        onChange={(e) => { updateTestEvent(ev.id, { date: new Date(e.target.value).toISOString() }); forceRefresh() }}
                        className="select"
                        style={{ fontSize: '0.8rem' }}
                      />
                      <button className="btn btn-danger btn-small" onClick={() => requestConfirm(`Delete "${ev.name}" and all linked scores?`, () => { deleteTestEvent(ev.id); forceRefresh() })}>x</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Student Roll */}
          {activeClassData && (
            <div className="card">
              <p className="pixel-heading">{activeClassData.name} — Roll</p>
              <form onSubmit={handleAddStudent} className="form-row mb-8">
                <input value={studentName} onChange={(e) => { setStudentName(e.target.value); setAddError('') }} placeholder="Student nickname" className="input flex-1" />
                <button type="submit" className="btn btn-small">Add</button>
              </form>
              {addError && <p className="error-text">{addError}</p>}

              {activeClassStudents.length === 0 ? (
                <p className="text-dim">No students in this class yet.</p>
              ) : (
                <div>
                  {activeClassStudents.map((s, i) => (
                    <div key={s.id} className="list-item" style={{ background: editingStudent === s.id ? 'rgba(233,69,96,0.1)' : 'transparent' }}>
                      <span className="text-dim" style={{ width: '20px' }}>{i + 1}.</span>
                      <span className="text-accent bold flex-1" style={{ cursor: 'pointer' }} onClick={() => openStudentProfile(s.id)}>{s.name}</span>
                      <span className="text-dim" style={{ fontSize: '0.75rem' }}>{s.coins}c | {s.tokens}t</span>
                      <button className="btn btn-outline btn-small" onClick={() => requestConfirm(`Remove "${s.name}" from class?`, () => handleRemove(activeClass, s.id))}>x</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Student Profile Panel */}
              {editingStudent && activeClassData?.studentIds.includes(editingStudent) && (() => {
                const s = getStudentById(editingStudent)
                if (!s) return null
                const classScores = getScoresForStudentInClass(editingStudent, activeClass)
                const getEventName = (eventId) => { if (!eventId) return '—'; const ev = testEvents.find((e) => e.id === eventId); return ev ? ev.name : '—' }
                return (
                  <div className="edit-panel">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span className="pixel-heading" style={{ margin: 0 }}>{s.name}</span>
                      <button className="btn btn-outline btn-small" onClick={() => setEditingStudent(null)}>Close</button>
                    </div>

                    <p className="text-dim mb-8" style={{ fontSize: '0.8rem' }}>Total earned: {s.totalEarned}</p>

                    {/* Coins */}
                    <div className="form-row mb-8">
                      <span className="font-pixel-sm" style={{ width: '70px' }}>Coins</span>
                      <input type="number" value={editCoins} onChange={(e) => setEditCoins(e.target.value)} className="input flex-1" />
                      <button className="btn btn-success btn-small" onClick={handleSaveCoins}>Save</button>
                    </div>

                    {/* Tokens */}
                    <div className="form-row mb-8">
                      <span className="font-pixel-sm" style={{ width: '70px' }}>Tokens</span>
                      <input type="number" value={editTokens} onChange={(e) => setEditTokens(e.target.value)} className="input flex-1" />
                      <button className="btn btn-success btn-small" onClick={handleSaveTokens}>Save</button>
                    </div>

                    {/* Manual Score */}
                    <p className="pixel-heading mt-16">Add Score Manually</p>
                    <div className="form-row mb-16">
                      <input type="number" value={manualScoreValue} onChange={(e) => setManualScoreValue(e.target.value)} placeholder="Score" className="input" style={{ width: '70px', flex: 'none' }} min="1" />
                      <select value={manualScoreEvent} onChange={(e) => setManualScoreEvent(e.target.value)} className="select flex-1">
                        <option value="">No event</option>
                        {testEvents.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                      </select>
                      <button className="btn btn-small" onClick={handleManualScore}>Add</button>
                    </div>

                    {/* Progress Graph */}
                    <p className="pixel-heading">Progress</p>
                    <ProgressGraph
                      dataPoints={classScores.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).map((sc) => ({ date: sc.date, value: sc.value, label: getEventName(sc.testEventId) }))}
                    />

                    {/* Score History */}
                    <p className="pixel-heading mt-16">Score History</p>
                    {classScores.length === 0 ? (
                      <p className="text-dim">No scores yet.</p>
                    ) : (
                      <div>
                        {classScores.map((sc) => (
                          <div key={sc.id} className="score-row">
                            {editingScoreId === sc.id ? (
                              <>
                                <input type="number" value={editScoreValue} onChange={(e) => setEditScoreValue(e.target.value)} className="input" style={{ width: '70px', flex: 'none' }} />
                                <button className="btn btn-success btn-small" onClick={handleSaveScore}>Save</button>
                                <button className="btn btn-outline btn-small" onClick={() => setEditingScoreId(null)}>x</button>
                              </>
                            ) : (
                              <>
                                <span className="text-coin bold" style={{ minWidth: '50px' }}>{sc.value} pts</span>
                                <span className="text-dim flex-1">{getEventName(sc.testEventId)}</span>
                                <span className="text-dim" style={{ fontSize: '0.75rem' }}>{new Date(sc.date).toLocaleDateString()}</span>
                                <button className="btn btn-outline btn-small" onClick={() => startEditScore(sc)}>Edit</button>
                                <button className="btn btn-danger btn-small" onClick={() => requestConfirm(`Delete score (${sc.value} pts)?`, () => { deleteScore(sc.id); forceRefresh() })}>x</button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Available to add */}
              {unassignedToActiveClass.length > 0 && (
                <div className="mt-16">
                  <p className="pixel-heading">Available to add</p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {unassignedToActiveClass.map((s) => (
                      <button key={s.id} className="chip chip-add" onClick={() => { assignStudentToClass(activeClass, s.id); forceRefresh() }}>
                        + {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="modal-overlay">
          <div className="modal">
            <p className="modal-text">{confirmAction.message}</p>
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={handleConfirm}>Yes, Delete</button>
              <button className="btn btn-outline" onClick={() => setConfirmAction(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TeacherDashboard
