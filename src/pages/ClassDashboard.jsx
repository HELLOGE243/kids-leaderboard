import { useState, useEffect, useMemo } from 'react'
import {
  getClassDashboardData,
  getQuizResultsGrid,
  getStudentClassScores,
  getImportedQuizSet,
  getCoursesForOrg,
  onDataChange,
  preloadClassStudents,
} from '../data/store.js'
import ClassSkills from '../components/ClassSkills.jsx'
import ClassGroupsPanel from '../components/ClassGroupsPanel.jsx'
import ClassQuizBrowser from '../components/ClassQuizBrowser.jsx'
import '../class-dashboard.css'

/**
 * A class, or one teaching group inside it.
 *
 * A teacher holds groups rather than classes, so the same screen is narrowed to
 * the students in the group they opened - the headline figures, the results
 * grid and the student list all count that group alone, because a group's
 * teacher has no business reading the rest of the class.
 */
function ClassDashboard({ classId, orgId, groupId = null, canEditGroups = false, onBack }) {
  const [refresh, setRefresh] = useState(0)
  const [view, setView] = useState('overview')
  const [selectedQuizId, setSelectedQuizId] = useState(null)
  const [selectedStudentId, setSelectedStudentId] = useState(null)
  const [sort, setSort] = useState({ key: 'name', asc: true })
  const [browsing, setBrowsing] = useState(false)
  const [quizSort, setQuizSort] = useState({ key: 'name', asc: true })

  useEffect(() => {
    const unsub = onDataChange(() => setRefresh(r => r + 1))
    return unsub
  }, [])

  useEffect(() => {
    const interval = setInterval(() => setRefresh(r => r + 1), 5000)
    return () => clearInterval(interval)
  }, [])

  // Student work lives in per-student documents; pull this class's in one
  // batch so the grids below can stay synchronous.
  useEffect(() => {
    let cancelled = false
    preloadClassStudents(classId, groupId).then(() => {
      if (!cancelled) setRefresh(r => r + 1)
    })
    return () => { cancelled = true }
  }, [classId, groupId])

  const dashboard = useMemo(() => getClassDashboardData(classId, groupId), [classId, groupId, refresh])

  if (!dashboard) return <div className="cd-page"><p>Class not found.</p><button className="btn" onClick={onBack}>Back</button></div>

  const { cls, courses, students, totalQuizzes } = dashboard

  if (view === 'quiz' && selectedQuizId) {
    return <QuizResultsView quizSetId={selectedQuizId} classStudentIds={dashboard.studentIds} onBack={() => { setView('overview'); setSelectedQuizId(null) }} refresh={refresh} />
  }

  if (browsing) {
    return <ClassQuizBrowser classId={classId} orgId={orgId} onBack={() => setBrowsing(false)} />
  }

  if (view === 'student' && selectedStudentId) {
    return <StudentClassReport studentId={selectedStudentId} classId={classId} onBack={() => { setView('overview'); setSelectedStudentId(null) }} refresh={refresh} />
  }

  const totalStudents = students.length
  const avgCompletion = totalStudents > 0 ? Math.round(students.reduce((s, st) => s + (st.total > 0 ? (st.completed / st.total) * 100 : 0), 0) / totalStudents) : 0
  const avgScore = totalStudents > 0 ? Math.round(students.reduce((s, st) => s + st.avgPct, 0) / totalStudents) : 0

  const sorted = [...students].sort((a, b) => {
    const dir = sort.asc ? 1 : -1
    if (sort.key === 'name') return dir * a.name.localeCompare(b.name)
    if (sort.key === 'completion') return dir * (a.completed - b.completed)
    if (sort.key === 'results') return dir * (a.avgPct - b.avgPct)
    return 0
  })

  function toggleSort(key) {
    setSort(prev => prev.key === key ? { key, asc: !prev.asc } : { key, asc: true })
  }

  const allQuizzes = []
  for (const course of courses) {
    for (const mod of course.modules) {
      for (const qsId of mod.quizSetIds) {
        const qs = getImportedQuizSet(qsId)
        allQuizzes.push({ id: qsId, title: qs?.rawTitle || qs?.name || qsId, courseName: course.name, moduleName: mod.name, term: course.term })
      }
    }
  }

  return (
    <div className="cd-page">
      <div className="cd-header">
        <button className="cd-back-btn" onClick={onBack}>{'←'} Back</button>
        <h2 className="cd-title">{cls.name}</h2>
        {cls.yearGroup && <span className="cd-year">{cls.yearGroup}</span>}
        <button className="cd-browse-btn" onClick={() => setBrowsing(true)}>Browse papers</button>
      </div>

      <div className="cd-stats-row">
        <div className="cd-stat-card">
          <span className="cd-stat-value">{totalStudents}</span>
          <span className="cd-stat-label">Students</span>
        </div>
        <div className="cd-stat-card">
          <span className="cd-stat-value">{avgCompletion}%</span>
          <span className="cd-stat-label">Avg Completion</span>
        </div>
        <div className="cd-stat-card">
          <span className="cd-stat-value">{avgScore}%</span>
          <span className="cd-stat-label">Avg Score</span>
        </div>
      </div>

      {/* How the class is actually taught comes first. */}
      <div className="cd-section">
        <ClassGroupsPanel
          classId={classId}
          students={students}
          canEdit={canEditGroups}
          fixedGroupId={groupId}
          onOpenStudent={(id) => { setSelectedStudentId(id); setView('student') }}
        />
      </div>

      <div className="cd-section">
        <h3 className="cd-section-title">Every student</h3>
        <div className="cd-table">
          <div className="cd-table-header">
            <span className="cd-th cd-th-name" onClick={() => toggleSort('name')}>Name {sort.key === 'name' ? (sort.asc ? '▲' : '▼') : ''}</span>
            <span className="cd-th cd-th-completion" onClick={() => toggleSort('completion')}>Completed {sort.key === 'completion' ? (sort.asc ? '▲' : '▼') : ''}</span>
            <span className="cd-th cd-th-results" onClick={() => toggleSort('results')}>Avg Score {sort.key === 'results' ? (sort.asc ? '▲' : '▼') : ''}</span>
          </div>
          {sorted.map(st => (
            <div key={st.id} className="cd-table-row" onClick={() => { setSelectedStudentId(st.id); setView('student') }}>
              <span className="cd-td cd-td-name">{st.name}</span>
              <span className="cd-td cd-td-completion">
                <span className="cd-progress-bar">
                  <span className="cd-progress-fill" style={{ width: `${st.total > 0 ? (st.completed / st.total) * 100 : 0}%` }} />
                </span>
                <span className="cd-progress-text">{st.completed}/{st.total}</span>
              </span>
              <span className={`cd-td cd-td-results ${st.avgPct >= 70 ? 'cd-score-high' : st.avgPct >= 50 ? 'cd-score-mid' : st.avgPct > 0 ? 'cd-score-low' : ''}`}>
                {st.avgPct > 0 ? `${st.avgPct}%` : '—'}
              </span>
            </div>
          ))}
          {students.length === 0 && <div className="cd-empty">No students in this class</div>}
        </div>
      </div>

      <details className="cd-analytics">
        <summary className="cd-section-title">Analytics — skills and weaknesses</summary>
        <ClassSkills classId={classId} orgId={orgId} canEditGroups={false} fixedGroupId={groupId} onOpenStudent={(id) => { setSelectedStudentId(id); setView('student') }} />
      </details>

      <div className="cd-section">
        <h3 className="cd-section-title">Papers — tap one for every student's result</h3>
        <div className="cd-table">
          <div className="cd-table-header">
            <span className="cd-th cd-th-name">Quiz</span>
            <span className="cd-th cd-th-completion">Course / Module</span>
            <span className="cd-th cd-th-results">Term</span>
          </div>
          {allQuizzes.map(q => (
            <div key={q.id} className="cd-table-row" onClick={() => { setSelectedQuizId(q.id); setView('quiz') }}>
              <span className="cd-td cd-td-name">{q.title}</span>
              <span className="cd-td cd-td-completion cd-text-dim">{q.courseName} / {q.moduleName}</span>
              <span className="cd-td cd-td-results cd-text-dim">{q.term || '—'}</span>
            </div>
          ))}
          {allQuizzes.length === 0 && <div className="cd-empty">No quizzes assigned to this class</div>}
        </div>
      </div>
    </div>
  )
}

