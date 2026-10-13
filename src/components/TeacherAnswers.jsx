import { useEffect, useState } from 'react'
import { getMyAskedQuestions, markAskedQuestionSeen } from '../data/store.js'

/**
 * What their teacher said back, at the top of a student's own screen.
 *
 * A student who asks for help in a review has, until now, been asking nobody:
 * the question was flagged inside their own record and no teacher had a screen
 * that read it. The reply lands here, where they will see it, and stops asking
 * for attention once they have opened it.
 *
 * @param {object} props
 * @param {string} props.studentId
 */
function TeacherAnswers({ studentId }) {
  const [asked, setAsked] = useState([])
  const [open, setOpen] = useState(null)

  useEffect(() => {
    let alive = true
    getMyAskedQuestions(studentId).then((rows) => { if (alive) setAsked(rows) })
    return () => { alive = false }
  }, [studentId])

  const answered = asked.filter((a) => a.status === 'answered')
  const waiting = asked.filter((a) => a.status !== 'answered')
  const unread = answered.filter((a) => !a.seenByStudent)
  if (!answered.length && !waiting.length) return null

  function openOne(ask) {
    setOpen(ask)
    if (!ask.seenByStudent) {
      markAskedQuestionSeen(ask.id)
      setAsked((rows) => rows.map((r) => (r.id === ask.id ? { ...r, seenByStudent: true } : r)))
    }
  }

  return (
    <section className={`ta-panel${unread.length ? ' is-new' : ''}`}>
      <header className="ta-head">
        <h2 className="ta-title">
          {unread.length
            ? `Your teacher answered ${unread.length === 1 ? 'your question' : `${unread.length} of your questions`}`
            : 'Questions you asked your teacher'}
        </h2>
        {waiting.length > 0 && (
          <span className="ta-waiting">{waiting.length} waiting for an answer</span>
        )}
      </header>

      <div className="ta-list">
        {[...answered, ...waiting].slice(0, 6).map((ask) => (
          <button
            key={ask.id}
            className={`ta-row${ask.status === 'answered' && !ask.seenByStudent ? ' is-unread' : ''}`}
            onClick={() => openOne(ask)}
          >
            <span className="ta-row-main">
              <span className="ta-row-quiz">{ask.quizTitle || 'A question'}</span>
              <span className="ta-row-snippet">{ask.questionSnippet || `Question ${(ask.questionIndex ?? 0) + 1}`}</span>
            </span>
            <span className={`ta-row-tag is-${ask.status === 'answered' ? 'answered' : 'open'}`}>
              {ask.status === 'answered' ? 'Answered' : 'Waiting'}
            </span>
          </button>
        ))}
      </div>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(null)}>
          <div className="ta-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ta-modal-head">
              <span className="ta-row-quiz">{open.quizTitle || 'A question'}</span>
              <button className="td2-icon-btn" aria-label="Close" onClick={() => setOpen(null)}>✕</button>
            </div>
            <p className="ta-modal-q">{open.questionSnippet || `Question ${(open.questionIndex ?? 0) + 1}`}</p>
            {open.studentNote && <p className="ta-modal-note">You asked: {open.studentNote}</p>}
            {open.status === 'answered' ? (
              <div className="ta-modal-answer">
                <span className="ta-modal-from">{open.answer?.teacherName || 'Your teacher'} said</span>
                <p className="ta-modal-text">{open.answer?.text}</p>
              </div>
            ) : (
              <p className="ta-modal-waiting">Your teacher has not answered this one yet.</p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default TeacherAnswers
