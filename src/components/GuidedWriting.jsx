import { useEffect, useMemo, useRef, useState } from 'react'
import { RichTextEditor } from './RichTextEditor.jsx'
import SpeakButton from './SpeakButton.jsx'
import { composeBrief } from '../data/writingGenres.js'
import { countSentences, lastSentenceOf, plainWords } from '../utils/writingText.js'

/**
 * Writing with a coach beside it.
 *
 * The task and the stages it should pass through on the left, the writing in
 * the middle, the coach on the right. The coach is quiet until the first few
 * sentences are down - the opening belongs to the child - and then has a fixed
 * number of turns, so its help is something they spend rather than something
 * that follows them around.
 *
 * This component owns the writing and the pacing. What the coach actually says
 * arrives from the server; nothing here invents feedback.
 *
 * @param {object} props
 * @param {object} props.question the guided-writing question
 * @param {string} props.value what they have written so far, as HTML
 * @param {(html: string) => void} props.onChange
 * @param {object} [props.session] coach turns and chosen cards so far
 * @param {(action: 'brainstorm'|'evaluate'|'suggest') => Promise<void>} [props.onAsk]
 * @param {(card: object) => void} [props.onTakeCard]
 * @param {boolean} [props.busy] a request to the coach is in flight
 */
function GuidedWriting({ question, value, onChange, session, onAsk, onTakeCard, busy = false }) {
  const brief = useMemo(
    () => composeBrief(question.modeId || 'short-story', question.formId || 'plain'),
    [question.modeId, question.formId])

  const perTurn = Number(question.sentencesPerTurn) > 0 ? Number(question.sentencesPerTurn) : 4
  const maxTurns = Number.isFinite(Number(question.coachTurns)) ? Number(question.coachTurns) : 5

  const turns = session?.turns || []
  const used = turns.filter((t) => t.kind === 'evaluate').length
  const left = Math.max(0, maxTurns - used)

  const sentences = useMemo(() => countSentences(value), [value])
  const countedAtLastTurn = session?.sentencesAtLastTurn || 0
  const since = Math.max(0, sentences - countedAtLastTurn)
  const ready = since >= perTurn && left > 0 && !busy

  const started = plainWords(value).length > 0
  const needBrainstorm = !started && maxTurns > 0 && !turns.some((t) => t.kind === 'brainstorm')

  // The newest thing the coach said, which is what the bubble shows.
  const latest = turns.length ? turns[turns.length - 1] : null
  const bubbleRef = useRef(null)
  useEffect(() => { bubbleRef.current?.scrollIntoView?.({ block: 'nearest' }) }, [turns.length])

  const [showSpine, setShowSpine] = useState(true)

  const beatsMet = new Set(session?.beatsMet || [])

  return (
    <div className="gw-layout">
      {/* ---- the task, and the stages it should pass through ---- */}
      <aside className="gw-task">
        {question.prompt && (
          <div className="gw-task-prompt" dangerouslySetInnerHTML={{ __html: question.prompt }} />
        )}
        {brief && (
          <div className="gw-task-kind">
            <span className="gw-task-kind-name">{brief.title}</span>
            <span className="gw-task-kind-job">{brief.job}</span>
          </div>
        )}

        {brief && (
          <div className="gw-spine">
            <button className="gw-spine-head" onClick={() => setShowSpine((v) => !v)}>
              {showSpine ? '▾' : '▸'} Your plan
            </button>
            {showSpine && (
              <ol className="gw-spine-list">
                {brief.beats.map((b) => (
                  <li key={b.id} className={`gw-beat${beatsMet.has(b.id) ? ' is-met' : ''}`}>
                    <span className="gw-beat-tick" aria-hidden="true">{beatsMet.has(b.id) ? '✓' : '○'}</span>
                    <span className="gw-beat-name">{b.name}</span>
                    <span className="gw-beat-look">{b.lookFor}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        <div className="gw-count">
          <b>{sentences}</b> sentence{sentences === 1 ? '' : 's'} written
          {maxTurns > 0 && <> · <b>{left}</b> coach {left === 1 ? 'turn' : 'turns'} left</>}
        </div>
      </aside>

      {/* ---- the writing ---- */}
      <div className="gw-editor">
        <RichTextEditor
          extended
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          placeholder={needBrainstorm
            ? 'Pick an idea on the right, or just start writing…'
            : 'Keep going…'}
        />
        <div className="gw-editor-foot">
          <SpeakButton
            text={lastSentenceOf(value)}
            speechKey="gw-last-sentence"
            label="Hear my last sentence"
            title="Read my last sentence back to me"
          />
          <span className="gw-editor-hint">
            {maxTurns === 0
              ? 'Write it your own way.'
              : left === 0
                ? 'No coach turns left — finish it in your own words.'
                : ready
                  ? 'Your coach has something to say.'
                  : `${Math.max(0, perTurn - since)} more sentence${perTurn - since === 1 ? '' : 's'} until your coach can help again.`}
          </span>
        </div>
      </div>

      {/* ---- the coach ---- */}
      {maxTurns > 0 && (
        <aside
          className={`gw-coach${busy ? ' is-thinking' : ''}${latest?.kind === 'evaluate' && latest?.glow ? ' is-pleased' : ''}`}
          ref={bubbleRef}
        >
          <div className="gw-coach-figure">
            <div className="gw-coach-avatar" aria-hidden="true" />
            <span className="gw-coach-name">Your writing coach</span>
          </div>

          {busy && <div className="gw-bubble gw-bubble-thinking">Reading what you have written…</div>}

          {!busy && !latest && (
            <div className="gw-bubble">
              {needBrainstorm
                ? 'Want a few ideas to start with? Or just begin — I will come back when you have a few sentences down.'
                : `Write ${perTurn} sentences and I will tell you what is working.`}
            </div>
          )}

          {!busy && latest && <CoachTurn turn={latest} onTakeCard={onTakeCard} />}

          <div className="gw-coach-actions">
            {needBrainstorm && (
              <button className="gw-btn gw-btn-primary" disabled={busy} onClick={() => onAsk?.('brainstorm')}>
                Give me some ideas
              </button>
            )}
            {!needBrainstorm && (
              <button
                className={`gw-btn${ready ? ' gw-btn-primary' : ''}`}
                disabled={!ready}
                onClick={() => onAsk?.('evaluate')}
              >
                {left === 0 ? 'No turns left' : ready ? 'Check my writing' : `Write ${Math.max(0, perTurn - since)} more`}
              </button>
            )}
            {!busy && latest?.kind === 'evaluate' && left >= 0 && (
              <button className="gw-btn" onClick={() => onAsk?.('suggest')} disabled={busy}>
                Want a suggestion?
              </button>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}

/**
 * One thing the coach said: what is working, what to fix, what is missing,
 * what to do now - and sometimes cards to spark the next sentence.
 */
function CoachTurn({ turn, onTakeCard }) {
  const spoken = [turn.glow, turn.grow, turn.missing, turn.next, turn.text]
    .filter(Boolean).join('. ')
  return (
    <>
      <div className="gw-bubble">
        {turn.text && <p className="gw-bubble-line">{turn.text}</p>}
        {turn.glow && <p className="gw-bubble-line gw-glow"><b>Working well:</b> {turn.glow}</p>}
        {turn.grow && <p className="gw-bubble-line gw-grow"><b>Have another look at:</b> {turn.grow}</p>}
        {turn.missing && <p className="gw-bubble-line gw-missing"><b>Still missing:</b> {turn.missing}</p>}
        {turn.next && <p className="gw-bubble-line gw-next"><b>Try next:</b> {turn.next}</p>}
        <SpeakButton text={spoken} speechKey={`gw-turn-${turn.id}`} label="Read this to me" />
      </div>

      {(turn.cards || []).length > 0 && (
        <div className="gw-cards">
          <p className="gw-cards-lead">Pick one to spark your next sentence — then write it in your own words.</p>
          {turn.cards.map((card, i) => (
            <button
              key={card.id || i}
              className={`gw-card${card.taken ? ' is-taken' : ''}`}
              onClick={() => onTakeCard?.(card)}
            >
              {card.move && <span className="gw-card-move">{card.move}</span>}
              <span className="gw-card-text">{card.text}</span>
              {card.taken && <span className="gw-card-taken">chosen</span>}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

export default GuidedWriting
