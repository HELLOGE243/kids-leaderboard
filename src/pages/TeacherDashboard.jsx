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
  const [activeClass, setActiveClass] = useState(null) // classId or null
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

  // --- Confirm & Execute ---
  function requestConfirm(message, onConfirm) {
    setConfirmAction({ message, onConfirm })
  }

  function handleConfirm() {
    if (confirmAction) confirmAction.onConfirm()
    setConfirmAction(null)
  }

  // --- Open Student Profile ---
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

  function handleSaveTokens() {
    if (!editingStudent) return
    updateStudent(editingStudent, { tokens: parseInt(editTokens, 10) || 0 })
    forceRefresh()
  }

  function handleSaveCoins() {
    if (!editingStudent) return
    setCoinsBalance(editingStudent, parseInt(editCoins, 10) || 0)
    forceRefresh()
  }

  function handleManualScore() {
    if (!editingStudent || !activeClass) return
    const value = parseInt(manualScoreValue, 10)
    if (isNaN(value) || value <= 0) return
    addScore(editingStudent, activeClass, value, manualScoreEvent || null)
    setManualScoreValue('')
    setManualScoreEvent('')
    forceRefresh()
  }

  function startEditScore(score) {
    setEditingScoreId(score.id)
    setEditScoreValue(String(score.value))
  }

  function handleSaveScore() {
    if (!editingScoreId) return
    updateScore(editingScoreId, {
      value: parseInt(editScoreValue, 10) || 0,
    })
    setEditingScoreId(null)
    forceRefresh()
  }

  // --- Test Events ---
  function handleCreateEvent(e) {
    e.preventDefault()
    if (!newEventName.trim() || !activeClass) return
    createTestEvent(activeClass, newEventName.trim())
    setNewEventName('')
    forceRefresh()
  }

  // Get test events for active class
  const testEvents = activeClass ? getTestEventsForClass(activeClass) : []

  // --- Create Organisation ---
  function handleCreateOrg(e) {
    e.preventDefault()
    if (!orgName.trim()) return
    const newOrg = createOrganisation(orgName.trim(), teacher.id)
    teacher.orgId = newOrg.id
    setOrgName('')
    forceRefresh()
  }

  // --- Create Class ---
  function handleCreateClass(e) {
    e.preventDefault()
    if (!className.trim() || !org) return
    createClass(className.trim(), org.id, teacher.id)
    setClassName('')
    forceRefresh()
  }

  // --- Create Student in Org ---
  function handleCreateStudent(e) {
    e.preventDefault()
    const name = newStudentName.trim()
    if (!name || !org) return

    const duplicate = students.find(
      (s) => s.name.toLowerCase() === name.toLowerCase()
    )
    if (duplicate) {
      setCreateStudentError(`A student named "${duplicate.name}" already exists (ID: ${duplicate.id}). Add anyway?`)
      return
    }

    createStudent(name, org.id)
    setNewStudentName('')
    setCreateStudentError('')
    forceRefresh()
  }

  function handleForceCreateStudent() {
    const name = newStudentName.trim()
    if (!name || !org) return
    createStudent(name, org.id)
    setNewStudentName('')
    setCreateStudentError('')
    forceRefresh()
  }

  // --- Add Student to Class by Nickname ---
  function handleAddStudent(e) {
    e.preventDefault()
    if (!studentName.trim() || !activeClass) return
    const student = findStudentInOrgByName(org.id, studentName.trim())
    if (!student) {
      setAddError('No student with that nickname found in your organisation.')
      return
    }
    assignStudentToClass(activeClass, student.id)
    setStudentName('')
    setAddError('')
    forceRefresh()
  }

  // --- Remove Student from Class ---
  function handleRemove(classId, studentId) {
    removeStudentFromClass(classId, studentId)
    forceRefresh()
  }

  // Get active class data
  const activeClassData = classes.find((c) => c.id === activeClass)
  const activeClassStudents = activeClassData
    ? activeClassData.studentIds.map((sid) => students.find((s) => s.id === sid)).filter(Boolean)
    : []

  // Students not in the active class (available to assign)
  const unassignedToActiveClass = activeClassData
    ? students.filter((s) => !activeClassData.studentIds.includes(s.id))
    : []

  // Students not in ANY class
  const allAssignedIds = new Set(classes.flatMap((cls) => cls.studentIds))
  const unassignedStudents = students.filter((s) => !allAssignedIds.has(s.id))

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.greeting}>Hey, {teacher.name}!</h1>
        <button onClick={onLogout} style={styles.logoutBtn}>Logout</button>
      </header>

      {/* Create Organisation - always visible */}
      {!org && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Create Your Organisation</h2>
          <p style={styles.hint}>This gives you a code that students use to join.</p>
          <form onSubmit={handleCreateOrg} style={styles.row}>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Organisation name"
              style={styles.input}
            />
            <button type="submit" style={styles.primaryBtn}>Create</button>
          </form>
        </div>
      )}

      {/* Organisation Card */}
      {org && (
        <>
          <div style={styles.orgCard}>
            <div style={styles.orgHeader}>
              <h2 style={styles.orgName}>{org.name}</h2>
              <span style={styles.orgCode}>CODE: {org.id}</span>
            </div>
            <div style={styles.orgStats}>
              <span style={styles.stat}>{classes.length} Classes</span>
              <span style={styles.stat}>{students.length} Students</span>
              <span style={styles.stat}>{unassignedStudents.length} Unassigned</span>
            </div>
          </div>

          {/* Create Student */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Add a Student</h2>
            <form onSubmit={handleCreateStudent} style={styles.row}>
              <input
                type="text"
                value={newStudentName}
                onChange={(e) => { setNewStudentName(e.target.value); setCreateStudentError('') }}
                placeholder="Student nickname"
                style={styles.input}
              />
              <button type="submit" style={styles.primaryBtn}>Create</button>
            </form>
            {createStudentError && (
              <div style={styles.warningRow}>
                <p style={styles.warning}>{createStudentError}</p>
                <button onClick={handleForceCreateStudent} style={styles.warningBtn}>Yes, Add Anyway</button>
              </div>
            )}
          </div>

          {/* Unassigned Students */}
          {unassignedStudents.length > 0 && (
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Unassigned Students</h2>
              <p style={styles.hint}>These students joined your org but aren't in any class yet.</p>
              <div style={styles.unassignedList}>
                {unassignedStudents.map((s) => (
                  <div key={s.id} style={styles.unassignedItem}>
                    <span style={styles.unassignedName}>{s.name}</span>
                    <span style={styles.unassignedId}>{s.id}</span>
                    <button
                      onClick={() => requestConfirm(
                        `Delete student "${s.name}" (${s.id})? This cannot be undone.`,
                        () => { deleteStudent(s.id); forceRefresh() }
                      )}
                      style={styles.deleteBtn}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Class List */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Classes</h2>

            {/* Create class form */}
            <form onSubmit={handleCreateClass} style={styles.row}>
              <input
                type="text"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="New class name (e.g. Maths)"
                style={styles.input}
              />
              <button type="submit" style={styles.primaryBtn}>Add</button>
            </form>

            {/* Class tabs */}
            {classes.length > 0 && (
              <div style={styles.classGrid}>
                {classes.map((cls) => (
                  <div
                    key={cls.id}
                    style={{
                      ...styles.classTab,
                      background: activeClass === cls.id ? '#6c5ce7' : '#fff',
                      color: activeClass === cls.id ? '#fff' : '#2d3436',
                      borderColor: activeClass === cls.id ? '#6c5ce7' : '#dfe6e9',
                    }}
                  >
                    <div
                      onClick={() => setActiveClass(activeClass === cls.id ? null : cls.id)}
                      style={styles.classTabClickArea}
                    >
                      <strong>{cls.name}</strong>
                      <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                        {cls.studentIds.length} students
                      </span>
                    </div>
                    <button
                      onClick={() => requestConfirm(
                        `Delete class "${cls.name}" and remove all student assignments? This cannot be undone.`,
                        () => {
                          if (activeClass === cls.id) setActiveClass(null)
                          deleteClass(cls.id)
                          forceRefresh()
                        }
                      )}
                      style={{
                        ...styles.classDeleteBtn,
                        color: activeClass === cls.id ? 'rgba(255,255,255,0.7)' : '#d63031',
                      }}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Test Events */}
          {activeClassData && (
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Test Events — {activeClassData.name}</h2>
              <form onSubmit={handleCreateEvent} style={styles.row}>
                <input
                  type="text"
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  placeholder="New test event name (e.g. Week 3 Quiz)"
                  style={styles.input}
                />
                <button type="submit" style={styles.primaryBtn}>Create</button>
              </form>
              {testEvents.length > 0 && (
                <div style={styles.eventList}>
                  {testEvents.map((ev) => (
                    <div key={ev.id} style={styles.eventItem}>
                      <span style={styles.eventName}>{ev.name}</span>
                      <input
                        type="date"
                        value={ev.date.slice(0, 10)}
                        onChange={(e) => {
                          updateTestEvent(ev.id, { date: new Date(e.target.value).toISOString() })
                          forceRefresh()
                        }}
                        style={styles.eventDateInput}
                      />
                      <button
                        onClick={() => requestConfirm(
                          `Delete test event "${ev.name}" and all scores linked to it?`,
                          () => { deleteTestEvent(ev.id); forceRefresh() }
                        )}
                        style={styles.scoreDeleteBtn}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Student Roll */}
          {activeClassData && (
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>{activeClassData.name} — Roll</h2>

              {/* Add student form */}
              <form onSubmit={handleAddStudent} style={styles.row}>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => { setStudentName(e.target.value); setAddError('') }}
                  placeholder="Student nickname"
                  style={styles.input}
                />
                <button type="submit" style={styles.primaryBtn}>Add</button>
              </form>
              {addError && <p style={styles.error}>{addError}</p>}

              {/* Student roll */}
              {activeClassStudents.length === 0 ? (
                <p style={styles.hint}>No students in this class yet.</p>
              ) : (
                <div style={styles.rollList}>
                  {activeClassStudents.map((s, i) => (
                    <div key={s.id} style={{
                      ...styles.rollItem,
                      background: editingStudent === s.id ? '#f0efff' : 'transparent',
                    }}>
                      <span style={styles.rollNumber}>{i + 1}.</span>
                      <span
                        style={styles.rollNameClickable}
                        onClick={() => openStudentProfile(s.id)}
                      >
                        {s.name}
                      </span>
                      <span style={styles.rollMeta}>{s.coins} coins | {s.tokens} tokens</span>
                      <button
                        onClick={() => requestConfirm(
                          `Remove "${s.name}" from this class?`,
                          () => handleRemove(activeClass, s.id)
                        )}
                        style={styles.removeBtn}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Student Profile Panel */}
              {editingStudent && activeClassData?.studentIds.includes(editingStudent) && (() => {
                const s = getStudentById(editingStudent)
                if (!s) return null
                const classScores = getScoresForStudentInClass(editingStudent, activeClass)
                const getEventName = (eventId) => {
                  if (!eventId) return '—'
                  const ev = testEvents.find((e) => e.id === eventId)
                  return ev ? ev.name : '—'
                }
                return (
                  <div style={styles.editPanel}>
                    <div style={styles.editHeader}>
                      <h3 style={styles.editTitle}>{s.name}</h3>
                      <button onClick={() => setEditingStudent(null)} style={styles.closeBtn}>Close</button>
                    </div>

                    {/* Summary */}
                    <div style={styles.profileStats}>
                      <span>Total earned: <strong>{s.totalEarned}</strong></span>
                    </div>

                    {/* Coins edit */}
                    <div style={styles.editRow}>
                      <label style={styles.editLabel}>Coins</label>
                      <input
                        type="number"
                        value={editCoins}
                        onChange={(e) => setEditCoins(e.target.value)}
                        style={styles.editInput}
                      />
                      <button onClick={handleSaveCoins} style={styles.smallSaveBtn}>Save</button>
                    </div>

                    {/* Tokens edit */}
                    <div style={styles.editRow}>
                      <label style={styles.editLabel}>Tokens</label>
                      <input
                        type="number"
                        value={editTokens}
                        onChange={(e) => setEditTokens(e.target.value)}
                        style={styles.editInput}
                      />
                      <button onClick={handleSaveTokens} style={styles.smallSaveBtn}>Save</button>
                    </div>

                    {/* Manual score input */}
                    <h4 style={styles.scoreHistoryTitle}>Add Score Manually</h4>
                    <div style={styles.manualScoreRow}>
                      <input
                        type="number"
                        value={manualScoreValue}
                        onChange={(e) => setManualScoreValue(e.target.value)}
                        placeholder="Score"
                        style={styles.scoreEditInput}
                        min="1"
                      />
                      <select
                        value={manualScoreEvent}
                        onChange={(e) => setManualScoreEvent(e.target.value)}
                        style={styles.eventSelect}
                      >
                        <option value="">No test event</option>
                        {testEvents.map((ev) => (
                          <option key={ev.id} value={ev.id}>{ev.name}</option>
                        ))}
                      </select>
                      <button onClick={handleManualScore} style={styles.smallSaveBtn}>Add</button>
                    </div>

                    {/* Progression Graph */}
                    <h4 style={styles.scoreHistoryTitle}>Progress — {activeClassData.name}</h4>
                    <ProgressGraph
                      dataPoints={classScores
                        .slice()
                        .sort((a, b) => new Date(a.date) - new Date(b.date))
                        .map((sc) => ({
                          date: sc.date,
                          value: sc.value,
                          label: getEventName(sc.testEventId),
                        }))
                      }
                    />

                    {/* Score History */}
                    <h4 style={styles.scoreHistoryTitle}>Score History — {activeClassData.name}</h4>
                    {classScores.length === 0 ? (
                      <p style={styles.hint}>No scores submitted yet.</p>
                    ) : (
                      <div style={styles.scoreHistory}>
                        {classScores.map((sc) => (
                          <div key={sc.id} style={styles.scoreRow}>
                            {editingScoreId === sc.id ? (
                              <>
                                <input
                                  type="number"
                                  value={editScoreValue}
                                  onChange={(e) => setEditScoreValue(e.target.value)}
                                  style={styles.scoreEditInput}
                                />
                                <button onClick={handleSaveScore} style={styles.smallSaveBtn}>Save</button>
                                <button onClick={() => setEditingScoreId(null)} style={styles.smallCancelBtn}>x</button>
                              </>
                            ) : (
                              <>
                                <span style={styles.scoreValue}>{sc.value} pts</span>
                                <span style={styles.scoreLabel}>{getEventName(sc.testEventId)}</span>
                                <span style={styles.scoreDate}>
                                  {new Date(sc.date).toLocaleDateString()}
                                </span>
                                <button onClick={() => startEditScore(sc)} style={styles.scoreEditBtn}>Edit</button>
                                <button
                                  onClick={() => requestConfirm(
                                    `Delete this score entry (${sc.value} pts)?`,
                                    () => { deleteScore(sc.id); forceRefresh() }
                                  )}
                                  style={styles.scoreDeleteBtn}
                                >
                                  x
                                </button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Available students - quick assign */}
              {unassignedToActiveClass.length > 0 && (
                <div style={styles.availableSection}>
                  <h3 style={styles.availableTitle}>Available to add:</h3>
                  <div style={styles.availableGrid}>
                    {unassignedToActiveClass.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { assignStudentToClass(activeClass, s.id); forceRefresh() }}
                        style={styles.availableBtn}
                      >
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
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <p style={styles.modalText}>{confirmAction.message}</p>
            <div style={styles.modalActions}>
              <button onClick={handleConfirm} style={styles.modalConfirmBtn}>Yes, Delete</button>
              <button onClick={() => setConfirmAction(null)} style={styles.modalCancelBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#f8f9fa',
    padding: '24px',
    maxWidth: '700px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  greeting: {
    fontSize: '1.8rem',
    color: '#2d3436',
  },
  logoutBtn: {
    padding: '10px 16px',
    fontSize: '0.9rem',
    borderRadius: '8px',
    border: '2px solid #636e72',
    background: 'transparent',
    cursor: 'pointer',
    color: '#636e72',
  },
  card: {
    background: '#fff',
    borderRadius: '14px',
    padding: '20px',
    marginBottom: '16px',
    border: '1px solid #dfe6e9',
  },
  cardTitle: {
    fontSize: '1.2rem',
    marginBottom: '12px',
    color: '#2d3436',
  },
  hint: {
    color: '#636e72',
    fontSize: '0.95rem',
    marginTop: '12px',
  },
  row: {
    display: 'flex',
    gap: '10px',
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    fontSize: '1rem',
    borderRadius: '10px',
    border: '2px solid #dfe6e9',
    outline: 'none',
  },
  primaryBtn: {
    padding: '12px 20px',
    fontSize: '1rem',
    fontWeight: 'bold',
    borderRadius: '10px',
    border: 'none',
    background: '#6c5ce7',
    color: '#fff',
    cursor: 'pointer',
  },
  error: {
    color: '#d63031',
    fontSize: '0.9rem',
    marginTop: '8px',
  },

  // Org card
  orgCard: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    borderRadius: '14px',
    padding: '24px',
    marginBottom: '16px',
    color: '#fff',
  },
  orgHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  orgName: {
    fontSize: '1.4rem',
    fontWeight: 'bold',
  },
  orgCode: {
    background: 'rgba(255,255,255,0.2)',
    padding: '6px 12px',
    borderRadius: '8px',
    fontSize: '0.9rem',
    fontWeight: 'bold',
    letterSpacing: '1px',
  },
  orgStats: {
    display: 'flex',
    gap: '20px',
  },
  stat: {
    fontSize: '1rem',
    opacity: 0.9,
  },

  // Class grid
  classGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '10px',
    marginTop: '16px',
  },
  classTab: {
    padding: '12px',
    borderRadius: '10px',
    border: '2px solid',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    fontSize: '1rem',
    position: 'relative',
  },
  classTabClickArea: {
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '4px',
    width: '100%',
  },
  classDeleteBtn: {
    position: 'absolute',
    top: '4px',
    right: '6px',
    background: 'none',
    border: 'none',
    fontSize: '0.9rem',
    cursor: 'pointer',
    fontWeight: 'bold',
    lineHeight: 1,
  },

  // Roll list
  rollList: {
    marginTop: '16px',
  },
  rollItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 0',
    borderBottom: '1px solid #f0f0f0',
  },
  rollNumber: {
    color: '#636e72',
    fontWeight: 'bold',
    width: '24px',
  },
  rollNameClickable: {
    flex: 1,
    fontWeight: '600',
    fontSize: '1rem',
    color: '#6c5ce7',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  rollMeta: {
    color: '#636e72',
    fontSize: '0.8rem',
  },
  removeBtn: {
    padding: '6px 12px',
    background: '#fff',
    color: '#d63031',
    border: '1px solid #d63031',
    borderRadius: '6px',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },

  // Unassigned students
  unassignedList: {
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  unassignedItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    background: '#fff3cd',
    borderRadius: '8px',
    border: '1px solid #ffc107',
  },
  unassignedName: {
    fontWeight: '600',
    fontSize: '1rem',
  },
  unassignedId: {
    color: '#636e72',
    fontSize: '0.85rem',
    flex: 1,
  },
  warningRow: {
    marginTop: '10px',
    padding: '12px',
    background: '#fff3cd',
    borderRadius: '8px',
    border: '1px solid #ffc107',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  warning: {
    flex: 1,
    color: '#856404',
    fontSize: '0.9rem',
  },
  warningBtn: {
    padding: '8px 16px',
    fontSize: '0.9rem',
    fontWeight: 'bold',
    borderRadius: '6px',
    border: 'none',
    background: '#ffc107',
    color: '#333',
    cursor: 'pointer',
  },
  deleteBtn: {
    padding: '6px 12px',
    background: '#d63031',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },

  // Available to add (in class detail)
  availableSection: {
    marginTop: '20px',
    paddingTop: '16px',
    borderTop: '1px solid #dfe6e9',
  },
  availableTitle: {
    fontSize: '0.95rem',
    color: '#636e72',
    marginBottom: '10px',
  },
  availableGrid: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  availableBtn: {
    padding: '8px 14px',
    fontSize: '0.9rem',
    borderRadius: '20px',
    border: '2px dashed #00b894',
    background: '#fff',
    color: '#00b894',
    fontWeight: '600',
    cursor: 'pointer',
  },

  // Test events
  eventList: {
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  eventItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 14px',
    background: '#f8f9fa',
    borderRadius: '8px',
  },
  eventName: {
    flex: 1,
    fontWeight: '600',
    fontSize: '0.95rem',
  },
  eventDateInput: {
    padding: '6px 10px',
    fontSize: '0.85rem',
    borderRadius: '6px',
    border: '1px solid #dfe6e9',
    outline: 'none',
    color: '#636e72',
  },

  // Manual score input
  manualScoreRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '16px',
  },
  eventSelect: {
    flex: 2,
    padding: '8px 12px',
    fontSize: '0.9rem',
    borderRadius: '6px',
    border: '1px solid #dfe6e9',
    outline: 'none',
  },

  // Student profile panel
  editPanel: {
    marginTop: '16px',
    padding: '20px',
    background: '#f0efff',
    borderRadius: '12px',
    border: '2px solid #6c5ce7',
  },
  editHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  editTitle: {
    fontSize: '1.2rem',
    fontWeight: 'bold',
    color: '#6c5ce7',
  },
  closeBtn: {
    padding: '6px 14px',
    fontSize: '0.85rem',
    borderRadius: '6px',
    border: '1px solid #636e72',
    background: 'transparent',
    color: '#636e72',
    cursor: 'pointer',
  },
  profileStats: {
    display: 'flex',
    gap: '20px',
    marginBottom: '16px',
    fontSize: '0.95rem',
    color: '#2d3436',
  },
  editRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  editLabel: {
    width: '80px',
    fontWeight: '600',
    fontSize: '0.95rem',
    color: '#2d3436',
  },
  editInput: {
    flex: 1,
    padding: '10px 14px',
    fontSize: '1rem',
    borderRadius: '8px',
    border: '2px solid #dfe6e9',
    outline: 'none',
  },
  smallSaveBtn: {
    padding: '8px 16px',
    fontSize: '0.9rem',
    fontWeight: 'bold',
    borderRadius: '6px',
    border: 'none',
    background: '#00b894',
    color: '#fff',
    cursor: 'pointer',
  },
  smallCancelBtn: {
    padding: '6px 10px',
    fontSize: '0.85rem',
    borderRadius: '6px',
    border: '1px solid #636e72',
    background: 'transparent',
    color: '#636e72',
    cursor: 'pointer',
  },
  scoreHistoryTitle: {
    fontSize: '1rem',
    color: '#2d3436',
    marginBottom: '10px',
    paddingTop: '12px',
    borderTop: '1px solid #dfe6e9',
  },
  scoreHistory: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  scoreRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    background: '#fff',
    borderRadius: '8px',
    fontSize: '0.9rem',
  },
  scoreValue: {
    fontWeight: 'bold',
    minWidth: '60px',
    color: '#6c5ce7',
  },
  scoreLabel: {
    flex: 1,
    color: '#636e72',
  },
  scoreDate: {
    color: '#b2bec3',
    fontSize: '0.8rem',
  },
  scoreEditInput: {
    flex: 1,
    padding: '6px 10px',
    fontSize: '0.9rem',
    borderRadius: '6px',
    border: '1px solid #dfe6e9',
    outline: 'none',
  },
  scoreEditBtn: {
    padding: '4px 10px',
    fontSize: '0.8rem',
    borderRadius: '4px',
    border: '1px solid #6c5ce7',
    background: 'transparent',
    color: '#6c5ce7',
    cursor: 'pointer',
  },
  scoreDeleteBtn: {
    padding: '4px 8px',
    fontSize: '0.8rem',
    borderRadius: '4px',
    border: 'none',
    background: '#d63031',
    color: '#fff',
    cursor: 'pointer',
  },

  // Confirmation modal
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modal: {
    background: '#fff',
    borderRadius: '16px',
    padding: '32px',
    maxWidth: '400px',
    width: '100%',
    textAlign: 'center',
  },
  modalText: {
    fontSize: '1.1rem',
    color: '#2d3436',
    marginBottom: '24px',
    lineHeight: 1.5,
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  modalConfirmBtn: {
    padding: '12px 24px',
    fontSize: '1rem',
    fontWeight: 'bold',
    borderRadius: '8px',
    border: 'none',
    background: '#d63031',
    color: '#fff',
    cursor: 'pointer',
  },
  modalCancelBtn: {
    padding: '12px 24px',
    fontSize: '1rem',
    borderRadius: '8px',
    border: '2px solid #636e72',
    background: 'transparent',
    color: '#636e72',
    cursor: 'pointer',
  },
}

export default TeacherDashboard
