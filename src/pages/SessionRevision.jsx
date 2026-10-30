import { useState, useMemo, useEffect, useRef } from 'react'
import { renderMath } from '../utils/renderMath.js'
import { prepareMath } from '../utils/mathify.js'
import { getDojoCardsForStudent, recordCompulsoryRevisionAnswer, markDojoAskTeacher, askTeacherAboutCard, reportQuestionError, studentRecordReady, onDataChange, recordDailyRevision } from '../data/store.js'
import ReportIssueModal from '../components/ReportIssueModal.jsx'
import { RichText } from '../components/RichTextEditor.jsx'
import { resolveImages } from '../data/imageStore.js'
import { playCorrectChime } from '../utils/soundManager.js'

const TARGET = 5

/**
 * What to say about the day's five.
 *
 * Deliberately not a tally of failure. A child who has just worked through
 * the questions they are worst at should not be met with one, and the cards
 * they missed are coming back anyway.
 */
function doneMessage(score, total) {
  if (total === 0) return 'Nothing to revise today.'
  if (score === total) return 'Every one returned. Come back tomorrow to keep the streak going.'
  if (score === 0) return 'A hard set. Every one of these comes back, and they get easier each time.'
  return 'Good work. The ones you kept will come back until you have them.'
}

function SessionRevision({ user, onComplete }) {
  // The deck is settled once, so that answering a card - which rewrites the
  // record - cannot reshuffle what is still to come. It has to wait for the
  // record to arrive first: an unloaded record and a student with nothing to
  // revise look identical, and building the deck from the first of those
  // produced an empty one, marked the day's revision done and sent the
  // student past it. null means "not decided yet", which is not the same as
  // an empty deck.
  const [cards, setCards] = useState(null)

  useEffect(() => {
    let alive = true
    const build = () => {
      if (!alive || !studentRecordReady(user.id)) return false
      const all = getDojoCardsForStudent(user.id).filter((c) => !c.archived)
      setDeckSize(all.length)
      setCards([...all].sort(() => Math.random() - 0.5).slice(0, TARGET))
      return true
    }
    if (build()) return () => { alive = false }
    const off = onDataChange(() => { if (build()) off() })
    return () => { alive = false; off() }
  }, [user.id])

  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState(-1)
  const [answered, setAnswered] = useState(false)
  const [result, setResult] = useState(null)
  const [flipped, setFlipped] = useState(false)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const [resolvedHtml, setResolvedHtml] = useState({})
  const [feedbackMsg, setFeedbackMsg] = useState(null)
  // Set when this answer was the third correct one in a row, which retires the
  // card. Separate from the pass/fail message because it is a different kind
  // of thing: that one says what happened to this answer, this one says the
  // question is finished with.
  const [cleared, setCleared] = useState(false)
  // How many questions are in the bank this card is going back into.
  const [deckSize, setDeckSize] = useState(0)
  // The card is folding away into the bank. While it is, Next does nothing:
  // pressing it twice would otherwise advance the deck underneath its own
  // animation and file the following card by accident.
  const [filing, setFiling] = useState(false)
  const [bankHit, setBankHit] = useState(false)
  const [flash, setFlash] = useState(false)
  const deckRef = useRef(null)
  const bankRef = useRef(null)
  const fileTimers = useRef([])
  const flashTimer = useRef(null)
  const [showBurst, setShowBurst] = useState(false)
  // The burst clears itself after a moment, but a student who presses Next
  // straight away used to carry the green celebration onto the next card.
  const burstTimer = useRef(null)
  const [particles, setParticles] = useState([])
  const [reportOpen, setReportOpen] = useState(false)
  const [reportType, setReportType] = useState('')
  const [reportDetails, setReportDetails] = useState('')

  const total = cards ? cards.length : 0

  useEffect(() => {
    // Only once the record has actually been read: "nothing to revise" is a
    // conclusion, not a starting state.
    if (cards && cards.length === 0) onComplete()
  }, [cards, onComplete])

  // Every hook has to run on every render, so this one belongs above the
  // returns below rather than in the middle of the body. It was already the
  // wrong side of "no cards, render nothing"; adding a second early return
  // for "the record has not arrived" turned that into a crash on first paint.
  // The day's result is written down when the deck is finished, not when the
  // student presses Continue: they may never press it, and the record of
  // whether revision was done should not depend on that.
  useEffect(() => {
    if (!done || !cards?.length) return
    recordDailyRevision(user.id, score, cards.length, cards.map((c) => c.id))
  }, [done])

  useEffect(() => () => {
    clearTimeout(burstTimer.current)
    clearTimeout(flashTimer.current)
    fileTimers.current.forEach(clearTimeout)
  }, [])

  if (!cards) {
    return (
      <div className="dojo-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <p className="sr-loading">Fetching today&rsquo;s revision&hellip;</p>
      </div>
    )
  }
  if (total === 0) return null

  const card = cards[idx]
  const q = card?.question
  const encounter = (card?.correctStreak || 0) + 1

  async function resolveField(html) {
    if (!html || resolvedHtml[html]) return
    const resolved = await resolveImages(html)
    setResolvedHtml(prev => ({ ...prev, [html]: resolved }))
  }
  if (q?.text) resolveField(q.text)
  if (q?.prompt) resolveField(q.prompt)

  function handleFlip() {
    setFlipped(true)
  }

  function spawnParticles() {
    const colors = ['#4caf50', '#81c784', '#a5d6a7', '#ffd54f', '#fff176', '#64ffda']
    const pts = Array.from({ length: 24 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 24 + (Math.random() - 0.5) * 0.5
      const dist = 80 + Math.random() * 160
      const size = 6 + Math.random() * 10
      return {
        id: i,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        size,
        color: colors[Math.floor(Math.random() * colors.length)],
      }
    })
    setParticles(pts)
  }

  // Cloze, matching and drag questions have no option list to click, so the
  // card shows the answer and the student marks their own recall. Without this
  // they appeared as an empty card with nothing to press.
  function answerSummary(question) {
    if (!question) return ''
    const t = question.type || 'multiple-choice'
    if (t === 'dropdown-cloze') {
      return (question.blanks || [])
        .map((b, i) => `${i + 1}. ${(b.options || [])[b.correctIndex] ?? '—'}`)
        .join('   ')
    }
    if (t === 'drag-sentence' || t === 'drag-summary' || t === 'drag-drop') {
      const opts = question.summaryOptions || []
      return (question.correctOrder || [])
        .map((oi, gi) => `Gap ${question.gapNumbers?.[gi] ?? gi + 1}: ${opts[oi] ?? '—'}`)
        .join(' · ')
    }
    if (t === 'multi-matching') {
      return (question.matchQuestions || [])
        .map((m, i) => `${i + 1}. Extract ${String.fromCharCode(65 + (m.correctExtract ?? 0))}`)
        .join('   ')
    }
    if (t === 'writing') return ''
    return question.options?.[question.correctIndex] || ''
  }

  function startBurst() {
    setShowBurst(true)
    spawnParticles()
    playCorrectChime()
    clearTimeout(burstTimer.current)
    burstTimer.current = setTimeout(() => setShowBurst(false), 1800)
  }

  /** Takes the celebration off the screen, whatever is left of it. */
  function endBurst() {
    clearTimeout(burstTimer.current)
    burstTimer.current = null
    setShowBurst(false)
    setParticles([])
  }

  // A wrong answer should be felt before it is read. The flash is over in
  // half a second and sits behind the card rather than over it, so the right
  // answer underneath is readable the whole time.
  function flashWrong() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    clearTimeout(flashTimer.current)
    setFlash(false)
    requestAnimationFrame(() => {
      setFlash(true)
      flashTimer.current = setTimeout(() => setFlash(false), 620)
    })
  }

  function handleSelfMark(knewIt) {
    if (answered) return
    setAnswered(true)
    setResult(knewIt ? 'correct' : 'incorrect')
    if (knewIt) {
      setScore(s => s + 1)
      setFeedbackMsg('Returned successfully')
      startBurst()
    } else {
      setFeedbackMsg('Kept in your revision deck')
      flashWrong()
    }
    const updated = recordCompulsoryRevisionAnswer(card.id, knewIt)
    if (knewIt && updated?.archived) setCleared(true)
  }

  function handleSubmit() {
    if (selected === -1 || answered) return
    const correct = selected === q.correctIndex
    setAnswered(true)
    setResult(correct ? 'correct' : 'incorrect')
    if (correct) {
      setScore(s => s + 1)
      setFeedbackMsg('Returned successfully')
      startBurst()
    } else {
      setFeedbackMsg('Kept in your revision deck')
      flashWrong()
    }
    // The store archives a card on its third correct answer and hands the
    // updated card back; it was being thrown away, so nothing on the screen
    // ever said a question had been finished with.
    const updated = recordCompulsoryRevisionAnswer(card.id, correct)
    if (correct && updated?.archived) setCleared(true)
  }

  function advance() {
    if (idx + 1 >= total) {
      endBurst()
      setDone(true)
      return
    }
    endBurst()
    setIdx(i => i + 1)
    setSelected(-1)
    setAnswered(false)
    setResult(null)
    setFlipped(false)
    setFeedbackMsg(null)
    setCleared(false)
  }

  /**
   * Folds the card away into the question bank, then moves on.
   *
   * The distance is measured rather than written down: the bank sits in the
   * top bar and the card fills what is left, so where one is relative to the
   * other depends on the window. A fixed offset lands in the right place on
   * one screen and halfway off every other.
   *
   * If anything is missing, or the student has asked for less motion, the
   * deck advances immediately. The animation is a flourish, and a flourish
   * must never be the thing that decides whether revision works.
   */
  function fileAway(then) {
    const deck = deckRef.current
    const bank = bankRef.current
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!deck || !bank || still) { then(); return }
    const c = deck.getBoundingClientRect()
    const b = bank.getBoundingClientRect()
    deck.style.setProperty('--file-dx', `${(b.left + b.width / 2) - (c.left + c.width / 2)}px`)
    deck.style.setProperty('--file-dy', `${(b.top + b.height / 2) - (c.top + c.height / 2)}px`)
    setFiling(true)
    fileTimers.current.forEach(clearTimeout)
    fileTimers.current = [
      setTimeout(() => setBankHit(true), 620),
      setTimeout(() => {
        setFiling(false)
        setBankHit(false)
        deck.style.removeProperty('--file-dx')
        deck.style.removeProperty('--file-dy')
        then()
      }, 950),
    ]
  }

  function handleNext() {
    if (filing) return
    if (result === 'incorrect') { fileAway(advance); return }
    advance()
  }

  function handleAskForHelp() {
    markDojoAskTeacher(card.id)
    askTeacherAboutCard(user.id, card)
    setFeedbackMsg('Sent to your teacher')
    setAnswered(true)
    setResult('help')
  }

  function handleFinish() {
    onComplete()
  }

  if (done) {
    return (
      <div className="dojo-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="sr-done-card">
          <div className="sr-done-icon">&#9989;</div>
          <h2 className="sr-done-title">Revision Complete</h2>
          {/* It was called a results card and reported nothing. The score is
              the one number a student - and later a parent - wants from it. */}
          <p className="sr-done-score">
            <strong>{score}</strong> <span className="sr-done-of">out of</span> <strong>{total}</strong>
          </p>
          <p className="sr-done-sub">{doneMessage(score, total)}</p>
          <button className="btn sr-continue-btn" onClick={handleFinish}>Continue to Portal</button>
        </div>
      </div>
    )
  }

  const selfMarked = !(q?.options || []).some((o) => o && String(o).trim())
  const textHtml = resolvedHtml[q?.text] || q?.text || ''
  const promptHtml = resolvedHtml[q?.prompt] || q?.prompt || ''
  const hasPrompt = promptHtml && promptHtml.trim()

  return (
    // Revealed, the card takes the screen here too: these are the same questions
    // from the hall, and they are read the same way.
    <div className={`dojo-page${flipped ? ' dojo-focus' : ''}`}>
      <div className="sr-top-bar" style={{ width: '100%' }}>
        <span className="sr-top-title">Compulsory Daily Revision</span>
        {/* The same slot the Revision Hall keeps its stored-question count in,
            so a card that is kept has somewhere on screen to be kept in. */}
        <span className={`sr-bank${bankHit ? ' sr-bank-hit' : ''}`} ref={bankRef}>
          <span className="sr-bank-icon" aria-hidden="true" />
          {deckSize} question{deckSize === 1 ? '' : 's'} in your bank
        </span>
        <span className="sr-top-progress">Card {idx + 1} of {total}</span>
      </div>

      <div className="dojo-arena" style={{ width: '100%' }}>
        <div className="dojo-deck-wrapper">
          <div className={`dojo-flip-container ${flipped ? 'dojo-flipped' : ''}${filing ? ' sr-filing' : ''}`} ref={deckRef}>
            <div className="dojo-flip-inner">
              <div className="dojo-flip-front">
                <div className="dojo-card-back" onClick={handleFlip}>
                  <div className="dojo-card-back-inner">
                    <div className="dojo-card-back-pattern" />
                    <span className="dojo-card-back-count">{total - idx} cards remaining</span>
                    <span className="dojo-card-back-icon">?</span>
                    <span className="dojo-card-back-label">Click to reveal</span>
                  </div>
                </div>
              </div>
              <div className="dojo-flip-back">
                <div className="qt-panel">
                  <div className="qt-topbar">
                    <div className="qt-timer-area">
                      {(card.className || card.courseName || card.quizTitle) && (
                        <span style={{ color: '#fff', fontSize: '0.85rem' }}>{[card.className, card.courseName, card.quizTitle].filter(Boolean).join(' · ')}</span>
                      )}
                    </div>
                    <div className="qt-center-group" />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifySelf: 'end' }}>
                      <div className="dojo-card-encounter">
                        <span className="dojo-encounter-label" style={{ color: '#fff' }}>Encounter {encounter}/3</span>
                        <span className="dojo-encounter-dots">
                          {[0, 1, 2].map(i => (
                            <span key={i} className={`dojo-enc-dot ${i < encounter ? 'dojo-enc-dot-filled' : ''}`} />
                          ))}
                        </span>
                      </div>
                      <button className="qt-report-error-btn" onClick={() => setReportOpen(true)}>{'⚠'} Report Error</button>
                    </div>
                  </div>
                  <div className="qt-split">
                    <div className="qt-split-left">
                      {textHtml && <div className="qt-question-text"><RichText html={textHtml} /></div>}
                      {!textHtml && <div className="qt-question-text" style={{ color: '#888' }}>Question</div>}
                    </div>
                    <div className="qt-split-divider" />
                    <div className="qt-split-right">
                      {hasPrompt && <div className="qt-prompt-display"><RichText html={promptHtml} /></div>}
                      {!hasPrompt && <div className="dojo-q-statement-label">{selfMarked ? 'Recall the answer, then check yourself' : 'Select your answer'}</div>}
                      {selfMarked ? (
                        <div className="sr-selfmark">
                          {answered ? (
                            <div className="sr-selfmark-answer">
                              <span className="sr-selfmark-label">Answer</span>
                              <span className="sr-selfmark-text">{answerSummary(q) || 'Read your teacher’s notes on this one.'}</span>
                            </div>
                          ) : (
                            <p className="sr-selfmark-hint">Work the answer out in your head first, then check it.</p>
                          )}
                        </div>
                      ) : (
                      <div className="qt-options">
                        {(q?.options || []).map((opt, oi) => {
                          if (!opt) return null
                          let cls = 'qt-option'
                          let radioCls = 'qt-option-radio'
                          if (answered) {
                            if (oi === q.correctIndex) { cls += ' qt-option-correct'; radioCls += ' qt-radio-correct' }
                            else if (oi === selected && result === 'incorrect') { cls += ' qt-option-wrong'; radioCls += ' qt-radio-wrong' }
                          } else if (oi === selected) cls += ' qt-option-selected'
                          return (
                            <button key={oi} className={cls} onClick={() => { if (!answered) setSelected(oi) }}>
                              <span className={radioCls} />
                              <span className="qt-option-text" dangerouslySetInnerHTML={{ __html: renderMath(prepareMath(opt)) }} />
                            </button>
                          )
                        })}
                      </div>
                      )}
                    </div>
                  </div>
                  <div className="qt-bottombar">
                    <div className="qt-bottom-left">
                      {!answered && (
                        <button className="qt-action-btn-left" onClick={handleAskForHelp}>Ask for Help</button>
                      )}
                    </div>
                    <div className="qt-bottom-center">
                      {feedbackMsg && (
                        <span className={`dojo-feedback-text ${result === 'correct' ? 'dojo-fb-correct' : result === 'help' ? 'dojo-fb-help' : 'dojo-fb-wrong'}`}>
                          {feedbackMsg}
                        </span>
                      )}
                      {cleared && <span className="sr-cleared">Question cleared</span>}
                    </div>
                    <div className="qt-bottom-right">
                      {!answered ? (
                        selfMarked ? (
                          <span className="sr-selfmark-actions">
                            <button className="qt-submit-btn sr-selfmark-no" onClick={() => handleSelfMark(false)}>Still unsure</button>
                            <button className="qt-submit-btn" onClick={() => handleSelfMark(true)}>I knew it</button>
                          </span>
                        ) : (
                          <button className="qt-submit-btn" disabled={selected === -1} onClick={handleSubmit}>Submit</button>
                        )
                      ) : (
                        <button className="qt-submit-btn" onClick={handleNext}>
                          {idx + 1 >= total ? 'See Results' : 'Next'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {flash && <div className="sr-wrong-flash" aria-hidden="true" />}
      {showBurst && (
        <div className="sr-correct-burst">
          <div className="sr-correct-strip">
            <span className="sr-strip-shimmer" aria-hidden="true" />
            {particles.slice(0, 14).map((p, i) => (
              <span
                key={p.id}
                className="sr-particle"
                style={{ width: p.size, height: p.size, background: p.color, left: `${(i * 7 + 4) % 100}%`, top: '50%' }}
              />
            ))}
            <span className="sr-correct-text">Correct!</span>
          </div>
        </div>
      )}
      {reportOpen && (
        <ReportIssueModal
          kind="question"
          question={card?.question}
          onClose={() => setReportOpen(false)}
          onSubmit={({ type, details, option }) => {
            reportQuestionError(card.sourceId || '', card.questionIndex || 0, user.id, type, details, { source: 'revision', option, questionId: card.questionId })
          }}
        />
      )}
    </div>
  )
}

export default SessionRevision
