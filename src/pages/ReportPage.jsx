import { useMemo, useState, useEffect } from 'react'
import {
  getStudentById,
  getClassesForStudent,
  getCoursesForStudent,
  getHomeworkAttemptsForStudent,
  getDojoCardsForStudent,
  getDojoArchivedCards,
  getVocabBankStats,
  getHomeworkOverviewForStudent,
  getTestEventsForClass,
  getScoresForStudentInClass,
  getScoresForTestEvent,
  getCoursePercentile,
  getImportedQuizSet,
  getOverallPercentile,
  getStudentWritingMarks,
  fullName,
} from '../data/store.js'

function getGrade(pct) {
  if (pct >= 90) return { label: 'Outstanding', color: '#b464ff' }
  if (pct >= 80) return { label: 'Excellent', color: '#00e5ff' }
  if (pct >= 65) return { label: 'Good', color: '#66bb6a' }
  if (pct >= 50) return { label: 'Satisfactory', color: '#ffab00' }
  if (pct >= 30) return { label: 'Developing', color: '#ff9100' }
  return { label: 'Needs Support', color: '#ff1744' }
}

function RingChart({ pct, size = 120, stroke = 10, color }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={`${(pct / 100) * circ} ${circ}`}
        transform={`rotate(-90 ${size/2} ${size/2})`} style={{ transition: 'stroke-dasharray 1s ease' }} />
    </svg>
  )
}

const TRAIL_CAMPS = [
  { name: 'Fort Street', cutoff: 70, emoji: '🏕', x: 68, y: 91 },
  { name: 'Penrith', cutoff: 74, emoji: '🌲', x: 30, y: 83 },
  { name: 'Sydney Girls', cutoff: 78, emoji: '🌲', x: 66, y: 74 },
  { name: 'Hornsby Girls', cutoff: 81, emoji: '⛰', x: 32, y: 65 },
  { name: 'Baulkham Hills', cutoff: 84, emoji: '⛰', x: 63, y: 56 },
  { name: 'Sydney Boys', cutoff: 87, emoji: '🏔', x: 35, y: 47 },
  { name: 'Normanhurst', cutoff: 90, emoji: '🏔', x: 60, y: 38 },
  { name: 'North Sydney Girls', cutoff: 93, emoji: '⭐', x: 38, y: 27 },
  { name: 'North Sydney Boys', cutoff: 94, emoji: '⭐', x: 56, y: 22 },
  { name: 'James Ruse', cutoff: 97, emoji: '👑', x: 50, y: 5 },
]

function buildTrailPath() {
  const start = { x: 55, y: 98 }
  const pts = [start, ...TRAIL_CAMPS.map(c => ({ x: c.x, y: c.y }))]
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], c = pts[i]
    const my = (p.y + c.y) / 2
    d += ` C ${p.x},${my} ${c.x},${my} ${c.x},${c.y}`
  }
  return d
}

function getHikerPos(pct) {
  const camps = TRAIL_CAMPS
  if (pct < camps[0].cutoff) {
    const t = Math.max(0, pct) / camps[0].cutoff
    return { x: 55 + t * (camps[0].x - 55), y: 93 + t * (camps[0].y - 93) }
  }
  for (let i = 0; i < camps.length - 1; i++) {
    if (pct >= camps[i].cutoff && pct < camps[i + 1].cutoff) {
      const t = (pct - camps[i].cutoff) / (camps[i + 1].cutoff - camps[i].cutoff)
      return {
        x: camps[i].x + t * (camps[i + 1].x - camps[i].x),
        y: camps[i].y + t * (camps[i + 1].y - camps[i].y),
      }
    }
  }
  return { x: camps[camps.length - 1].x, y: camps[camps.length - 1].y }
}

const TRAIL_D = buildTrailPath()

