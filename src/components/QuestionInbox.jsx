import { useEffect, useMemo, useState } from 'react'
import { getAskedForClasses, answerAskedQuestion, getGroupName } from '../data/store.js'

/**
 * The questions a teacher's students have asked them.
 *
 * Asking used to go nowhere: the student's question was flagged inside their
 * own record, and no screen anywhere read it. This is that screen - the
 * question as the student met it, what they said about it, and a box to answer
 * in. The answer goes back to the top of that child's own dashboard.
 *
 * @param {object} props
 * @param {{id: string, name: string}} props.teacher
 */
function QuestionInbox({ teacher }) {
  const [asked, setAsked] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAnswered, setShowAnswered] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getAskedForClasses().then((rows) => {
      if (!alive) return
      setAsked(rows)
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  const open = useMemo(() => asked.filter((a) => a.status !== 'answered'), [asked])
  const done = useMemo(() => asked.filter((a) => a.status === 'answered'), [asked])
  const shown = showAnswered ? done : open

  async function send(ask) {
    const text = reply.trim()
    if (!text) return
    setBusy(true)
    const ok = await answerAskedQuestion(ask.id, text, teacher)
    setBusy(false)
    if (!ok) return
    setAsked((rows) => rows.map((r) => (r.id === ask.id
      ? { ...r, status: 'answered', answer: { text, teacherName: teacher.name, teacherId: teacher.id } }
      : r)))
    setReplyTo(null)
    setReply('')
  }

  return (
    <section className="td2-card">
      <div className="td2-card-head">
        <h2 className="td2-h2">
          Questions from students{open.length > 0 ? ` (${open.length})` : ''}
        </h2>
        <button className="td2-btn-ghost td2-btn-sm" onClick={() => setShowAnswered((v) => !v)}>
          {showAnswered ? `Show unanswered (${open.length})` : `Show answered (${done.length})`}
        </button>
      </div>

      {loading ? (
        <p className="td2-muted">Looking…</p>
      ) : shown.length === 0 ? (
        <p className="td2-muted">
          {showAnswered ? 'Nothing answered yet.' : 'Nothing waiting. Questions your students send from a review land here.'}
        </p>
      ) : (
        <div className="qi-list">
          {shown.map((ask) => {
            const where = ask.groupName || (ask.groupIds || []).map((id) => getGroupName(id)).filter(Boolean)[0]
            return (
              <div key={ask.id} className="qi-item">
                <div className="qi-head">
                  <span className="qi-who">{ask.studentName || ask.studentId}</span>
                  <span className="qi-where">
                    {where ? `${where} · ` : ''}{ask.quizTitle || 'a quiz'}
                    {ask.askedAt ? ` · ${new Date(ask.askedAt).toLocaleDateString()}` : ''}
                  </span>
                </div>
                <p className="qi-q">{ask.questionSnippet || `Question ${(ask.questionIndex ?? 0) + 1}`}</p>
                {ask.studentNote && <p className="qi-note">They said: {ask.studentNote}</p>}

                {ask.status === 'answered' ? (
                  <div className="qi-answer">
                    <span className="qi-answer-from">{ask.answer?.teacherName || 'Answered'}</span>
                    <p className="qi-answer-text">{ask.answer?.text}</p>
                  </div>
                ) : replyTo === ask.id ? (
                  <div className="qi-reply">
                    <textarea
                      className="td2-input qi-reply-box"
                      rows={3}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Answer in a sentence or two — they read this on their own screen."
                      autoFocus
                    />
                    <div className="qi-reply-actions">
                      <button className="td2-btn td2-btn-sm" disabled={busy} onClick={() => send(ask)}>
                        {busy ? 'Sending…' : 'Send answer'}
                      </button>
                      <button className="td2-btn-ghost td2-btn-sm" onClick={() => { setReplyTo(null); setReply('') }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="td2-btn td2-btn-sm" onClick={() => { setReplyTo(ask.id); setReply('') }}>
                    Answer
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default QuestionInbox
