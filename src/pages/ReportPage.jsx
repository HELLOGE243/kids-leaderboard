import { useEffect, useState } from 'react'
import '../report-page.css'
import { getStudentReport } from '../data/store.js'
import { onDataChange } from '../data/firebase.js'

// Per-course student report, written for parents as much as students: is the
// work being done, how does it compare, and what to do next. Opens on the
// "All courses" overview, or on one course when given initialCourseId (the
// ?report=<courseId> link in parent messages).

const STATUS = {
  done: { label: 'Done', cls: 'ok' },
  late: { label: 'Late', cls: 'warn' },
  missing: { label: 'Missing', cls: 'bad' },
  due: { label: 'Due now', cls: 'due' },
  upcoming: { label: 'Upcoming', cls: 'muted' },
  'not-started': { label: 'Not started', cls: 'muted' },
}

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—')
const band = (pct) => (pct == null ? '' : pct >= 85 ? 'great' : pct >= 70 ? 'good' : pct >= 55 ? 'fair' : 'low')
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`

function Sparkline({ values }) {
  if (!values || values.length < 2) return <span className="rp-dim">Not enough results yet</span>
  const w = 120
  const h = 34
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - (v / 100) * (h - 4) - 2])
  const delta = values[values.length - 1] - values[0]
  return (
    <span className="rp-spark">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.5" fill="currentColor" />
      </svg>
      <b className={delta >= 0 ? 'rp-up' : 'rp-down'}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%</b>
    </span>
  )
}

function Stat({ label, value, sub, tone }) {
  return (
    <div className={`rp-stat ${tone ? `rp-tone-${tone}` : ''}`}>
      <span className="rp-stat-label">{label}</span>
      <span className="rp-stat-value">{value}</span>
      {sub && <span className="rp-stat-sub">{sub}</span>}
    </div>
  )
}

function Percentile({ value }) {
  if (value == null) return <span className="rp-dim">—</span>
  return <span className={`rp-pctl rp-band-${band(value)}`}>{ordinal(value)}</span>
}

function Actions({ actions }) {
  if (!actions.length) return <div className="rp-actions rp-actions-clear">✓ Nothing to follow up — all caught up.</div>
  return (
    <div className="rp-actions">
      <h3>What to do next</h3>
      <ul>{actions.map((a, i) => <li key={i} className={`rp-action-${a.kind}`}>{a.text}</li>)}</ul>
    </div>
  )
}

function Skills({ strengths, weaknesses }) {
  if (!strengths.length && !weaknesses.length) {
    return <p className="rp-dim">Skill breakdown appears once tagged questions have been answered.</p>
  }
  const row = (s) => (
    <div key={s.tagId} className="rp-skill">
      <span className="rp-skill-name">{s.name}</span>
      <span className="rp-skill-bar"><span className={`rp-band-bg-${band(s.pct)}`} style={{ width: `${s.pct}%` }} /></span>
      <span className="rp-skill-pct">{s.pct}%</span>
    </div>
  )
  return (
    <div className="rp-skills">
      <div><h4>Strengths</h4>{strengths.length ? strengths.map(row) : <p className="rp-dim">None yet</p>}</div>
      <div><h4>Needs work</h4>{weaknesses.length ? weaknesses.map(row) : <p className="rp-dim">Nothing below 65%</p>}</div>
    </div>
  )
}

function Flags({ q }) {
  return (
    <>
      {q.lockedOut && <span className="rp-flag rp-flag-bad" title="Auto-submitted after leaving the quiz screen 3 times">⚠ Auto-submitted</span>}
      {!q.lockedOut && q.screenLeaves > 0 && <span className="rp-flag" title="Times the student left the quiz screen">Left screen ×{q.screenLeaves}</span>}
    </>
  )
}

function CourseView({ course }) {
  const c = course.completion
  return (
    <>
      <div className="rp-stats">
        <Stat label="Homework done" value={c.total ? `${c.done}/${c.assigned || c.total}` : '—'} sub={c.missing ? `${c.missing} missing${c.late ? ` · ${c.late} late` : ''}` : c.late ? `${c.late} late` : 'on time'} tone={c.missing ? 'bad' : c.late ? 'warn' : 'ok'} />
        <Stat label="Average score" value={course.avgPct != null ? `${course.avgPct}%` : '—'} tone={band(course.avgPct)} />
        <Stat label="Class percentile" value={course.coursePercentile != null ? ordinal(course.coursePercentile) : '—'} sub={course.coursePercentile != null ? `better than ${course.coursePercentile}% of the class` : 'shown once 5+ classmates have results'} />
        <Stat label="Checkpoints" value={course.checkpointProgress != null ? `${course.checkpointProgress}%` : '—'} sub={course.checkpointAvg != null ? `avg ${course.checkpointAvg}%` : course.checkpointProgress != null ? 'none taken yet' : 'none for this class'} />
        <div className="rp-stat"><span className="rp-stat-label">Recent trend</span><Sparkline values={course.trend} /></div>
      </div>

      <Actions actions={course.actions} />

      <section className="rp-card">
        <h3>Skills</h3>
        <Skills strengths={course.strengths} weaknesses={course.weaknesses} />
      </section>

      {course.modules.some((m) => m.quizzes.length) && (
        <section className="rp-card">
          <h3>Homework</h3>
          <div className="rp-table-wrap">
            <table className="rp-table">
              <thead><tr><th>Quiz</th><th>Status</th><th>Score</th><th>Percentile</th><th>Class avg</th><th>Time</th><th>Date</th></tr></thead>
              <tbody>
                {course.modules.filter((m) => m.quizzes.length).map((m) => (
                  <ModuleRows key={m.index} m={m} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {course.checkpoints.length > 0 && (
        <section className="rp-card">
          <h3>Checkpoint tests</h3>
          <div className="rp-table-wrap">
            <table className="rp-table">
              <thead><tr><th>Test</th><th>Score</th><th>Percentile</th><th>Time</th><th>Date</th></tr></thead>
              <tbody>
                {course.checkpoints.map((cp) => (
                  <tr key={cp.id} className={cp.done ? '' : 'rp-row-muted'}>
                    <td>{cp.title} <Flags q={cp} /></td>
                    <td>{cp.done ? <span className={`rp-score rp-band-${band(cp.pct)}`}>{cp.score}/{cp.total} · {cp.pct}%</span> : <span className="rp-dim">Not taken</span>}</td>
                    <td><Percentile value={cp.percentile} /></td>
                    <td>{cp.minutes != null ? `${cp.minutes} min` : '—'}</td>
                    <td>{fmtDate(cp.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}

function ModuleRows({ m }) {
  return (
    <>
      <tr className="rp-module-row"><td colSpan={7}>{m.name}{m.deadline && <span className="rp-dim"> · due {fmtDate(m.deadline)}</span>}</td></tr>
      {m.quizzes.map((q) => {
        const st = STATUS[q.status]
        return (
          <tr key={q.id}>
            <td>{q.title} <Flags q={q} /></td>
            <td><span className={`rp-status rp-status-${st.cls}`}>{st.label}</span></td>
            <td>{q.pct != null ? <span className={`rp-score rp-band-${band(q.pct)}`}>{q.score}/{q.total} · {q.pct}%</span> : '—'}{q.redoPct != null && <span className="rp-dim"> (redo {q.redoPct}%)</span>}</td>
            <td><Percentile value={q.percentile} /></td>
            <td>{q.classAvg != null ? `${q.classAvg}%` : '—'}</td>
            <td>{q.minutes != null ? `${q.minutes} min` : '—'}</td>
            <td>{fmtDate(q.date)}</td>
          </tr>
        )
      })}
    </>
  )
}

function Overview({ report, onOpen }) {
  const allActions = report.courses.flatMap((c) => c.actions.map((a) => ({ ...a, text: `${c.courseName}: ${a.text}` })))
  return (
    <>
      <Actions actions={allActions} />
      <div className="rp-course-grid">
        {report.courses.map((c) => (
          <button key={c.courseId} className="rp-course-card" onClick={() => onOpen(c.courseId)}>
            <span className="rp-course-class">{c.className}</span>
            <span className="rp-course-name">{c.courseName}</span>
            <span className="rp-course-row">
              <span><b>{c.completion.total ? `${c.completion.done}/${c.completion.assigned || c.completion.total}` : '—'}</b> done</span>
              <span><b className={`rp-band-${band(c.avgPct)}`}>{c.avgPct != null ? `${c.avgPct}%` : '—'}</b> avg</span>
              <span><b>{c.coursePercentile != null ? ordinal(c.coursePercentile) : '—'}</b> percentile</span>
            </span>
            {(c.completion.missing > 0 || c.lockouts > 0) && (
              <span className="rp-course-alerts">
                {c.completion.missing > 0 && <span className="rp-flag rp-flag-bad">{c.completion.missing} missing</span>}
                {c.lockouts > 0 && <span className="rp-flag rp-flag-bad">{c.lockouts} auto-submitted</span>}
              </span>
            )}
            <Sparkline values={c.trend} />
          </button>
        ))}
      </div>
    </>
  )
}

export default function ReportPage({ studentId, onBack, initialCourseId = null }) {
  const [, setTick] = useState(0)
  // Percentiles arrive from live stats subscriptions after first render.
  useEffect(() => onDataChange(() => setTick((n) => n + 1)), [])
  const report = getStudentReport(studentId)
  const [tab, setTab] = useState(initialCourseId || 'all')

  if (!report) {
    return (
      <div className="rp-page"><div className="rp-wrap"><p>Student not found.</p><button className="rp-back" onClick={onBack}>← Back</button></div></div>
    )
  }
  const course = report.courses.find((c) => c.courseId === tab)

  return (
    <div className="rp-page">
      <div className="rp-wrap">
        <header className="rp-header">
          <button className="rp-back" onClick={onBack}>← Back</button>
          <div>
            <h1>{report.student.name}</h1>
            <p className="rp-dim">{[report.student.yearGroup, report.student.school].filter(Boolean).join(' · ') || 'Student report'}</p>
          </div>
        </header>

        {report.courses.length === 0 ? (
          <p className="rp-dim">No courses yet. Results appear here once the student is in a class.</p>
        ) : (
          <>
            <nav className="rp-tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'is-active' : ''} onClick={() => setTab('all')}>All courses</button>
              {report.courses.map((c) => (
                <button key={c.courseId} role="tab" aria-selected={tab === c.courseId} className={tab === c.courseId ? 'is-active' : ''} onClick={() => setTab(c.courseId)}>
                  {c.courseName}
                  {c.completion.missing > 0 && <span className="rp-tab-dot" aria-label="has missing work" />}
                </button>
              ))}
            </nav>
            {course ? <CourseView course={course} /> : <Overview report={report} onOpen={setTab} />}
          </>
        )}
      </div>
    </div>
  )
}