function SchoolBenchmark({ avgPct, studentName }) {
  const beaten = TRAIL_CAMPS.filter(s => avgPct >= s.cutoff).length
  const nextSchool = TRAIL_CAMPS.find(s => s.cutoff > avgPct)
  const gap = nextSchool ? nextSchool.cutoff - avgPct : 0

  const target = getHikerPos(avgPct)
  const [pos, setPos] = useState({ x: 55, y: 95 })
  useEffect(() => {
    const t = setTimeout(() => setPos(target), 400)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="rpt-section rpt-summit">
      <p className="hw-res-section-label">Summit Challenge</p>
      <p className="rpt-benchmark-sub">
        {beaten > 0
          ? `You've reached ${beaten} base camp${beaten > 1 ? 's' : ''}!`
          : 'Start your climb — the first base camp is within reach!'}
        {nextSchool && gap <= 12 && <span className="rpt-benchmark-nudge"> {gap}% to {nextSchool.name}!</span>}
      </p>
      <div className="rpt-everest">
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="rpt-everest-svg">
          <defs>
            <linearGradient id="evSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#070b1a" />
              <stop offset="35%" stopColor="#111638" />
              <stop offset="70%" stopColor="#1a1a4e" />
              <stop offset="100%" stopColor="#1e1235" />
            </linearGradient>
            <linearGradient id="evMt" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d0d8e8" />
              <stop offset="12%" stopColor="#8a9bb0" />
              <stop offset="30%" stopColor="#5a6878" />
              <stop offset="55%" stopColor="#3a4a58" />
              <stop offset="80%" stopColor="#2a3a38" />
              <stop offset="100%" stopColor="#1a2e1e" />
            </linearGradient>
            <linearGradient id="evRidge" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6a7a8a" />
              <stop offset="100%" stopColor="#1a2820" />
            </linearGradient>
          </defs>
          <rect width="100" height="100" fill="url(#evSky)" />
          {[8,16,24,38,52,61,73,82,91,14,44,68,77,86].map((x, i) => (
            <circle key={i} cx={x} cy={2 + (i * 5.3) % 22} r={0.25 + (i % 3) * 0.12} fill="#fff" opacity={0.15 + (i % 5) * 0.08} />
          ))}
          <circle cx="88" cy="7" r="2.5" fill="#ffeebb" opacity="0.12" />
          <circle cx="88" cy="7" r="1.5" fill="#ffeebb" opacity="0.25" />
          <polygon points="0,100 10,76 20,62 30,48 38,34 44,20 48,10 50,3 52,10 56,20 62,34 70,48 80,62 90,78 100,100" fill="url(#evMt)" />
          <polygon points="0,100 14,74 24,58 32,46 38,100" fill="url(#evRidge)" opacity="0.35" />
          <polygon points="62,100 68,48 76,58 84,72 100,100" fill="url(#evRidge)" opacity="0.3" />
          <polygon points="44,20 48,10 50,3 52,10 56,20 53,18 50,22 47,18" fill="#fff" opacity="0.85" />
          <polygon points="42,26 47,18 50,22 53,18 58,26 54,24 50,28 46,24" fill="#fff" opacity="0.35" />
          <polygon points="0,100 5,94 15,96 25,92 35,96 45,93 55,96 65,92 75,95 85,93 95,96 100,100" fill="#15251a" opacity="0.5" />
          <line x1="50" y1="3" x2="50" y2="0.5" stroke="#ddd" strokeWidth="0.3" />
          <polygon points="50,0.5 53,1.5 50,2.5" fill="#ff4444" opacity="0.8" />
          <path d={TRAIL_D} fill="none" stroke="rgba(255,255,200,0.2)" strokeWidth="0.5" strokeDasharray="1.2,0.8" strokeLinecap="round" />
          {TRAIL_CAMPS.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r="0.8" fill={avgPct >= c.cutoff ? 'rgba(102,187,106,0.7)' : 'rgba(255,255,255,0.15)'} />
          ))}
        </svg>

        {TRAIL_CAMPS.map((camp, i) => {
          const isLeft = camp.x < 50
          const passed = avgPct >= camp.cutoff
          return (
            <div key={i} className={`rpt-camp ${passed ? 'rpt-camp-passed' : ''} ${isLeft ? 'rpt-camp-lr' : 'rpt-camp-rl'}`}
              style={{ left: `${camp.x}%`, top: `${camp.y}%` }}>
              <span className="rpt-camp-flag">{camp.emoji}</span>
              <div className="rpt-camp-info">
                <span className="rpt-camp-name">{camp.name}</span>
                <span className="rpt-camp-cutoff">{camp.cutoff}%</span>
              </div>
            </div>
          )
        })}

        <div className="rpt-hiker" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
          <div className="rpt-hiker-glow" />
          <svg viewBox="0 0 24 32" width="22" height="28" className="rpt-hiker-icon">
            <circle cx="12" cy="7" r="5" fill="#ffd700" />
            <circle cx="12" cy="7" r="3.5" fill="#fff3e0" />
            <circle cx="10.5" cy="6.5" r="0.7" fill="#333" />
            <circle cx="13.5" cy="6.5" r="0.7" fill="#333" />
            <path d="M10.5 8.5 Q12 10 13.5 8.5" fill="none" stroke="#333" strokeWidth="0.5" />
            <rect x="9" y="11" width="6" height="8" rx="2" fill="#ffd700" />
            <line x1="9" y1="14" x2="5" y2="19" stroke="#ffd700" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="15" y1="14" x2="19" y2="11" stroke="#ffd700" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="19" y1="11" x2="19" y2="5" stroke="#b8860b" strokeWidth="1" strokeLinecap="round" />
            <polygon points="17,5 19,3 21,5 19,5" fill="#ff4444" />
            <line x1="10.5" y1="19" x2="9" y2="26" stroke="#ffd700" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="13.5" y1="19" x2="15" y2="26" stroke="#ffd700" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="rpt-hiker-label">{studentName}<br />{avgPct}%</span>
        </div>
      </div>
    </div>
  )
}

