import { useState, useRef } from 'react'
import { uploadImage } from '../data/imageStore.js'
import {
  getClassesForOrg,
  getCoursesForOrg,
  createCourse,
  updateCourse,
  deleteCourse,
  getCourseById,
  addModuleToCourse,
  updateModule,
  deleteModule,
  assignQuizToModule,
  removeQuizFromModule,
  getImportedQuizSets,
  getImportedQuizSet,
  getActiveTerm,
  getQuizFolders,
  getCourseStudentIds,
  setCourseStudentIds,
  courseTakesWholeClass,
  getStudentById,
} from '../data/store.js'

function CourseBuilder({ orgId, onBack, onEditQuiz }) {
  const [refresh, setRefresh] = useState(0)
  const forceRefresh = () => setRefresh((r) => r + 1)

  const classes = getClassesForOrg(orgId)
  const courses = getCoursesForOrg(orgId)
  const allQuizSets = getImportedQuizSets()
  const activeTerm = getActiveTerm(orgId)

  const [selectedClassId, setSelectedClassId] = useState(null)
  const [newCourseName, setNewCourseName] = useState('')
  const [newCourseTerm, setNewCourseTerm] = useState('')
  const [editingCourse, setEditingCourse] = useState(null)
  const [showEnrolment, setShowEnrolment] = useState(false)
  const [newModuleName, setNewModuleName] = useState('')
  const [activeModule, setActiveModule] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [quizSearch, setQuizSearch] = useState('')
  const [pendingAssign, setPendingAssign] = useState(null)
  const [editingModuleName, setEditingModuleName] = useState(null)
  const [editModuleValue, setEditModuleValue] = useState('')
  const dragQuiz = useRef(null)
  const imageInputRef = useRef(null)

  const course = editingCourse ? getCourseById(editingCourse) : null

  function handleImageUpload(courseId, e) {
    const file = e.target.files?.[0]
    if (!file) return
    // Stored as a link, not embedded: embedded pictures filled the shared record.
    uploadImage(file)
      .then((url) => { updateCourse(courseId, { image: url }); forceRefresh() })
      .catch((err) => alert(`Image upload failed: ${err.message}`))
  }

  function handleCreateCourse(e) {
    e.preventDefault()
    if (!newCourseName.trim() || !selectedClassId) return
    createCourse(newCourseName.trim(), selectedClassId, orgId, newCourseTerm || activeTerm)
    setNewCourseName('')
    setNewCourseTerm('')
    forceRefresh()
  }

  function handleAddModule(e) {
    e.preventDefault()
    if (!newModuleName.trim() || !editingCourse) return
    const mod = addModuleToCourse(editingCourse, newModuleName.trim())
    setNewModuleName('')
    setActiveModule(mod.id)
    forceRefresh()
  }

  function startRenameModule(m) {
    setEditingModuleName(m.id)
    setEditModuleValue(m.name)
  }

  function saveRenameModule(courseId, moduleId) {
    if (editModuleValue.trim()) updateModule(courseId, moduleId, { name: editModuleValue.trim() })
    setEditingModuleName(null)
    forceRefresh()
  }

  function moveQuiz(mod, fromIdx, toIdx) {
    if (toIdx < 0 || toIdx >= mod.quizSetIds.length) return
    const ids = [...mod.quizSetIds]
    const [moved] = ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, moved)
    updateModule(course.id, mod.id, { quizSetIds: ids })
    forceRefresh()
  }

  // ===== COURSE EDITOR =====
  if (course) {
    const mod = activeModule
      ? course.modules.find((m) => m.id === activeModule)
      : course.modules[0]
    const modQuizSets = mod
      ? mod.quizSetIds.map((id) => getImportedQuizSet(id)).filter(Boolean)
      : []
    const searchLower = quizSearch.toLowerCase()
    const assignedIds = new Set(course.modules.flatMap((m) => m.quizSetIds))
    const folders = getQuizFolders(orgId)
    const folderMap = {}
    for (const f of folders) folderMap[f.id] = f
    const availableQuizzes = allQuizSets
      .filter((s) => {
        if (assignedIds.has(s.id)) return false
        if (searchLower && !s.friendlyTitle.toLowerCase().includes(searchLower)) return false
        return true
      })
      .sort((a, b) => {
        const aFolder = a.folderId ? (folderMap[a.folderId]?.name || '') : ''
        const bFolder = b.folderId ? (folderMap[b.folderId]?.name || '') : ''
        const aHas = aFolder ? 0 : 1
        const bHas = bFolder ? 0 : 1
        if (aHas !== bHas) return aHas - bHas
        if (aFolder !== bFolder) return aFolder.localeCompare(bFolder)
        return a.friendlyTitle.localeCompare(b.friendlyTitle)
      })
    const cls = classes.find((c) => c.id === course.classId)

    return (
      <div className="page" style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: 'calc(100dvh - 40px)' }}>
        <div className="header">
          <div>
            <h1 className="pixel-title">{course.name}</h1>
            {cls && <p className="text-dim" style={{ fontSize: '0.7rem' }}>{cls.name}</p>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-outline btn-small" style={{ fontSize: '0.5rem', padding: '6px 12px' }} onClick={() => imageInputRef.current?.click()}>
              {course.image ? 'Change Image' : 'Upload Image'}
            </button>
            <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageUpload(course.id, e)} />
            {course.image && (
              <img src={course.image} alt="" style={{ height: 36, borderRadius: 4, objectFit: 'cover' }} />
            )}
            {(() => {
              const roll = (cls?.studentIds) || []
              const taking = getCourseStudentIds(course.id)
              const everyone = courseTakesWholeClass(course.id)
              return (
                <button
                  className="btn btn-outline btn-small"
                  style={{ fontSize: '0.5rem', padding: '6px 12px' }}
                  onClick={() => setShowEnrolment(true)}
                  title="Choose which students in this class take this course"
                >
                  Students: {everyone ? `All (${roll.length})` : `${taking.length} of ${roll.length}`}
                </button>
              )
            })()}
            <button className="btn-logout" onClick={() => { setEditingCourse(null); setActiveModule(null); setQuizSearch('') }}>
              Back to Courses
            </button>
          </div>
        </div>

        {showEnrolment && (() => {
          const roll = (cls?.studentIds) || []
          const everyone = courseTakesWholeClass(course.id)
          const taking = new Set(getCourseStudentIds(course.id))
          const setTaking = (ids) => { setCourseStudentIds(course.id, ids); forceRefresh() }
          return (
            <div className="modal-overlay" onClick={() => setShowEnrolment(false)}>
              <div className="card" style={{ maxWidth: 520, width: '92%', maxHeight: '86vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                  <h2 className="pixel-heading" style={{ margin: 0, fontSize: '0.8rem' }}>Who takes {course.name}?</h2>
                  <button className="btn btn-outline btn-small" style={{ fontSize: '0.5rem', padding: '4px 10px' }} onClick={() => setShowEnrolment(false)}>Close</button>
                </div>
                <div style={{ padding: '4px 4px 12px' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <button
                      className={`btn btn-small ${everyone ? '' : 'btn-outline'}`}
                      style={{ fontSize: '0.5rem', padding: '6px 12px' }}
                      onClick={() => setTaking(null)}
                    >Everyone in this class</button>
                    <button
                      className={`btn btn-small ${everyone ? 'btn-outline' : ''}`}
                      style={{ fontSize: '0.5rem', padding: '6px 12px' }}
                      onClick={() => setTaking(roll)}
                    >Choose students</button>
                  </div>
                  <p className="text-dim" style={{ fontSize: '0.7rem', marginBottom: 10 }}>
                    {everyone
                      ? 'Every student on the class roll sees this course, including anyone added later.'
                      : 'Only the students ticked below see this course and download its quizzes.'}
                  </p>
                  {roll.length === 0 ? (
                    <p className="text-dim" style={{ fontSize: '0.75rem' }}>No students on this class roll yet.</p>
                  ) : (
                    <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {roll.map((sid) => {
                        const s = getStudentById(sid)
                        const on = everyone || taking.has(sid)
                        return (
                          <label
                            key={sid}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 4, cursor: everyone ? 'default' : 'pointer', background: on ? 'rgba(233,69,96,0.08)' : 'transparent', opacity: everyone ? 0.65 : 1 }}
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={everyone}
                              onChange={() => {
                                const next = new Set(taking)
                                if (next.has(sid)) next.delete(sid); else next.add(sid)
                                setTaking([...next])
                              }}
                            />
                            <span style={{ fontSize: '0.85rem' }}>{s ? `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.name : sid}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

        <div style={{ display: 'flex', gap: 16, marginTop: 16, flex: 1, minHeight: 0 }}>
          {/* Left: Modules */}
          <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <p className="pixel-heading" style={{ margin: 0, marginBottom: 8, fontSize: '0.65rem' }}>Modules</p>

              <form onSubmit={handleAddModule} className="form-row" style={{ gap: 6, marginBottom: 10, flexShrink: 0 }}>
                <input
                  value={newModuleName}
                  onChange={(e) => setNewModuleName(e.target.value)}
                  placeholder="New module name"
                  className="input flex-1"
                  style={{ fontSize: '0.8rem' }}
                />
                <button type="submit" className="btn btn-small" style={{ fontSize: '0.5rem' }}>Add</button>
              </form>

              {course.modules.length === 0 && (
                <p className="text-dim" style={{ fontSize: '0.8rem', marginBottom: 8 }}>No modules yet.</p>
              )}

              <div className="cb-module-list" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {course.modules.map((m, i) => {
                  const isActive = activeModule === m.id || (!activeModule && i === 0)
                  return (
                    <div
                      key={m.id}
                      className={`cb-module-card ${isActive ? 'cb-module-active' : ''}`}
                      onClick={() => setActiveModule(m.id)}
                    >
                      <span className="cb-module-num">{i + 1}</span>
                      <div className="cb-module-body">
                        {editingModuleName === m.id ? (
                          <input
                            value={editModuleValue}
                            onChange={(e) => setEditModuleValue(e.target.value)}
                            onBlur={() => saveRenameModule(course.id, m.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveRenameModule(course.id, m.id) }}
                            className="input"
                            style={{ fontSize: '0.8rem', padding: '2px 6px' }}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="cb-module-name">{m.name}</span>
                        )}
                        <span className="cb-module-info">{m.quizSetIds.length}q</span>
                      </div>
                      <div className="cb-module-actions">
                        <button
                          className="btn btn-outline btn-small"
                          style={{ padding: '2px 5px', fontSize: '0.4rem' }}
                          onClick={(e) => { e.stopPropagation(); startRenameModule(m) }}
                          title="Rename"
                        >
                          ✎
                        </button>
                        <button
                          className="btn btn-danger btn-small"
                          style={{ padding: '2px 5px', fontSize: '0.4rem' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmAction({
                              message: `Delete module "${m.name}"?`,
                              onConfirm: () => { deleteModule(course.id, m.id); if (activeModule === m.id) setActiveModule(null); forceRefresh() },
                            })
                          }}
                        >
                          x
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Right: Module content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
            {mod ? (
              <>
                {/* Assigned quizzes */}
                <div className="card">
                  <p className="pixel-heading" style={{ margin: 0, marginBottom: 12, fontSize: '0.65rem' }}>
                    {mod.name} — Assigned Quizzes
                  </p>

                  {modQuizSets.length === 0 ? (
                    <p className="text-dim" style={{ fontSize: '0.85rem' }}>No quizzes assigned. Add from below.</p>
                  ) : (
                    modQuizSets.map((s, i) => (
                      <div key={s.id} className="list-item" style={{ fontSize: '0.85rem', padding: '8px 10px', gap: 8 }}>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'var(--font-pixel)', width: 24, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
                        <span className="flex-1">{s.friendlyTitle}</span>
                        <span className="text-dim" style={{ fontSize: '0.65rem' }}>{s.questions.length}q</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <button
                            className="btn btn-outline btn-small"
                            style={{ padding: '1px 4px', fontSize: '0.35rem', lineHeight: 1 }}
                            onClick={() => moveQuiz(mod, i, i - 1)}
                            disabled={i === 0}
                          >
                            ▲
                          </button>
                          <button
                            className="btn btn-outline btn-small"
                            style={{ padding: '1px 4px', fontSize: '0.35rem', lineHeight: 1 }}
                            onClick={() => moveQuiz(mod, i, i + 1)}
                            disabled={i === modQuizSets.length - 1}
                          >
                            ▼
                          </button>
                        </div>
                        {onEditQuiz && (
                          <button
                            className="btn btn-small btn-outline"
                            style={{ padding: '3px 8px', fontSize: '0.4rem' }}
                            onClick={() => onEditQuiz(s.id)}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          className="btn btn-danger btn-small"
                          style={{ padding: '3px 8px', fontSize: '0.4rem' }}
                          onClick={() => setConfirmAction({ message: `Remove "${s.friendlyTitle}" from ${mod.name}? It will return to the available quizzes pool.`, onConfirm: () => { removeQuizFromModule(course.id, mod.id, s.id); forceRefresh() } })}
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Available quizzes */}
                <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                  <p className="pixel-heading" style={{ margin: 0, marginBottom: 8, fontSize: '0.6rem', flexShrink: 0 }}>Available Quizzes</p>
                  <input
                    value={quizSearch}
                    onChange={(e) => setQuizSearch(e.target.value)}
                    placeholder="Search quizzes..."
                    className="input"
                    style={{ fontSize: '0.85rem', padding: '8px 12px', marginBottom: 8, flexShrink: 0 }}
                  />

                  <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                    {availableQuizzes.length === 0 ? (
                      <p className="text-dim" style={{ fontSize: '0.8rem' }}>
                        {searchLower ? 'No matches.' : 'All quizzes assigned or none imported.'}
                      </p>
                    ) : (() => {
                      let lastFolder = null
                      return availableQuizzes.map((s) => {
                        const folderName = s.folderId ? (folderMap[s.folderId]?.name || null) : null
                        const showHeader = folderName !== lastFolder
                        lastFolder = folderName
                        return (
                          <div key={s.id} style={{ position: 'relative' }}>
                            {showHeader && (
                              <div style={{ padding: '6px 10px 3px', fontSize: '0.55rem', fontFamily: 'var(--font-pixel)', color: 'var(--accent)', textTransform: 'uppercase', opacity: 0.7, borderTop: lastFolder !== null || folderName ? '1px solid var(--border)' : 'none', marginTop: folderName ? 4 : 0 }}>
                                {folderName || 'Unfiled'}
                              </div>
                            )}
                            <div
                              className="list-item"
                              style={{ fontSize: '0.85rem', padding: '6px 10px', cursor: 'pointer' }}
                              onClick={() => setPendingAssign(pendingAssign === s.id ? null : s.id)}
                            >
                              <span className="flex-1">{s.friendlyTitle}</span>
                              <span className="text-dim" style={{ fontSize: '0.65rem', marginRight: 8 }}>{s.questions.length}q</span>
                              <span style={{ fontSize: '0.55rem', color: 'var(--accent)', fontFamily: 'var(--font-pixel)' }}>+ Add</span>
                            </div>
                            {pendingAssign === s.id && (
                              <div className="cb-assign-popup">
                                <p style={{ margin: '0 0 8px', fontSize: '0.65rem' }}>Assign <strong>{s.friendlyTitle}</strong> ({s.questions.length}q) to <strong>{mod.name}</strong>?</p>
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                  <button className="btn btn-small" style={{ fontSize: '0.45rem', padding: '4px 12px' }} onClick={() => { assignQuizToModule(course.id, mod.id, s.id); setPendingAssign(null); forceRefresh() }}>Assign</button>
                                  <button className="btn btn-small btn-outline" style={{ fontSize: '0.45rem', padding: '4px 10px' }} onClick={() => setPendingAssign(null)}>Cancel</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })
                    })()}
                  </div>
                </div>
              </>
            ) : (
              <div className="card">
                <p className="text-dim" style={{ fontSize: '0.85rem' }}>Add a module to get started.</p>
              </div>
            )}
          </div>
        </div>

        {confirmAction && (
          <div className="modal-overlay">
            <div className="modal">
              <p className="modal-text">{confirmAction.message}</p>
              <div className="modal-actions">
                <button className="btn btn-danger" onClick={() => { confirmAction.onConfirm(); setConfirmAction(null) }}>Yes</button>
                <button className="btn btn-outline" onClick={() => setConfirmAction(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ===== CLASS-SPECIFIC COURSE LIST =====
  if (selectedClassId) {
    const selectedClass = classes.find((c) => c.id === selectedClassId)
    const classCourses = courses.filter((c) => c.classId === selectedClassId)

    return (
      <div className="page" style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div className="header">
          <div>
            <h1 className="pixel-title">{selectedClass?.name || 'Class'} — Courses</h1>
          </div>
          <button className="btn-logout" onClick={() => setSelectedClassId(null)}>Back to Classes</button>
        </div>

        <div className="card mt-16">
          <p className="pixel-heading" style={{ margin: 0, marginBottom: 8, fontSize: '0.65rem' }}>New Course</p>
          <form onSubmit={handleCreateCourse} className="form-row" style={{ gap: 8 }}>
            <input
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              placeholder={`Course name (e.g. ${selectedClass?.name || 'Class'} T1)`}
              className="input flex-1"
              style={{ fontSize: '0.85rem' }}
            />
            <select
              value={newCourseTerm || activeTerm}
              onChange={(e) => setNewCourseTerm(e.target.value)}
              className="input"
              style={{ width: 70, fontSize: '0.8rem' }}
            >
              {['T1', 'T2', 'T3', 'T4'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button type="submit" className="btn btn-small" style={{ fontSize: '0.55rem' }}>Create</button>
          </form>
        </div>

        <div className="card mt-16">
          <p className="pixel-heading" style={{ margin: 0, marginBottom: 8, fontSize: '0.65rem' }}>Courses</p>
          {classCourses.length === 0 ? (
            <p className="text-dim" style={{ fontSize: '0.85rem' }}>No courses for this class. Create one above.</p>
          ) : (
            <table className="table w-full">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: '0.7rem' }}>Course</th>
                  <th style={{ textAlign: 'center', width: 60, fontSize: '0.7rem' }}>Term</th>
                  <th style={{ textAlign: 'center', width: 80, fontSize: '0.7rem' }}>Modules</th>
                  <th style={{ textAlign: 'center', width: 90, fontSize: '0.7rem' }}>Students</th>
                  <th style={{ textAlign: 'center', width: 120, fontSize: '0.7rem' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {classCourses.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontSize: '0.85rem' }}>{c.name}</td>
                    <td style={{ textAlign: 'center' }}>
                      <select
                        value={c.term || ''}
                        onChange={(e) => { updateCourse(c.id, { term: e.target.value }); forceRefresh() }}
                        className="input"
                        style={{ width: 60, fontSize: '0.7rem', padding: '2px 4px', textAlign: 'center', color: 'var(--accent)' }}
                      >
                        <option value="">--</option>
                        {['T1', 'T2', 'T3', 'T4'].map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td style={{ textAlign: 'center', fontSize: '0.8rem' }}>{c.modules.length}</td>
                    <td style={{ textAlign: 'center', fontSize: '0.8rem', color: courseTakesWholeClass(c.id) ? 'var(--text-dim)' : 'var(--accent)' }}>
                      {courseTakesWholeClass(c.id) ? 'All' : `${getCourseStudentIds(c.id).length} of ${(classes.find((x) => x.id === c.classId)?.studentIds || []).length}`}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn btn-outline btn-small"
                        style={{ padding: '4px 10px', fontSize: '0.45rem', marginRight: 4 }}
                        onClick={() => { setEditingCourse(c.id); setActiveModule(c.modules[0]?.id || null) }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger btn-small"
                        style={{ padding: '4px 8px', fontSize: '0.4rem' }}
                        onClick={() => setConfirmAction({ message: `Delete course "${c.name}"?`, onConfirm: () => { deleteCourse(c.id); forceRefresh() } })}
                      >
                        x
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {confirmAction && (
          <div className="modal-overlay">
            <div className="modal">
              <p className="modal-text">{confirmAction.message}</p>
              <div className="modal-actions">
                <button className="btn btn-danger" onClick={() => { confirmAction.onConfirm(); setConfirmAction(null) }}>Yes</button>
                <button className="btn btn-outline" onClick={() => setConfirmAction(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ===== CLASS SELECTION =====
  return (
    <div className="page" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div className="header">
        <div>
          <h1 className="pixel-title">Course Builder</h1>
        </div>
        <button className="btn-logout" onClick={onBack}>Back</button>
      </div>

      <p className="pixel-heading" style={{ marginTop: 16, marginBottom: 16 }}>Select a Class</p>
      {classes.length === 0 ? (
        <p className="text-dim">No classes yet. Create one in the dashboard first.</p>
      ) : (
        <div className="portal-class-grid">
          {classes.map((cls) => (
            <div key={cls.id} className="portal-class-card-wrap">
              <div className="portal-class-card" onClick={() => setSelectedClassId(cls.id)}>
                <div className="portal-class-img" style={cls.image ? { backgroundImage: `url(${cls.image})` } : {}}>
                  {!cls.image && <span className="portal-class-placeholder">📖</span>}
                </div>
                <div className="portal-class-name" title={cls.name}>{cls.name}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default CourseBuilder
