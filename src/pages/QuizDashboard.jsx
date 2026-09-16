import { useState, useEffect, useRef } from 'react'
import {
  getClassesForStudent,
  getTopicsForClass,
  getQuizzesForTopic,
  isQuizUnlocked,
  getAttemptForQuiz,
  getAttemptsForQuiz,
  submitQuizAttempt,
  getQuizById,
  addTokens,
  saveReviewState,
  getReviewState,
  sendBroadcast,
} from '../data/store.js'
import { RichText } from '../components/RichTextEditor.jsx'
import { useScreenGuard } from '../utils/screenGuard.js'
import { checkExplanation, parseExplanation } from '../utils/aiChat.js'

function youtubeEmbedUrl(url) {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/)
  return m ? `https://www.youtube.com/embed/${m[1]}` : null
}

// Class progress bar. Remembers the last percentage this student saw for the
// class; when it has gone up (a checkpoint quiz was finished) the bar animates
// from the old value to the new one and shows a "+N%" pop.
const TIERS = [
  { min: 100, key: 'champion', label: 'Champion', icon: '🏆' },
  { min: 75, key: 'gold', label: 'Gold', icon: '🥇' },
  { min: 50, key: 'silver', label: 'Silver', icon: '🥈' },
  { min: 25, key: 'bronze', label: 'Bronze', icon: '🥉' },
  { min: 1, key: 'started', label: 'On the board', icon: '🚀' },
  { min: 0, key: 'new', label: 'Ready to start', icon: '✨' },
]
const tierFor = (pct) => TIERS.find((t) => pct >= t.min)
const MILESTONES = [25, 50, 75]

/**
 * A whole subject row drawn as one big progress bar. Remembers the last
 * percentage this student saw (per browser); when it has gone up since - a
 * checkpoint quiz was finished - the fill sweeps across, the number counts up,
 * passed milestones light up, and reaching a new tier bursts with sparks.
 */