function MiniBar({ value, max = 100, color = '#4caf50' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="rpt-mini-bar-track">
      <div className="rpt-mini-bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

function ReportPage({ studentId, onBack }) {
  const student = getStudentById(studentId)
  const classes = getClassesForStudent(studentId)

  const data = useMemo(() => {
    if (!student) return null
    const attempts = getHomeworkAttemptsForStudent(studentId)
    const dojoActive = getDojoCardsForStudent(studentId)
    const dojoMastered = getDojoArchivedCards(studentId)
    const vocabStats = getVocabBankStats(studentId)
    const courses = getCoursesForStudent(studentId)

    const totalScore = attempts.reduce((s, a) => s + a.score, 0)
    const totalMarks = attempts.reduce((s, a) => s + a.total, 0)
    const avgPct = totalMarks > 0 ? Math.round((totalScore / totalMarks) * 100) : 0

    const courseStats = []
    const courseSwData = []
    for (const cls of classes) {
      const overview = getHomeworkOverviewForStudent(studentId, cls.id)
      const rawCourses = (courses || []).filter(c => c.classId === cls.id)
      for (const course of overview) {
        let cScore = 0, cTotal = 0, cCompleted = 0, cQuizCount = 0
        for (const mod of course.modules) {
          cScore += mod.totalScore
          cTotal += mod.totalMarks
          cCompleted += mod.completed
          cQuizCount += mod.quizCount
        }
        const pct = cTotal > 0 ? Math.round((cScore / cTotal) * 100) : null
        const percentile = getCoursePercentile(studentId, course.courseId)
        courseStats.push({
          className: cls.name,
          courseName: course.courseName,
          pct,
          percentile,
          completed: cCompleted,
          total: cQuizCount,
          modules: course.modules,
        })

        const rawCourse = rawCourses.find(c => c.id === course.courseId)
        if (rawCourse) {
          const quizResults = []
          for (const mod of rawCourse.modules || []) {
            for (const qsId of mod.quizSetIds || []) {
              const attempt = attempts.find(a => a.quizSetId === qsId)
              if (!attempt || attempt.total <= 0) continue
              const qs = getImportedQuizSet(qsId)
              const qPct = Math.round((attempt.score / attempt.total) * 100)
              quizResults.push({ name: qs?.friendlyTitle || qs?.rawTitle || mod.name, pct: qPct })
            }
          }
          if (quizResults.length > 0) {
            const sorted = [...quizResults].sort((a, b) => b.pct - a.pct)
            courseSwData.push({
              courseName: course.courseName,
              strengths: sorted.filter(q => q.pct >= 70).slice(0, 3),
              weaknesses: [...sorted].reverse().filter(q => q.pct < 55).slice(0, 3),
            })
          }
        }
      }
    }

    courseStats.sort((a, b) => (b.pct || 0) - (a.pct || 0))

    const testData = []
    for (const cls of classes) {
      const events = getTestEventsForClass(cls.id)
      const scores = getScoresForStudentInClass(studentId, cls.id)
      for (const ev of events) {
        const allScores = getScoresForTestEvent(ev.id)
        const myScore = scores.find(s => s.testEventId === ev.id)
        const sorted = [...allScores].sort((a, b) => b.value - a.value)
        const rank = myScore ? sorted.findIndex(s => s.studentId === studentId) + 1 : null
        const total = ev.totalMarks || 100
        const pct = myScore ? Math.round((myScore.value / total) * 100) : null
        testData.push({ name: ev.name, className: cls.name, pct, rank, totalStudents: sorted.length })
      }
    }

    const revisionKey = `revisionDoneAt_${studentId}`
    const lastRevision = localStorage.getItem(revisionKey)
    const daysSinceRevision = lastRevision ? Math.floor((Date.now() - Number(lastRevision)) / (24 * 60 * 60 * 1000)) : null

    const overallPercentile = getOverallPercentile(studentId)

    const writingMarks = getStudentWritingMarks(studentId).map(m => {
      const qs = getImportedQuizSet(m.quizSetId)
      const qTitle = qs?.friendlyTitle || qs?.rawTitle || qs?.title || 'Writing Task'
      return { ...m, quizTitle: qTitle, coins: (m.totalScore || 0) * 2 }
    }).sort((a, b) => new Date(b.date) - new Date(a.date))

    return {
      attempts, avgPct, totalScore, totalMarks,
      dojoActive: dojoActive.length, dojoMastered: dojoMastered.length,
      vocabStats, courses, courseStats, courseSwData,
      testData, daysSinceRevision, overallPercentile, writingMarks,
    }
  }, [studentId])

  if (!student) {
    return (
      <div className="hw-res-backdrop">
        <div className="hw-res-content" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--text-dim)' }}>Student not found.</p>
          <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={onBack}>Back</button>
        </div>
      </div>
    )
  }

  const pctBarColor = data.avgPct >= 80 ? '#00e676' : data.avgPct >= 55 ? '#66bb6a' : data.avgPct >= 40 ? '#ffab00' : '#ff9100'

  return (
    <div className="hw-res-backdrop">
      <div className="hw-res-content rpt-content">
        {/* Header banner */}
        <div className="hw-res-banner">
          <div className="hw-res-banner-left">
            <div className="hw-res-title-box">
              <span className="rpt-student-name">{fullName(student)}</span>
              {(student.yearGroup || student.schoolName) && (
                <span className="rpt-student-info">{[student.yearGroup, student.schoolName].filter(Boolean).join(' · ')}</span>
              )}
              <span className="rpt-report-label">Student Report</span>
            </div>
          </div>
          <div className="hw-res-banner-ring">
            <RingChart pct={data.avgPct} color={pctBarColor} />
            <div className="hw-res-ring-inner">
              <span className="hw-res-ring-pct">{data.avgPct}%</span>
            </div>
          </div>
        </div>

        {/* Summary metrics strip */}
        <div className="hw-res-metrics">
          <div className="hw-res-metric">
            <span className="hw-res-metric-label">Assignments</span>
            <span className="hw-res-metric-val">{data.attempts.length}</span>
          </div>
          <div className="hw-res-metric-sep" />
          <div className="hw-res-metric">
            <span className="hw-res-metric-label">Avg Score</span>
            <span className="hw-res-metric-val" style={{ color: pctBarColor }}>{data.avgPct}%</span>
          </div>
          <div className="hw-res-metric-sep" />
          <div className="hw-res-metric">
            <span className="hw-res-metric-label">Questions Revised</span>
            <span className="hw-res-metric-val" style={{ color: '#64ffda' }}>{data.dojoMastered}</span>
            <span className="hw-res-metric-sub">{data.dojoActive} active</span>
          </div>
          <div className="hw-res-metric-sep" />
          <div className="hw-res-metric">
            <span className="hw-res-metric-label">Overall Percentile</span>
            <span className="hw-res-metric-val" style={{ color: '#ce93d8' }}>{data.overallPercentile !== null ? `${data.overallPercentile}th` : '—'}</span>
            {data.overallPercentile !== null && <span className="hw-res-metric-sub">vs cohort</span>}
          </div>
        </div>

        {/* School Benchmark Ladder */}
        <SchoolBenchmark avgPct={data.avgPct} studentName={fullName(student)} />

        {/* Course Performance */}
        {data.courseStats.length > 0 && (
          <div className="rpt-section">
            <p className="hw-res-section-label">Course Performance</p>
            <div className="rpt-course-grid">
              {data.courseStats.map((c, i) => (
                <div key={i} className="rpt-course-card">
                  <div className="rpt-course-header">
                    <div>
                      <div className="rpt-course-name">{c.courseName}</div>
                      <div className="rpt-course-class">{c.className}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {c.pct != null && (() => {
                        const g = getGrade(c.pct)
                        return (
                          <span className="rpt-course-grade" style={{ background: g.color }}>{g.label}</span>
                        )
                      })()}
                      <div className="rpt-course-pct" style={{ color: c.pct >= 70 ? '#66bb6a' : c.pct >= 50 ? '#ffab00' : c.pct != null ? '#ff9100' : 'var(--text-dim)' }}>
                        {c.pct != null ? `${c.pct}%` : '—'}
                      </div>
                    </div>
                  </div>
                  <MiniBar value={c.pct || 0} color={c.pct >= 70 ? '#66bb6a' : c.pct >= 50 ? '#ffab00' : '#ff9100'} />
                  {c.percentile !== null && (
                    <div className="rpt-percentile-band">
                      <div className="rpt-percentile-bar-track">
                        <div className="rpt-percentile-bar-fill" style={{ width: `${c.percentile}%` }} />
                        <div className="rpt-percentile-marker" style={{ left: `${c.percentile}%` }} />
                      </div>
                      <div className="rpt-percentile-info">
                        <span className="rpt-percentile-val">{c.percentile}<sup>th</sup> percentile</span>
                        <span className="rpt-percentile-desc">Better than {c.percentile}% of students</span>
                      </div>
                    </div>
                  )}
                  <div className="rpt-course-footer">
                    <span>{c.completed}/{c.total} quizzes completed</span>
                  </div>
                  {c.modules.length > 0 && (
                    <div className="rpt-module-list">
                      {c.modules.map((m, mi) => {
                        const mPct = m.totalMarks > 0 ? Math.round((m.totalScore / m.totalMarks) * 100) : null
                        return (
                          <div key={mi} className="rpt-module-row">
                            <span className="rpt-module-name">{m.name}</span>
                            <span className="rpt-module-progress">{m.completed}/{m.quizCount}</span>
                            <span className="rpt-module-pct" style={{ color: mPct >= 70 ? '#66bb6a' : mPct >= 50 ? '#ffab00' : mPct != null ? '#ff9100' : 'var(--text-dim)' }}>
                              {mPct != null ? `${mPct}%` : '—'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per-course Strengths & Weaknesses */}
        {data.courseSwData.length > 0 && (
          <div className="rpt-section">
            <p className="hw-res-section-label">Strengths & Areas for Improvement</p>
            <div className="rpt-sw-courses">
              {data.courseSwData.map((c, ci) => (
                <div key={ci} className="rpt-sw-course-block">
                  <div className="rpt-sw-course-name">{c.courseName}</div>
                  <div className="hw-res-perf-row" style={{ marginTop: 8 }}>
                    <div className="hw-res-perf-panel">
                      <p className="rpt-sw-heading rpt-sw-heading-strong">Strongest Quizzes</p>
                      {c.strengths.length === 0 ? (
                        <p className="rpt-empty-note">No quizzes above 70% yet</p>
                      ) : (
                        <div className="rpt-sw-list">
                          {c.strengths.map((q, qi) => (
                            <div key={qi} className="rpt-sw-item rpt-sw-strength">
                              <span className="rpt-sw-name">{q.name}</span>
                              <span className="rpt-sw-pct">{q.pct}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="hw-res-perf-panel">
                      <p className="rpt-sw-heading rpt-sw-heading-weak">Needs More Practice</p>
                      {c.weaknesses.length === 0 ? (
                        <p className="rpt-empty-note">No quizzes below 55% — great work!</p>
                      ) : (
                        <div className="rpt-sw-list">
                          {c.weaknesses.map((q, qi) => (
                            <div key={qi} className="rpt-sw-item rpt-sw-weakness">
                              <span className="rpt-sw-name">{q.name}</span>
                              <span className="rpt-sw-pct">{q.pct}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Free Writing */}
        {data.writingMarks.length > 0 && (
          <div className="rpt-section">
            <p className="hw-res-section-label">Free Writing</p>
            <div className="rpt-writing-grid">
              {data.writingMarks.map((m, i) => {
                const pct = Math.round((m.totalScore / 25) * 100)
                const barColor = pct >= 80 ? '#66bb6a' : pct >= 60 ? '#ffab00' : '#ff9100'
                return (
                  <div key={m.id || i} className="rpt-writing-card">
                    <div className="rpt-writing-header">
                      <span className="rpt-writing-title">{m.quizTitle}</span>
                      <span className="rpt-writing-date">{new Date(m.date).toLocaleDateString()}</span>
                    </div>
                    <div className="rpt-writing-score-row">
                      <span className="rpt-writing-score" style={{ color: barColor }}>{m.totalScore}</span>
                      <span className="rpt-writing-of">/25</span>
                      <span className="rpt-writing-coins">🪙 {m.coins}</span>
                    </div>
                    <MiniBar value={m.totalScore} max={25} color={barColor} />
                    {m.categories && (
                      <div className="rpt-writing-cats">
                        {m.categories.map((c, ci) => (
                          <div key={ci} className="rpt-writing-cat">
                            <span className="rpt-writing-cat-name">{c.key}</span>
                            <span className="rpt-writing-cat-score">{c.score}/5</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {m.overallComment && <p className="rpt-writing-comment">{m.overallComment}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Revision & Engagement */}
        <div className="hw-res-perf-row">
          <div className="hw-res-perf-panel">
            <p className="hw-res-section-label">Revision Hall</p>
            <div className="rpt-dojo-stats">
              <div className="rpt-dojo-stat">
                <span className="rpt-dojo-num" style={{ color: '#64ffda' }}>{data.dojoActive}</span>
                <span className="rpt-dojo-label">Active Cards</span>
              </div>
              <div className="rpt-dojo-stat">
                <span className="rpt-dojo-num" style={{ color: '#66bb6a' }}>{data.dojoMastered}</span>
                <span className="rpt-dojo-label">Mastered</span>
              </div>
              <div className="rpt-dojo-stat">
                <span className="rpt-dojo-num" style={{ color: '#ffab00' }}>
                  {data.daysSinceRevision !== null ? (data.daysSinceRevision === 0 ? 'Today' : `${data.daysSinceRevision}d ago`) : '—'}
                </span>
                <span className="rpt-dojo-label">Last Daily Rev.</span>
              </div>
            </div>
          </div>
          <div className="hw-res-perf-panel">
            <p className="hw-res-section-label">Vocabulary Growth</p>
            <div className="rpt-dojo-stats">
              <div className="rpt-dojo-stat">
                <span className="rpt-dojo-num" style={{ color: '#ce93d8' }}>{data.vocabStats.total}</span>
                <span className="rpt-dojo-label">Total Words</span>
              </div>
              <div className="rpt-dojo-stat">
                <span className="rpt-dojo-num" style={{ color: '#66bb6a' }}>{data.vocabStats.mastered}</span>
                <span className="rpt-dojo-label">Mastered</span>
              </div>
              <div className="rpt-dojo-stat">
                <span className="rpt-dojo-num" style={{ color: '#4fc3f7' }}>{data.vocabStats.thisWeek}</span>
                <span className="rpt-dojo-label">Added This Week</span>
              </div>
            </div>
          </div>
        </div>

        {/* Test Events */}
        {data.testData.length > 0 && (
          <div className="rpt-section">
            <p className="hw-res-section-label">Competitive Tests</p>
            <div className="hw-res-qtable">
              <div className="hw-res-qtable-header">
                <span className="hw-res-qth" style={{ flex: 2 }}>Test</span>
                <span className="hw-res-qth" style={{ flex: 1 }}>Class</span>
                <span className="hw-res-qth" style={{ flex: 1 }}>Score</span>
                <span className="hw-res-qth" style={{ flex: 1 }}>Rank</span>
              </div>
              <div className="hw-res-qtable-body">
                {data.testData.map((t, i) => (
                  <div key={i} className={`hw-res-qrow ${t.pct !== null ? (t.pct >= 70 ? 'hw-res-qrow-correct' : t.pct >= 40 ? '' : 'hw-res-qrow-wrong') : ''}`}>
                    <span className="hw-res-qcell" style={{ flex: 2, fontWeight: 600 }}>{t.name}</span>
                    <span className="hw-res-qcell" style={{ flex: 1, color: 'var(--text-dim)' }}>{t.className}</span>
                    <span className="hw-res-qcell" style={{ flex: 1 }}>{t.pct != null ? `${t.pct}%` : '—'}</span>
                    <span className="hw-res-qcell" style={{ flex: 1 }}>
                      {t.rank ? <><strong>{t.rank}</strong><span style={{ color: 'var(--text-dim)' }}>/{t.totalStudents}</span></> : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
          <button className="btn btn-outline" style={{ padding: '14px 48px', fontSize: '0.8rem' }} onClick={onBack}>
            Back to Portal
          </button>
        </div>
      </div>
    </div>
  )
}

export default ReportPage
