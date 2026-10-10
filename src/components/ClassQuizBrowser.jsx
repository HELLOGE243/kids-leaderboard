import { useState } from 'react'
import { getClassById, getCoursesForOrg, getImportedQuizSet, isWritingType } from '../data/store.js'
import { RichText } from './RichTextEditor.jsx'
import { renderMath } from '../utils/renderMath.js'
import { prepareMath } from '../utils/mathify.js'

/**
 * A teacher reading a class's papers.
 *
 * For knowing what is on a paper before a lesson — what is asked, what the
 * answer is, what the explanation says — without going through the editor, where
 * every field is one keystroke from changing a live paper, and without the
 * marking screens. Nothing here writes: no answers, no marks, no edits.
 */
function letter(i) {
  return String.fromCharCode(65 + i)
}

function QuestionView({ q }) {
  const type = q.type || 'multiple-choice'
  const [tab, setTab] = useState(0)
  const hasExtracts = (type === 'multi-description' || type === 'multi-matching') && (q.descriptions || []).length > 0

  const answerBlock = () => {
    if (type === 'multiple-choice' || type === 'multi-description') {
      return (
        <div className="qt-options">
          {(q.options || []).map((opt, oi) => {
            if (!opt) return null
            const right = oi === q.correctIndex
            return (
              <div key={oi} className={`qt-option qt-option-review${right ? ' qt-option-correct' : ''}`} style={{ cursor: 'default' }}>
                <span className={`qt-option-radio${right ? ' qt-radio-correct' : ''}`} />
                <span className="qt-option-text" dangerouslySetInnerHTML={{ __html: renderMath(prepareMath(opt)) }} />
              </div>
            )
          })}
        </div>
      )
    }
    if (type === 'dropdown-cloze') {
      return (
        <div className="cqb-key">
          {(q.blanks || []).map((b, bi) => (
            <div key={bi} className="cqb-key-row">
              <span className="cqb-key-label">Blank {bi + 1}</span>
              <span className="cqb-key-value">{b.options?.[b.correctIndex] ?? letter(b.correctIndex)}</span>
            </div>
          ))}
        </div>
      )
    }
    if (type === 'drag-drop' || type === 'drag-sentence' || type === 'drag-summary') {
      return (
        <div className="cqb-key">
          {(q.correctOrder || []).map((oi, gi) => (
            <div key={gi} className="cqb-key-row">
              <span className="cqb-key-label">Gap {q.gapNumbers?.[gi] ?? gi + 1}</span>
              <span className="cqb-key-value">{q.summaryOptions?.[oi] || letter(oi)}</span>
            </div>
          ))}
        </div>
      )
    }
    if (type === 'multi-matching') {
      return (
        <div className="cqb-key">
          {(q.matchQuestions || []).map((mq, mi) => (
            <div key={mi} className="cqb-key-row">
              <span className="cqb-key-label" dangerouslySetInnerHTML={{ __html: mq.question }} />
              <span className="cqb-key-value">{letter(mq.correctExtract)}</span>
            </div>
          ))}
        </div>
      )
    }
    if (isWritingType(type)) {
      return <p className="cqb-note">Writing — marked against the rubric in the writing screen.</p>
    }
    return <p className="cqb-note">No answer key for this question type.</p>
  }

  return (
    <div className="cqb-question">
      {hasExtracts && (
        <>
          <div className="qt-desc-tabs">
            {q.descriptions.map((d, di) => (
              <button key={di} className={`qt-desc-tab${tab === di ? ' qt-desc-tab-active' : ''}`} onClick={() => setTab(di)}>
                {d.title || letter(di)}
              </button>
            ))}
          </div>
          <div className="qt-desc-content"><RichText html={q.descriptions[tab]?.content || ''} /></div>
        </>
      )}
      {!hasExtracts && q.text && (
        <div className="qt-question-text"><RichText html={q.text} /></div>
      )}
      {q.prompt && <div className="qt-prompt-display" dangerouslySetInnerHTML={{ __html: q.prompt }} />}
      {answerBlock()}
      {(q.expGeneral || Object.keys(q.expOptions || {}).length > 0) && (
        <details className="cqb-explain">
          <summary>Explanation</summary>
          {q.expGeneral && <div className="cqb-explain-body" dangerouslySetInnerHTML={{ __html: renderMath(q.expGeneral) }} />}
          {Object.entries(q.expOptions || {}).map(([key, val]) => val ? (
            <div key={key} className="cqb-explain-opt">
              <strong>{key}</strong>
              <span dangerouslySetInnerHTML={{ __html: renderMath(val) }} />
            </div>
          ) : null)}
        </details>
      )}
    </div>
  )
}

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
        {q ? <QuestionView key={qi} q={q} /> : <p className="td2-empty">This paper has no questions.</p>}
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