export function SubjectBar({ storageKey, done, total, title, subtitle, thumb, badge, onClick, size = 'md' }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const startPct = (() => {
    try {
      const prev = localStorage.getItem(storageKey)
      return prev !== null && Number(prev) < pct ? Number(prev) : pct
    } catch { return pct }
  })()
  const [fill, setFill] = useState(startPct)
  const [count, setCount] = useState(startPct)
  const [gain, setGain] = useState(null)
  const [unlocked, setUnlocked] = useState(null)
  // Confetti fires only on the run that completes the subject, never on revisit.
  const [complete, setComplete] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(storageKey, String(pct)) } catch { /* private mode */ }
    if (fill >= pct) { setFill(pct); setCount(pct); return }
    const from = fill
    const timers = []
    let raf
    timers.push(setTimeout(() => {
      setFill(pct)
      setGain(pct - from)
      const t0 = performance.now()
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 1400)
        setCount(Math.round(from + (pct - from) * (1 - Math.pow(1 - k, 3))))
        if (k < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }, 400))
    if (tierFor(pct).key !== tierFor(from).key && pct >= 25) {
      timers.push(setTimeout(() => setUnlocked(tierFor(pct)), 1500))
      timers.push(setTimeout(() => setUnlocked(null), 4300))
    }
    if (pct === 100 && from < 100 && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      timers.push(setTimeout(() => setComplete(true), 1600))
      timers.push(setTimeout(() => setComplete(false), 7000))
    }
    timers.push(setTimeout(() => setGain(null), 3000))
    return () => { timers.forEach(clearTimeout); cancelAnimationFrame(raf) }
  }, [pct, storageKey])

  const tier = tierFor(count)
  return (
    <button className={`pq-bar pq-bar-${size} tier-${tier.key}${onClick ? '' : ' is-static'}`} onClick={onClick} tabIndex={onClick ? 0 : -1}
      role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${title}: ${pct}% complete`}>
      {/* Clipped layer: fill and milestone marks stay inside the rounded bar. */}
      <span className="pq-bar-track" aria-hidden="true">
        <span className="pq-bar-fill" style={{ width: `${fill}%` }}><span className="pq-bar-shine" /></span>
        {MILESTONES.map((m) => (
          <span key={m} className={`pq-bar-tick${count >= m ? ' is-lit' : ''}`} style={{ left: `${m}%` }} />
        ))}
      </span>
      <span className="pq-bar-content">
        {thumb}
        <span className="pq-bar-text">
          <span className="pq-bar-title">{title}</span>
          {subtitle && <span className="pq-bar-sub">{subtitle}</span>}
        </span>
        {badge}
        <span className="pq-bar-score">
          <span className="pq-bar-pct">{count}<small>%</small></span>
          <span className="pq-bar-tier">{tier.icon} {tier.label}</span>
        </span>
      </span>
      {gain !== null && (
        <span className="pq-bar-gain" style={{ left: `${Math.min(fill, 92)}%` }}>
          +{gain}%
          {[...Array(10)].map((_, i) => <i key={i} className="pq-spark" style={{ '--a': `${i * 36}deg`, '--d': `${28 + (i % 3) * 14}px` }} />)}
        </span>
      )}
      {unlocked && <span className="pq-bar-unlock">{unlocked.icon} {unlocked.label} unlocked!</span>}
      {complete && (
        <span className="pq-confetti" aria-hidden="true">
          {[...Array(28)].map((_, i) => (
            <i key={i} className="pq-confetto" style={{
              '--x': `${(i * 37) % 100}%`,
              '--delay': `${(i % 7) * 90}ms`,
              '--spin': `${(i % 2 ? 1 : -1) * (360 + (i % 5) * 120)}deg`,
              '--drift': `${((i % 5) - 2) * 26}px`,
              '--hue': `${(i * 47) % 360}`,
            }} />
          ))}
          <span className="pq-complete-badge">🎉 Subject complete!</span>
        </span>
      )}
    </button>
  )
}

function QuizDashboard({ user, onBack, initialNav }) {
  const [selectedClass, setSelectedClass] = useState(initialNav?.classId || null)
  const [selectedTopic, setSelectedTopic] = useState(initialNav?.topicId || null)
  const [activeQuiz, setActiveQuiz] = useState(null)
  const [highlightQuizId, setHighlightQuizId] = useState(initialNav?.quizId || null)
  const [answers, setAnswers] = useState([])
  const [submitted, setSubmitted] = useState(null)
  const [refresh, setRefresh] = useState(0)
  const [showWarning, setShowWarning] = useState(null)
  const [quizStartTime, setQuizStartTime] = useState(null)
  const [timeLeft, setTimeLeft] = useState(null)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [reviewQuiz, setReviewQuiz] = useState(null)
  const [currentQ, setCurrentQ] = useState(0)
  const [flagged, setFlagged] = useState(new Set())
  const [showTimerDisplay, setShowTimerDisplay] = useState(true)
  const [reviewCurrentQ, setReviewCurrentQ] = useState(0)
  const [showQGrid, setShowQGrid] = useState(false)
  const [showReviewQGrid, setShowReviewQGrid] = useState(false)
  const [expandedLeft, setExpandedLeft] = useState(false)
  const [reviewChats, setReviewChats] = useState({})
  const [reviewTokensAwarded, setReviewTokensAwarded] = useState({})
  const [tokenPopup, setTokenPopup] = useState(null)
  const [viewResults, setViewResults] = useState(null)
  const [reviewNudge, setReviewNudge] = useState(false)
  const timerRef = useRef(null)
  const questionTimes = useRef([])
  const questionEnteredAt = useRef(Date.now())
  const screenLeaves = useRef(0)

  const classes = getClassesForStudent(user.id)

  useEffect(() => {
    if (!quizStartTime || !activeQuiz) return
    const limitMs = (activeQuiz.timeLimit || 10) * 60 * 1000
    function tick() {
      const elapsed = Date.now() - quizStartTime
      const remaining = Math.max(0, limitMs - elapsed)
      setTimeLeft(remaining)
      if (remaining <= 0) {
        clearInterval(timerRef.current)
        doSubmit()
      }
    }
    tick()
    timerRef.current = setInterval(tick, 1000)
    return () => clearInterval(timerRef.current)
  }, [quizStartTime])

  useEffect(() => {
    if (!reviewQuiz) return
    const { quiz, attempt } = reviewQuiz
    const q = quiz.questions[reviewCurrentQ]
    if (!q) return
    const isCorrect = q.correctIndex === attempt.answers[reviewCurrentQ]
    const key = `correct-${reviewCurrentQ}`
    if (isCorrect && !reviewTokensAwarded[key]) {
      addTokens(user.id, 1)
      const newTokens = { ...reviewTokensAwarded, [key]: true }
      setReviewTokensAwarded(newTokens)
      saveReviewState(quiz.id, user.id, { chats: reviewChats, tokens: newTokens })
      setTokenPopup('+1 Token — Correct answer!')
      const t = setTimeout(() => setTokenPopup(null), 2000)
      return () => clearTimeout(t)
    }
  }, [reviewCurrentQ, reviewQuiz])

  useEffect(() => {
    if (!reviewQuiz) { setReviewNudge(false); return }
    const { quiz, attempt } = reviewQuiz
    const q = quiz.questions[reviewCurrentQ]
    if (!q) return
    const isCorrect = q.correctIndex === attempt.answers[reviewCurrentQ]
    const chat = reviewChats[reviewCurrentQ] || {}
    if (!isCorrect && chat.step !== 'done') {
      setReviewNudge(true)
    } else {
      setReviewNudge(false)
    }
  }, [reviewCurrentQ, reviewQuiz, reviewChats])


  useEffect(() => {
    if (!activeQuiz) return
    return () => {
      const spent = Date.now() - questionEnteredAt.current
      questionTimes.current[currentQ] = (questionTimes.current[currentQ] || 0) + spent
    }
  }, [currentQ, activeQuiz])

  useEffect(() => {
    if (activeQuiz) questionEnteredAt.current = Date.now()
  }, [currentQ, activeQuiz])

  function doSubmit({ lockedOut = false } = {}) {
    if (!activeQuiz) return
    clearInterval(timerRef.current)
    setShowSubmitConfirm(false)
    const spent = Date.now() - questionEnteredAt.current
    questionTimes.current[currentQ] = (questionTimes.current[currentQ] || 0) + spent
    const finalAnswers = answers.map((a) => (a === -1 ? -1 : a))
    const times = questionTimes.current.map((t) => Math.round((t || 0) / 1000))
    const result = submitQuizAttempt(activeQuiz.id, user.id, finalAnswers, times, { screenLeaves: screenLeaves.current, lockedOut })
    setSubmitted(result)
    setQuizStartTime(null)
    setTimeLeft(null)
    setCurrentQ(0)
    setFlagged(new Set())
    setRefresh((r) => r + 1)
    if (result) {
      const quizLabel = selectedTopic ? `${selectedTopic.name} Quiz ${activeQuiz.number}` : `Quiz ${activeQuiz.number}`
      sendBroadcast(`${user.name} finished ${quizLabel}`)
    }
  }

  const doSubmitRef = useRef(null)
  doSubmitRef.current = doSubmit
  // Leaving the screen too often submits the attempt (utils/screenGuard.js).
  useScreenGuard({
    active: !!(activeQuiz && quizStartTime && !submitted),
    countRef: screenLeaves,
    onLockout: () => doSubmitRef.current?.({ lockedOut: true }),
  })

  function handleStartQuiz(quiz, topic) {
    if (topic) setSelectedTopic(topic)
    setShowWarning(quiz)
  }

  function confirmStartQuiz() {
    const quiz = showWarning
    setShowWarning(null)
    setActiveQuiz(quiz)
    setAnswers(Array(quiz.questions.length).fill(-1))
    setSubmitted(null)
    setQuizStartTime(Date.now())
    setCurrentQ(0)
    setFlagged(new Set())
    setShowTimerDisplay(true)
    questionTimes.current = Array(quiz.questions.length).fill(0)
    screenLeaves.current = 0
    questionEnteredAt.current = Date.now()
  }

  function handleSubmitClick() {
    setShowSubmitConfirm(true)
  }

  function confirmSubmit() {
    setShowSubmitConfirm(false)
    doSubmit()
  }

  function handleDone() {
    setActiveQuiz(null)
    setSubmitted(null)
  }

  function openReview(quiz) {
    const attempt = getAttemptForQuiz(quiz.id, user.id)
    if (attempt) {
      setReviewQuiz({ quiz, attempt })
      setReviewCurrentQ(0)
      const saved = getReviewState(quiz.id, user.id)
      setReviewChats(saved?.chats || {})
      setReviewTokensAwarded(saved?.tokens || {})
    }
  }

  function toggleFlag() {
    setFlagged((prev) => {
      const next = new Set(prev)
      if (next.has(currentQ)) next.delete(currentQ)
      else next.add(currentQ)
      return next
    })
  }

  function formatTimeSplit(ms) {
    const totalSec = Math.ceil(ms / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    return { h: String(h).padStart(2, '0'), m: String(m).padStart(2, '0'), s: String(s).padStart(2, '0') }
  }

  // Warning popup before starting
  if (showWarning) {
    const tl = showWarning.timeLimit || 10
    return (
      <div className="neon-overlay">
        <div className="neon-popup" style={{ maxWidth: 480, padding: '40px 36px' }}>
          <p className="pixel-heading" style={{ fontSize: '1.2rem', color: 'var(--accent)', marginBottom: 20 }}>Quiz {showWarning.number}</p>
          <p style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: 12, lineHeight: 1.6 }}>The quiz cannot be closed once started.</p>
          <div style={{ margin: '24px 0', padding: '16px', border: '2px solid var(--warning)', borderRadius: 'var(--radius)', background: 'rgba(255,171,0,0.08)' }}>
            <p className="pixel-heading" style={{ fontSize: '1.4rem', color: 'var(--warning)', margin: 0 }}>Time: {tl} min</p>
          </div>
          <p style={{ fontSize: '1rem', color: 'var(--danger)', marginBottom: 28, lineHeight: 1.6 }}>You only have one attempt.</p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn" style={{ padding: '14px 40px', fontSize: '0.7rem' }} autoFocus onClick={confirmStartQuiz}>Start Quiz</button>
            <button className="btn btn-outline" style={{ padding: '14px 40px', fontSize: '0.7rem' }} onClick={() => setShowWarning(null)}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  // Taking a quiz — NAPLAN-style
  if (activeQuiz && !submitted) {
    const total = activeQuiz.questions.length
    const q = activeQuiz.questions[currentQ]
    const answered = answers.filter((a) => a !== -1).length
    const unanswered = total - answered
    const isLow = timeLeft !== null && timeLeft < 60000
    const time = timeLeft !== null ? formatTimeSplit(timeLeft) : null

    return (
      <div className="qt-backdrop" onClick={() => setShowQGrid(false)}>
        <div className="qt-panel" onClick={() => setShowQGrid(false)} onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()} style={{ userSelect: 'none' }}>
          {/* Top bar */}
          <div className="qt-topbar">
            <div className="qt-timer-area">
              {showTimerDisplay && time ? (
                <div className={`qt-timer ${isLow ? 'qt-timer-low' : ''}`}>
                  <span className="qt-timer-num">{time.m}</span>
                  <span className="qt-timer-sep">:</span>
                  <span className="qt-timer-num">{time.s}</span>
                  <span className="qt-timer-labels"><span>Min</span><span>Sec</span></span>
                </div>
              ) : null}
              <button className="qt-hide-timer" onClick={() => setShowTimerDisplay(!showTimerDisplay)}>
                {showTimerDisplay ? 'Hide time' : 'Show time'}
              </button>
            </div>

            <div className="qt-center-group">
              <div className="qt-question-indicator">
                Question <strong>{currentQ + 1}</strong> of <strong>{total}</strong>
              </div>
              <div className="qt-grid-trigger-wrap">
                <button className="qt-grid-trigger" onClick={(e) => { e.stopPropagation(); setShowQGrid(!showQGrid) }} title="Jump to question">
                  {[...Array(6)].map((_, i) => <span key={i} className="qt-grid-sq" />)}
                </button>
                {showQGrid && (
                  <div className="qt-grid-dropdown" onClick={(e) => e.stopPropagation()}>
                    {activeQuiz.questions.map((_, i) => (
                      <button
                        key={i}
                        className={`qt-grid-btn ${i === currentQ ? 'qt-grid-btn-current' : ''} ${answers[i] !== -1 ? 'qt-grid-btn-answered' : ''} ${flagged.has(i) ? 'qt-grid-btn-flagged' : ''}`}
                        onClick={() => { setCurrentQ(i); setShowQGrid(false) }}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div />
          </div>

          {/* Two-panel content area */}
          <div className={`qt-split ${expandedLeft ? 'qt-split-expanded' : ''}`}>
            <div className="qt-split-left">
              <div className="qt-question-text">
                <RichText html={q.text} />
              </div>
            </div>
            <div className="qt-split-divider" onClick={() => setExpandedLeft(e => !e)} />
            <div className="qt-split-right">
              {q.prompt && <div className="qt-prompt-display" dangerouslySetInnerHTML={{ __html: q.prompt }} />}
              <div className="qt-options">
                {q.options.map((opt, oi) => (
                  <button
                    key={oi}
                    className={`qt-option ${answers[currentQ] === oi ? 'qt-option-selected' : ''}`}
                    onClick={() => setAnswers((prev) => { const next = [...prev]; next[currentQ] = oi; return next })}
                  >
                    <span className="qt-option-radio" />
                    <span className="qt-option-text">{opt}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="qt-bottombar">
            <button className="qt-nav-btn qt-nav-back" onClick={() => setCurrentQ((c) => Math.max(0, c - 1))} disabled={currentQ === 0}>
              &#9664; Back
            </button>
            <div className="qt-bottom-center">
              <button className="qt-submit-btn" onClick={handleSubmitClick}>
                Submit ({answered}/{total})
              </button>
            </div>
            <div className="qt-bottom-right">
              <button className={`qt-flag-btn ${flagged.has(currentQ) ? 'qt-flag-btn-active' : ''}`} onClick={toggleFlag}>
                Flag &#9873;
              </button>
              {currentQ === total - 1 ? (
                <button className="qt-submit-btn" onClick={handleSubmitClick}>
                  Submit &#9654;
                </button>
              ) : (
                <button className="qt-nav-btn qt-nav-next" onClick={() => setCurrentQ((c) => Math.min(total - 1, c + 1))}>
                  Next &#9654;
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Submit confirmation popup */}
        {showSubmitConfirm && (() => {
          const answeredCount = answers.filter((a) => a !== -1).length
          const unansweredCount = answers.length - answeredCount
          return (
          <div className="neon-overlay">
            <div className="neon-popup" style={{ maxWidth: 400 }}>
              <p className="neon-popup-text" style={{ fontSize: '1.1rem', marginBottom: 12 }}>
                {answeredCount} answered, {unansweredCount} unanswered.
              </p>
              <p className="neon-popup-text" style={{ fontSize: '1.1rem', marginBottom: 20 }}>
                Are you sure you want to finish the quiz?
              </p>
              <div className="neon-popup-actions">
                <button className="btn btn-danger" style={{ padding: '10px 24px' }} autoFocus onClick={confirmSubmit}>Yes</button>
                <button className="btn btn-outline" style={{ padding: '10px 24px' }} onClick={() => setShowSubmitConfirm(false)}>No</button>
              </div>
            </div>
          </div>
          )
        })()}
      </div>
    )
  }

  // Quiz result (shown immediately after submission)
  if ((activeQuiz && submitted) || viewResults) {
    const resultsQuiz = viewResults ? viewResults.quiz : activeQuiz
    const resultsAttempt = viewResults ? viewResults.attempt : submitted
    const allAttempts = getAttemptsForQuiz(resultsQuiz.id)
    const totalStudents = allAttempts.length
    const sorted = [...allAttempts].sort((a, b) => b.score - a.score)
    const rank = sorted.findIndex((a) => a.studentId === user.id) + 1
    function closeResults() {
      if (viewResults) { setViewResults(null) }
      else { handleDone() }
    }
    return (
      <div className="page" style={{ maxWidth: 750, margin: '0 auto' }}>
        <div className="header">
          <h1 className="pixel-title">Results</h1>
          <button className="btn-logout" onClick={closeResults}>Done</button>
        </div>

        <div className="card mt-16" style={{ textAlign: 'center' }}>
          <p className="pixel-heading" style={{ fontSize: '1.2rem', color: resultsAttempt.score >= resultsAttempt.total * 0.7 ? 'var(--success)' : resultsAttempt.score >= resultsAttempt.total * 0.4 ? 'var(--warning)' : 'var(--danger)' }}>
            {resultsAttempt.score} / {resultsAttempt.total}
          </p>
          <p className="text-dim">{Math.round((resultsAttempt.score / resultsAttempt.total) * 100)}%</p>
          {rank > 0 && <p style={{ marginTop: 8, fontSize: '0.9rem', color: 'var(--accent)' }}>Rank {rank} out of {totalStudents}</p>}
        </div>

        <div className="card mt-16">
          <p className="pixel-heading mb-8">Question Breakdown</p>
          <div style={{ overflowX: 'auto' }}>
            <table className="table w-full quiz-report-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>#</th>
                  <th style={{ textAlign: 'left' }}>Question</th>
                  <th style={{ textAlign: 'center', width: 90 }}>Result</th>
                  <th style={{ textAlign: 'center', width: 80 }}>Time</th>
                  <th style={{ textAlign: 'center', width: 110 }}>Class %</th>
                </tr>
              </thead>
              <tbody>
                {resultsQuiz.questions.map((q, qi) => {
                  const picked = resultsAttempt.answers[qi]
                  const correct = q.correctIndex === picked
                  const correctCount = totalStudents > 0 ? allAttempts.filter((a) => a.answers[qi] === q.correctIndex).length : 0
                  const classPct = totalStudents > 0 ? Math.round((correctCount / totalStudents) * 100) : 0
                  const timeSec = resultsAttempt.questionTimes?.[qi]
                  return (
                    <tr key={qi} className={correct ? 'qr-row-correct' : 'qr-row-wrong'}>
                      <td className="bold">{qi + 1}</td>
                      <td><RichText html={q.text} /></td>
                      <td style={{ textAlign: 'center' }}>{correct ? <span style={{ color: 'var(--success)' }}>✓</span> : <span style={{ color: 'var(--danger)' }}>✗</span>}</td>
                      <td style={{ textAlign: 'center', fontSize: '0.8rem', color: '#777' }}>{timeSec != null ? (timeSec < 60 ? `${timeSec}s` : `${Math.floor(timeSec / 60)}m ${timeSec % 60}s`) : '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`qr-pct ${classPct >= 70 ? 'qr-pct-high' : classPct >= 40 ? 'qr-pct-mid' : 'qr-pct-low'}`}>{classPct}%</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  // Review mode — NAPLAN-style
  if (reviewQuiz) {
    const { quiz, attempt } = reviewQuiz
    const total = quiz.questions.length
    const q = quiz.questions[reviewCurrentQ]
    const picked = attempt.answers[reviewCurrentQ]
    const skipped = picked === -1
    const exp = parseExplanation(q.explanation)
    const allReviewAttempts = getAttemptsForQuiz(quiz.id)
    const reviewTotalStudents = allReviewAttempts.length
    const reviewCorrectCount = reviewTotalStudents > 0 ? allReviewAttempts.filter((a) => a.answers[reviewCurrentQ] === q.correctIndex).length : 0
    const reviewClassPct = reviewTotalStudents > 0 ? Math.round((reviewCorrectCount / reviewTotalStudents) * 100) : 0
    const isCorrectQ = q.correctIndex === picked
    const timesForQ = allReviewAttempts.map((a) => a.questionTimes?.[reviewCurrentQ]).filter((t) => t != null && t > 0)
    const avgTimeSec = timesForQ.length > 0 ? Math.round(timesForQ.reduce((a, b) => a + b, 0) / timesForQ.length) : null
    const studentTimeSec = attempt.questionTimes?.[reviewCurrentQ]
    function formatTime(s) { return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s` }

    return (
      <div className="qt-backdrop" onClick={() => setShowReviewQGrid(false)}>
        <div className="qt-panel" onClick={() => setShowReviewQGrid(false)} onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()} style={{ userSelect: 'none' }}>
          {/* Top bar */}
          <div className="qt-topbar">
            <div className="qt-timer-area">
              <div className="qt-review-score" style={{ color: attempt.score >= attempt.total * 0.7 ? 'var(--success)' : attempt.score >= attempt.total * 0.4 ? 'var(--warning)' : 'var(--danger)' }}>
                {attempt.score}/{attempt.total} ({Math.round((attempt.score / attempt.total) * 100)}%)
              </div>
            </div>
            <div className="qt-center-group">
              <div className="qt-question-indicator">
                Question <strong>{reviewCurrentQ + 1}</strong> of <strong>{total}</strong> — Review
              </div>
              <div className="qt-grid-trigger-wrap">
                <button className="qt-grid-trigger" onClick={(e) => { e.stopPropagation(); setShowReviewQGrid(!showReviewQGrid) }} title="Jump to question">
                  {[...Array(6)].map((_, i) => <span key={i} className="qt-grid-sq" />)}
                </button>
                {showReviewQGrid && (
                  <div className="qt-grid-dropdown" onClick={(e) => e.stopPropagation()}>
                    {quiz.questions.map((_, i) => {
                      const p = attempt.answers[i]
                      const isCorrect = quiz.questions[i].correctIndex === p
                      return (
                        <button
                          key={i}
                          className={`qt-grid-btn ${i === reviewCurrentQ ? 'qt-grid-btn-current' : ''} ${isCorrect ? 'qt-grid-btn-correct' : 'qt-grid-btn-wrong'}`}
                          onClick={() => { setReviewCurrentQ(i); setShowReviewQGrid(false) }}
                        >
                          {i + 1}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
            <div />
          </div>

          {/* Content */}
          {reviewNudge && (
            <div className="qt-review-nudge" key={reviewCurrentQ}>Complete your question review chat below!</div>
          )}
          <div className="qt-content">
            {q.videoUrl && youtubeEmbedUrl(q.videoUrl) && (
              <div className="qt-video-embed">
                <iframe src={youtubeEmbedUrl(q.videoUrl)} allowFullScreen title="Solution video" />
              </div>
            )}
            <div className="qt-question-text">
              <RichText html={q.text} />
              {skipped && <p style={{ color: '#c62828', marginTop: 12 }}>Not answered</p>}
            </div>
            {q.prompt && <div className="qt-prompt-display" dangerouslySetInnerHTML={{ __html: q.prompt }} />}
            <div className="qt-options">
              {q.options.map((opt, oi) => {
                let cls = 'qt-option qt-option-review'
                if (oi === q.correctIndex) cls += ' qt-option-correct'
                if (oi === picked && oi !== q.correctIndex) cls += ' qt-option-wrong'
                const letter = String.fromCharCode(65 + oi)
                const optExp = exp.options?.[letter]
                return (
                  <div key={oi}>
                    <div className={cls}>
                      <span className={`qt-option-radio ${oi === q.correctIndex ? 'qt-radio-correct' : oi === picked ? 'qt-radio-wrong' : ''}`} />
                      <span className="qt-option-text">{opt}</span>
                    </div>
                    {optExp && <div className="qt-option-explanation" dangerouslySetInnerHTML={{ __html: optExp }} />}
                  </div>
                )
              })}
            </div>
            <div className="qt-review-stats">
              <div className={`qt-review-stat-cell ${isCorrectQ ? 'qt-review-stat-correct' : 'qt-review-stat-wrong'}`}>
                <span className="qt-review-stat-icon">{isCorrectQ ? '✓' : '✗'}</span>
                <span className="qt-review-stat-label">{isCorrectQ ? 'Correct' : skipped ? 'Skipped' : 'Incorrect'}</span>
              </div>
              <div className="qt-review-stat-cell">
                {(() => {
                  let diff, diffColor
                  if (reviewClassPct <= 10) { diff = 'Challenging'; diffColor = '#ff1744' }
                  else if (reviewClassPct <= 40) { diff = 'Separator'; diffColor = '#ff9100' }
                  else if (reviewClassPct <= 80) { diff = 'Average'; diffColor = '#ffab00' }
                  else { diff = 'Must Get Right'; diffColor = '#76ff03' }
                  return <>
                    <span className="qt-review-stat-big" style={{ color: diffColor, textShadow: `0 0 8px ${diffColor}40` }}>{reviewClassPct}%</span>
                    <span className="qt-review-stat-label">answered correctly</span>
                    <span className="qt-review-stat-diff" style={{ color: diffColor }}>{diff}</span>
                  </>
                })()}
              </div>
              <div className="qt-review-stat-cell">
                {studentTimeSec != null && (() => {
                  let timeColor = '#4caf50'
                  if (avgTimeSec != null && avgTimeSec > 0) {
                    const ratio = (studentTimeSec - avgTimeSec) / avgTimeSec
                    if (ratio > 0.5) timeColor = '#e53935'
                    else if (ratio > 0.2) timeColor = '#ffab00'
                    else if (ratio >= -0.1) timeColor = '#4caf50'
                    else timeColor = '#4caf50'
                  }
                  return (
                    <div className="qt-review-time-row">
                      <span className="qt-review-stat-big" style={{ color: timeColor }}>{formatTime(studentTimeSec)}</span>
                      <span className="qt-review-stat-label">your time</span>
                    </div>
                  )
                })()}
                {avgTimeSec != null && (
                  <div className="qt-review-time-row">
                    <span className="qt-review-stat-big" style={{ color: '#1a1a2e' }}>{formatTime(avgTimeSec)}</span>
                    <span className="qt-review-stat-label">class avg</span>
                  </div>
                )}
              </div>
            </div>
            {q.correctIndex !== picked && (() => {
              const chat = reviewChats[reviewCurrentQ] || { step: 'ask', messages: [] }
              const qIdx = reviewCurrentQ
              function updateChat(newChat) {
                setReviewChats((prev) => ({ ...prev, [qIdx]: newChat }))
              }
              const correctText = q.options[q.correctIndex] || ''
              const questionText = (q.text || '').replace(/<[^>]*>/g, '')

              async function handleExplanationSubmit(e) {
                e.preventDefault()
                const input = e.target.elements.explanation.value.trim()
                if (!input) return
                const withStudent = { ...chat, step: 'checking', messages: [...chat.messages, { from: 'student', text: input }] }
                updateChat(withStudent)
                const result = await checkExplanation({
                  questionText,
                  correctAnswer: correctText,
                  officialExplanation: [exp.general, ...Object.values(exp.options || {})].filter(Boolean).join(' '),
                  studentReason: chat.reason || '',
                  studentExplanation: input,
                })
                if (result.coherent) {
                  const congratsMsgs = [...withStudent.messages, { from: 'ai', text: result.reply }]
                  updateChat({ ...withStudent, step: 'complete', messages: congratsMsgs })
                  setTimeout(() => {
                    const doneChat = { ...withStudent, step: 'done', messages: congratsMsgs }
                    setReviewChats((prev) => ({ ...prev, [qIdx]: doneChat }))
                    const newTokens = { ...reviewTokensAwarded }
                    if (!newTokens[`chat-${qIdx}`]) {
                      addTokens(user.id, 1)
                      newTokens[`chat-${qIdx}`] = true
                      setReviewTokensAwarded(newTokens)
                      setTokenPopup('+1 Token — Great explanation!')
                      setTimeout(() => setTokenPopup(null), 2000)
                    }
                    saveReviewState(quiz.id, user.id, { chats: { ...reviewChats, [qIdx]: doneChat }, tokens: newTokens })
                  }, 2500)
                } else {
                  updateChat({ ...withStudent, step: 'explain', messages: [...withStudent.messages, { from: 'ai', text: result.reply }] })
                }
              }

              if (chat.step === 'init' || !chat.step || chat.messages.length === 0) {
                const msgs = [{ from: 'ai', text: `Hmm, it looks like you didn't get this one right. No worries — let's figure out what happened! Why do you think you answered incorrectly?` }]
                if (chat.step !== 'ask') updateChat({ step: 'ask', messages: msgs })
                return (
                  <div className="qt-chat" onClick={(e) => e.stopPropagation()}>
                    <div className="qt-chat-header"><span>Review Chat</span><span className={`qt-chat-bounty${chat.step === 'done' ? ' qt-chat-bounty-claimed' : ''}`}>{chat.step === 'done' ? '1 Token Claimed!' : 'Token Bounty: 1'}</span></div>
                    <div className="qt-chat-messages">
                      {msgs.map((m, i) => <div key={i} className={`qt-chat-msg qt-chat-${m.from}`} dangerouslySetInnerHTML={{ __html: m.text }} />)}
                    </div>
                    <div className="qt-chat-reasons">
                      {['The question was difficult to understand', 'Silly mistake', 'I ran out of time', 'I guessed'].map((reason) => (
                        <button key={reason} className="qt-chat-reason-btn" onClick={() => {
                          updateChat({
                            step: 'explain',
                            messages: [...msgs, { from: 'student', text: reason }, { from: 'ai', text: `Got it — "${reason.toLowerCase()}". That's okay, it happens! Now, look at the correct answer and explain in your own words why it's the right one. This will help it stick!` }],
                            reason
                          })
                        }}>{reason}</button>
                      ))}
                    </div>
                  </div>
                )
              }
              return (
                <div className="qt-chat" onClick={(e) => e.stopPropagation()}>
                  <div className="qt-chat-header"><span>Review Chat</span><span className={`qt-chat-bounty${chat.step === 'done' ? ' qt-chat-bounty-claimed' : ''}`}>{chat.step === 'done' ? '1 Token Claimed!' : 'Token Bounty: 1'}</span></div>
                  <div className="qt-chat-messages">
                    {chat.messages.map((m, i) => <div key={i} className={`qt-chat-msg qt-chat-${m.from}`} dangerouslySetInnerHTML={{ __html: m.text }} />)}
                    {chat.step === 'checking' && <div className="qt-chat-msg qt-chat-ai qt-chat-typing">Thinking...</div>}
                  </div>
                  {chat.step === 'explain' && (
                    <form className="qt-chat-input-row" onSubmit={handleExplanationSubmit}>
                      <input name="explanation" className="qt-chat-input" placeholder="Explain in your own words..." autoFocus />
                      <button type="submit" className="qt-chat-send">Send</button>
                    </form>
                  )}
                  {chat.step === 'complete' && (
                    <div className="qt-chat-done" style={{ color: 'var(--success)' }}>Token incoming...</div>
                  )}
                  {chat.step === 'done' && (
                    <div className="qt-chat-done">Chat complete</div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Bottom bar */}
          <div className="qt-bottombar">
            <div className="qt-bottom-left">
              <button className="qt-nav-btn qt-nav-back" onClick={() => setReviewCurrentQ((c) => Math.max(0, c - 1))} disabled={reviewCurrentQ === 0}>
                &#9664; Back
              </button>
            </div>
            <div className="qt-bottom-center">
              <button className="qt-nav-btn qt-nav-done" onClick={() => { saveReviewState(quiz.id, user.id, { chats: reviewChats, tokens: reviewTokensAwarded }); setReviewQuiz(null) }}>
                Done
              </button>
            </div>
            <div className="qt-bottom-right">
              <button className="qt-nav-btn qt-nav-next" onClick={() => setReviewCurrentQ((c) => Math.min(total - 1, c + 1))} disabled={reviewCurrentQ === total - 1}>
                Next &#9654;
              </button>
            </div>
          </div>
        </div>
        {tokenPopup && (
          <div className="qt-token-popup">{tokenPopup}</div>
        )}
      </div>
    )
  }

  // Class → topics sidebar + quiz content (same layout as assignments)
  if (selectedClass) {
    const topics = getTopicsForClass(selectedClass.id)
    const activeTopic = selectedTopic || (topics.length > 0 ? topics[0] : null)
    const activeQuizzes = activeTopic ? getQuizzesForTopic(activeTopic.id) : []

    return (
      <div className="hw-page">
        <div className="header">
          <div>
            <h1 className="pixel-title">Progress Tests</h1>
            <p style={{ fontSize: '0.8rem', color: 'var(--accent)', marginTop: 2 }}>Class: <strong>{selectedClass.name}</strong></p>
          </div>
          <button className="btn-logout" onClick={() => { setSelectedClass(null); setSelectedTopic(null) }}>Back</button>
        </div>

        {(() => {
          const allQuizzes = topics.flatMap((t) => getQuizzesForTopic(t.id))
          const doneCount = allQuizzes.filter((q) => getAttemptForQuiz(q.id, user.id)).length
          return (
            <div className="pq-class-progress">
              <SubjectBar
                size="lg"
                storageKey={`pq-progress-${user.id}-${selectedClass.id}`}
                done={doneCount}
                total={allQuizzes.length}
                title="Class progress"
                subtitle={`${doneCount} of ${allQuizzes.length} checkpoint quizzes complete`}
              />
            </div>
          )
        })()}

        {topics.length === 0 ? (
          <div className="card mt-16">
            <p className="text-dim">No topics available yet.</p>
          </div>
        ) : (
          <div className="hw-layout">
            <div className="hw-timeline">
              {topics.map((topic, i) => {
                const quizzes = getQuizzesForTopic(topic.id)
                const completedCount = quizzes.filter(q => getAttemptForQuiz(q.id, user.id)).length
                const unlockedCount = quizzes.filter(q => isQuizUnlocked(q.id, user.id)).length
                const allDone = quizzes.length > 0 && completedCount === quizzes.length
                const pendingCount = quizzes.filter(q => isQuizUnlocked(q.id, user.id) && !getAttemptForQuiz(q.id, user.id)).length
                const isActive = activeTopic && topic.id === activeTopic.id
                const allLocked = unlockedCount === 0
                return (
                  <div key={topic.id} className={`hw-timeline-arrow-card ${isActive ? 'hw-timeline-arrow-active' : ''} ${allDone ? 'hw-timeline-arrow-done' : ''} ${allLocked ? 'pq-timeline-locked' : ''}`} style={{ position: 'relative' }} onClick={() => setSelectedTopic(topic)}>
                    {pendingCount > 0 && <span className="hw-badge-warn" style={{ position: 'absolute', top: -6, right: -6, zIndex: 2 }}>{pendingCount}</span>}
                    <span className="hw-timeline-week-num">{allLocked ? '🔒' : i + 1}</span>
                    <div className="hw-timeline-arrow-body">
                      <span className="hw-timeline-name">{topic.name}</span>
                      <span className="hw-timeline-info">
                        {allLocked ? 'Locked' : `${completedCount}/${quizzes.length} quizzes done`}
                      </span>
                    </div>
                    <div className="hw-timeline-arrow-point" />
                  </div>
                )
              })}
            </div>

            <div className="hw-content">
              {activeTopic ? (
                <>
                  <h2 className="pixel-heading" style={{ fontSize: '1rem', marginBottom: 4 }}>{activeTopic.name}</h2>
                  <p className="hw-section-label">Quizzes</p>
                  {activeQuizzes.length === 0 ? (
                    <p className="text-dim" style={{ fontSize: '0.8rem' }}>No quizzes for this topic yet.</p>
                  ) : (
                    <div className="pq-rows">
                      {activeQuizzes.map(quiz => {
                        const isUnlocked = isQuizUnlocked(quiz.id, user.id)
                        const attempt = getAttemptForQuiz(quiz.id, user.id)
                        const hasAttempt = !!attempt
                        const pct = hasAttempt ? Math.round((attempt.score / attempt.total) * 100) : 0
                        let cardGrade = '', cardGradeClass = ''
                        if (hasAttempt) {
                          if (pct === 100) { cardGrade = 'Mastery'; cardGradeClass = 'hw-quiz-status-mastery' }
                          else if (pct >= 80) { cardGrade = 'High Distinction'; cardGradeClass = 'hw-quiz-status-hd' }
                          else if (pct >= 55) { cardGrade = 'Distinction'; cardGradeClass = 'hw-quiz-status-done' }
                          else if (pct >= 40) { cardGrade = 'Satisfactory'; cardGradeClass = 'hw-quiz-status-sat' }
                          else if (pct >= 20) { cardGrade = 'Credit'; cardGradeClass = 'hw-quiz-status-credit' }
                          else { cardGrade = 'Needs Review'; cardGradeClass = 'hw-quiz-status-needs-work' }
                        }
                        const isHighlighted = highlightQuizId === quiz.id
                        return (
                          <button
                            key={quiz.id}
                            className={`pq-row pq-quiz-row${!isUnlocked ? ' is-locked' : ''}${hasAttempt ? ' is-done' : ''}${isHighlighted ? ' is-highlight' : ''}`}
                            disabled={!isUnlocked}
                            onClick={() => {
                              if (!isUnlocked) return
                              setHighlightQuizId(null)
                              if (hasAttempt) openReview(quiz)
                              else handleStartQuiz(quiz, activeTopic)
                            }}
                          >
                            <span className="pq-row-check" aria-hidden="true">{!isUnlocked ? '🔒' : hasAttempt ? '✓' : quiz.number}</span>
                            <span className="pq-row-info">
                              <span className="pq-row-name">Quiz {quiz.number}</span>
                              <span className="pq-row-meta">{quiz.questions.length} questions · {quiz.timeLimit || 10} min</span>
                            </span>
                            {!isUnlocked ? (
                              <span className="hw-quiz-status hw-quiz-status-locked">Locked</span>
                            ) : hasAttempt ? (
                              <span className={`hw-quiz-status ${cardGradeClass}`}>{attempt.score}/{attempt.total} ({pct}%) · {cardGrade}</span>
                            ) : (
                              <span className="hw-quiz-status hw-quiz-status-new">Start</span>
                            )}
                            <span className="pq-row-chevron" aria-hidden="true">{isUnlocked ? '›' : ''}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-dim">Select a topic to see quizzes.</p>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Class selection (matches assignment course cards)
  return (
    <div className="hw-page">
      <div className="header">
        <h1 className="pixel-title">Progress Tests</h1>
        <button className="btn-logout" onClick={onBack}>Back</button>
      </div>

      <p className="pixel-heading" style={{ marginBottom: 16 }}>My Classes</p>

      {classes.length === 0 ? (
        <div className="card">
          <p className="text-dim">Not enrolled in any classes yet.</p>
        </div>
      ) : (
        <div className="pq-rows">
          {classes.map((cls) => {
            const topics = getTopicsForClass(cls.id)
            let classPending = 0
            for (const t of topics) {
              for (const q of getQuizzesForTopic(t.id)) {
                if (isQuizUnlocked(q.id, user.id) && !getAttemptForQuiz(q.id, user.id)) classPending++
              }
            }
            const totalQuizzes = topics.reduce((sum, t) => sum + getQuizzesForTopic(t.id).length, 0)
            const completedQuizzes = topics.reduce((sum, t) => sum + getQuizzesForTopic(t.id).filter(q => getAttemptForQuiz(q.id, user.id)).length, 0)
            return (
              <SubjectBar
                key={cls.id}
                storageKey={`pq-progress-${user.id}-${cls.id}`}
                done={completedQuizzes}
                total={totalQuizzes}
                onClick={() => setSelectedClass(cls)}
                thumb={<span className="pq-bar-thumb" style={cls.image ? { backgroundImage: `url(${cls.image})` } : {}}>{!cls.image && '📋'}</span>}
                title={<>{cls.name}{cls.yearGroup ? <span className="pq-bar-year"> · Year {cls.yearGroup}</span> : null}</>}
                subtitle={`${completedQuizzes} of ${totalQuizzes} checkpoint quizzes · ${topics.length} topic${topics.length !== 1 ? 's' : ''}`}
                badge={classPending > 0 ? <span className="pq-bar-badge">{classPending} to do</span> : null}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

export default QuizDashboard
