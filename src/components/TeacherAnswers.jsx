import { useEffect, useState } from 'react'
import { getMyAskedQuestions } from '../data/store.js'

/**
 * A word on the portal that their teacher has written back.
 *
 * This used to be the whole of it: a list, and a popup holding one line of the
 * question, what the child had asked and the teacher's sentence. Nothing to do
 * with it, and no way for anyone to know whether it had landed. A child who is
 * told why they were wrong and never asked the question again has not been
 * taught anything.
 *
 * So the reading of it moved to the Revision Hall, where the rest of the cards
 * are and where a question can be handed back to be answered again. What is
 * left here is the knock on the door: how many are waiting, and a way in.
 *
 * @param {object} props
 * @param {string} props.studentId
 * @param {() => void} props.onOpen takes them to the hall, on the answers tab
 */
function TeacherAnswers({ studentId, onOpen }) {
  const [asked, setAsked] = useState([])

  useEffect(() => {
    let alive = true
    getMyAskedQuestions(studentId).then((rows) => { if (alive) setAsked(rows || []) })
    return () => { alive = false }
  }, [studentId])

  const answered = asked.filter((a) => a.status === 'answered')
  const unread = answered.filter((a) => !a.seenByStudent)
  const waiting = asked.filter((a) => a.status !== 'answered')
  if (!answered.length && !waiting.length) return null

  // Nothing new to read and nothing outstanding: the hall can say so in its
  // own time rather than the portal keeping a dead panel on the screen.
  if (!unread.length && !waiting.length) return null

  return (
    <button className={`ta-banner${unread.length ? ' is-new' : ''}`} onClick={onOpen}>
      <span className="ta-banner-icon">{unread.length ? '💬' : '⏳'}</span>
      <span className="ta-banner-main">
        <span className="ta-banner-title">
          {unread.length
            ? `Your teacher answered ${unread.length === 1 ? 'your question' : `${unread.length} of your questions`}`
            : `${waiting.length} question${waiting.length === 1 ? '' : 's'} waiting for your teacher`}
        </span>
        <span className="ta-banner-sub">
          {unread.length
            ? 'Open it in the Revision Hall and try the question again'
            : 'Their answers will appear in the Revision Hall'}
        </span>
      </span>
      {unread.length > 0 && <span className="ta-banner-go">Open →</span>}
    </button>
  )
}

export default TeacherAnswers
