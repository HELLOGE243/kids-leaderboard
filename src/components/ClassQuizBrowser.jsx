import { useState } from 'react'
import { getClassById, getCoursesForOrg, getImportedQuizSet } from '../data/store.js'
import ReviewedQuestion from './ReviewedQuestion.jsx'

/**
 * A teacher reading a class's papers.
 *
 * For knowing what is on a paper before a lesson — what is asked, what the
 * answer is, what the explanation says — without going through the editor, where
 * every field is one keystroke from changing a live paper, and without the
 * marking screens. Nothing here writes: no answers, no marks, no edits.
 *
 * The questions are rendered by the same component the students' own review
 * uses, so a paper reads here exactly as it reads to the child sitting it:
 * passage on the left, question and options on the right, the correct answer
 * marked and the explanation under the option it belongs to. The old copy of
 * that rendering also read the explanation from `expGeneral`/`expOptions`,
 * which only exist while a question is open in the editor - on a saved paper
 * they are `explanation`, so no explanation ever appeared here.
 */
function ClassQuizBrowser({ classId, orgId, onBack }) {
  const cls = getClassById(classId)
  const courses = getCoursesForOrg(orgId).filter((c) => c.classId === classId)
  const [openPaper, setOpenPaper] = useState(null)
  const [qi, setQi] = useState(0)

  if (!cls) return null

  if (openPaper) {
    const questions = openPaper.questions || []
    const q = questions[qi]
    return (
      <div className="cqb">
        <div className="cqb-bar">
          <button className="btn-logout" onClick={() => { setOpenPaper(null); setQi(0) }}>Back to papers</button>
          <span className="cqb-bar-title">{openPaper.friendlyTitle || openPaper.rawTitle}</span>
          <span className="cqb-bar-note">Reading only — nothing here can be marked or changed</span>
        </div>
        <div className="cqb-nav">
          <button className="btn btn-outline btn-small" disabled={qi === 0} onClick={() => setQi(qi - 1)}>◀ Previous</button>
          <span className="cqb-nav-count">Question {qi + 1} of {questions.length}</span>
          <button className="btn btn-outline btn-small" disabled={qi >= questions.length - 1} onClick={() => setQi(qi + 1)}>Next ▶</button>
        </div>
        {q
          ? <ReviewedQuestion key={qi} question={q} index={qi} keyOnly />
          : <p className="td2-empty">This paper has no questions.</p>}
      </div>
    )
  }

  return (
    <div className="cqb">
      <div className="cqb-bar">
        <button className="btn-logout" onClick={onBack}>Back</button>
        <span className="cqb-bar-title">{cls.name} — papers</span>
        <span className="cqb-bar-note">Reading only — nothing here can be marked or changed</span>
      </div>

      {courses.length === 0 && <p className="td2-empty">This class has no courses yet.</p>}

      {courses.map((course) => (
        <div key={course.id} className="cqb-course">
          <div className="cqb-course-head">
            <span className="cqb-course-name">{course.name}</span>
            {course.trialTest && <span className="cqb-tag">Trial</span>}
            {course.term && <span className="cqb-term">{course.term}</span>}
          </div>
          {(course.modules || []).length === 0 && <p className="td2-empty">No modules.</p>}
          {(course.modules || []).map((mod) => {
            const sets = (mod.quizSetIds || []).map(getImportedQuizSet).filter(Boolean)
            return (
              <div key={mod.id} className="cqb-module">
                <div className="cqb-module-name">{mod.name}</div>
                {sets.length === 0 && <p className="td2-empty">No papers.</p>}
                <div className="cqb-papers">
                  {sets.map((s) => (
                    <button key={s.id} className="cqb-paper" onClick={() => { setOpenPaper(s); setQi(0) }}>
                      <span className="cqb-paper-name">{s.friendlyTitle || s.rawTitle}</span>
                      <span className="cqb-paper-meta">
                        {(s.questions || []).length} question{(s.questions || []).length !== 1 ? 's' : ''}
                        {s.timeLimit ? ` · ${s.timeLimit} min` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export default ClassQuizBrowser
