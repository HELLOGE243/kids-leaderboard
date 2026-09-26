import { getTrialCourseReport } from '../data/store.js'

const SUBJECT_LABELS = {
  reading: 'Reading',
  math: 'Mathematics',
  thinking: 'Thinking Skills',
  writing: 'Writing',
  other: 'Paper',
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// A colour scale for the weakness bars only - marks themselves are shown
// plainly, with the cohort figures beside them to give the comparison.
function barColour(pct) {
  if (pct >= 85) return '#00e5ff'
  if (pct >= 70) return '#66bb6a'
  if (pct >= 55) return '#ffab00'
  if (pct >= 40) return '#ff9100'
  return '#ff1744'
}

/**
 * The report for a trial test sitting: one mark out of 100 across the papers,
 * where the student sits in the cohort, the same again per subject, and the
 * question types that cost them marks.
 *
 * Cohort figures come from the shared quizStats aggregate, so a student sees
 * averages and rankings without ever reading another student's record.
 */
function TrialReport({ courseId, studentId, studentName, onBack }) {
  const report = getTrialCourseReport(courseId, studentId)

  if (!report) {
    return (
      <div className="page" style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="card"><p className="text-dim">This course has no trial report.</p></div>
        {onBack && <button className="btn mt-16" onClick={onBack}>Back</button>}
      </div>
    )
  }

  if (!report.released) {
    return (
      <div className="page-center" style={{ minHeight: '60vh' }}>
        <div className="card" style={{ maxWidth: 520, textAlign: 'center', padding: '36px 32px' }}>
          <p className="pixel-heading" style={{ fontSize: '0.9rem', marginBottom: 14 }}>Results sealed</p>
          <p className="text-dim" style={{ fontSize: '0.9rem', lineHeight: 1.7, marginBottom: 24 }}>
            {report.courseName} has not been released yet. Your report opens the moment your teacher publishes the results.
          </p>
          {onBack && <button className="btn" onClick={onBack}>Back to the Course</button>}
        </div>
      </div>
    )
  }

  const { overall, papers, weaknesses } = report

  return (
    <div className="page trial-report" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div className="header">
        <div>
          <h1 className="pixel-title">{report.courseName}</h1>
          <p className="text-dim" style={{ fontSize: '0.75rem' }}>
            Trial test report{studentName ? ` · ${studentName}` : ''}
            {report.releasedAt ? ` · released ${new Date(report.releasedAt).toLocaleDateString()}` : ''}
          </p>
        </div>
        {onBack && <button className="btn-logout" onClick={onBack}>Back</button>}
      </div>

      {/* Overall */}
      <div className="card tr-overall">
        <div className="tr-overall-mark">
          <span className="tr-big">{overall.mark}</span>
          <span className="tr-out-of">/ {overall.outOf}</span>
          <span className="text-dim" style={{ fontSize: '0.7rem' }}>
            {overall.papersSat} of {overall.papers} papers · each worth {Math.round(100 / overall.papers)} marks
          </span>
        </div>
        <div className="tr-overall-stats">
          <div className="tr-stat">
            <span className="tr-stat-val">{overall.percentile != null ? ordinal(overall.percentile) : '—'}</span>
            <span className="tr-stat-lbl">percentile</span>
          </div>
          <div className="tr-stat">
            <span className="tr-stat-val">{overall.rank ? `${ordinal(overall.rank)}` : '—'}</span>
            <span className="tr-stat-lbl">of {overall.cohortSize} sitting</span>
          </div>
          <div className="tr-stat">
            <span className="tr-stat-val">{overall.average ?? '—'}</span>
            <span className="tr-stat-lbl">average</span>
          </div>
          <div className="tr-stat">
            <span className="tr-stat-val">{overall.median ?? '—'}</span>
            <span className="tr-stat-lbl">median</span>
          </div>
          <div className="tr-stat">
            <span className="tr-stat-val" style={{ color: 'var(--token)' }}>{overall.top ?? '—'}</span>
            <span className="tr-stat-lbl">top mark</span>
          </div>
        </div>
      </div>

      {/* Per paper */}
      <div className="card mt-16">
        <p className="pixel-heading" style={{ fontSize: '0.7rem', marginBottom: 12 }}>By paper</p>
        <table className="table w-full tr-table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Paper</th>
              <th>Your mark</th>
              <th>Percentile</th>
              <th>Average</th>
              <th>Median</th>
              <th>Top</th>
            </tr>
          </thead>
          <tbody>
            {papers.map((p) => {
              return (
                <tr key={p.quizSetId}>
                  <td style={{ textAlign: 'left' }}>
                    <span className="tr-subject">{SUBJECT_LABELS[p.subject] || SUBJECT_LABELS.other}</span>
                    <span className="tr-paper-name">{p.name}</span>
                  </td>
                  <td style={{ fontWeight: 700 }}>
                    {p.mine ? `${p.mine.score}/${p.mine.total} (${p.mine.pct}%)` : 'Not sat'}
                  </td>
                  <td>{p.percentile != null ? ordinal(p.percentile) : '—'}</td>
                  <td>{p.average != null ? `${p.average}%` : '—'}</td>
                  <td>{p.median != null ? `${p.median}%` : '—'}</td>
                  <td style={{ color: 'var(--token)' }}>{p.top != null ? `${p.top}%` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="text-dim" style={{ fontSize: '0.65rem', marginTop: 8 }}>
          Cohort figures count every student who has sat that paper.
        </p>
      </div>

      {/* Weaknesses */}
      <div className="card mt-16">
        <p className="pixel-heading" style={{ fontSize: '0.7rem', marginBottom: 12 }}>Where the marks went</p>
        {weaknesses.length === 0 ? (
          <p className="text-dim" style={{ fontSize: '0.8rem' }}>
            No question type stands out as a weakness across this sitting — work through the questions you missed in each paper.
          </p>
        ) : (
          <div className="tr-weak-list">
            {weaknesses.map((w) => (
              <div key={w.id} className="tr-weak">
                <div className="tr-weak-head">
                  <span className="tr-weak-name">{w.name}</span>
                  <span className="tr-weak-sub">{SUBJECT_LABELS[w.subject] || ''}</span>
                  <span className="tr-weak-pct" style={{ color: barColour(w.pct) }}>{w.right}/{w.asked} correct</span>
                </div>
                <div className="tr-weak-bar"><span style={{ width: `${w.pct}%`, background: barColour(w.pct) }} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default TrialReport
