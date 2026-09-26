import { useState, useEffect, useRef } from 'react'
import { loadOwnContact } from '../data/firebase.js'
import { extractTabLabel } from '../utils/extractLabel.js'
import { renderMath } from '../utils/renderMath.js'
import {
  getCoursesForStudent,
  getCourseById,
  getClassesForStudent,
  getClassById,
  getImportedQuizSet,
  getHomeworkAttempt,
  getHomeworkAttemptsForQuiz,
  getHomeworkAttemptsForStudent,
  submitHomeworkAttempt,
  submitHomeworkRedo,
  sendBroadcast,
  getLatestHomeworkRedo,
  fixMojibake,
  unescapeHtml,
  getStudentById,
  addCoins,
  addTokens,
  saveHomeworkReviewState,
  getHomeworkReviewState,
  getHomeworkStart,
  startHomeworkCourse,
  getUnlockedModuleCount,
  refreshQuizSetFromCloud,
  quizResultsVisible,
  attemptAwaitsMarking,
  getTrialCourseReport,
  getModuleDeadline,
  addDojoCard,
  getSharedExplanation,
  saveSharedExplanation,
  markDojoAskTeacher,
  getStudentPercentile,
  getAllAttemptsForQuizSet,
  getWritingMark,
  WRITING_RUBRIC,
  reportQuestionError,
  reportExplanation,
  addToVocabBank,
  saveHomeworkProgress,
  getHomeworkProgress,
  clearHomeworkProgress,
  resetQuizForStudent,
} from '../data/store.js'
import { RichText, default as RichTextEditor } from '../components/RichTextEditor.jsx'
import { playCoinSound } from '../utils/soundManager.js'
import { resolveImages } from '../data/imageStore.js'
import { parseVideoUrl } from '../utils/video.js'
import { useScreenGuard } from '../utils/screenGuard.js'
import ReportIssueModal from '../components/ReportIssueModal.jsx'
import ClozeGapReview from '../components/ClozeGapReview.jsx'
import TrialReport from '../components/TrialReport.jsx'
import ReviewHelp from '../components/ReviewHelp.jsx'
import { checkExplanation, parseExplanation, generateWordDefinition, generateExplanation } from '../utils/aiChat.js'

const TRIAL_INSTRUCTIONS = {
  'sel-reading': { heading: 'Selective High School Placement Practice Test', subject: 'Reading', body: `<p><b>INSTRUCTIONS</b></p><p><b>Please read these instructions carefully.</b></p><p>You have <b>45 minutes</b> to complete <b>17 questions</b> in this test.</p><p>For Questions 1–8, choose <b>one</b> correct answer to each question.</p><p>For Question 9, choose the <b>eight</b> correct answers.</p><p>For Questions 10–15, choose <b>one</b> correct answer to each question.</p><p>For Question 16, choose the <b>six</b> correct answers.</p><p>For Question 17, choose the <b>ten</b> correct answers.</p><p>You will <b>not</b> lose marks for incorrect answers, so you should attempt <b>all</b> questions.</p><p>Please note that some words and phrases are in bold in the texts as they are referred to in some questions.</p><p>Calculators and dictionaries are not allowed.</p>` },
  'sel-math': { heading: 'Selective High School Placement Practice Test', subject: 'Mathematical Reasoning', body: `<p><b>INSTRUCTIONS</b></p><p><b>Please read these instructions carefully.</b></p><p>You have <b>40 minutes</b> to complete <b>35 questions</b> in this test.</p><p>For each question there are five possible answers. Choose the one correct answer.</p><p>You will <b>not</b> lose marks for incorrect answers, so you should attempt <b>all</b> questions.</p><p>Calculators and dictionaries are not allowed.</p>` },
  'sel-thinking': { heading: 'Selective High School Placement Practice Test', subject: 'Thinking Skills', body: `<p><b>INSTRUCTIONS</b></p><p><b>Please read these instructions carefully.</b></p><p>You have <b>40 minutes</b> to complete <b>40 questions</b> in this test.</p><p>For each question there are four possible answers. Choose the one correct answer.</p><p>You will <b>not</b> lose marks for incorrect answers, so you should attempt <b>all</b> questions.</p><p>Calculators and dictionaries are not allowed.</p>` },
  'sel-writing': { heading: 'Selective High School Placement Practice Test', subject: 'Writing', body: `<p><b>INSTRUCTIONS</b></p><p><b>Please read these instructions carefully.</b></p><p>You have <b>30 minutes</b> to complete this test.</p><p>This test contains one task.</p><p>The task provides an opportunity for you to show how well you can choose, develop and organise ideas and communicate them effectively in writing.</p><p>Before you begin writing, take time to think carefully about what you need to say and the ways in which the organisation and layout of your response might help express your message.</p><p>You will receive a higher mark if you produce an original and engaging response to the writing task.</p><p>You will receive a lower mark if your writing does not address the topic outlined in the writing task.</p><p>Calculators and dictionaries are not allowed.</p>` },
  'oc-reading': { heading: 'Opportunity Class Placement Practice Test', subject: 'Reading', body: `<p><b>INSTRUCTIONS</b></p><p><b>Please read these instructions carefully.</b></p><p>You have <b>40 minutes</b> to complete <b>14 questions</b> in this test.</p><p>For Questions 1–6, choose <b>one</b> correct answer to each question.</p><p>For Question 7, choose the <b>eight</b> correct answers.</p><p>For Questions 8–12, choose <b>one</b> correct answer to each question.</p><p>For Question 13, choose the <b>six</b> correct answers.</p><p>For Question 14, choose the <b>eight</b> correct answers.</p><p>You will <b>not</b> lose marks for incorrect answers, so you should attempt <b>all</b> questions.</p><p>Please note that some words and phrases are in bold in the texts as they are referred to in some questions.</p><p>Calculators and dictionaries are not allowed.</p>` },
  'oc-math': { heading: 'Opportunity Class Placement Practice Test', subject: 'Mathematical Reasoning', body: `<p><b>INSTRUCTIONS</b></p><p><b>Please read these instructions carefully.</b></p><p>You have <b>40 minutes</b> to complete <b>35 questions</b> in this test.</p><p>For each question there are five possible answers. Choose the one correct answer.</p><p>You will <b>not</b> lose marks for incorrect answers, so you should attempt <b>all</b> questions.</p><p>Calculators and dictionaries are not allowed.</p>` },
  'oc-thinking': { heading: 'Opportunity Class Placement Practice Test', subject: 'Thinking Skills', body: `<p><b>INSTRUCTIONS</b></p><p><b>Please read these instructions carefully.</b></p><p>You have <b>30 minutes</b> to complete <b>30 questions</b> in this test.</p><p>For each question there are four possible answers. Choose the one correct answer.</p><p>You will <b>not</b> lose marks for incorrect answers, so you should attempt <b>all</b> questions.</p><p>Calculators and dictionaries are not allowed.</p>` },
}

function AnimatedNumber({ target, duration = 1200 }) {
  const [value, setValue] = useState(0)
  const ref = useRef(null)
  useEffect(() => {
    const start = performance.now()
    function tick(now) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))
      if (progress < 1) ref.current = requestAnimationFrame(tick)
    }
    ref.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(ref.current)
  }, [target, duration])
  return value
}

