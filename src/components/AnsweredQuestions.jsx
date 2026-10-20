import { useEffect, useMemo, useState } from 'react'
import SpeakButton from './SpeakButton.jsx'
import { renderMath } from '../utils/renderMath.js'
import { prepareMath } from '../utils/mathify.js'
import {
  getMyAskedQuestions, markAskedQuestionSeen, plainSnippet,
  loadAskedQuestionContext, recordAnswerPractice, getAnswerPractice,
  ANSWER_PRACTICE_TOKENS,
} from '../data/store.js'

/**
 * What the teacher said, as something to work through rather than read.
 *
 * A reply used to arrive as a line of text in a popup: the snippet of the
 * question, what the child had asked, and the teacher's sentence. Nothing to
 * do with it, and no way to find out whether it had landed. A child who is
 * told why they were wrong and never asked the question again has not been
 * taught anything; they have been told something.
 *
 * So a reply is a card, in the hall where the other cards are, and it runs the
 * same way round as they do: the question as they met it, what they put, what
 * their teacher said, and then the question again. The attempt is the point -
 * it is what pays and what closes the card.
 *
 * Green, because the hall's other cards are things still to put right and
 * these are the ones with help attached.
 *
 * Getting it wrong is free and is not written down. A child still stuck after
 * an explanation needs another go, not a mark against them.
 *
 * @param {object} props
 * @param {{id: string}} props.user
 * @param {() => void} [props.onChanged] told when tokens are won, so a
 *   balance elsewhere on the screen can catch up
 */
