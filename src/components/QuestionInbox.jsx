import { useEffect, useMemo, useState } from 'react'
import { getAskedForClasses, answerAskedQuestion, getGroupName, loadAskedQuestionContext, plainSnippet } from '../data/store.js'
import ReviewedQuestion from './ReviewedQuestion.jsx'

/**
 * The questions a teacher's students have asked them.
 *
 * Asking used to go nowhere: the student's question was flagged inside their
 * own record, and no screen anywhere read it. This is that screen - the
 * question as the student met it, what they said about it, and a box to answer
 * in. The answer goes back to the top of that child's own dashboard.
 *
 * A line of the prompt is not enough to answer anything, so opening a question
 * fetches the paper and the child's own record and shows the question exactly
 * as they saw it on review, with their answer marked on it. Where they never
 * sat it - a question sent from the revision hall - the answer key is shown
 * instead, which is the honest thing to show.
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
  // The paper behind one question, fetched only when a teacher opens it. Kept
  // per question id so closing and reopening does not fetch it again.
  const [openId, setOpenId] = useState(null)
  const [context, setContext] = useState({})

  async function openQuestion(ask) {
    if (openId === ask.id) { setOpenId(null); return }
    setOpenId(ask.id)
    if (context[ask.id]) return
    setContext((c) => ({ ...c, [ask.id]: 'loading' }))
    try {
      const ctx = await loadAskedQuestionContext(ask)
      setContext((c) => ({ ...c, [ask.id]: ctx }))
    } catch (e) {
      console.warn('Could not fetch the question behind that:', e)
      setContext((c) => ({ ...c, [ask.id]: null }))
    }
  }

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
                <button
                  className={`qi-q${openId === ask.id ? ' is-open' : ''}`}
                  onClick={() => openQuestion(ask)}
                  title={openId === ask.id ? 'Close the question' : 'See the question and their answer'}
                >
                  <span className="qi-q-text">
                    {plainSnippet(ask.questionSnippet) || `Question ${(ask.questionIndex ?? 0) + 1}`}
                  </span>
                  <span className="qi-q-more">{openId === ask.id ? 'Hide' : 'See the question'}</span>
                </button>
                {ask.studentNote && <p className="qi-note">They said: {ask.studentNote}</p>}

                {openId === ask.id && (
                  <div className="qi-paper">
                    {context[ask.id] === 'loading' ? (
                      <p className="td2-muted td2-small">Fetching the paper…</p>
                    ) : context[ask.id] === null ? (
                      <p className="td2-muted td2-small">
                        Could not fetch that paper just now.
                      </p>
                    ) : !context[ask.id]?.question ? (
                      <p className="td2-muted td2-small">
                        That question is no longer on the paper.
                      </p>
                    ) : (
                      <>
                        {!context[ask.id].sat && (
                          <p className="qi-unsat">
                            They have not answered this one, so the answer key is shown.
                          </p>
                        )}
                        <ReviewedQuestion
                          question={context[ask.id].question}
                          answer={context[ask.id].answer}
                          index={context[ask.id].index}
                          seconds={context[ask.id].seconds}
                          attemptId={context[ask.id].attempt?.id}
                          keyOnly={!context[ask.id].sat}
                        />
                      </>
                    )}
                  </div>
                )}

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