function ordinal(n) {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

function rankColor(n) {
  if (n === 1) return '#FFDF00'
  if (n === 2) return '#c0c0c0'
  if (n === 3) return '#cd7f32'
  return '#fff'
}

function HwResults({ title, score, total, pct, coins, grade, gradeColor, rank, totalStudents, classAvgPct, classAvgScore, classMedianScore, classTopScore, totalBalance, awaitingMarking, percentile, historicalAttempts, timeTaken, avgTimeTaken, questionsCorrect, questionsSkipped, questionBreakdown, isRedo, onGoToQuestion, onReview, onExit }) {
  const [sortBy, setSortBy] = useState('number')
  const [sortAsc, setSortAsc] = useState(true)

  const sortedBreakdown = [...questionBreakdown].sort((a, b) => {
    if (sortBy === 'number') return sortAsc ? a.num - b.num : b.num - a.num
    if (sortBy === 'classPct') return sortAsc ? a.classPct - b.classPct : b.classPct - a.classPct
    return 0
  })

  function toggleSort(col) {
    if (sortBy === col) setSortAsc(!sortAsc)
    else { setSortBy(col); setSortAsc(col === 'number') }
  }

  const pctBarColor = pct >= 80 ? '#00e676' : pct >= 55 ? '#66bb6a' : pct >= 40 ? '#ffab00' : '#ff9100'

  return (
    <div className="hw-res-backdrop">
      <div className="hw-res-content">
        {/* Actions — at the very top */}
        <div className="hw-res-actions">
          <button className="btn" onClick={onReview}>
            Review All
          </button>
          <button className="btn btn-outline" onClick={onExit}>
            Back to the Course
          </button>
        </div>

        {/* Separator */}
        <div className="hw-res-separator" />

        {/* Report box container */}
        <div className="hw-res-report-box">

        {/* Header banner */}
        <div className="hw-res-banner">
          <div className="hw-res-banner-left">
            <div className="hw-res-title-box">
              <span className="hw-res-title-text">
                {isRedo ? 'Revision — ' : ''}{title}
              </span>
            </div>
            {!isRedo && !awaitingMarking && <div className="hw-res-grade-badge" style={{ '--grade-bg': gradeColor }}>
              <span className="hw-res-grade-text">{grade}</span>
            </div>}
            {!isRedo && awaitingMarking && <div className="hw-res-grade-badge" style={{ '--grade-bg': '#7c3aed' }}>
              <span className="hw-res-grade-text">Pending</span>
            </div>}
          </div>
          {!isRedo && !awaitingMarking && <div className="hw-res-banner-ring">
            <svg viewBox="0 0 120 120" className="hw-res-ring-svg">
              <circle cx="60" cy="60" r="52" fill="none" className="hw-res-ring-track" strokeWidth="10" />
              <circle cx="60" cy="60" r="52" fill="none" stroke={pctBarColor} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${pct * 3.267} 326.7`} transform="rotate(-90 60 60)" className="hw-res-ring-fill" />
            </svg>
            <div className="hw-res-ring-inner">
              <span className="hw-res-ring-pct"><AnimatedNumber target={pct} />%</span>
              <span className="hw-res-ring-label">correct</span>
            </div>
          </div>}
        </div>

        {/* Summary metrics strip */}
        {!isRedo && <div className="hw-res-metrics">
          <div className="hw-res-metric">
            <span className="hw-res-metric-label">Score</span>
            {awaitingMarking
              ? <span className="hw-res-metric-val" style={{ color: '#b39ddb' }}>PENDING</span>
              : <span className="hw-res-metric-val">{score} / {total}</span>}
          </div>
          <div className="hw-res-metric-sep" />
          {!awaitingMarking && (
            <>
              <div className="hw-res-metric">
                <span className="hw-res-metric-label">Ranking</span>
                <span className="hw-res-metric-val" style={{ color: rankColor(rank) }}>{ordinal(rank)} <span style={{ color: 'var(--text-dim)' }}>/ {totalStudents}</span></span>
              </div>
              <div className="hw-res-metric-sep" />
            </>
          )}
          <div className="hw-res-metric">
            <span className="hw-res-metric-label">Time</span>
            <span className="hw-res-metric-val">{timeTaken}</span>
            {avgTimeTaken && <span className="hw-res-metric-sub">avg {avgTimeTaken}</span>}
          </div>
          <div className="hw-res-metric-sep" />
          <div className="hw-res-metric">
            <span className="hw-res-metric-label">Coins</span>
            <span className="hw-res-metric-val" style={{ color: '#ffab00' }}>+{coins} <span style={{ color: 'var(--text-dim)', fontSize: '0.45rem' }}>({totalBalance})</span></span>
          </div>
        </div>}

        {!isRedo && awaitingMarking && (
          <div className="hw-res-pending-note">
            Your writing goes to your teacher to mark. Your score, your ranking and the class figures
            appear here once they have marked it.
          </div>
        )}

        {/* Performance summary: Class comparison + Percentile side by side */}
        {!isRedo && !awaitingMarking && <div className="hw-res-perf-row">
          <div className="hw-res-perf-panel">
            <p className="hw-res-section-label">Class Comparison</p>
            <div className="hw-res-bar-group">
              {[
                { label: 'You', value: score, cls: score >= classAvgScore ? 'hw-res-bar-you-above' : 'hw-res-bar-you-below', colour: score >= classAvgScore ? '#00e676' : '#ff9100' },
                { label: 'Average', value: classAvgScore, cls: 'hw-res-bar-class' },
                { label: 'Median', value: classMedianScore, cls: 'hw-res-bar-median' },
                { label: 'Highest', value: classTopScore, cls: 'hw-res-bar-top', colour: '#00e5ff' },
              ].filter((row) => row.value != null).map((row) => (
                <div key={row.label} className="hw-res-bar-row">
                  <span className="hw-res-bar-label">{row.label}</span>
                  <div className="hw-res-bar-track">
                    <div className={`hw-res-bar-fill ${row.cls}`} style={{ width: `${total > 0 ? Math.round((row.value / total) * 100) : 0}%` }} />
                  </div>
                  <span className="hw-res-bar-val" style={row.colour ? { color: row.colour } : undefined}>{row.value} / {total}</span>
                </div>
              ))}
            </div>
            <div className="hw-res-correct-summary">
              <span className="hw-res-cs-item"><span style={{ color: '#00e676' }}>{questionsCorrect}</span> correct</span>
              <span className="hw-res-cs-dot" />
              <span className="hw-res-cs-item"><span style={{ color: '#ff9100' }}>{total - questionsCorrect - questionsSkipped}</span> wrong</span>
              <span className="hw-res-cs-dot" />
              <span className="hw-res-cs-item"><span style={{ color: 'var(--text-dim)' }}>{questionsSkipped}</span> skipped</span>
            </div>
          </div>
          <div className="hw-res-perf-panel">
            <p className="hw-res-section-label">Historical Percentile</p>
            {percentile !== null ? (
              <>
                <div className="hw-res-percentile-display">
                  <span className="hw-res-percentile-num"><AnimatedNumber target={percentile} duration={1800} /></span>
                  <span className="hw-res-percentile-suffix">th</span>
                  <span className="hw-res-percentile-pct">percentile</span>
                </div>
                <div className="hw-res-percentile-bar-wrap">
                  <div className="hw-res-percentile-bar-track">
                    <div className="hw-res-percentile-bar-fill" style={{ width: `${percentile}%` }} />
                    <div className="hw-res-percentile-marker" style={{ left: `${percentile}%` }} />
                  </div>
                  <div className="hw-res-percentile-labels">
                    <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                  </div>
                </div>
                <p className="hw-res-percentile-desc">
                  Better than <strong>{percentile}%</strong> of <strong>{historicalAttempts}</strong> attempts
                </p>
              </>
            ) : (
              <p className="hw-res-percentile-desc" style={{ marginTop: 8 }}>Not enough data yet</p>
            )}
          </div>
        </div>}

        {/* Question Breakdown Table */}
        {!awaitingMarking && <div className="hw-res-qtable-wrap">
          <p className="hw-res-section-label">Question Breakdown</p>
          <div className="hw-res-qtable">
            <div className="hw-res-qtable-header">
              <button className={`hw-res-qth hw-res-qth-num ${sortBy === 'number' ? 'active' : ''}`} onClick={() => toggleSort('number')}>
                Q# {sortBy === 'number' ? (sortAsc ? '▲' : '▼') : ''}
              </button>
              <span className="hw-res-qth hw-res-qth-tag">Category</span>
              <button className={`hw-res-qth hw-res-qth-class ${sortBy === 'classPct' ? 'active' : ''}`} onClick={() => toggleSort('classPct')}>
                Class % {sortBy === 'classPct' ? (sortAsc ? '▲' : '▼') : ''}
              </button>
              <span className="hw-res-qth hw-res-qth-action" />
            </div>
            <div className="hw-res-qtable-body">
              {sortedBreakdown.map(q => (
                <div key={q.num} className={`hw-res-qrow ${q.correct ? 'hw-res-qrow-correct' : q.skipped ? 'hw-res-qrow-skipped' : 'hw-res-qrow-wrong'}`}>
                  <span className="hw-res-qcell hw-res-qcell-num">Q{q.num}</span>
                  <span className="hw-res-qcell hw-res-qcell-tag">
                    {q.tag && <span className="hw-res-qtag">{q.tag}</span>}
                  </span>
                  <span className="hw-res-qcell hw-res-qcell-class">
                    <span className="hw-res-qclass-bar">
                      <span className="hw-res-qclass-fill" style={{ width: `${q.classPct}%` }} />
                    </span>
                    <span className="hw-res-qclass-val">{q.classPct}%</span>
                  </span>
                  <span className="hw-res-qcell hw-res-qcell-action">
                    <button className="hw-res-qgo" onClick={() => onGoToQuestion(q.num - 1)}>Review</button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>}

        </div>{/* end hw-res-report-box */}
      </div>
    </div>
  )
}

function isQuestionCorrect(q, answer) {
  const type = q.type || 'multiple-choice'
  if (type === 'multiple-choice' || type === 'multi-description') return answer === q.correctIndex
  if (type === 'dropdown-cloze') return Array.isArray(answer) && q.blanks?.every((b, i) => answer[i] === b.correctIndex)
  if (type === 'drag-drop' || type === 'drag-sentence' || type === 'drag-summary') return Array.isArray(answer) && q.correctOrder?.every((c, i) => answer[i] === c)
  if (type === 'multi-matching') return Array.isArray(answer) && q.matchQuestions?.every((mq, i) => answer[i] === mq.correctExtract)
  return false
}

function isAnswered(answer, type) {
  if (type === 'free-writing') return typeof answer === 'string' && answer.trim().length > 0
  if (Array.isArray(answer)) return answer.some(x => x !== -1)
  return answer !== -1
}

function HomeworkDashboard({ user, onBack, initialNav }) {
  const [activeCourse, setActiveCourse] = useState(initialNav?.courseId || null)
  const [activeModuleId, setActiveModuleId] = useState(initialNav?.moduleId || null)
  const [highlightQuizId, setHighlightQuizId] = useState(initialNav?.quizSetId || null)
  const [showStartPopup, setShowStartPopup] = useState(null)
  const [takingQuiz, setTakingQuiz] = useState(null)
  const [quizAnswers, setQuizAnswers] = useState([])
  const [currentQ, setCurrentQ] = useState(0)
  const [resolvedQuestions, setResolvedQuestions] = useState(null)
  const [submittedResult, setSubmittedResult] = useState(null)
  const [reviewMode, setReviewMode] = useState(false)
  const [reviewIndices, setReviewIndices] = useState([])
  const [showStatsPopup, setShowStatsPopup] = useState(true)
  const [showVocabHint, setShowVocabHint] = useState(false)
  const [showTrialReport, setShowTrialReport] = useState(false)
  const [sealedNotice, setSealedNotice] = useState(null)

  // Shown once, then never again on this device: a tip a student has read is
  // just clutter on top of their work.
  const VOCAB_HINT_KEY = `vocabHintSeen:${user.id}`
  function hasSeenVocabHint() {
    try { return localStorage.getItem(VOCAB_HINT_KEY) === '1' } catch { return false }
  }
  function markVocabHintSeen() {
    try { localStorage.setItem(VOCAB_HINT_KEY, '1') } catch { /* private window */ }
    setShowVocabHint(false)
  }
  // The banners above a question are a prompt, not a fixture: they show when the
  // student arrives at a question and step aside after a few seconds, returning
  // if they come back to it.
  const [bannersVisible, setBannersVisible] = useState(true)
  const [showWarning, setShowWarning] = useState(null)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [quizStartTime, setQuizStartTime] = useState(null)
  const [timeLeft, setTimeLeft] = useState(null)
  const [showTimerDisplay, setShowTimerDisplay] = useState(true)
  const [expandedLeft, setExpandedLeft] = useState(false)
  const [showQGrid, setShowQGrid] = useState(false)
  const [flagged, setFlagged] = useState(new Set())
  const [reviewChats, setReviewChats] = useState({})
  // Questions already sent to the teacher, so the button can confirm itself.
  const [askedTeacher, setAskedTeacher] = useState(() => new Set())
  // Draft explanations for matching sub-questions, kept out of state so typing
  // does not re-render the whole review screen on every keystroke.
  const mineDrafts = useRef({})
  function sendQuestionToTeacher(idx, question) {
    if (!takingQuiz || askedTeacher.has(idx)) return
    // addDojoCard returns the card, not its id: passing the object straight on
    // meant the card was never flagged and never reached the Ask for Help deck.
    const card = addDojoCard(user.id, question, 'homework', takingQuiz.id, idx, { className: '', courseName: '', quizTitle: takingQuiz.friendlyTitle || '' })
    if (card?.id) markDojoAskTeacher(card.id)
    setAskedTeacher((prev) => new Set(prev).add(idx))
  }
  const [reviewTokensAwarded, setReviewTokensAwarded] = useState({})
  const [reviewNudge, setReviewNudge] = useState(false)
  const [tokenPopup, setTokenPopup] = useState(null)

  /**
   * Earning a token is the point of the review, so it is announced across the
   * middle of the screen with a chime, and waits there until the student
   * clicks it away rather than disappearing while they are still reading.
   */
  function showTokenBanner(text) {
    setTokenPopup(text)
    playCoinSound()
  }
  const [isRedo, setIsRedo] = useState(false)
  const [showReportModal, setShowReportModal] = useState(null)
  const [reportType, setReportType] = useState('')
  const [reportDetails, setReportDetails] = useState('')
  const [reportSent, setReportSent] = useState(false)
  const [speakingExp, setSpeakingExp] = useState(null)
  const [vocabTooltip, setVocabTooltip] = useState(null)
  const [vocabSaved, setVocabSaved] = useState(null)
  const [vocabDefinition, setVocabDefinition] = useState(null)
  const [vocabDefLoading, setVocabDefLoading] = useState(false)
  const [studentDescTab, setStudentDescTab] = useState(0)
  const [dragShuffles, setDragShuffles] = useState({})
  const [dragSource, setDragSource] = useState(null)
  const dragScrollRef = useRef(null)
  // Watermark: student name plus their parent's email, so a shared screenshot
  // traces back to the family.
  const [watermarkEmail, setWatermarkEmail] = useState('')
  useEffect(() => {
    if (!user?.id) return
    let live = true
    loadOwnContact(user.id).then((c) => { if (live) setWatermarkEmail(c.parentEmail || '') })
    return () => { live = false }
  }, [user?.id])
  const autoScrollRef = useRef(null)
  const [trialScreen, setTrialScreen] = useState(null)
  const [trialNameInput, setTrialNameInput] = useState('')
  const [visitedQuestions, setVisitedQuestions] = useState(new Set())
  const [clickFlash, setClickFlash] = useState(null)
  const [showVideoQ, setShowVideoQ] = useState(null)
  const [resetModal, setResetModal] = useState(null)
  const [resetPw, setResetPw] = useState('')
  const [resetError, setResetError] = useState(false)
  const timerRef = useRef(null)
  const questionTimes = useRef([])
  const questionEnteredAt = useRef(Date.now())
  const doSubmitRef = useRef(null)
  const screenLeaves = useRef(0)

  const courses = getCoursesForStudent(user.id)
  const classes = getClassesForStudent(user.id)

  // Courses grouped by class, each group keeping backend creation order.
  const courseGroups = (() => {
    const groups = []
    const byClass = new Map()
    for (const cls of classes) {
      const g = { classId: cls.id, className: cls.name, courses: [] }
      byClass.set(cls.id, g)
      groups.push(g)
    }
    let orphans = null
    for (const c of courses) {
      const g = byClass.get(c.classId)
      if (g) { g.courses.push(c); continue }
      if (!orphans) { orphans = { classId: '__other', className: 'Other', courses: [] }; groups.push(orphans) }
      orphans.courses.push(c)
    }
    return groups.filter((g) => g.courses.length > 0)
  })()

  useEffect(() => {
    if (!quizStartTime || !takingQuiz) return
    if (takingQuiz.homeworkMode) { setTimeLeft(null); return }
    const limitMs = (takingQuiz.timeLimit || 10) * 60 * 1000
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
    if (!takingQuiz) return
    return () => {
      const spent = Date.now() - questionEnteredAt.current
      questionTimes.current[currentQ] = (questionTimes.current[currentQ] || 0) + spent
    }
  }, [currentQ, takingQuiz])

  useEffect(() => {
    if (takingQuiz) questionEnteredAt.current = Date.now()
  }, [currentQ, takingQuiz])

  useEffect(() => {
    if (!reviewMode || !submittedResult || !resolvedQuestions) return
    const q = resolvedQuestions[currentQ]
    if (!q) return
    const isCorrect = isQuestionCorrect(q, submittedResult.answers[currentQ])
    const key = `correct-${currentQ}`
    if (isCorrect && !reviewTokensAwarded[key]) {
      addTokens(user.id, 1)
      playCoinSound()
      const newTokens = { ...reviewTokensAwarded, [key]: true }
      setReviewTokensAwarded(newTokens)
      if (takingQuiz) saveHomeworkReviewState(takingQuiz.id, user.id, { chats: reviewChats, tokens: newTokens })
    }
  }, [currentQ, reviewMode, submittedResult])

  useEffect(() => {
    if (!reviewMode || !submittedResult || !resolvedQuestions) { setReviewNudge(false); return }
    const q = resolvedQuestions[currentQ]
    if (!q) return
    const isCorrectR = isQuestionCorrect(q, submittedResult.answers[currentQ])
    const chat = reviewChats[currentQ] || {}
    setReviewNudge(!isCorrectR && chat.step !== 'done' && (q.type || 'multiple-choice') !== 'free-writing')
  }, [currentQ, reviewMode, submittedResult, reviewChats])

  useEffect(() => {
    setBannersVisible(true)
    const t = setTimeout(() => { setBannersVisible(false); if (reviewMode) markVocabHintSeen() }, 3000)
    // A click anywhere means the student has started working: the banners have
    // been read, or they are not wanted. Listening on the capture phase lets
    // that first click do its own job as well.
    const dismiss = () => setBannersVisible(false)
    document.addEventListener('pointerdown', dismiss, { capture: true })
    return () => {
      clearTimeout(t)
      document.removeEventListener('pointerdown', dismiss, { capture: true })
    }
  }, [reviewMode, takingQuiz])

  useEffect(() => { setStudentDescTab(0) }, [currentQ])
  useEffect(() => { setSpeakingExp(null); window.speechSynthesis?.cancel() }, [currentQ])
  useEffect(() => { setVocabTooltip(null) }, [currentQ])


  function handleWordDoubleClick(e) {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    const word = sel.toString().trim()
    if (!word || word.includes(' ') || word.length < 2) return
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    setVocabTooltip({ word, x: rect.left + rect.width / 2, y: rect.top - 8 })
    setVocabSaved(null)
    setVocabDefinition(null)
    if (reviewMode) {
      setVocabDefLoading(true)
      generateWordDefinition(word).then(result => {
        setVocabDefinition(result)
        setVocabDefLoading(false)
      }).catch(() => setVocabDefLoading(false))
    }
  }

  function saveVocabWord() {
    if (!vocabTooltip || !user) return
    const context = ''
    const source = takingQuiz?.title || ''
    addToVocabBank(user.id, vocabTooltip.word, context, source)
    setVocabSaved(vocabTooltip.word)
    setTimeout(() => { setVocabTooltip(null); setVocabSaved(null) }, 1500)
  }

  function toggleSpeak(key, html) {
    if (speakingExp === key) {
      window.speechSynthesis?.cancel()
      setSpeakingExp(null)
      return
    }
    window.speechSynthesis?.cancel()
    const text = html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim()
    if (!text || !window.speechSynthesis) return
    const utter = new SpeechSynthesisUtterance(text)
    utter.rate = 0.9
    utter.onend = () => setSpeakingExp(null)
    utter.onerror = () => setSpeakingExp(null)
    setSpeakingExp(key)
    window.speechSynthesis.speak(utter)
  }

  useEffect(() => {
    if (takingQuiz && !reviewMode && !submittedResult) {
      setVisitedQuestions(prev => { const next = new Set(prev); next.add(currentQ); return next })
    }
  }, [currentQ, takingQuiz, reviewMode, submittedResult])

  function formatTimeSplit(ms) {
    const totalSec = Math.ceil(ms / 1000)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    return { m: String(m).padStart(2, '0'), s: String(s).padStart(2, '0') }
  }

  function cleanText(t) { return fixMojibake(unescapeHtml(t)) }

  async function prepareQuiz(quizSet) {
    const resolved = await Promise.all(
      quizSet.questions.map(async (q) => {
        const base = {
          ...q,
          type: q.type || 'multiple-choice',
          text: cleanText(await resolveImages(q.text || '')),
          prompt: cleanText(q.prompt || ''),
          options: (q.options || []).map((o) => cleanText(o)),
        }
        if (q.descriptions) {
          base.descriptions = await Promise.all(q.descriptions.map(async (d) => ({
            ...d,
            content: cleanText(await resolveImages(d.content || '')),
          })))
        }
        return base
      })
    )
    return resolved
  }

  function handleQuizCardClick(quizSet, hasAttempt) {
    if (hasAttempt && !quizResultsVisible(quizSet.id, user.id)) {
      // A trial paper closes on submission and stays closed. Opening it would
      // show the questions and the answers given, which is most of the paper.
      setSealedNotice(quizSet.friendlyTitle || quizSet.rawTitle || 'This paper')
      return
    }
    if (hasAttempt) {
      prepareQuiz(quizSet).then((resolved) => {
        setResolvedQuestions(resolved)
        setTakingQuiz(quizSet)
        const attempt = getHomeworkAttempt(quizSet.id, user.id)
        setSubmittedResult(attempt)
        const saved = getHomeworkReviewState(quizSet.id, user.id)
        if (saved) {
          setReviewChats(saved.chats || {})
          setReviewTokensAwarded(saved.tokens || {})
        } else {
          setReviewChats({})
          setReviewTokensAwarded({})
        }
        setReviewMode(false)
        setCurrentQ(0)
      })
    } else if (quizSet.homeworkMode) {
      const progress = getHomeworkProgress(quizSet.id, user.id)
      if (progress) {
        resumeHomeworkQuiz(quizSet, progress)
      } else {
        openWarning(quizSet)
      }
    } else {
      openWarning(quizSet)
    }
  }

  // Quizzes are downloaded at sign-in, so a teacher's change since then - a new
  // time limit, a fixed answer - has not reached this device. Re-read the paper
  // before it starts, and fall back to the copy in hand if the read fails.
  function openWarning(quizSet) {
    setShowWarning(quizSet)
    refreshQuizSetFromCloud(quizSet.id).then((fresh) => {
      if (fresh) setShowWarning((cur) => (cur && cur.id === fresh.id ? fresh : cur))
    })
  }

  async function resumeHomeworkQuiz(quizSet, progress) {
    const resolved = await prepareQuiz(quizSet)
    setResolvedQuestions(resolved)
    setQuizAnswers(progress.answers || resolved.map(q => {
      const type = q.type || 'multiple-choice'
      if (type === 'dropdown-cloze') return new Array(q.blanks?.length || 1).fill(-1)
      if (type === 'drag-drop' || type === 'drag-sentence' || type === 'drag-summary') return new Array(q.correctOrder?.length || 6).fill(-1)
      if (type === 'multi-matching') return new Array(q.matchQuestions?.length || 1).fill(-1)
      if (type === 'free-writing') return ''
      return -1
    }))
    setCurrentQ(0)
    setFlagged(new Set(progress.flagged || []))
    questionTimes.current = progress.questionTimes || Array(resolved.length).fill(0)
    screenLeaves.current = progress.screenLeaves || 0
    setVisitedQuestions(new Set(progress.visited || []))
    if (progress.dragShuffles) setDragShuffles(progress.dragShuffles)
    setTakingQuiz(quizSet)
    setQuizStartTime(Date.now())
  }

  function handleRedoClick(quizSet) {
    setIsRedo(true)
    openWarning(quizSet)
  }

  async function confirmStartQuiz() {
    const quizSet = showWarning
    setShowWarning(null)
    const resolved = await prepareQuiz(quizSet)
    setResolvedQuestions(resolved)
    setQuizAnswers(resolved.map(q => {
      const type = q.type || 'multiple-choice'
      if (type === 'dropdown-cloze') return new Array(q.blanks?.length || 1).fill(-1)
      if (type === 'drag-drop' || type === 'drag-sentence' || type === 'drag-summary') return new Array(q.correctOrder?.length || 6).fill(-1)
      if (type === 'multi-matching') return new Array(q.matchQuestions?.length || 1).fill(-1)
      if (type === 'free-writing') return ''
      return -1
    }))
    setCurrentQ(0)
    setSubmittedResult(null)
    setReviewMode(false)
    setExpandedLeft(false)
    setShowQGrid(false)
    setFlagged(new Set())
    setShowTimerDisplay(true)
    setVisitedQuestions(new Set([0]))
    const shuffles = {}
    resolved.forEach((rq, qi) => {
      if (['drag-drop', 'drag-sentence', 'drag-summary'].includes(rq.type || 'multiple-choice') && rq.summaryOptions) {
        shuffles[qi] = rq.summaryOptions.map((_, i) => i)
      }
    })
    setDragShuffles(shuffles)
    questionTimes.current = Array(resolved.length).fill(0)
    screenLeaves.current = 0
    questionEnteredAt.current = Date.now()
    setTakingQuiz(quizSet)
    setShowVocabHint(false)
    if (quizSet.trialTest && quizSet.trialTestSubject) {
      setTrialScreen(0)
      setTrialNameInput('')
    } else {
      setQuizStartTime(Date.now())
    }
  }

  function startTrialQuiz() {
    setTrialScreen(null)
    setQuizStartTime(Date.now())
  }

  function doSubmit({ lockedOut = false } = {}) {
    if (!takingQuiz) return
    clearInterval(timerRef.current)
    setShowSubmitConfirm(false)
    setShowSaveExitConfirm(false)
    const spent = Date.now() - questionEnteredAt.current
    questionTimes.current[currentQ] = (questionTimes.current[currentQ] || 0) + spent
    const finalAnswers = quizAnswers.map((a) => (a === -1 ? -1 : a))
    const times = questionTimes.current.map((t) => Math.round((t || 0) / 1000))
    const meta = { screenLeaves: screenLeaves.current, lockedOut }
    const result = isRedo
      ? submitHomeworkRedo(takingQuiz.id, user.id, finalAnswers, times, meta)
      : submitHomeworkAttempt(takingQuiz.id, user.id, finalAnswers, times, meta)
    setSubmittedResult(result)
    setQuizStartTime(null)
    setTimeLeft(null)
    if (takingQuiz.homeworkMode) clearHomeworkProgress(takingQuiz.id, user.id)
    if (result) {
      addCoins(user.id, result.score * 10)
      playCoinSound()
      const label = takingQuiz.friendlyTitle || takingQuiz.rawTitle || 'Homework'
      sendBroadcast(`${user.name} finished ${label}`)
    }
    if (!isRedo && result && resolvedQuestions) {
      const dojoCourse = activeCourse ? getCourseById(activeCourse) : null
      const dojoCourseName = dojoCourse?.name || ''
      const dojoClassName = dojoCourse?.classId ? (getClassById(dojoCourse.classId)?.name || '') : ''
      const dojoQuizTitle = takingQuiz.friendlyTitle || takingQuiz.rawTitle || ''
      resolvedQuestions.forEach((q, qi) => {
        if (!isQuestionCorrect(q, finalAnswers[qi])) {
          addDojoCard(user.id, q, 'homework', takingQuiz.id, qi, { className: dojoClassName, courseName: dojoCourseName, quizTitle: dojoQuizTitle })
        }
      })
    }
  }

  doSubmitRef.current = doSubmit

  // Leaving the screen too often submits the attempt (utils/screenGuard.js).
  useScreenGuard({
    active: !!(takingQuiz && quizStartTime && !submittedResult),
    countRef: screenLeaves,
    onLockout: () => doSubmitRef.current?.({ lockedOut: true }),
  })
  const saveProgressRef = useRef(null)
  saveProgressRef.current = () => {
    if (!takingQuiz?.homeworkMode || submittedResult) return
    const spent = Date.now() - questionEnteredAt.current
    questionTimes.current[currentQ] = (questionTimes.current[currentQ] || 0) + spent
    saveHomeworkProgress(takingQuiz.id, user.id, {
      answers: quizAnswers,
      currentQ,
      flagged: [...flagged],
      questionTimes: questionTimes.current.map(t => t || 0),
      visited: [...visitedQuestions],
      dragShuffles,
      screenLeaves: screenLeaves.current,
    })
  }

  // Periodic autosave. beforeunload/pagehide are unreliable - a crash, a lost
  // battery or a killed mobile tab never fire them - so a student could lose a
  // whole attempt. Progress goes to studentData/{their id}, a document only
  // they write, so this costs one small write every 30s per student and never
  // contends with anyone else.
  useEffect(() => {
    if (!takingQuiz?.homeworkMode || submittedResult) return
    const id = setInterval(() => {
      if (!saveProgressRef.current) return
      saveProgressRef.current()
      // saveProgress accumulates time-on-question without resetting the
      // marker; reset it here so the question-change handler does not count
      // the same interval a second time.
      questionEnteredAt.current = Date.now()
    }, 30000)
    return () => clearInterval(id)
  }, [takingQuiz, submittedResult])

  useEffect(() => {
    if (!takingQuiz || submittedResult) return
    function handleUnload() {
      if (takingQuiz?.homeworkMode) {
        if (saveProgressRef.current) saveProgressRef.current()
      } else {
        if (doSubmitRef.current) doSubmitRef.current()
      }
    }
    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('pagehide', handleUnload)
    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      window.removeEventListener('pagehide', handleUnload)
    }
  }, [takingQuiz, submittedResult])

  function handleSubmitClick() {
    setShowSubmitConfirm(true)
  }

  function confirmSubmit() {
    setShowSubmitConfirm(false)
    doSubmit()
  }

  function toggleFlag() {
    setFlagged((prev) => {
      const next = new Set(prev)
      if (next.has(currentQ)) next.delete(currentQ)
      else next.add(currentQ)
      return next
    })
  }

  const [showSaveExitConfirm, setShowSaveExitConfirm] = useState(false)

  function saveAndExitHomework() {
    if (!takingQuiz?.homeworkMode || submittedResult) return
    setShowSaveExitConfirm(true)
  }

  function confirmSaveAndExit() {
    setShowSaveExitConfirm(false)
    const spent = Date.now() - questionEnteredAt.current
    questionTimes.current[currentQ] = (questionTimes.current[currentQ] || 0) + spent
    saveHomeworkProgress(takingQuiz.id, user.id, {
      answers: quizAnswers,
      currentQ,
      flagged: [...flagged],
      questionTimes: questionTimes.current.map(t => t || 0),
      visited: [...visitedQuestions],
      dragShuffles,
      screenLeaves: screenLeaves.current,
    })
    exitQuiz()
  }

  function exitQuiz() {
    if (reviewMode && takingQuiz) {
      saveHomeworkReviewState(takingQuiz.id, user.id, { chats: reviewChats, tokens: reviewTokensAwarded })
    }
    setTakingQuiz(null)
    setResolvedQuestions(null)
    setSubmittedResult(null)
    setReviewMode(false)
    setExpandedLeft(false)
    setShowQGrid(false)
    setReviewChats({})
    setReviewTokensAwarded({})
    setReviewNudge(false)
    setTokenPopup(null)
    setIsRedo(false)
    setTrialScreen(null)
    setTrialNameInput('')
    setVisitedQuestions(new Set())
  }

  // ===== PRE-QUIZ WARNING POPUP =====
  if (showWarning) {
    const tl = showWarning.timeLimit || 10
    const isHwMode = showWarning.homeworkMode
    return (
      <div className="neon-overlay">
        <div className="neon-popup" style={{ maxWidth: 480, padding: '40px 36px' }}>
          <p className="pixel-heading" style={{ fontSize: '1.2rem', color: 'var(--accent)', marginBottom: 12 }}>{showWarning.friendlyTitle}</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 20 }}>
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' }}>{showWarning.questions.length} questions</span>
            <span className={isHwMode ? 'neon-popup-heading' : ''} style={{ fontSize: '0.95rem', fontWeight: 700, color: isHwMode ? undefined : 'var(--warning)' }}>{isHwMode ? 'No time limit' : `${tl} min`}</span>
          </div>
          {isHwMode ? (
            <>
              <p style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: 12, lineHeight: 1.6 }}>This is a homework quiz. You can save and exit at any time.</p>
              <div className="neon-popup-save-box">
                <p className="pixel-heading neon-popup-heading" style={{ fontSize: '1rem', margin: 0 }}>Your progress will be saved if you leave.</p>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: 12, lineHeight: 1.6 }}>The quiz cannot be closed once started.</p>
              <p style={{ fontSize: '1rem', color: 'var(--danger)', marginBottom: 8, lineHeight: 1.6 }}>You only have one attempt.</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: 28, lineHeight: 1.6 }}>If you exit or close the tab, the questions will be submitted.</p>
            </>
          )}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn" style={{ padding: '14px 40px', fontSize: '0.7rem' }} autoFocus onClick={confirmStartQuiz}>Start Quiz</button>
            <button className="btn btn-outline" style={{ padding: '14px 40px', fontSize: '0.7rem' }} onClick={() => setShowWarning(null)}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  // ===== QUIZ-TAKING / RESULTS / REVIEW =====
  if (takingQuiz && resolvedQuestions) {
    const questions = resolvedQuestions
    const total = questions.length

    // ===== TRIAL TEST PRE-SCREENS =====
    if (trialScreen !== null && takingQuiz.trialTest) {
      const subj = takingQuiz.trialTestSubject || 'sel-reading'
      const instrData = TRIAL_INSTRUCTIONS[subj] || TRIAL_INSTRUCTIONS['sel-reading']

      if (trialScreen === 0) {
        const nameMatch = trialNameInput.trim().toLowerCase() === user.name.trim().toLowerCase()
        return (
          <div className="tt-backdrop">
            <div className="tt-panel">
              <div className="tt-header-bar" />
              <div className="tt-content-center">
                <img src="/avant-logo.png" alt="Avant OC & Selective" className="tt-school-logo" />
                <h1 className="tt-welcome-title">Welcome</h1>
                <p className="tt-welcome-text">In AVANT online practice tests, type in your name to pass this stage. On test day, you will be required to enter the student access code that is on your Test Admission Ticket (TAT).</p>
                <div className="tt-name-entry">
                  <input
                    className="tt-name-input"
                    value={trialNameInput}
                    onChange={(e) => setTrialNameInput(e.target.value)}
                    placeholder="Type your full name..."
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter' && nameMatch) setTrialScreen(1) }}
                  />
                  {trialNameInput.trim() && !nameMatch && <p className="tt-name-hint">Please type your name exactly: <strong>{user.name}</strong></p>}
                  {nameMatch && <p className="tt-name-ok">Identity confirmed</p>}
                </div>
                <button className="tt-nav-btn tt-nav-next" disabled={!nameMatch} onClick={() => setTrialScreen(1)}>Next</button>
              </div>
            </div>
          </div>
        )
      }

      if (trialScreen === 1) {
        return (
          <div className="tt-backdrop">
            <div className="tt-panel">
              <div className="tt-header-bar"><span className="tt-header-title">Instructions</span></div>
              <div className="tt-content-scroll">
                <img src="/avant-logo.png" alt="Avant OC & Selective" className="tt-school-logo" />
                <h2 className="tt-section-title">How to navigate the test?</h2>

                <div className="tt-instr-card">
                  <div className="tt-instr-text">
                    <p><b>Next and Back</b></p>
                    <p>Once you've selected your answer, you will need to click 'Next' to go to the next question. The test won't automatically take you to the next question.</p>
                    <p>You can use the 'Back' button to review previous questions or change your answers.</p>
                  </div>
                  <div className="tt-instr-visual">
                    <div style={{ display: 'flex', gap: 12 }}>
                      <span className="tt-demo-btn tt-demo-back">&#9664; Back</span>
                      <span className="tt-demo-btn tt-demo-next">Next &#9654;</span>
                    </div>
                  </div>
                </div>

                <div className="tt-instr-card">
                  <div className="tt-instr-text">
                    <p><b>Flag feature</b></p>
                    <p>If you are finding a question difficult to answer, select your best guess and then click the flag icon to remind yourself to go back to it if you have time.</p>
                    <p>You can check which questions you flagged using the progress summary (the grid at the top of the page).</p>
                  </div>
                  <div className="tt-instr-visual">
                    <span className="tt-demo-flag">Flag &#9873;</span>
                  </div>
                </div>

                <div className="tt-instr-card">
                  <div className="tt-instr-text">
                    <p><b>Question number and progress summary</b></p>
                    <p>You will always be able to see which question you are up to and how many questions there are in total.</p>
                    <p>If you click this grid, it takes you to the progress summary. This shows you where you are up to in the test and reminds you which questions you have flagged to come back to.</p>
                    <p>The progress summary also lets you jump to any question at any time.</p>
                    <p><b>If you have time, don't forget to check it before you finish the test.</b></p>
                  </div>
                  <div className="tt-instr-visual">
                    <div className="tt-demo-progress">
                      <div className="tt-demo-q-indicator">Question 5 of {total}</div>
                      <p style={{ fontWeight: 600, fontSize: '0.85rem', textAlign: 'center', margin: '6px 0 4px' }}>Progress summary</p>
                      <div className="tt-demo-legend">
                        <span><span className="tt-legend-box tt-legend-answered"></span> Answered</span>
                        <span><span className="tt-legend-box tt-legend-unanswered"></span> Not answered</span>
                        <span><span className="tt-legend-box tt-legend-unread"></span> Not read</span>
                        <span><span className="tt-legend-box tt-legend-flagged">&#9873;</span> Flagged</span>
                      </div>
                      <div className="tt-demo-grid">
                        {Array.from({ length: Math.min(total, 17) }, (_, i) => {
                          let cls = 'tt-demo-grid-btn'
                          if (i < 4) cls += ' tt-demo-grid-answered'
                          else if (i === 4) cls += ' tt-demo-grid-unanswered'
                          return <span key={i} className={cls}>{i === 2 ? <><span className="tt-demo-grid-flag">&#9873;</span>{i + 1}</> : i + 1}</span>
                        })}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
              <div className="tt-bottom-bar">
                <button className="tt-nav-btn tt-nav-back" onClick={() => setTrialScreen(0)}>&#9664; Back</button>
                <div />
                <button className="tt-nav-btn tt-nav-next" onClick={() => setTrialScreen(2)}>Next &#9654;</button>
              </div>
            </div>
          </div>
        )
      }

      if (trialScreen === 2) {
        return (
          <div className="tt-backdrop">
            <div className="tt-panel">
              <div className="tt-header-bar" />
              <div className="tt-content-scroll" style={{ padding: '40px 60px' }}>
                <img src="/avant-logo.png" alt="Avant OC & Selective" className="tt-school-logo" />
                <h2 className="tt-subject-heading">{instrData.heading}</h2>
                <h3 className="tt-subject-name">{instrData.subject}</h3>
                <div className="tt-subject-body" dangerouslySetInnerHTML={{ __html: instrData.body }} />
                <p className="tt-copyright">Every reasonable effort has been made by the publisher to trace copyright holders, but if any items requiring clearance have unwittingly been included, the publisher will be pleased to make amends at the earliest possible opportunity.</p>
              </div>
              <div className="tt-bottom-bar">
                <button className="tt-nav-btn tt-nav-back" onClick={() => setTrialScreen(1)}>&#9664; Back</button>
                <div />
                <button className="tt-nav-btn tt-nav-next" onClick={() => setTrialScreen(3)}>Next &#9654;</button>
              </div>
            </div>
          </div>
        )
      }

      if (trialScreen === 3) {
        return (
          <div className="tt-backdrop">
            <div className="tt-panel">
              <div className="tt-header-bar" />
              <div className="tt-content-center">
                <img src="/avant-logo.png" alt="Avant OC & Selective" className="tt-school-logo" />
                <div className="tt-confirm-card">
                  <h2 className="tt-confirm-heading">{instrData.heading} - {instrData.subject}</h2>
                  <p className="tt-confirm-name">{user.name}</p>
                  <p className="tt-confirm-question">Are you sure you have finished reading the instructions?</p>
                  <p className="tt-confirm-note">You will not be able to read them again until the test begins.</p>
                  <div className="tt-confirm-actions">
                    <button className="tt-nav-btn tt-nav-back" onClick={() => setTrialScreen(2)}>No, go back</button>
                    <button className="tt-nav-btn tt-nav-next" onClick={startTrialQuiz}>Yes, start test</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      }
    }

    // Results screen
    if (submittedResult && !reviewMode) {
      const score = submittedResult.score
      const markTotal = submittedResult.total
      const coins = score * 10
      const pct = markTotal > 0 ? Math.round((score / markTotal) * 100) : 0
      const allAttempts = getHomeworkAttemptsForQuiz(takingQuiz.id)
      const sorted = [...allAttempts].sort((a, b) => b.score - a.score)
      const rank = sorted.findIndex((a) => a.studentId === user.id) + 1
      const totalStudents = allAttempts.length
      const classAvgPct = totalStudents > 0 ? Math.round(allAttempts.reduce((sum, a) => sum + Math.round((a.score / a.total) * 100), 0) / totalStudents) : 0
      // The spread matters as much as the average: a 60% average with a 95%
      // top mark says something different from one where nobody passed 65%.
      const cohortScores = allAttempts.filter((a) => a.total > 0).map((a) => a.score).sort((x, y) => x - y)
      const classAvgScore = cohortScores.length ? Math.round(cohortScores.reduce((s, v) => s + v, 0) / cohortScores.length) : null
      const classMedianScore = cohortScores.length
        ? (cohortScores.length % 2
            ? cohortScores[(cohortScores.length - 1) / 2]
            : Math.round((cohortScores[cohortScores.length / 2 - 1] + cohortScores[cohortScores.length / 2]) / 2))
        : null
      const classTopScore = cohortScores.length ? cohortScores[cohortScores.length - 1] : null
      const cohortPcts = allAttempts.filter((a) => a.total > 0).map((a) => Math.round((a.score / a.total) * 100)).sort((x, y) => x - y)
      const classMedianPct = cohortPcts.length
        ? (cohortPcts.length % 2
            ? cohortPcts[(cohortPcts.length - 1) / 2]
            : Math.round((cohortPcts[cohortPcts.length / 2 - 1] + cohortPcts[cohortPcts.length / 2]) / 2))
        : null
      const classTopPct = cohortPcts.length ? cohortPcts[cohortPcts.length - 1] : null

      let grade, gradeColor
      if (pct === 100) { grade = 'Mastery'; gradeColor = '#b464ff' }
      else if (pct >= 80) { grade = 'High Distinction'; gradeColor = '#00e5ff' }
      else if (pct >= 55) { grade = 'Distinction'; gradeColor = '#66bb6a' }
      else if (pct >= 40) { grade = 'Satisfactory'; gradeColor = '#ffab00' }
      else if (pct >= 20) { grade = 'Credit'; gradeColor = '#ff9100' }
      else { grade = 'Needs Review'; gradeColor = '#ff1744' }

      const studentNow = getStudentById(user.id)
      const totalBalance = studentNow ? studentNow.coins : 0

      const percentile = getStudentPercentile(user.id, takingQuiz.id)
      const historicalAll = getAllAttemptsForQuizSet(takingQuiz.id)
      const historicalAttempts = historicalAll.length

      const qTimes = submittedResult.questionTimes || []
      const totalSec = qTimes.reduce((s, t) => s + (t || 0), 0)
      const fmtTime = (s) => { const m = Math.floor(s / 60); return m > 0 ? `${m}m ${s % 60}s` : `${s}s` }
      const timeTaken = fmtTime(totalSec)

      const allTimeTotals = allAttempts.map(a => (a.questionTimes || []).reduce((s, t) => s + (t || 0), 0)).filter(t => t > 0)
      const avgTimeTaken = allTimeTotals.length > 0 ? fmtTime(Math.round(allTimeTotals.reduce((a, b) => a + b, 0) / allTimeTotals.length)) : null

      const questionsCorrect = score
      const questionsSkipped = submittedResult.answers.filter(a => a === -1 || a === null || a === undefined).length

      const questionBreakdown = questions.map((q, qi) => {
        const answer = submittedResult.answers[qi]
        const correct = isQuestionCorrect(q, answer)
        const skipped = answer === -1 || answer === null || answer === undefined
        const correctCount = totalStudents > 0 ? allAttempts.filter(a => isQuestionCorrect(q, a.answers?.[qi])).length : 0
        const classPct = totalStudents > 0 ? Math.round((correctCount / totalStudents) * 100) : 0
        const tag = q.tag || ''
        return { num: qi + 1, correct, skipped, classPct, tag }
      })

      const enterReview = (startQ) => {
        const saved = getHomeworkReviewState(takingQuiz.id, user.id)
        if (saved) {
          setReviewChats(saved.chats || {})
          setReviewTokensAwarded(saved.tokens || {})
        } else {
          setReviewChats({})
          setReviewTokensAwarded({})
        }
        // Every question type is reviewable. This used to admit multiple choice
        // only, which is why cloze, matching and drag questions never appeared.
        const wrongIdxs = questions
          .map((qq, i) => (isQuestionCorrect(qq, submittedResult.answers[i]) ? -1 : i))
          .filter((i) => i !== -1)
        const indices = wrongIdxs.length > 0 ? wrongIdxs : questions.map((_, i) => i)
        setReviewIndices(indices)
        const actualStart = (startQ !== undefined && indices.includes(startQ)) ? startQ : indices[0]
        setCurrentQ(actualStart)
        setShowStatsPopup(true)
        setShowVocabHint(!hasSeenVocabHint())
        setReviewMode(true)
      }

      if (!quizResultsVisible(takingQuiz.id, user.id)) {
        return (
          <div className="page-center" style={{ minHeight: '100dvh' }}>
            <div className="card" style={{ maxWidth: 520, textAlign: 'center', padding: '36px 32px' }}>
              <p className="pixel-heading" style={{ fontSize: '0.9rem', marginBottom: 14 }}>Paper submitted</p>
              <p style={{ fontSize: '1.05rem', lineHeight: 1.7, marginBottom: 10 }}>
                <strong>{takingQuiz.friendlyTitle}</strong> has been handed in.
              </p>
              <p className="text-dim" style={{ fontSize: '0.85rem', lineHeight: 1.7, marginBottom: 24 }}>
                This is a trial test. Your paper is closed now — no marks, no answers, and no review —
                until your teacher releases the results for the whole sitting. You will get your full
                report then: your ranking, every paper, and where to work next.
              </p>
              <button className="btn" onClick={() => { exitQuiz(); setActiveModuleId(null) }}>Back to my dashboard</button>
            </div>
          </div>
        )
      }

      // A free-writing answer is marked by a teacher, so nothing about this
      // paper's score, rank or class figures means anything until they have.
      // Once the mark is in, it is part of the score like any other question.
      const awaitingMarking = attemptAwaitsMarking(takingQuiz.id, user.id)

      return <HwResults
        awaitingMarking={awaitingMarking}
        title={takingQuiz.friendlyTitle}
        score={score} total={markTotal} pct={pct} coins={coins}
        grade={grade} gradeColor={gradeColor}
        rank={rank} totalStudents={totalStudents} classAvgPct={classAvgPct}
        classAvgScore={classAvgScore} classMedianScore={classMedianScore} classTopScore={classTopScore} totalBalance={totalBalance}
        percentile={percentile} historicalAttempts={historicalAttempts}
        timeTaken={timeTaken} avgTimeTaken={avgTimeTaken} questionsCorrect={questionsCorrect} questionsSkipped={questionsSkipped}
        questionBreakdown={questionBreakdown}
        isRedo={isRedo}
        onGoToQuestion={(qi) => enterReview(qi)}
        onReview={() => enterReview(0)}
        onExit={exitQuiz}
      />
    }

    // Quiz-taking or review mode
    const q = questions[currentQ]
    const isReview = reviewMode
    const selectedAnswer = quizAnswers[currentQ] ?? (submittedResult ? submittedResult.answers[currentQ] : -1)
    const answered = isReview ? total : quizAnswers.filter((a, ai) => isAnswered(a, (questions[ai]?.type || 'multiple-choice'))).length
    const isLow = timeLeft !== null && timeLeft < 60000
    const time = timeLeft !== null ? formatTimeSplit(timeLeft) : null

    return (
      <div className="qt-backdrop" onClick={() => setShowQGrid(false)}>
        <div className="qt-panel" onClick={() => setShowQGrid(false)} onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()} style={{ userSelect: 'none' }}>
          {/* Top bar */}
          <div className="qt-topbar">
            <div className="qt-timer-area">
              {!isReview && showTimerDisplay && time ? (
                <div className={`qt-timer ${isLow ? 'qt-timer-low' : ''}`}>
                  <span className="qt-timer-num">{time.m}</span>
                  <span className="qt-timer-sep">:</span>
                  <span className="qt-timer-num">{time.s}</span>
                  <span className="qt-timer-labels"><span>Min</span><span>Sec</span></span>
                </div>
              ) : null}
              {!isReview && (
                <button className="qt-hide-timer" onClick={() => setShowTimerDisplay(!showTimerDisplay)}>
                  {showTimerDisplay ? 'Hide time' : 'Show time'}
                </button>
              )}
              {isReview && (() => {
                const reviewPct = submittedResult.total > 0 ? Math.round((submittedResult.score / submittedResult.total) * 100) : 0
                let reviewGrade, reviewGradeColor
                if (reviewPct === 100) { reviewGrade = 'Mastery'; reviewGradeColor = '#b464ff' }
                else if (reviewPct >= 80) { reviewGrade = 'High Distinction'; reviewGradeColor = '#00e5ff' }
                else if (reviewPct >= 55) { reviewGrade = 'Distinction'; reviewGradeColor = '#76ff03' }
                else if (reviewPct >= 40) { reviewGrade = 'Satisfactory'; reviewGradeColor = '#ffab00' }
                else if (reviewPct >= 20) { reviewGrade = 'Credit'; reviewGradeColor = '#ff9100' }
                else { reviewGrade = 'Needs Review'; reviewGradeColor = '#ff1744' }
                return (
                  <div className="qt-review-score" style={{ color: reviewGradeColor }}>
                    {submittedResult.score}/{submittedResult.total} ({reviewPct}%) — {reviewGrade}
                  </div>
                )
              })()}
            </div>

            <div className="qt-center-group">
              <div className="qt-question-indicator">
                Question <strong>{isReview ? reviewIndices.indexOf(currentQ) + 1 : currentQ + 1}</strong> of <strong>{isReview ? reviewIndices.length : total}</strong>{isReview ? ' — Review' : ''}
              </div>
              <div className="qt-grid-trigger-wrap">
                <button className="qt-grid-trigger" onClick={(e) => { e.stopPropagation(); setShowQGrid(!showQGrid) }} title="Jump to question">
                  {[...Array(6)].map((_, i) => <span key={i} className="qt-grid-sq" />)}
                </button>
                {showQGrid && (
                  <div className="qt-grid-dropdown qt-progress-summary" onClick={(e) => e.stopPropagation()}>
                    {!isReview && (
                      <div className="qt-progress-legend">
                        <span className="qt-progress-legend-item"><span className="qt-legend-swatch qt-legend-answered"></span> {quizAnswers.filter((a, ai) => isAnswered(a, questions[ai]?.type || 'multiple-choice')).length} Answered</span>
                        <span className="qt-progress-legend-item"><span className="qt-legend-swatch qt-legend-unanswered"></span> {questions.filter((_, i) => visitedQuestions.has(i) && !isAnswered(quizAnswers[i], questions[i]?.type || 'multiple-choice')).length} Not answered</span>
                        <span className="qt-progress-legend-item"><span className="qt-legend-swatch qt-legend-unread"></span> {questions.filter((_, i) => !visitedQuestions.has(i)).length} Not read</span>
                        <span className="qt-progress-legend-item"><span className="qt-legend-swatch qt-legend-flagged">&#9873;</span> {flagged.size} Flagged</span>
                      </div>
                    )}
                    <p style={{ textAlign: 'center', fontWeight: 600, fontSize: '0.95rem', color: '#333', margin: '6px 0 8px' }}>Progress summary</p>
                    <div className="qt-progress-grid">
                      {questions.map((qq, i) => {
                        let cls = 'qt-grid-btn'
                        if (i === currentQ) cls += ' qt-grid-btn-current'
                        if (isReview) {
                          const ans = submittedResult.answers[i]
                          cls += isQuestionCorrect(qq, ans) ? ' qt-grid-btn-correct' : (isAnswered(ans, qq.type || 'multiple-choice') ? ' qt-grid-btn-wrong' : '')
                        } else {
                          if (isAnswered(quizAnswers[i], qq.type || 'multiple-choice')) cls += ' qt-grid-btn-navy'
                          else if (visitedQuestions.has(i)) cls += ' qt-grid-btn-grey'
                          else cls += ' qt-grid-btn-unread'
                        }
                        const isFlagged = !isReview && flagged.has(i)
                        return (
                          <button key={i} className={cls} onClick={() => { setCurrentQ(i); setShowQGrid(false) }}>
                            {isFlagged && <span className="qt-grid-flag-icon">&#9873;</span>}
                            {i + 1}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div style={{ justifySelf: 'end' }}>
              <button className="qt-report-error-btn" onClick={() => { setShowReportModal('question'); setReportType(''); setReportDetails(''); setReportSent(false) }}>{'⚠'} Report Error</button>
            </div>
          </div>

          {/* Banners: the review prompt, then the vocabulary tip beneath it. */}
          {(
            <div className="qt-banner-anchor">
            <div className={`qt-banner-stack${bannersVisible ? '' : ' is-hidden'}`} aria-hidden={!bannersVisible}>
              {isReview && reviewNudge && (
                <div className="qt-review-nudge" key={currentQ}>Take a look at the help below — explain this one in your own words for a token!</div>
              )}
              {isReview && submittedResult && isQuestionCorrect(q, submittedResult.answers[currentQ]) && (
                <div className="qt-review-nudge qt-review-nudge-correct" key={`correct-${currentQ}`}>+10 Coins — Correct answer!</div>
              )}
              {isReview && showVocabHint && (
                <div className="qt-vocab-hint" onClick={markVocabHintSeen}>
                  <span className="qt-vocab-hint-icon">{'\u{1F4D6}'}</span>
                  <span>Double-click any word to look it up and add it to your <strong>Vocabulary Bank</strong></span>
                </div>
              )}
            </div>
            </div>
          )}

          {/* Two-panel content */}
          {(() => {
            const qType = q.type || 'multiple-choice'
            const isClozeActive = qType === 'dropdown-cloze' && !isReview
            if (isClozeActive) {
              return (
                <div className="qt-cloze-fullwidth">
                  <div className="qt-watermark" aria-hidden="true">
                    <div className="qt-watermark-inner">
                      {Array.from({ length: 6 }, (_, i) => (
                        <div key={i} className="qt-watermark-row">
                          <img src="/avant-logo.png" className="qt-watermark-logo" alt="" />
                          <span className="qt-watermark-name">{user.name}{watermarkEmail && <span className="qt-watermark-email">{watermarkEmail}</span>}</span>
                          <img src="/avant-logo.png" className="qt-watermark-logo" alt="" />
                          <span className="qt-watermark-name">{user.name}{watermarkEmail && <span className="qt-watermark-email">{watermarkEmail}</span>}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {q.prompt && <div className="qt-prompt-display" style={{ fontWeight: 700, marginBottom: 12 }} dangerouslySetInnerHTML={{ __html: q.prompt }} />}
                  <div className="qt-cloze-instructions">Read the text below and select the correct word or phrase for each gap from the drop-down list.</div>
                  <div className="qt-cloze-passage-text">
                    {(() => {
                      const parts = (q.text || '').split('___')
                      const blanks = q.blanks || []
                      const answers = Array.isArray(selectedAnswer) ? selectedAnswer : new Array(blanks.length).fill(-1)
                      return parts.map((part, pi) => (
                        <span key={pi}>
                          <span dangerouslySetInnerHTML={{ __html: part }} />
                          {pi < parts.length - 1 && pi < blanks.length && (
                            <select className="qt-cloze-inline-select" value={answers[pi] ?? -1} onChange={e => {
                              const val = parseInt(e.target.value)
                              setQuizAnswers(prev => { const next = [...prev]; const arr = Array.isArray(next[currentQ]) ? [...next[currentQ]] : new Array(blanks.length).fill(-1); arr[pi] = val; next[currentQ] = arr; return next })
                            }}>
                              <option value={-1} disabled hidden></option>
                              {blanks[pi].options.map((opt, oi) => opt ? <option key={oi} value={oi}>{opt}</option> : null)}
                            </select>
                          )}
                        </span>
                      ))
                    })()}
                  </div>
                </div>
              )
            }
            return null
          })()}
          {(() => {
            const qType = q.type || 'multiple-choice'
            const isClozeActive = qType === 'dropdown-cloze' && !isReview
            if (isClozeActive) return null
            const hasExtracts = q.descriptions && q.descriptions.length > 0 && (qType === 'multi-description' || qType === 'multi-matching')
            return (
          <div className={`qt-split ${expandedLeft ? 'qt-split-expanded' : ''}`}>
            <div className="qt-split-left" style={{ '--wm-name': `"${user.name}"`, userSelect: 'text' }} onDoubleClick={handleWordDoubleClick}>
              <div className="qt-watermark" aria-hidden="true">
                <div className="qt-watermark-inner">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="qt-watermark-row">
                    <img src="/avant-logo.png" className="qt-watermark-logo" alt="" />
                    <span className="qt-watermark-name">{user.name}{watermarkEmail && <span className="qt-watermark-email">{watermarkEmail}</span>}</span>
                    <img src="/avant-logo.png" className="qt-watermark-logo" alt="" />
                    <span className="qt-watermark-name">{user.name}{watermarkEmail && <span className="qt-watermark-email">{watermarkEmail}</span>}</span>
                  </div>
                ))}
                </div>
              </div>
              {isReview && q.videoUrl && (() => {
                // YouTube, Vimeo, Loom, Google Drive and direct video files embed;
                // any other link opens in a new tab rather than silently vanishing.
                const video = parseVideoUrl(q.videoUrl)
                if (!video) return null
                if (!video.embedUrl) {
                  return (
                    <a className="qt-video-btn" href={video.url} target="_blank" rel="noopener noreferrer">
                      <span className="qt-video-btn-icon">↗</span>
                      <span>Open Explanation Video</span>
                    </a>
                  )
                }
                const isOpen = showVideoQ === currentQ
                return (
                  <>
                    <button className="qt-video-btn" onClick={() => setShowVideoQ(isOpen ? null : currentQ)}>
                      <span className="qt-video-btn-icon">{isOpen ? '▼' : '▶'}</span>
                      <span>{isOpen ? 'Hide Explanation Video' : 'Show Explanation Video'}</span>
                    </button>
                    {isOpen && (
                      <div className="qt-video-embed">
                        {video.kind === 'file' ? (
                          <video src={video.embedUrl} controls preload="metadata" />
                        ) : (
                          <iframe src={video.embedUrl} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
                        )}
                      </div>
                    )}
                  </>
                )
              })()}
              {q.descriptions && q.descriptions.length > 0 && (
                <>
                  <div className="qt-desc-tabs">
                    {q.descriptions.map((d, di) => (
                      <button key={di} className={`qt-desc-tab${studentDescTab === di ? ' qt-desc-tab-active' : ''}`} onClick={() => setStudentDescTab(di)}>
                        {extractTabLabel(d.title, di)}
                      </button>
                    ))}
                  </div>
                  <div className="qt-desc-content">
                    <RichText html={q.descriptions[studentDescTab]?.content || ''} />
                  </div>
                </>
              )}
              {!hasExtracts && (
                <div className="qt-question-text">
                  <RichText html={q.text} />
                  {qType === 'free-writing' && !isReview && q.prompt && (
                    <div className="qt-prompt-display" style={{ marginTop: 20 }} dangerouslySetInnerHTML={{ __html: q.prompt }} />
                  )}
                </div>
              )}
            </div>
            <div className="qt-split-divider" onClick={() => setExpandedLeft((e) => !e)} />
            <div className="qt-split-right" ref={dragScrollRef} onDragOver={e => {
              e.preventDefault()
              if (!dragScrollRef.current) return
              const rect = dragScrollRef.current.getBoundingClientRect()
              const y = e.clientY
              const EDGE = 60, SPEED = 6
              if (y > rect.bottom - EDGE) dragScrollRef.current.scrollTop += SPEED
              else if (y < rect.top + EDGE) dragScrollRef.current.scrollTop -= SPEED
            }}>
              {isReview ? (() => {
                const picked = submittedResult.answers[currentQ]
                const qType = q.type || 'multiple-choice'
                const isCorrectQ = isQuestionCorrect(q, picked)
                const skipped = qType === 'free-writing' ? (typeof picked !== 'string' || !picked.trim()) : (Array.isArray(picked) ? picked.every(x => x === -1) : picked === -1)
                const allAttempts = getHomeworkAttemptsForQuiz(takingQuiz.id)
                const totalStudents = allAttempts.length
                // Attempts served from the quizStats aggregate carry a score but
                // no answer list, so only the ones that have answers can say
                // whether this particular question was right.
                const markable = allAttempts.filter((a) => Array.isArray(a.answers))
                const correctCount = markable.filter(a => isQuestionCorrect(q, a.answers[currentQ])).length
                const classPct = markable.length > 0 ? Math.round((correctCount / markable.length) * 100) : null
                const timesForQ = allAttempts.map(a => a.questionTimes?.[currentQ]).filter(t => t != null && t > 0)
                const avgTimeSec = timesForQ.length > 0 ? Math.round(timesForQ.reduce((a, b) => a + b, 0) / timesForQ.length) : null
                const studentTimeSec = submittedResult.questionTimes?.[currentQ]
                function formatTime(s) { return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s` }

                const reviewStats = (
                  <div className="qt-stats-strip">
                    <button className="qt-stats-strip-toggle" onClick={() => setShowStatsPopup(p => !p)}>
                      {showStatsPopup ? '▾ Hide stats' : '▸ Show stats'}
                    </button>
                    {showStatsPopup && (
                      <div className="qt-stats-strip-body">
                        <div className={`qt-review-stat-cell ${isCorrectQ ? 'qt-review-stat-correct' : 'qt-review-stat-wrong'}`}>
                          <span className="qt-review-stat-icon">{isCorrectQ ? '✓' : '✗'}</span>
                          <span className="qt-review-stat-label">{qType === 'free-writing' ? 'Written' : isCorrectQ ? 'Correct' : (Array.isArray(submittedResult.answers[currentQ]) ? submittedResult.answers[currentQ].every(x => x === -1) : submittedResult.answers[currentQ] === -1) ? 'Skipped' : 'Incorrect'}</span>
                        </div>
                        <div className="qt-review-stat-cell">
                          {classPct == null ? (
                            <>
                              <span className="qt-review-stat-big" style={{ color: '#90a0b0' }}>—</span>
                              <span className="qt-review-stat-label">no class data yet</span>
                            </>
                          ) : (() => {
                            let diff, diffColor
                            if (classPct <= 10) { diff = 'Challenging'; diffColor = '#ff1744' }
                            else if (classPct <= 40) { diff = 'Separator'; diffColor = '#ff9100' }
                            else if (classPct <= 80) { diff = 'Average'; diffColor = '#ffab00' }
                            else { diff = 'Must Get Right'; diffColor = '#43a047' }
                            return <>
                              <span className="qt-review-stat-big" style={{ color: diffColor }}>{classPct}%</span>
                              <span className="qt-review-stat-label">answered correctly</span>
                              <span className="qt-review-stat-diff" style={{ color: diffColor }}>{diff}</span>
                            </>
                          })()}
                        </div>
                        <div className="qt-review-stat-cell">
                          {studentTimeSec != null && (
                            <div className="qt-review-time-row">
                              <span className="qt-review-stat-big">{formatTime(studentTimeSec)}</span>
                              <span className="qt-review-stat-label">your time</span>
                            </div>
                          )}
                          {avgTimeSec != null && (
                            <div className="qt-review-time-row">
                              <span className="qt-review-stat-big" style={{ color: '#1a1a2e' }}>{formatTime(avgTimeSec)}</span>
                              <span className="qt-review-stat-label">class avg</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )

                if (qType === 'multiple-choice' || qType === 'multi-description') {
                  const exp = parseExplanation(q.explanation)
                  return <>
                    <div className="qt-review-scroll">
                    {!isCorrectQ && qType !== 'free-writing' && (() => {
                      const chat = reviewChats[currentQ] || { step: 'ask', messages: [] }
                      const qIdx = currentQ
                      function updateChat(next) { setReviewChats(prev => ({ ...prev, [qIdx]: next })) }
                      const correctText = q.options[q.correctIndex] || ''
                      const questionText = (q.text || '').replace(/<[^>]*>/g, '')
                      const correctLetter = String.fromCharCode(65 + q.correctIndex)
                      const myLetter = picked != null && picked >= 0 ? String.fromCharCode(65 + picked) : null
                      const isDone = chat.step === 'done'
                      // The teacher's own explanation comes first; the AI only fills
                      // the gap, and what it writes is shared with everyone else.
                      async function openHelp() {
                        const written = exp.general || exp.options?.[correctLetter]
                        if (written) return written
                        const pick = (src) => src.general || src.options?.[correctLetter]
                        const shared = await getSharedExplanation(takingQuiz.id, q, qIdx)
                        const fromShared = shared ? pick(shared) : ''
                        if (fromShared) return fromShared
                        const ai = await generateExplanation({ questionText, options: q.options, correctIndex: q.correctIndex })
                        saveSharedExplanation(takingQuiz.id, q, qIdx, ai)
                        return pick(ai)
                      }
                      async function handleExplanationSubmit(e) {
                        e.preventDefault()
                        const input = e.target.elements.explanation.value.trim()
                        if (!input) return
                        const base = { ...chat, panel: 'mine', step: 'checking', mine: input, feedback: '' }
                        updateChat(base)
                        const result = await checkExplanation({ questionText, correctAnswer: correctText, officialExplanation: [exp.general, ...Object.values(exp.options || {})].filter(Boolean).join(' '), studentReason: chat.reason || '', studentExplanation: input })
                        if (result.coherent) {
                          const doneChat = { ...base, step: 'done', feedback: result.reply }
                          updateChat(doneChat)
                          const newTokens = { ...reviewTokensAwarded }
                          if (!newTokens[`chat-${qIdx}`]) { addTokens(user.id, 1); newTokens[`chat-${qIdx}`] = true; setReviewTokensAwarded(newTokens); showTokenBanner('+1 Token — Great explanation!') }
                          saveHomeworkReviewState(takingQuiz.id, user.id, { chats: { ...reviewChats, [qIdx]: doneChat }, tokens: newTokens })
                        } else {
                          updateChat({ ...base, step: 'explain', feedback: result.reply })
                        }
                      }
                      return (
                        <ReviewHelp
                          chat={chat}
                          onChange={updateChat}
                          fetchConcept={openHelp}
                          isDone={isDone}
                          onAskTeacher={() => sendQuestionToTeacher(qIdx, q)}
                          asked={askedTeacher.has(qIdx)}
                          renderMine={() => (
                            <div className="qt-help-form">
                              <div className="qt-help-lead">Look at the correct answer — <b>{correctLetter}) {correctText}</b> — then say in your own words why it is right.</div>
                              {isDone ? (
                                <>
                                  {chat.mine && <div className="qt-help-mine">{chat.mine}</div>}
                                  <div className="qt-help-feedback">{chat.feedback || 'Nice work — token claimed.'}</div>
                                </>
                              ) : chat.step === 'checking' ? (
                                <div className="qt-help-loading">Reading your explanation…</div>
                              ) : (
                                <form className="qt-help-form" onSubmit={handleExplanationSubmit}>
                                  {chat.feedback && <div className="qt-help-feedback qt-help-feedback-retry">{chat.feedback}</div>}
                                  <textarea name="explanation" className="qt-help-input" rows={3} defaultValue={chat.mine || ''} placeholder="Because…" autoFocus />
                                  <button type="submit" className="qt-help-send qt-click-flash">Submit explanation</button>
                                </form>
                              )}
                            </div>
                          )}
                        />
                      )
                    })()}
                    {q.prompt && <div className="qt-prompt-display" dangerouslySetInnerHTML={{ __html: q.prompt }} />}
                    <div className="qt-options">
                      {q.options.map((opt, oi) => {
                        if (!opt) return null
                        let optClass = 'qt-option qt-option-review'
                        if (oi === q.correctIndex) optClass += ' qt-option-correct'
                        if (oi === picked && oi !== q.correctIndex) optClass += ' qt-option-wrong'
                        const letter = String.fromCharCode(65 + oi)
                        const optExp = exp.options?.[letter]
                        return (
                          <div key={oi}>
                            <div className={optClass} style={{ cursor: 'default' }}>
                              <span className={`qt-option-radio ${oi === q.correctIndex ? 'qt-radio-correct' : oi === picked ? 'qt-radio-wrong' : ''}`} />
                              <span className="qt-option-text">{opt}</span>
                            </div>
                            {optExp && <div className="qt-exp-wrap">
                              <div className="qt-option-explanation" dangerouslySetInnerHTML={{ __html: renderMath(optExp) }} />
                              <div className="qt-exp-actions">
                                <button className={`qt-exp-speak ${speakingExp === `${currentQ}-${oi}` ? 'qt-exp-speak-active' : ''}`} title="Read aloud" onClick={() => toggleSpeak(`${currentQ}-${oi}`, optExp)}>{speakingExp === `${currentQ}-${oi}` ? '⏹' : '🔊'}</button>
                                <button className="qt-exp-report" title="Report explanation issue" onClick={() => { setShowReportModal('explanation'); setReportType(''); setReportDetails(''); setReportSent(false) }}>🚩</button>
                              </div>
                            </div>}
                          </div>
                        )
                      })}
                    </div>
                    </div>
                    {reviewStats}
                  </>
                }

                if (qType === 'dropdown-cloze') {
                  const blanks = q.blanks || []
                  const answers = Array.isArray(picked) ? picked : []
                  const correctCount = blanks.filter((b, i) => answers[i] === b.correctIndex).length
                  const wrongGaps = blanks.map((b, i) => (answers[i] === b.correctIndex ? -1 : i)).filter((i) => i >= 0)
                  const parts = (q.text || '').split('___')
                  const plain = (html) => (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
                  // The sentence around a gap, for the AI to explain against.
                  const sentenceFor = (bi) => plain(`${parts[bi] || ''} ___ ${parts[bi + 1] || ''}`)
                  // A gap behaves like a small multiple-choice question, which is
                  // what both the explanation cache and the AI prompt expect.
                  const gapQuestion = (bi) => ({
                    id: q.id ? `${q.id}#g${bi}` : null,
                    text: sentenceFor(bi),
                    options: blanks[bi].options || [],
                    correctIndex: blanks[bi].correctIndex,
                  })
                  const gapChatKey = (bi) => `${currentQ}:g${bi}`
                  const gapDone = (bi) => {
                    const gchat = reviewChats[gapChatKey(bi)] || {}
                    const words = (blanks[bi].options || []).filter((w) => w && w.trim())
                    return words.length > 0 && words.every((_, oi) => gchat.defs?.[oi]?.ok)
                  }
                  const allGapsDone = wrongGaps.length > 0 && wrongGaps.every(gapDone)
                  return <>
                    <div className="qt-review-scroll">
                    {q.prompt && <div className="qt-prompt-display" dangerouslySetInnerHTML={{ __html: q.prompt }} />}
                    <div className="qt-review-sub-score">{correctCount}/{blanks.length} blanks correct</div>
                    <div className="qt-cloze-review-split">
                      <div className="qt-cloze-review-left">
                        <div className="qt-cloze-review-heading">The passage</div>
                        <div className="qt-cloze-passage-text">
                          {parts.map((part, pi) => (
                            <span key={pi}>
                              <span dangerouslySetInnerHTML={{ __html: part }} />
                              {pi < parts.length - 1 && pi < blanks.length && (
                                <span className={`qt-cloze-gapmark ${answers[pi] === blanks[pi].correctIndex ? 'is-right' : 'is-wrong'}`}>
                                  <span className="qt-cloze-gapmark-num">{pi + 1}</span>
                                  {blanks[pi].options[blanks[pi].correctIndex] || '—'}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="qt-cloze-review-right">
                        <div className="qt-cloze-review-heading">Every gap, every choice</div>
                        {blanks.map((blank, bi) => {
                          const studentPick = answers[bi] ?? -1
                          const isRight = studentPick === blank.correctIndex
                          return (
                            <div key={bi} className={`qt-cloze-gap-card ${isRight ? 'is-right' : 'is-wrong'}`}>
                              <div className="qt-cloze-gap-card-head">
                                <span className="qt-cloze-gap-card-num">Gap {bi + 1}</span>
                                <span className="qt-cloze-gap-card-icon">{isRight ? '✓' : '✗'}</span>
                              </div>
                              <div className="qt-cloze-gap-options">
                                {(blank.options || []).map((opt, oi) => {
                                  if (!opt) return null
                                  const isCorrect = oi === blank.correctIndex
                                  const isYours = oi === studentPick && !isCorrect
                                  return (
                                    <span key={oi} className={`qt-cloze-gap-option${isCorrect ? ' is-correct' : ''}${isYours ? ' is-yours' : ''}`}>
                                      {opt}
                                      {isCorrect && <span className="qt-cloze-gap-tag">correct</span>}
                                      {isYours && <span className="qt-cloze-gap-tag">your answer</span>}
                                    </span>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    {wrongGaps.length > 0 && (
                      <div className="qt-cloze-review-help">
                        <div className="qt-cloze-review-heading">
                          Work through the gaps you missed
                          <span className="qt-cloze-review-token">{allGapsDone ? '1 token earned ✓' : 'Define every word of each missed gap to earn 1 token'}</span>
                        </div>
                        {wrongGaps.map((bi) => {
                          const key = gapChatKey(bi)
                          const gchat = reviewChats[key] || {}
                          const gq = gapQuestion(bi)
                          const setChat = (next) => {
                            const merged = { ...reviewChats, [key]: next }
                            setReviewChats(merged)
                            const everyGapDone = wrongGaps.every((gi) => {
                              const cc = gi === bi ? next : (merged[gapChatKey(gi)] || {})
                              const words = (blanks[gi].options || []).filter((w) => w && w.trim())
                              return words.length > 0 && words.every((_, oi) => cc.defs?.[oi]?.ok)
                            })
                            let tokens = reviewTokensAwarded
                            if (everyGapDone && !tokens[`chat-${currentQ}`]) {
                              tokens = { ...tokens, [`chat-${currentQ}`]: true }
                              addTokens(user.id, 1)
                              setReviewTokensAwarded(tokens)
                              showTokenBanner('+1 Token — every word defined!')
                            }
                            saveHomeworkReviewState(takingQuiz.id, user.id, { chats: merged, tokens })
                          }
                          const fetchFor = async (kind) => {
                            const letterOf = (i) => String.fromCharCode(65 + i)
                            const pickText = (src) => kind === 'wrong'
                              ? ((answers[bi] >= 0 && src.options?.[letterOf(answers[bi])]) || src.general)
                              : (src.general || src.options?.[letterOf(blanks[bi].correctIndex)])
                            const shared = await getSharedExplanation(takingQuiz.id, gq, `${currentQ}g${bi}`)
                            if (shared) {
                              const got = pickText(shared)
                              if (got) return got
                            }
                            const ai = await generateExplanation({ questionText: gq.text, options: gq.options, correctIndex: gq.correctIndex })
                            saveSharedExplanation(takingQuiz.id, gq, `${currentQ}g${bi}`, ai)
                            return pickText(ai)
                          }
                          return (
                            <ClozeGapReview
                              key={bi}
                              gap={blanks[bi]}
                              gapIndex={bi}
                              sentence={sentenceFor(bi)}
                              chat={gchat}
                              onChange={setChat}
                              studentPick={answers[bi] ?? -1}
                              fetchConcept={() => fetchFor('concept')}
                              onAskTeacher={() => sendQuestionToTeacher(currentQ, q)}
                              asked={askedTeacher.has(currentQ)}
                            />
                          )
                        })}
                      </div>
                    )}
                    </div>
                    {reviewStats}
                  </>
                }

                if (qType === 'drag-drop' || qType === 'drag-sentence' || qType === 'drag-summary') {
                  const order = q.correctOrder || []
                  const opts = q.summaryOptions || []
                  const correctCount = order.filter((c, i) => Array.isArray(picked) && picked[i] === c).length
                  return <>
                    <div className="qt-review-scroll">
                    {q.prompt && <div className="qt-prompt-display" dangerouslySetInnerHTML={{ __html: q.prompt }} />}
                    <div className="qt-review-sub-score">{correctCount}/{order.length} positions correct</div>
                    {(() => {
                      // The sentences the student chose from, in the order they saw
                      // them: without the bank in front of them, the gap-by-gap list
                      // below is a list of sentences with nothing to compare against.
                      const shuffled = dragShuffles[currentQ] || opts.map((_, i) => i)
                      const visible = shuffled.filter((i) => opts[i])
                      const letterOf = (oi) => String.fromCharCode(65 + visible.indexOf(oi))
                      const usedCorrectly = new Set(order.filter((cIdx, si) => Array.isArray(picked) && picked[si] === cIdx))
                      const unused = visible.filter((oi) => !order.includes(oi))
                      return <>
                        <div className="qt-drag-sentences qt-drag-sentences-review">
                          {visible.map((oi) => (
                            <div key={oi} className={`qt-drag-sentence qt-drag-sentence-review${usedCorrectly.has(oi) ? ' is-right' : ''}${unused.includes(oi) ? ' is-extra' : ''}`}>
                              <span className="qt-drag-letter">{letterOf(oi)}</span>
                              <span>{opts[oi]}</span>
                              {unused.includes(oi) && <span className="qt-drag-extra-tag">not needed</span>}
                            </div>
                          ))}
                        </div>
                        <div className="qt-sub-review-list">
                          {order.map((correctIdx, si) => {
                            const studentPick = Array.isArray(picked) ? picked[si] : -1
                            const isRight = studentPick === correctIdx
                            return (
                              <div key={si} className={`qt-sub-review-row ${isRight ? 'qt-sub-correct' : 'qt-sub-wrong'}`}>
                                <span className="qt-sub-review-label">Gap {q.gapNumbers && q.gapNumbers[si] != null ? q.gapNumbers[si] : si + 1}.</span>
                                <span className="qt-sub-review-icon">{isRight ? '✓' : '✗'}</span>
                                {!isRight && <span className="qt-sub-review-picked">Your answer: {studentPick >= 0 ? `${letterOf(studentPick)} — ${opts[studentPick] || '—'}` : 'Skipped'}</span>}
                                <span className="qt-sub-review-correct">Correct: {opts[correctIdx] ? `${letterOf(correctIdx)} — ${opts[correctIdx]}` : '—'}</span>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    })()}
                    </div>
                    {reviewStats}
                  </>
                }

                if (qType === 'multi-matching') {
                  const mqs = q.matchQuestions || []
                  const descs = q.descriptions || []
                  const answers = Array.isArray(picked) ? picked : []
                  const correctCount = mqs.filter((mq, i) => answers[i] === mq.correctExtract).length
                  const extractLabel = (i) => `Extract ${String.fromCharCode(65 + i)}`
                  const plain = (html) => (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
                  const wrongOnes = mqs.map((mq, i) => (answers[i] === mq.correctExtract ? -1 : i)).filter((i) => i >= 0)
                  return <>
                    <div className="qt-review-scroll">
                    {q.prompt && <div className="qt-prompt-display" dangerouslySetInnerHTML={{ __html: q.prompt }} />}
                    <div className="qt-review-sub-score">{correctCount}/{mqs.length} matches correct</div>
                    <div className="qt-match-review-extracts">
                      {descs.map((d, di) => (
                        <details key={di} className="qt-match-extract">
                          <summary>{extractLabel(di)}{d.title ? ` — ${plain(d.title)}` : ''}</summary>
                          <div className="qt-desc-content" dangerouslySetInnerHTML={{ __html: d.content }} />
                        </details>
                      ))}
                    </div>
                    {mqs.map((mq, mi) => {
                      const studentPick = answers[mi] ?? -1
                      const isRight = studentPick === mq.correctExtract
                      const key = `${currentQ}:m${mi}`
                      const mchat = reviewChats[key] || {}
                      // Each statement is its own little question: which extract
                      // it belongs to, and why the one they picked was not it.
                      const subQuestion = {
                        id: q.id ? `${q.id}#m${mi}` : null,
                        text: `${plain(q.prompt)} ${plain(mq.question)}`.trim(),
                        options: descs.map((d, di) => `${extractLabel(di)}: ${plain(d.content).slice(0, 400)}`),
                        correctIndex: mq.correctExtract,
                      }
                      const setChat = (next) => {
                        const merged = { ...reviewChats, [key]: next }
                        setReviewChats(merged)
                        saveHomeworkReviewState(takingQuiz.id, user.id, { chats: merged, tokens: reviewTokensAwarded })
                      }
                      const fetchFor = async (kind) => {
                        const letterOf = (i) => String.fromCharCode(65 + i)
                        const pickText = (src) => kind === 'wrong'
                          ? ((studentPick >= 0 && src.options?.[letterOf(studentPick)]) || src.general)
                          : (src.general || src.options?.[letterOf(mq.correctExtract)])
                        const shared = await getSharedExplanation(takingQuiz.id, subQuestion, `${currentQ}m${mi}`)
                        if (shared) {
                          const got = pickText(shared)
                          if (got) return got
                        }
                        const ai = await generateExplanation({ questionText: subQuestion.text, options: subQuestion.options, correctIndex: subQuestion.correctIndex })
                        saveSharedExplanation(takingQuiz.id, subQuestion, `${currentQ}m${mi}`, ai)
                        return pickText(ai)
                      }
                      async function submitMine(text) {
                        const input = (text || '').trim()
                        if (!input) return
                        setChat({ ...mchat, panel: 'mine', step: 'checking', mine: input, feedback: '' })
                        const result = await checkExplanation({
                          questionText: subQuestion.text,
                          correctAnswer: extractLabel(mq.correctExtract),
                          officialExplanation: [mchat.help?.wrong, mchat.help?.concept].filter(Boolean).join(' '),
                          studentReason: mchat.reason || '',
                          studentExplanation: input,
                        })
                        if (result.coherent) {
                          const doneChat = { ...mchat, panel: 'mine', step: 'done', mine: input, feedback: result.reply }
                          const merged = { ...reviewChats, [key]: doneChat }
                          setReviewChats(merged)
                          let tokens = reviewTokensAwarded
                          if (!tokens[`chat-${key}`]) {
                            tokens = { ...tokens, [`chat-${key}`]: true }
                            addTokens(user.id, 1)
                            setReviewTokensAwarded(tokens)
                            showTokenBanner('+1 Token — Great explanation!')
                          }
                          saveHomeworkReviewState(takingQuiz.id, user.id, { chats: merged, tokens })
                        } else {
                          setChat({ ...mchat, panel: 'mine', step: 'explain', mine: input, feedback: result.reply })
                        }
                      }
                      return (
                        <div key={mi} className={`qt-match-review-item ${isRight ? 'is-right' : 'is-wrong'}`}>
                          <div className="qt-match-review-head">
                            <span className="qt-match-review-num">{mi + 1}</span>
                            <span className="qt-match-review-q" dangerouslySetInnerHTML={{ __html: mq.question }} />
                            <span className="qt-match-review-icon">{isRight ? '✓' : '✗'}</span>
                          </div>
                          <div className="qt-match-review-answers">
                            {!isRight && <span className="qt-sub-review-picked">You chose: {studentPick >= 0 ? extractLabel(studentPick) : 'Skipped'}</span>}
                            <span className="qt-sub-review-correct">Correct: {extractLabel(mq.correctExtract)}</span>
                          </div>
                          {!isRight && (
                            <ReviewHelp
                              chat={mchat}
                              onChange={setChat}
                              wrongLabel="Why did I get this wrong?"
                              conceptLabel="Why is this the answer?"
                              mineLabel="Explain it yourself"
                              fetchConcept={() => fetchFor('concept')}
                              isDone={mchat.step === 'done'}
                              onAskTeacher={() => sendQuestionToTeacher(currentQ, q)}
                              asked={askedTeacher.has(currentQ)}
                              compact
                              renderMine={() => (
                                <div className="qt-help-form">
                                  <div className="qt-help-lead">Say in your own words why <b>{extractLabel(mq.correctExtract)}</b> is the one that matches this statement.</div>
                                  {mchat.step === 'done' ? (
                                    <>
                                      {mchat.mine && <div className="qt-help-mine">{mchat.mine}</div>}
                                      <div className="qt-help-feedback">{mchat.feedback || 'Nice work — token claimed.'}</div>
                                    </>
                                  ) : mchat.step === 'checking' ? (
                                    <div className="qt-help-loading">Reading your explanation…</div>
                                  ) : (
                                    <>
                                      {mchat.feedback && <div className="qt-help-feedback qt-help-feedback-retry">{mchat.feedback}</div>}
                                      <textarea
                                        className="qt-help-input"
                                        rows={3}
                                        defaultValue={mchat.mine || ''}
                                        placeholder="Because the extract says…"
                                        onChange={(e) => { mineDrafts.current[key] = e.target.value }}
                                      />
                                      <button className="qt-help-send" onClick={() => submitMine(mineDrafts.current[key] ?? mchat.mine)}>Submit explanation</button>
                                    </>
                                  )}
                                </div>
                              )}
                            />
                          )}
                        </div>
                      )
                    })}
                    </div>
                    {reviewStats}
                  </>
                }

                if (qType === 'free-writing') {
                  const writingMark = submittedResult ? getWritingMark(submittedResult.id || '', currentQ) : null
                  const SCORE_LABELS_W = ['', 'Beginning', 'Developing', 'Competent', 'Proficient', 'Advanced']
                  const SCORE_COLORS_W = ['', '#ff1744', '#ff9100', '#ffab00', '#66bb6a', '#00e5ff']
                  const rawAnswer = typeof picked === 'string' && picked.trim() ? picked : ''
                  const TOOL_ICONS = { highlight: '🖍️', strikethrough: '~~', comment: '💬', insertion: '➕', correction: '🔤' }
                  const OLD_ICONS = { spelling: '🔤', grammar: '📝', punctuation: '✏️', vocabulary: '📖', structure: '🏗️' }

                  function stripHtmlStudent(html) {
                    let h = html.replace(/<br\s*\/?>/gi, '\n')
                    h = h.replace(/<\/p>/gi, '\n\n')
                    h = h.replace(/<\/div>/gi, '\n')
                    const d = document.createElement('div')
                    d.innerHTML = h
                    return (d.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
                  }
                  function renderStudentAnnotated(html, annots) {
                    const plain = stripHtmlStudent(html || '')
                    if (!plain) return <div><em>(No answer submitted)</em></div>
                    if (!annots?.length) return <div className="qt-wr-annotated-text">{plain}</div>
                    const sorted = [...annots].filter(a => a.startOffset != null).sort((a, b) => a.startOffset - b.startOffset)
                    if (!sorted.length) return <div className="qt-wr-annotated-text">{plain}</div>
                    const commentAnnots = annots.filter(a => a.action === 'comment')
                    const parts = []
                    let cursor = 0
                    for (const ann of sorted) {
                      if (ann.startOffset < cursor) continue
                      if (ann.startOffset > cursor) parts.push(<span key={`t${cursor}`}>{plain.slice(cursor, ann.startOffset)}</span>)
                      const seg = plain.slice(ann.startOffset, ann.endOffset)
                      if (ann.action === 'highlight') parts.push(<mark key={ann.id} className="qt-wr-highlight" style={{ '--hl-color': ann.color }}>{seg}</mark>)
                      else if (ann.action === 'strikethrough') parts.push(<span key={ann.id} className="qt-wr-strike">{seg}</span>)
                      else if (ann.action === 'comment') {
                        const cIdx = commentAnnots.findIndex(a => a.id === ann.id)
                        parts.push(<span key={ann.id} className="qt-wr-comment-mark" data-comment-idx={cIdx + 1}>{seg}</span>)
                      }
                      else if (ann.action === 'insertion') parts.push(<span key={ann.id} className="qt-wr-insertion-wrap">{seg}<span className="qt-wr-insertion-text">{ann.insertionText}</span></span>)
                      else if (ann.action === 'correction') parts.push(<span key={ann.id} className="qt-wr-correction-mark"><span className="qt-wr-correction-original">{seg}</span>{ann.suggestion && <span className="qt-wr-correction-suggestion"><span className="qt-wr-correction-suggestion-label">Suggestion:</span> {ann.suggestion}</span>}</span>)
                      else parts.push(<span key={ann.id}>{seg}</span>)
                      cursor = ann.endOffset
                    }
                    if (cursor < plain.length) parts.push(<span key="end">{plain.slice(cursor)}</span>)
                    return <div className="qt-wr-annotated-wrap">
                      <div className="qt-wr-annotated-text">{parts}</div>
                      {commentAnnots.length > 0 && (
                        <div className="qt-wr-margin-comments">
                          {commentAnnots.map((ann, i) => (
                            <div key={ann.id} className="qt-wr-margin-comment">
                              <span className="qt-wr-margin-num">{i + 1}</span>
                              <span className="qt-wr-margin-text">{ann.comment}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  }

                  return <>
                    <div className="qt-review-scroll qt-wr-review-scroll">
                    {writingMark && (
                      <div className="qt-wr-score-banner" style={{ '--banner-color': SCORE_COLORS_W[Math.ceil(writingMark.totalScore / 5)] }}>
                        <span className="qt-wr-score-banner-num">{writingMark.totalScore}</span>
                        <span className="qt-wr-score-banner-of">/25</span>
                      </div>
                    )}
                    {q.prompt && <div className="qt-prompt-display" dangerouslySetInnerHTML={{ __html: q.prompt }} />}
                    <div className="qt-freewrite-review">
                      <div className="qt-freewrite-review-label">Your Response</div>
                      <div className="qt-freewrite-review-text">
                        {renderStudentAnnotated(rawAnswer, writingMark?.annotations)}
                      </div>
                    </div>
                    {writingMark && (
                      <div className="qt-wr-feedback">
                        <div className="qt-wr-feedback-header">
                          <span className="qt-wr-feedback-title">Teacher Feedback</span>
                          <span className="qt-wr-feedback-score" style={{ color: SCORE_COLORS_W[Math.ceil(writingMark.totalScore / 5)] }}>{writingMark.totalScore}/25</span>
                        </div>
                        <div className="qt-wr-rubric-grid">
                          {WRITING_RUBRIC.map(cat => {
                            const mc = writingMark.categories.find(c => c.key === cat.key)
                            if (!mc) return null
                            return (
                              <div key={cat.key} className="qt-wr-rubric-item">
                                <div className="qt-wr-rubric-bar-wrap">
                                  <div className="qt-wr-rubric-bar" style={{ width: `${(mc.score / 5) * 100}%`, background: SCORE_COLORS_W[mc.score] }} />
                                </div>
                                <div className="qt-wr-rubric-label">{cat.name}</div>
                                <div className="qt-wr-rubric-score" style={{ color: SCORE_COLORS_W[mc.score] }}>{mc.score}/5 <span className="qt-wr-rubric-level">{SCORE_LABELS_W[mc.score]}</span></div>
                                {mc.comment && <div className="qt-wr-rubric-comment">{mc.comment}</div>}
                              </div>
                            )
                          })}
                        </div>
                        {writingMark.overallComment && (
                          <div className="qt-wr-overall">
                            <div className="qt-wr-overall-label">Overall</div>
                            <div className="qt-wr-overall-text">{writingMark.overallComment}</div>
                          </div>
                        )}
                      </div>
                    )}
                    {!writingMark && (
                      <div className="qt-wr-pending">Your writing is awaiting teacher feedback.</div>
                    )}
                    </div>
                  </>
                }

                return <>{reviewStats}</>
              })() : (() => {
                const qType = q.type || 'multiple-choice'

                if (qType === 'multiple-choice' || qType === 'multi-description') {
                  return <>
                    {q.prompt && <div className="qt-prompt-display" dangerouslySetInnerHTML={{ __html: q.prompt }} />}
                    <div className="qt-options">
                      {q.options.map((opt, oi) => {
                        if (!opt) return null
                        const isSelected = selectedAnswer === oi
                        return (
                          <button key={oi} className={`qt-option qt-click-flash-option${isSelected ? ' qt-option-selected' : ''}`} onClick={() => setQuizAnswers(prev => { const next = [...prev]; next[currentQ] = oi; return next })} style={{ cursor: 'pointer' }}>
                            <span className="qt-option-radio qt-click-flash-radio" />
                            <span className="qt-option-text">{opt}</span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                }

                if (qType === 'dropdown-cloze') {
                  return <>
                    {q.prompt && <div className="qt-prompt-display" dangerouslySetInnerHTML={{ __html: q.prompt }} />}
                    <div className="qt-cloze-blanks">
                      {(q.blanks || []).map((blank, bi) => (
                        <div key={bi} className="qt-cloze-blank-row">
                          <span className="qt-cloze-blank-label">Blank {bi + 1}:</span>
                          <select className="qt-cloze-select" value={Array.isArray(selectedAnswer) ? selectedAnswer[bi] : -1} onChange={e => {
                            const val = parseInt(e.target.value)
                            setQuizAnswers(prev => { const next = [...prev]; const arr = Array.isArray(next[currentQ]) ? [...next[currentQ]] : new Array(q.blanks.length).fill(-1); arr[bi] = val; next[currentQ] = arr; return next })
                          }}>
                            <option value={-1}>Select...</option>
                            {blank.options.map((opt, oi) => opt ? <option key={oi} value={oi}>{opt}</option> : null)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </>
                }

                if (qType === 'drag-drop' || qType === 'drag-sentence' || qType === 'drag-summary') {
                  const opts = q.summaryOptions || []
                  // correctOrder[gap] = option index, so the gaps are its entries. Gaps
                  // used to equal the option count, which added a phantom gap for the
                  // extra (unused) sentence.
                  const numGaps = (q.correctOrder && q.correctOrder.length) || opts.filter(Boolean).length
                  const answers = Array.isArray(selectedAnswer) ? selectedAnswer : new Array(numGaps).fill(-1)
                  const shuffled = dragShuffles[currentQ] || opts.map((_, i) => i)
                  const dragLabel = (qType === 'drag-sentence' || q.dragType === 'sentence') ? 'sentence' : 'summary'
                  const gapLabels = shuffled.filter(i => opts[i]).map((_, g) => String.fromCharCode(65 + g))
                  const gapName = (si) => (q.gapNumbers && q.gapNumbers[si] != null ? q.gapNumbers[si] : si + 1)
                  return <>
                    {q.prompt && <div className="qt-prompt-display" dangerouslySetInnerHTML={{ __html: q.prompt }} />}
                    <p style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 4 }}>Choose from the {dragLabel === 'sentence' ? 'sentences' : 'summaries'} ({gapLabels.join(', ')}) the one which fits each gap.</p>
                    <p style={{ fontSize: '0.8rem', color: '#555', marginBottom: 12 }}>Drag each {dragLabel} into a gap below, or tap a {dragLabel} and then tap the gap. Tap a filled gap to clear it.</p>
                    {(() => {
                      const visible = shuffled.filter(i => opts[i])
                      const labelOf = (oi) => gapLabels[visible.indexOf(oi)]
                      // Placing a sentence moves it out of any other gap it was in.
                      const place = (si, oi) => setQuizAnswers(prev => {
                        const next = [...prev]
                        const arr = Array.isArray(next[currentQ]) ? [...next[currentQ]] : new Array(numGaps).fill(-1)
                        for (let k = 0; k < arr.length; k++) if (arr[k] === oi) arr[k] = -1
                        arr[si] = oi
                        next[currentQ] = arr
                        return next
                      })
                      const clear = (si) => setQuizAnswers(prev => {
                        const next = [...prev]
                        const arr = Array.isArray(next[currentQ]) ? [...next[currentQ]] : new Array(numGaps).fill(-1)
                        arr[si] = -1
                        next[currentQ] = arr
                        return next
                      })
                      return <>
                        <div className="qt-drag-sentences">
                          {visible.map((oi) => {
                            const isPlaced = answers.includes(oi)
                            return (
                              <div
                                key={oi}
                                draggable
                                className={`qt-drag-sentence${dragSource === oi ? ' qt-drag-sentence-selected' : ''}${isPlaced ? ' qt-drag-sentence-used' : ''}`}
                                onDragStart={e => { e.dataTransfer.setData('text/plain', String(oi)); e.dataTransfer.effectAllowed = 'move'; setDragSource(oi) }}
                                onDragEnd={() => setDragSource(null)}
                                onClick={() => setDragSource(dragSource === oi ? null : oi)}
                              >
                                <span className="qt-drag-letter">{labelOf(oi)}</span>
                                <span>{opts[oi]}</span>
                              </div>
                            )
                          })}
                        </div>
                        <div className="qt-drag-gaps-table">
                          {Array.from({ length: numGaps }, (_, si) => {
                            const placed = answers[si]
                            return (
                              <div
                                key={si}
                                className={`qt-drag-gap-row${dragSource != null ? ' qt-drag-gap-ready' : ''}`}
                                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('qt-drag-gap-over') }}
                                onDragLeave={e => e.currentTarget.classList.remove('qt-drag-gap-over')}
                                onDrop={e => {
                                  e.preventDefault()
                                  e.currentTarget.classList.remove('qt-drag-gap-over')
                                  const oi = parseInt(e.dataTransfer.getData('text/plain'))
                                  if (!Number.isNaN(oi)) place(si, oi)
                                  setDragSource(null)
                                }}
                                onClick={() => {
                                  if (dragSource != null) { place(si, dragSource); setDragSource(null) }
                                  else if (placed != null && placed !== -1) clear(si)
                                }}
                              >
                                <span className="qt-drag-gap-label">Gap {gapName(si)}</span>
                                <span className="qt-drag-gap-content">
                                  {placed != null && placed !== -1 && opts[placed]
                                    ? <span className="qt-drag-gap-filled"><b>{labelOf(placed)}</b> {opts[placed]} <span className="qt-drag-gap-remove">✕</span></span>
                                    : <span className="qt-drag-gap-empty">Drop a {dragLabel} here</span>}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    })()}
                  </>
                }

                if (qType === 'multi-matching') {
                  return <>
                    {q.prompt && <div className="qt-prompt-display" dangerouslySetInnerHTML={{ __html: q.prompt }} />}
                    <div className="qt-matching-instructions">
                      For the questions below, choose the correct extract ({(q.descriptions || []).map((_, di) => String.fromCharCode(65 + di)).join(', ')}).
                      The extracts may be chosen more than once.<br /><br />
                      Which extract…
                    </div>
                    <div className="qt-matching-questions">
                      {(q.matchQuestions || []).map((mq, mi) => (
                        <div key={mi} className="qt-matching-row">
                          <span className="qt-matching-num">{mi + 1}.</span>
                          <span className="qt-matching-question" dangerouslySetInnerHTML={{ __html: mq.question }} />
                          <select className="qt-cloze-select" value={Array.isArray(selectedAnswer) ? selectedAnswer[mi] : -1} onChange={e => {
                            const val = parseInt(e.target.value)
                            setQuizAnswers(prev => { const next = [...prev]; const arr = Array.isArray(next[currentQ]) ? [...next[currentQ]] : new Array(q.matchQuestions.length).fill(-1); arr[mi] = val; next[currentQ] = arr; return next })
                          }}>
                            <option value={-1} disabled hidden></option>
                            {(q.descriptions || []).map((d, di) => <option key={di} value={di}>{String.fromCharCode(65 + di)}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </>
                }

                if (qType === 'free-writing') {
                  return <div className="qt-freewrite-editor-wrap">
                    <RichTextEditor
                      extended
                      value={typeof selectedAnswer === 'string' ? selectedAnswer : ''}
                      onChange={(html) => { setQuizAnswers(prev => { const next = [...prev]; next[currentQ] = html; return next }) }}
                      placeholder="Write your answer here..."
                    />
                  </div>
                }

                return null
              })()}
            </div>
          </div>
            )
          })()}

          {/* Stats popup removed — now inline strip */}

          {/* Bottom bar */}
          <div className="qt-bottombar">
            <div className="qt-bottom-left">
              <button className="qt-nav-btn qt-nav-back qt-click-flash" onClick={() => {
                if (isReview && reviewIndices.length > 0) {
                  const idx = reviewIndices.indexOf(currentQ)
                  if (idx > 0) setCurrentQ(reviewIndices[idx - 1])
                } else {
                  setCurrentQ((c) => Math.max(0, c - 1))
                }
              }} disabled={isReview ? reviewIndices.indexOf(currentQ) <= 0 : currentQ === 0}>
                &#9664; Back
              </button>
              {!isReview && takingQuiz.homeworkMode && (
                <button className="qt-save-exit-btn qt-click-flash" onClick={saveAndExitHomework}>Save &amp; Exit</button>
              )}
              {isReview && submittedResult && !isQuestionCorrect(q, submittedResult.answers[currentQ]) && (
                <button
                  className={`qt-ask-teacher-btn qt-click-flash${askedTeacher.has(currentQ) ? ' is-sent' : ''}`}
                  disabled={askedTeacher.has(currentQ)}
                  onClick={() => sendQuestionToTeacher(currentQ, q)}
                >{askedTeacher.has(currentQ) ? 'Sent to your teacher ✓' : 'Ask Teacher'}</button>
              )}
            </div>
            <div className="qt-bottom-center">
              {isReview ? (
                <button className="qt-nav-btn qt-nav-done qt-click-flash" onClick={exitQuiz}>Done</button>
              ) : (
                <button className="qt-submit-btn qt-click-flash" onClick={handleSubmitClick}>
                  Submit ({answered}/{total})
                </button>
              )}
            </div>
            <div className="qt-bottom-right">
              {!isReview && (
                <button className={`qt-flag-btn qt-click-flash ${flagged.has(currentQ) ? 'qt-flag-btn-active' : ''}`} onClick={toggleFlag}>
                  {flagged.has(currentQ) ? 'Flagged' : 'Flag'} &#9873;
                </button>
              )}
              {isReview && reviewIndices.indexOf(currentQ) === reviewIndices.length - 1 ? (
                <span style={{ visibility: 'hidden', padding: '22px 48px' }} />
              ) : !isReview && currentQ === total - 1 ? (
                <button className="qt-submit-btn qt-click-flash" onClick={handleSubmitClick}>
                  Submit &#9654;
                </button>
              ) : (
                <button className="qt-nav-btn qt-nav-next qt-click-flash" onClick={() => {
                  if (isReview && reviewIndices.length > 0) {
                    const idx = reviewIndices.indexOf(currentQ)
                    if (idx < reviewIndices.length - 1) setCurrentQ(reviewIndices[idx + 1])
                  } else {
                    setCurrentQ((c) => Math.min(total - 1, c + 1))
                  }
                }}>
                  Next &#9654;
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Submit confirmation popup */}
        {showSaveExitConfirm && (
          <div className="neon-overlay">
            <div className="neon-popup" style={{ maxWidth: 420 }}>
              <p className="neon-popup-heading" style={{ marginBottom: 28 }}>
                Save your progress and exit?
              </p>
              <p className="neon-popup-sub" style={{ marginBottom: 24 }}>
                You can return to finish this quiz later.
              </p>
              <div className="neon-popup-actions">
                <button className="btn" style={{ background: '#4caf50', color: '#fff' }} autoFocus onClick={confirmSaveAndExit}>Yes, Save &amp; Exit</button>
                <button className="btn btn-outline" onClick={() => setShowSaveExitConfirm(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {showSubmitConfirm && (() => {
          const answeredCount = quizAnswers.filter((a, ai) => isAnswered(a, resolvedQuestions[ai]?.type || 'multiple-choice')).length
          const unansweredCount = quizAnswers.length - answeredCount
          const flaggedCount = flagged.size
          const total = quizAnswers.length || 1
          const pct = Math.round((answeredCount / total) * 100)
          const unansweredIdx = quizAnswers.map((a, ai) => ai).filter((ai) => !isAnswered(quizAnswers[ai], resolvedQuestions[ai]?.type || 'multiple-choice'))
          const flaggedIdx = [...flagged].sort((a, b) => a - b)
          const jump = (i) => { setCurrentQ(i); setShowSubmitConfirm(false) }
          return (
            <div className="neon-overlay">
              <div className="submit-card" role="dialog" aria-labelledby="submit-card-title">
                <h2 id="submit-card-title" className="submit-card-title">{unansweredCount === 0 ? 'All done — ready to submit?' : 'Ready to submit?'}</h2>
                <div className="submit-card-bar" aria-hidden="true"><div className="submit-card-bar-fill" style={{ width: `${pct}%` }} /></div>
                <div className="submit-card-stats">
                  <div className="submit-stat submit-stat-done"><b>{answeredCount}</b><span>Answered</span></div>
                  <div className={`submit-stat ${unansweredCount ? 'submit-stat-todo' : 'submit-stat-clear'}`}><b>{unansweredCount}</b><span>Unanswered</span></div>
                  {flaggedCount > 0 && <div className="submit-stat submit-stat-flag"><b>{flaggedCount}</b><span>Flagged</span></div>}
                </div>
                {unansweredIdx.length > 0 && (
                  <div className="submit-card-group">
                    <div className="submit-card-label">Not answered — tap to go back</div>
                    <div className="submit-card-chips">
                      {unansweredIdx.map((i) => <button key={i} className="submit-chip submit-chip-todo" onClick={() => jump(i)}>{i + 1}</button>)}
                    </div>
                  </div>
                )}
                {flaggedIdx.length > 0 && (
                  <div className="submit-card-group">
                    <div className="submit-card-label">Flagged for review</div>
                    <div className="submit-card-chips">
                      {flaggedIdx.map((i) => <button key={i} className="submit-chip submit-chip-flag" onClick={() => jump(i)}>{i + 1}</button>)}
                    </div>
                  </div>
                )}
                <p className="submit-card-note">You can't change your answers after submitting.</p>
                <div className="submit-card-actions">
                  <button className="submit-btn submit-btn-back" onClick={() => setShowSubmitConfirm(false)}>Keep working</button>
                  <button className="submit-btn submit-btn-go" autoFocus onClick={confirmSubmit}>Submit quiz</button>
                </div>
              </div>
            </div>
          )
        })()}
        {tokenPopup && (
          <div className="qt-token-burst" onClick={() => setTokenPopup(null)}>
            <div className="qt-token-strip">
              <span className="qt-token-shimmer" aria-hidden="true" />
              <span className="qt-token-text">{tokenPopup}</span>
            </div>
          </div>
        )}
        {vocabTooltip && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => { setVocabTooltip(null); setVocabSaved(null); setVocabDefinition(null) }} />
            <div className="qt-vocab-tooltip" style={{ left: vocabTooltip.x, top: vocabTooltip.y }} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
              {vocabSaved ? (
                <span className="qt-vocab-tooltip-saved">Added "{vocabSaved}"</span>
              ) : (
                <>
                  {reviewMode && (
                    <div style={{ marginBottom: 6, fontSize: '0.8rem', lineHeight: 1.4 }}>
                      {vocabDefLoading ? (
                        <span style={{ color: '#888', fontStyle: 'italic' }}>Looking up...</span>
                      ) : vocabDefinition ? (
                        <>
                          <span style={{ fontWeight: 700 }}>{vocabTooltip.word}</span>
                          {vocabDefinition.partOfSpeech && <span style={{ color: '#888', fontStyle: 'italic', marginLeft: 4 }}>({vocabDefinition.partOfSpeech})</span>}
                          <div style={{ color: '#444', marginTop: 3 }}>{vocabDefinition.definition}</div>
                        </>
                      ) : null}
                    </div>
                  )}
                  <button className="qt-vocab-tooltip-btn" onClick={saveVocabWord}>Add '{vocabTooltip.word}' to Vocab Bank</button>
                </>
              )}
            </div>
          </>
        )}
        {/* Old vocab onboarding removed — replaced by bottom-slide hint */}
        {showReportModal && (
          <ReportIssueModal
            kind={showReportModal}
            question={resolvedQuestions?.[currentQ]}
            questionLabel={`Question ${currentQ + 1}`}
            onClose={() => setShowReportModal(null)}
            onSubmit={({ type, details, option }) => {
              const extra = { source: reviewMode || submittedResult ? 'review' : 'quiz', option, questionId: resolvedQuestions?.[currentQ]?.id }
              if (showReportModal === 'question') reportQuestionError(takingQuiz.id, currentQ, user.id, type, details, extra)
              else reportExplanation(takingQuiz.id, currentQ, user.id, type, details, extra)
            }}
          />
        )}
      </div>
    )
  }

  // ===== COURSE DETAIL VIEW =====
  if (activeCourse) {
    const course = getCourseById(activeCourse)
    if (!course) { setActiveCourse(null); return null }

    const cls = classes.find((c) => c.id === course.classId)
    const unlocked = getUnlockedModuleCount(user.id, course.id)
    const activeModule = (() => {
      if (activeModuleId) {
        const idx = course.modules.findIndex((m) => m.id === activeModuleId)
        if (idx >= 0 && idx < unlocked) return course.modules[idx]
      }
      return unlocked > 0 ? course.modules[0] : null
    })()

    const quizSets = activeModule
      ? activeModule.quizSetIds.map((id) => getImportedQuizSet(id)).filter(Boolean)
      : []

    if (showTrialReport) {
      return <TrialReport courseId={course.id} studentId={user.id} studentName={user.name} onBack={() => setShowTrialReport(false)} />
    }

    return (
      <div className="hw-page">
        {sealedNotice && (
          <div className="neon-overlay" onClick={() => setSealedNotice(null)}>
            <div className="neon-popup" style={{ maxWidth: 460, padding: '36px 32px' }} onClick={(e) => e.stopPropagation()}>
              <p className="pixel-heading" style={{ fontSize: '0.9rem', marginBottom: 14 }}>Results sealed</p>
              <p style={{ fontSize: '1rem', lineHeight: 1.7, marginBottom: 10 }}><strong>{sealedNotice}</strong> is finished and locked.</p>
              <p className="text-dim" style={{ fontSize: '0.85rem', lineHeight: 1.7, marginBottom: 24 }}>
                Your teacher releases the results for the whole trial at once. Come back then to see your
                marks, your report and your review.
              </p>
              <button className="btn" onClick={() => setSealedNotice(null)}>Got it</button>
            </div>
          </div>
        )}

        <div className="header">
          <div>
            <div className="hw-course-title-row">
              <h1 className="pixel-title">{course.name}</h1>
              {/* The report is the point of a released trial, so it sits with the
                  course's name rather than off among the navigation. */}
              {course.trialTest && course.resultsReleased && (
                <button className="hw-trial-report-btn" onClick={() => setShowTrialReport(true)}>
                  View trial report
                </button>
              )}
            </div>
            {cls && <p style={{ fontSize: '0.8rem', color: 'var(--accent)', marginTop: 2 }}>Class: <strong>{cls.name}</strong></p>}
            {course.trialTest && (
              <p style={{ fontSize: '0.75rem', color: course.resultsReleased ? 'var(--success)' : 'var(--token)', marginTop: 4 }}>
                {course.resultsReleased
                  ? 'Trial test · results released'
                  : 'Trial test · marks stay sealed until your teacher releases them'}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn-logout" onClick={() => { setActiveCourse(null); setActiveModuleId(null) }}>
              Back to Courses
            </button>
          </div>
        </div>

        {(() => {
          const unlockedCount = getUnlockedModuleCount(user.id, course.id)
          const hwStart = getHomeworkStart(user.id, course.id)
          const weeksSinceStart = hwStart ? Math.floor((Date.now() - new Date(hwStart.startedDate).getTime()) / (7 * 24 * 60 * 60 * 1000)) : 0
          const currentWeekIdx = Math.min(weeksSinceStart, course.modules.length - 1)

          return (
            <>
            <div className="hw-layout">
              <div className="hw-timeline">
                {course.modules.map((m, i) => {
                  const isLocked = i >= unlockedCount
                  const isActive = !isLocked && activeModule && m.id === activeModule.id
                  const isCurrent = i === currentWeekIdx && hwStart
                  const quizCount = m.quizSetIds.length
                  const completedCount = m.quizSetIds.filter(qid => getHomeworkAttempt(qid, user.id)).length
                  const allDone = !isLocked && quizCount > 0 && completedCount === quizCount
                  const pendingCount = !isLocked ? quizCount - completedCount : 0
                  const isOverdue = pendingCount > 0 && i < currentWeekIdx
                  const deadline = getModuleDeadline(user.id, course.id, i)
                  const deadlineMs = deadline ? deadline.getTime() - Date.now() : null
                  const deadlineExpired = deadlineMs !== null && deadlineMs <= 0
                  const deadlineDays = deadlineMs !== null && deadlineMs > 0 ? Math.floor(deadlineMs / (1000 * 60 * 60 * 24)) : null
                  const deadlineHours = deadlineMs !== null && deadlineMs > 0 ? Math.floor((deadlineMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)) : null
                  return (
                    <div key={m.id} className={`hw-timeline-arrow-card ${isActive ? 'hw-timeline-arrow-active' : ''} ${allDone ? 'hw-timeline-arrow-done' : ''} ${isCurrent && !isLocked ? 'hw-timeline-arrow-current' : ''} ${isLocked ? 'hw-timeline-arrow-locked' : ''}`} style={{ position: 'relative' }} onClick={() => { if (!isLocked) setActiveModuleId(m.id) }}>
                      {pendingCount > 0 && <span className={isOverdue ? 'hw-badge-overdue' : 'hw-badge-warn'} style={{ position: 'absolute', top: -6, right: -6, zIndex: 2 }}>{isOverdue ? '⏰' : pendingCount}</span>}
                      {isCurrent && !isLocked && <div className="hw-timeline-now-label"><span className="hw-now-text">N<br/>O<br/>W</span><span className="hw-now-arrow">▶</span></div>}
                      <span className="hw-timeline-week-num">{isLocked ? '🔒' : i + 1}</span>
                      <div className="hw-timeline-arrow-body">
                        <div className="hw-timeline-name-row">
                          <span className="hw-timeline-name">{m.name}</span>
                        </div>
                        <span className="hw-timeline-info">
                          {isLocked ? 'Locked' : (quizCount > 0 ? `${completedCount}/${quizCount} assignments done` : '0 assignments')}
                        </span>
                      </div>
                      <div className="hw-timeline-arrow-point" />
                    </div>
                  )
                })}
                {course.modules.length === 0 && (
                  <p className="text-dim" style={{ fontSize: '0.7rem', padding: '12px 0' }}>No modules yet.</p>
                )}
              </div>

              <div className="hw-content">
                {activeModule ? (() => {
                  const activeModIdx = course.modules.findIndex(m => m.id === activeModule.id)
                  const moduleOverdue = activeModIdx >= 0 && activeModIdx < currentWeekIdx
                  const modDeadline = getModuleDeadline(user.id, course.id, activeModIdx)
                  const modDeadlineMs = modDeadline ? modDeadline.getTime() - Date.now() : null
                  const modExpired = modDeadlineMs !== null && modDeadlineMs <= 0
                  const modDays = modDeadlineMs !== null && modDeadlineMs > 0 ? Math.floor(modDeadlineMs / (1000 * 60 * 60 * 24)) : null
                  const modHours = modDeadlineMs !== null && modDeadlineMs > 0 ? Math.floor((modDeadlineMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)) : null
                  return <>
                    <div className="hw-content-header">
                      <h2 className="pixel-heading" style={{ fontSize: '1rem', margin: 0 }}>{activeModule.name}</h2>
                      {modDeadline && (
                        <span className={`hw-content-timer ${modExpired ? 'hw-content-timer-expired' : modDays !== null && modDays <= 1 ? 'hw-content-timer-urgent' : ''}`}>
                          {modExpired ? 'Ended — Marks Tallied' : `${modDays}d ${modHours}h remaining`}
                        </span>
                      )}
                    </div>
                    <p className="hw-section-label">Assignments</p>
                    {quizSets.length === 0 ? (
                      <p className="text-dim" style={{ fontSize: '0.8rem' }}>No assignments for this module yet.</p>
                    ) : (
                      <div className="hw-quiz-grid">
                        {quizSets.map((s) => {
                          const attempt = getHomeworkAttempt(s.id, user.id)
                          const hasAttempt = !!attempt
                          // In a trial test course a mark stays sealed until the
                          // teacher releases the sitting.
                          const resultsOut = quizResultsVisible(s.id, user.id)
                          const hwProgress = !hasAttempt && s.homeworkMode ? getHomeworkProgress(s.id, user.id) : null
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
                          const hwProgressPct = hwProgress ? Math.round(((hwProgress.answers || []).filter((a, ai) => {
                            const qt = s.questions[ai]?.type || 'multiple-choice'
                            if (qt === 'free-writing') return typeof a === 'string' && a.trim().length > 0
                            if (Array.isArray(a)) return a.some(v => v !== -1 && v !== '')
                            return a !== -1 && a !== null && a !== undefined
                          }).length / s.questions.length) * 100) : 0
                          return (
                            <div
                              key={s.id}
                              className={`hw-quiz-card${hasAttempt && pct === 100 ? ' hw-quiz-card-mastery' : ''}${hwProgress ? ' hw-quiz-card-inprogress' : ''}${highlightQuizId === s.id ? ' hw-quiz-card-highlight' : ''}`}
                              style={{ position: 'relative' }}
                              onClick={() => { setHighlightQuizId(null); handleQuizCardClick(s, hasAttempt) }}
                            >
                              {!hasAttempt && !hwProgress && <span className={moduleOverdue ? 'hw-badge-overdue' : 'hw-badge-warn'} style={{ position: 'absolute', top: -6, right: -6 }}>{moduleOverdue ? '⏰' : '!'}</span>}
                              {hwProgress && <span className="hw-badge-progress" style={{ position: 'absolute', top: -6, right: -6 }}>▶</span>}
                              <div className="hw-quiz-paper" />
                              <div className="hw-quiz-title-row">
                                <span className="hw-quiz-title">{s.friendlyTitle}</span>
                                <span className="hw-quiz-icon">{hwProgress ? '📝' : '📝'}</span>
                              </div>
                              <div className="hw-quiz-meta">{s.questions.length} questions</div>
                              {hasAttempt && !resultsOut ? (
                                <div className="hw-quiz-status hw-quiz-status-sealed">Submitted — awaiting results</div>
                              ) : hasAttempt ? (
                                <div className={`hw-quiz-status ${cardGradeClass}`}>
                                  {attempt.score}/{attempt.total} ({pct}%) — {cardGrade}
                                </div>
                              ) : hwProgress ? (
                                <div className="hw-quiz-status hw-quiz-status-inprogress">
                                  In Progress — {hwProgressPct}% answered
                                </div>
                              ) : (
                                <div className="hw-quiz-status hw-quiz-status-new">Not Started</div>
                              )}
                              {hasAttempt && (
                                <button className="hw-reset-lock" onClick={e => { e.stopPropagation(); setResetModal(s.id); setResetPw(''); setResetError(false) }} title="Reset quiz">&#128274;</button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {(() => {
                      const revQuizzes = activeModule.quizSetIds.map(id => getImportedQuizSet(id)).filter(Boolean)
                      if (revQuizzes.length === 0) return null
                      const hasAnyUnlocked = revQuizzes.some(s => getHomeworkAttempt(s.id, user.id))
                      if (!hasAnyUnlocked) return null
                      return (
                        <>
                          <div className="hw-revision-sep" />
                          <p className="hw-section-label" style={{ marginTop: 16 }}>Revision</p>
                          <div className="hw-quiz-grid">
                            {revQuizzes.map(s => {
                              const attempt = getHomeworkAttempt(s.id, user.id)
                              const isUnlocked = !!attempt
                              if (!isUnlocked) return null
                              const redo = getLatestHomeworkRedo(s.id, user.id)
                              return (
                                <div key={`rev-${s.id}`} className={`hw-quiz-card hw-quiz-card-redo`} onClick={() => handleRedoClick(s)}>
                                  <div className="hw-quiz-title-row">
                                    <span className="hw-quiz-title">{s.friendlyTitle}</span>
                                    <span className="hw-rev-check">
                                      {redo ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill="#4caf50"/><path d="M7 12.5l3 3 7-7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                        : <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="2" opacity="0.35"/></svg>}
                                    </span>
                                  </div>
                                  <div className="hw-quiz-meta">{s.questions.length} questions</div>
                                </div>
                              )
                            })}
                          </div>
                        </>
                      )
                    })()}

                  </>
                })() : (
                  <p className="text-dim">No modules in this course.</p>
                )}
              </div>
            </div>
            </>
          )
        })()}
      </div>
    )
  }

  // ===== COURSE CARDS VIEW =====
  return (
    <div className="hw-page">
      <div className="header">
        <h1 className="pixel-title">My Courses</h1>
        <button className="btn-logout" onClick={onBack}>Back</button>
      </div>


      {courses.length === 0 ? (
        <div className="card">
          <p className="text-dim">No courses assigned yet. Check back later!</p>
        </div>
      ) : (
        courseGroups.map((group) => (
        <div key={group.classId} className="hw-class-group">
          <p className="hw-class-group-title">{group.className}</p>
        <div className="hw-course-grid">
          {group.courses.map((c) => {
            const classImg = classes.find(cl => cl.id === c.classId)?.image
            const hwStart = getHomeworkStart(user.id, c.id)
            let coursePending = 0, courseOverdue = 0
            const unlockedN = hwStart ? getUnlockedModuleCount(user.id, c.id) : 0
            if (hwStart && unlockedN > 0) {
              const days = Math.floor((Date.now() - new Date(hwStart.startedDate).getTime()) / (1000 * 60 * 60 * 24))
              const curWeek = Math.floor(days / 7)
              ;(c.modules || []).forEach((m, mi) => {
                if (mi >= unlockedN) return
                const incomplete = (m.quizSetIds || []).filter(qid => !getHomeworkAttempt(qid, user.id)).length
                if (incomplete > 0) { if (mi < curWeek) courseOverdue += incomplete; else coursePending += incomplete }
              })
            }
            const hasBadge = courseOverdue > 0 || coursePending > 0
            return (
              <div key={c.id} style={{ position: 'relative' }}>
                {hasBadge && <span className={courseOverdue > 0 ? 'hw-badge-overdue' : 'hw-badge-warn'} style={{ position: 'absolute', top: -6, right: -6, zIndex: 2 }}>{courseOverdue > 0 ? '⏰' : coursePending}</span>}
                <div className="hw-course-card" onClick={() => {
                  const started = getHomeworkStart(user.id, c.id)
                  if (started) { setActiveCourse(c.id); setActiveModuleId(null) }
                  else setShowStartPopup(c.id)
                }}>
                  <div className="hw-course-img" style={classImg ? { backgroundImage: `url(${classImg})` } : {}}>
                    {!classImg && <span className="hw-course-img-placeholder">📚</span>}
                  </div>
                  {c.term && <div className="hw-course-term-badge">{c.term}</div>}
                  <div className="hw-course-shine" />
                </div>
                <div className="hw-course-name" title={c.name}>{c.name}</div>
              </div>
            )
          })}
        </div>
        </div>
        ))
      )}

      {showStartPopup && (
        <div className="neon-overlay">
          <div className="neon-popup" style={{ maxWidth: 520, padding: '40px 36px' }}>
            <p className="pixel-heading" style={{ fontSize: '0.9rem', color: 'var(--accent)', marginBottom: 20 }}>
              {(() => { const c = getCourseById(showStartPopup); return c ? c.name : 'Course' })()}
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '1rem', color: 'var(--text)', marginBottom: 12, lineHeight: 1.6 }}>
              Have you had your first class yet?
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--danger)', marginBottom: 28, lineHeight: 1.6, textDecoration: 'underline', textUnderlineOffset: '4px' }}>
              Do NOT open this until you have finished your first lesson.
            </p>
            <div className="neon-popup-actions" style={{ gap: 12 }}>
              <button className="btn" style={{ padding: '14px 40px', fontSize: '0.7rem' }}
                onClick={() => {
                  startHomeworkCourse(user.id, showStartPopup)
                  setActiveCourse(showStartPopup)
                  setActiveModuleId(null)
                  setShowStartPopup(null)
                }}
              >Yes, I have</button>
              <button className="btn btn-outline" style={{ padding: '14px 40px', fontSize: '0.7rem' }}
                onClick={() => setShowStartPopup(null)}
              >Not yet</button>
            </div>
          </div>
        </div>
      )}

      {resetModal && (
        <div className="neon-overlay" onClick={() => setResetModal(null)}>
          <div className="neon-popup" style={{ maxWidth: 400, padding: '36px 32px' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Reset Quiz</p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: 20, lineHeight: 1.5 }}>Enter the admin password to reset this quiz. The student's attempt will be permanently deleted.</p>
            <input
              type="password"
              className="input"
              value={resetPw}
              onChange={e => { setResetPw(e.target.value); setResetError(false) }}
              placeholder="Admin password"
              autoFocus
              style={{ width: '100%', marginBottom: resetError ? 8 : 20, boxSizing: 'border-box' }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (resetPw === atob('MjQzYXZhbnQxNjA2')) {
                    resetQuizForStudent(resetModal, user.id)
                    setResetModal(null)
                  } else {
                    setResetError(true)
                  }
                }
              }}
            />
            {resetError && <p style={{ fontSize: '0.8rem', color: 'var(--danger)', marginBottom: 12 }}>Incorrect password</p>}
            <div className="neon-popup-actions">
              <button className="btn" style={{ background: '#4caf50', color: '#fff' }} onClick={() => {
                if (resetPw === atob('MjQzYXZhbnQxNjA2')) {
                  resetQuizForStudent(resetModal, user.id)
                  setResetModal(null)
                } else {
                  setResetError(true)
                }
              }}>Reset</button>
              <button className="btn btn-outline" onClick={() => setResetModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HomeworkDashboard
