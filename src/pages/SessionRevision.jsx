import { useState, useMemo, useEffect } from 'react'
import { getDojoCardsForStudent, recordCompulsoryRevisionAnswer, markDojoAskTeacher, reportQuestionError } from '../data/store.js'
import ReportIssueModal from '../components/ReportIssueModal.jsx'
import { RichText } from '../components/RichTextEditor.jsx'
import { resolveImages } from '../data/imageStore.js'

const TARGET = 5

function SessionRevision({ user, onComplete }) {
  const cards = useMemo(() => {
    const all = getDojoCardsForStudent(user.id).filter(c => !c.archived)
    const shuffled = [...all].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, TARGET)
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
  const [showBurst, setShowBurst] = useState(false)
  const [particles, setParticles] = useState([])
  const [reportOpen, setReportOpen] = useState(false)
  const [reportType, setReportType] = useState('')
  const [reportDetails, setReportDetails] = useState('')

  const total = cards.length

  useEffect(() => {
    if (total === 0) onComplete()
  }, [total, onComplete])

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

  function handleSubmit() {
    if (selected === -1 || answered) return
    const correct = selected === q.correctIndex
    setAnswered(true)
    setResult(correct ? 'correct' : 'incorrect')
    if (correct) {
      setScore(s => s + 1)
      setFeedbackMsg('Returned successfully')
      setShowBurst(true)
      spawnParticles()
      setTimeout(() => setShowBurst(false), 1500)
    } else {
      setFeedbackMsg('Kept in your revision deck')
    }
    recordCompulsoryRevisionAnswer(card.id, correct)
  }

  function handleNext() {
    if (idx + 1 >= total) {
      setDone(true)
      return
    }
    setIdx(i => i + 1)
    setSelected(-1)
    setAnswered(false)
    setResult(null)
    setFlipped(false)
    setFeedbackMsg(null)
  }

  function handleAskForHelp() {
    markDojoAskTeacher(card.id)
    setFeedbackMsg('Moved to Ask for Help deck')
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
          <p className="sr-done-sub">Well done — keep revising daily to strengthen your memory!</p>
          <button className="btn sr-continue-btn" onClick={handleFinish}>Continue to Portal</button>
        </div>
      </div>
    )
  }

  const textHtml = resolvedHtml[q?.text] || q?.text || ''
  const promptHtml = resolvedHtml[q?.prompt] || q?.prompt || ''
  const hasPrompt = promptHtml && promptHtml.trim()

  return (
    <div className="dojo-page">
      <div className="sr-top-bar" style={{ width: '100%' }}>
        <span className="sr-top-title">Compulsory Daily Revision</span>
        <span className="sr-top-progress">Card {idx + 1} of {total}</span>
      </div>

      <div className="dojo-arena" style={{ width: '100%' }}>
        <div className="dojo-deck-wrapper">
          <div className={`dojo-flip-container ${flipped ? 'dojo-flipped' : ''}`}>
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
                      {!hasPrompt && <div className="dojo-q-statement-label">Select your answer</div>}
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
                              <span className="qt-option-text">{opt}</span>
                            </button>
                          )
                        })}
                      </div>
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
                    </div>
                    <div className="qt-bottom-right">
                      {!answered ? (
                        <button className="qt-submit-btn" disabled={selected === -1} onClick={handleSubmit}>Submit</button>
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
      {showBurst && (
        <div className="sr-correct-burst">
          {particles.map(p => (
            <span
              key={p.id}
              className="sr-particle"
              style={{
                width: p.size, height: p.size,
                background: p.color,
                left: `calc(50% + ${p.x}px)`,
                top: `calc(50% + ${p.y}px)`,
              }}
            />
          ))}
          <span className="sr-correct-text">Correct!</span>
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