function AnsweredQuestions({ user, onChanged }) {
  const [asked, setAsked] = useState(null)
  const [open, setOpen] = useState(null)      // the ask being worked through
  const [ctx, setCtx] = useState(null)        // its paper, and what they put
  const [stage, setStage] = useState('reply') // reply -> retry -> done
  const [pick, setPick] = useState(-1)
  const [verdict, setVerdict] = useState(null)
  // What this attempt paid, not what the session has paid: reopening a card
  // already done pays nothing, and the message has to say so.
  const [paid, setPaid] = useState(0)
  const [won, setWon] = useState(0)

  useEffect(() => {
    let alive = true
    getMyAskedQuestions(user.id).then((rows) => { if (alive) setAsked(rows || []) })
    return () => { alive = false }
  }, [user.id])

  const donePractice = useMemo(
    () => new Set(getAnswerPractice(user.id).map((r) => r.askId)),
    [user.id, won])

  const answered = useMemo(
    () => (asked || []).filter((a) => a.status === 'answered'),
    [asked])
  const waiting = useMemo(
    () => (asked || []).filter((a) => a.status !== 'answered'),
    [asked])

  async function openCard(ask) {
    setOpen(ask)
    setCtx(null)
    setStage('reply')
    setPick(-1)
    setVerdict(null)
    setPaid(0)
    if (!ask.seenByStudent) {
      markAskedQuestionSeen(ask.id)
      setAsked((rows) => rows.map((r) => (r.id === ask.id ? { ...r, seenByStudent: true } : r)))
    }
    try {
      setCtx(await loadAskedQuestionContext(ask))
    } catch {
      setCtx({ question: null })
    }
  }

  function check() {
    if (pick < 0 || !ctx?.question) return
    const right = pick === ctx.question.correctIndex
    setVerdict(right ? 'right' : 'wrong')
    if (right) {
      const earned = recordAnswerPractice(user.id, open.id, ctx.question.id)
      setPaid(earned)
      if (earned) { setWon((n) => n + earned); onChanged?.() }
      setStage('done')
    }
  }

  // Only a question with one right option can be handed back to be answered.
  // A sixteen-gap cloze is not a card, and pretending otherwise would make a
  // worse screen than simply showing what was said.
  const retryable = (q) => {
    if (!q) return false
    const type = q.type || 'multiple-choice'
    return type === 'multiple-choice' || type === 'multi-description'
  }

  if (asked === null) return <p className="aq-loading">Looking for your answers…</p>

  if (open) {
    const q = ctx?.question
    const canRetry = retryable(q) && Array.isArray(q?.options)
    const already = donePractice.has(open.id)
    return (
      <div className="aq-card-open">
        <header className="aq-open-head">
          <button className="aq-back" onClick={() => { setOpen(null); setCtx(null) }}>← All answers</button>
          <span className="aq-open-where">{open.quizTitle || 'A question'}</span>
        </header>

        {!ctx ? (
          <p className="aq-loading">Fetching the question…</p>
        ) : !q ? (
          <p className="aq-loading">This question is no longer on the paper, but here is what your teacher said.</p>
        ) : (
          <>
            {/* A reading question is unanswerable without the text it is
                about. Where the question has a prompt of its own, whatever
                is in `text` is the passage it was asked against, and the
                child needs it in front of them to have another go. */}
            {q.prompt && q.text && (
              <details className="aq-passage" open>
                <summary className="aq-step-label">The text</summary>
                <div
                  className="aq-passage-body"
                  dangerouslySetInnerHTML={{ __html: renderMath(prepareMath(q.text)) }}
                />
              </details>
            )}

            <div className="aq-step">
              <span className="aq-step-label">The question</span>
              <div
                className="aq-question"
                dangerouslySetInnerHTML={{ __html: renderMath(prepareMath(q.prompt || q.text || '')) }}
              />
            </div>

            {stage === 'reply' && (
              <>
                {ctx.sat && ctx.answer >= 0 && Array.isArray(q.options) && (
                  <div className="aq-step">
                    <span className="aq-step-label">What you put</span>
                    <p className="aq-yours">{plainSnippet(q.options[ctx.answer])}</p>
                  </div>
                )}
                {open.studentNote && (
                  <div className="aq-step">
                    <span className="aq-step-label">What you asked</span>
                    <p className="aq-yours">{open.studentNote}</p>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <div className="aq-reply">
          <div className="aq-reply-head">
            <span className="aq-reply-from">{open.answer?.teacherName || 'Your teacher'} said</span>
            <SpeakButton
              text={open.answer?.text || ''}
              speechKey={`answer-${open.id}`}
              label="Read it to me"
            />
          </div>
          <p className="aq-reply-text">{open.answer?.text}</p>
        </div>

        {stage === 'reply' && (
          canRetry ? (
            <button className="aq-go" onClick={() => setStage('retry')}>
              {already ? 'Try it again' : `Now try it again — ${ANSWER_PRACTICE_TOKENS} tokens`}
            </button>
          ) : (
            <button className="aq-go" onClick={() => { setOpen(null); setCtx(null) }}>Got it</button>
          )
        )}

        {stage === 'retry' && canRetry && (
          <div className="aq-retry">
            <span className="aq-step-label">Your turn</span>
            <div className="aq-options">
              {q.options.map((opt, i) => opt ? (
                <button
                  key={i}
                  className={`aq-option${pick === i ? ' is-picked' : ''}${
                    verdict === 'wrong' && pick === i ? ' is-wrong' : ''}`}
                  onClick={() => { setPick(i); setVerdict(null) }}
                  dangerouslySetInnerHTML={{ __html: renderMath(prepareMath(opt)) }}
                />
              ) : null)}
            </div>
            {verdict === 'wrong' && (
              <p className="aq-wrong-note">Not that one. Read what your teacher said again, then try another.</p>
            )}
            <button className="aq-go" disabled={pick < 0} onClick={check}>Check my answer</button>
          </div>
        )}

        {stage === 'done' && (
          <div className="aq-done">
            <span className="aq-done-tick">✓</span>
            <p className="aq-done-text">
              That is the one.{paid > 0 ? ` +${paid} tokens.` : ' You had already earned the tokens for this one.'}
            </p>
            <button className="aq-go" onClick={() => { setOpen(null); setCtx(null) }}>Back to my answers</button>
          </div>
        )}
      </div>
    )
  }

  if (!answered.length && !waiting.length) {
    return (
      <div className="dojo-empty">
        <span className="dojo-empty-icon">💬</span>
        <p className="dojo-empty-sub">
          Nothing here yet. When you ask your teacher about a question, their answer lands here.
        </p>
      </div>
    )
  }

  return (
    <div className="aq-list">
      {answered.map((ask) => {
        const practised = donePractice.has(ask.id)
        return (
          <button
            key={ask.id}
            className={`aq-card${ask.seenByStudent ? '' : ' is-new'}${practised ? ' is-done' : ''}`}
            onClick={() => openCard(ask)}
          >
            <div className="aq-card-top">
              <span className="aq-card-from">{ask.answer?.teacherName || 'Your teacher'} answered</span>
              {!ask.seenByStudent && <span className="aq-card-new">new</span>}
              {practised && <span className="aq-card-tick">✓ done</span>}
            </div>
            <span className="aq-card-q">
              {plainSnippet(ask.questionSnippet) || `Question ${(ask.questionIndex ?? 0) + 1}`}
            </span>
            <span className="aq-card-foot">
              <span>{ask.quizTitle || 'A paper'}</span>
              <span>{practised ? 'Read it again' : 'Open it'}</span>
            </span>
          </button>
        )
      })}

      {waiting.map((ask) => (
        <div key={ask.id} className="aq-card is-waiting">
          <div className="aq-card-top">
            <span className="aq-card-from">Waiting for your teacher</span>
          </div>
          <span className="aq-card-q">
            {plainSnippet(ask.questionSnippet) || `Question ${(ask.questionIndex ?? 0) + 1}`}
          </span>
          <span className="aq-card-foot"><span>{ask.quizTitle || 'A paper'}</span></span>
        </div>
      ))}
    </div>
  )
}

export default AnsweredQuestions