function QuizResultsView({ quizSetId, classStudentIds, onBack, refresh }) {
  const data = useMemo(() => getQuizResultsGrid(quizSetId), [quizSetId, refresh])
  const [sort, setSort] = useState({ key: 'score', asc: false })
  const [activeCell, setActiveCell] = useState(null)

  if (!data) return <div className="cd-page"><p>Quiz not found.</p><button className="btn" onClick={onBack}>Back</button></div>

  const { quizSet, rows, questionCount, reportedQuestionIndices } = data

  const sorted = [...rows].sort((a, b) => {
    const dir = sort.asc ? 1 : -1
    if (sort.key === 'name') return dir * a.studentName.localeCompare(b.studentName)
    if (sort.key === 'score') return dir * (a.pct - b.pct)
    return 0
  })

  function toggleSort(key) {
    setSort(prev => prev.key === key ? { key, asc: !prev.asc } : { key, asc: true })
  }

  const submitted = rows.length
  const totalStudents = classStudentIds?.length || submitted
  const avgScore = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.pct, 0) / rows.length) : 0

  const qAvgs = Array.from({ length: questionCount }, (_, i) => {
    const answered = rows.filter(r => r.questionResults[i] && r.questionResults[i] !== 'skipped')
    if (answered.length === 0) return null
    const correct = answered.filter(r => r.questionResults[i] === 'correct').length
    return Math.round((correct / answered.length) * 100)
  })

  function formatTime(seconds) {
    if (!seconds && seconds !== 0) return '—'
    if (seconds < 60) return `${Math.round(seconds)}s`
    const m = Math.floor(seconds / 60)
    const s = Math.round(seconds % 60)
    return `${m}m ${s}s`
  }

  function handleCellClick(studentId, qi, e) {
    e.stopPropagation()
    const key = `${studentId}-${qi}`
    setActiveCell(prev => prev === key ? null : key)
  }

  return (
    <div className="cd-page" onClick={() => setActiveCell(null)}>
      <div className="cd-header">
        <button className="cd-back-btn" onClick={onBack}>{'←'} Back</button>
        <h2 className="cd-title">{quizSet.rawTitle || quizSet.name || 'Quiz Results'}</h2>
      </div>

      <div className="cd-stats-row">
        <div className="cd-stat-card">
          <span className="cd-stat-value">{submitted}/{totalStudents}</span>
          <span className="cd-stat-label">Submitted</span>
        </div>
        <div className="cd-stat-card">
          <span className="cd-stat-value">{avgScore}%</span>
          <span className="cd-stat-label">Class Average</span>
        </div>
        <div className="cd-stat-card">
          <span className="cd-stat-value">{questionCount}</span>
          <span className="cd-stat-label">Questions</span>
        </div>
      </div>

      <div className="cd-results-grid-wrap">
        <div className="cd-results-grid" style={{ gridTemplateColumns: `180px 70px repeat(${questionCount}, 1fr)` }}>
          <span className="cd-rg-header cd-rg-name" onClick={() => toggleSort('name')}>Student {sort.key === 'name' ? (sort.asc ? '▲' : '▼') : ''}</span>
          <span className="cd-rg-header cd-rg-score" onClick={() => toggleSort('score')}>Totals {sort.key === 'score' ? (sort.asc ? '▲' : '▼') : ''}</span>
          {Array.from({ length: questionCount }, (_, i) => (
            <span key={i} className={`cd-rg-header cd-rg-q ${reportedQuestionIndices.includes(i) ? 'cd-rg-reported-header' : ''}`}>
              {i + 1}{reportedQuestionIndices.includes(i) && <span className="cd-rg-report-icon" title="Error reported">{'⚠'}</span>}
            </span>
          ))}

          <span className="cd-rg-cell cd-rg-name cd-rg-avg-row">{quizSet.rawTitle || quizSet.name || 'Quiz'}</span>
          <span className="cd-rg-cell cd-rg-score cd-rg-avg-row">{avgScore}%</span>
          {qAvgs.map((avg, i) => (
            <span key={i} className="cd-rg-cell cd-rg-q cd-rg-avg-row">{avg !== null ? `${avg}%` : '—'}</span>
          ))}

          {sorted.map(row => (
            <div key={row.studentId} className="cd-rg-row" style={{ display: 'contents' }}>
              <span className="cd-rg-cell cd-rg-name">{row.studentName}</span>
              <span className={`cd-rg-cell cd-rg-score ${row.pct >= 70 ? 'cd-score-high' : row.pct >= 50 ? 'cd-score-mid' : 'cd-score-low'}`}>
                {row.pct}%
              </span>
              {row.questionResults.map((r, i) => {
                const cellKey = `${row.studentId}-${i}`
                const isActive = activeCell === cellKey
                const timeVal = row.time?.[i]
                const reported = row.reportedQuestions?.includes(i)
                return (
                  <span key={i} className={`cd-rg-cell cd-rg-q cd-rg-bar cd-rg-${r}`} onClick={(e) => handleCellClick(row.studentId, i, e)}>
                    {reported && <span className="cd-rg-cell-report">{'⚠'}</span>}
                    {isActive && (
                      <span className="cd-rg-time-tip">{formatTime(timeVal)}</span>
                    )}
                  </span>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {rows.length === 0 && <div className="cd-empty" style={{ marginTop: 16 }}>No submissions yet</div>}
    </div>
  )
}

function StudentClassReport({ studentId, classId, onBack, refresh }) {
  const data = useMemo(() => getStudentClassScores(studentId, classId), [studentId, classId, refresh])

  if (!data) return <div className="cd-page"><p>Student not found.</p><button className="btn" onClick={onBack}>Back</button></div>

  const { student, courses } = data

  return (
    <div className="cd-page">
      <div className="cd-header">
        <button className="cd-back-btn" onClick={onBack}>{'←'} Back</button>
        <h2 className="cd-title">{student.name}</h2>
      </div>

      <div className="cd-report-card">
        <div className="cd-report-row"><span className="cd-report-label">Full Name</span><span className="cd-report-value">{student.name}</span></div>
        {student.yearGroup && <div className="cd-report-row"><span className="cd-report-label">Year Group</span><span className="cd-report-value">{student.yearGroup}</span></div>}
        {student.school && <div className="cd-report-row"><span className="cd-report-label">School</span><span className="cd-report-value">{student.school}</span></div>}
      </div>

      {courses.map(course => (
        <div key={course.courseId} className="cd-section">
          <h3 className="cd-section-title">{course.courseName} <span className="cd-text-dim">({course.term || 'No term'})</span></h3>
          {course.modules.map((mod, mi) => (
            <div key={mi} className="cd-module-block">
              <h4 className="cd-module-title">{mod.name}</h4>
              <div className="cd-quiz-list">
                {mod.quizzes.map(q => (
                  <div key={q.id} className="cd-quiz-row">
                    <span className="cd-quiz-name">
                      {q.title}
                      {q.lockedOut && <span className="cd-locked-tag" title={`Left the quiz screen ${q.screenLeaves} times; submitted automatically`}>Locked out</span>}
                      {!q.lockedOut && q.screenLeaves > 0 && <span className="cd-leaves-tag" title="Times the student left the quiz screen">Left screen ×{q.screenLeaves}</span>}
                    </span>
                    {q.score !== null ? (
                      <span className={`cd-quiz-score ${q.pct >= 70 ? 'cd-score-high' : q.pct >= 50 ? 'cd-score-mid' : 'cd-score-low'}`}>
                        {q.score}/{q.total} ({q.pct}%)
                      </span>
                    ) : (
                      <span className="cd-quiz-score cd-text-dim">Not attempted</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}

      {courses.length === 0 && <div className="cd-empty">No courses assigned to this class</div>}
    </div>
  )
}

export default ClassDashboard
