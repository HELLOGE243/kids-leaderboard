import { useState, useEffect, useRef, useMemo, memo } from 'react'

import ProgressGraph from '../components/ProgressGraph.jsx'
import Shop from './Shop.jsx'
import ReportPage from './ReportPage.jsx'
import QuizDashboard from './QuizDashboard.jsx'
import HomeworkDashboard from './HomeworkDashboard.jsx'
import RevisionDojo, { preloadDojoWallpapers } from './RevisionDojo.jsx'
import Battlegrounds from './Battlegrounds.jsx'
import VocabularyBank from './VocabularyBank.jsx'
import { getClassesForStudent, getOrganisation, getStudentById, getLeaderboard, getHomeworkLeaderboard, getActiveTerm, addScore, getTestEventsForClass, getScoresForStudentInClass, getRankingForStudentInClass, getHomeworkWeeklyStats, getTopicsForClass, getQuizzesForTopic, isQuizUnlocked, getAttemptForQuiz, getPendingHomeworkCount, getNewCourseCount, getDueDojoCards, getStudentFeedData, getSchoolNewsfeed, getPurchasedTracks, getPastLeaderboards, onDataChange, onBroadcast } from '../data/store.js'
import { playClick, playCoinSound, playTrack, stopTrack, getCurrentTrackId, isMuted, toggleMute, MUSIC_TRACKS } from '../utils/soundManager.js'

function FlipDigit({ value }) {
  const prevRef = useRef(value)
  const [display, setDisplay] = useState(value)
  const [flipping, setFlipping] = useState(false)

  useEffect(() => {
    if (value !== prevRef.current) {
      setFlipping(true)
      const swap = setTimeout(() => setDisplay(value), 200)
      const done = setTimeout(() => {
        setFlipping(false)
        prevRef.current = value
      }, 400)
      return () => { clearTimeout(swap); clearTimeout(done) }
    }
  }, [value])

  return (
    <span className={`flipclock-digit${flipping ? ' flipping' : ''}`}>{display}</span>
  )
}

const ClockBar = memo(function ClockBar({ logo }) {
  const [clock, setClock] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const hrs = String(clock.getHours() % 12 || 12).padStart(2, '0')
  const mins = String(clock.getMinutes()).padStart(2, '0')
  const secs = String(clock.getSeconds()).padStart(2, '0')
  const ampm = clock.getHours() >= 12 ? 'PM' : 'AM'
  const day = clock.getDate()
  const ordinal = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th'
  const weekday = clock.toLocaleDateString('en-AU', { weekday: 'long' })
  const month = clock.toLocaleDateString('en-AU', { month: 'long' })
  const dateStr = `${weekday}, ${day}${ordinal} ${month} ${clock.getFullYear()}`

  return (
    <div className="flipclock-bar">
      <div className="flipclock-time">
        <FlipDigit value={hrs[0]} />
        <FlipDigit value={hrs[1]} />
        <span className="flipclock-sep">:</span>
        <FlipDigit value={mins[0]} />
        <FlipDigit value={mins[1]} />
        <span className="flipclock-sep">:</span>
        <FlipDigit value={secs[0]} />
        <FlipDigit value={secs[1]} />
        <span className="flipclock-ampm">{ampm}</span>
      </div>
      <img src={logo} alt="" className="portal-header-logo" />
      <span className="flipclock-date">{dateStr}</span>
    </div>
  )
})

const QUOTES = [
  { text: "The expert in anything was once a beginner.", author: "Helen Hayes" },
  { text: "Mistakes are proof that you are trying.", author: "Jennifer Lim" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "The more that you read, the more things you will know.", author: "Dr. Seuss" },
  { text: "It's not that I'm so smart, it's just that I stay with problems longer.", author: "Albert Einstein" },
  { text: "Fall seven times, stand up eight.", author: "Japanese Proverb" },
  { text: "A person who never made a mistake never tried anything new.", author: "Albert Einstein" },
  { text: "Education is the most powerful weapon you can use to change the world.", author: "Nelson Mandela" },
  { text: "Your brain is like a muscle — the more you use it, the stronger it gets.", author: "Unknown" },
  { text: "Be curious, not judgmental.", author: "Walt Whitman" },
  { text: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas Edison" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "If you think education is expensive, try ignorance.", author: "Benjamin Franklin" },
  { text: "Today a reader, tomorrow a leader.", author: "Margaret Fuller" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Don't let what you cannot do interfere with what you can do.", author: "John Wooden" },
  { text: "Why fit in when you were born to stand out?", author: "Dr. Seuss" },
  { text: "Homework spelled backwards is krowemoh, which is also no fun.", author: "Unknown" },
  { text: "The brain is wider than the sky.", author: "Emily Dickinson" },
  { text: "I'm still learning.", author: "Michelangelo (at age 87)" },
  { text: "Knowledge is power. Power is pizza. Pizza is knowledge.", author: "April Ludgate" },
]

const MEDALS = ['\u{1F451}', '\u{1F948}', '\u{1F949}']

function LeaderboardDisplay({ entries, userId }) {
  const top3 = entries.slice(0, 3)
  const podiumOrder = top3.length >= 3
    ? [top3[1], top3[0], top3[2]]
    : top3.length === 2 ? [top3[1], top3[0]] : top3
  const podiumClasses = top3.length >= 3
    ? ['lb-podium-2nd', 'lb-podium-1st', 'lb-podium-3rd']
    : top3.length === 2 ? ['lb-podium-2nd', 'lb-podium-1st'] : ['lb-podium-1st']
  const podiumMedals = top3.length >= 3
    ? [MEDALS[1], MEDALS[0], MEDALS[2]]
    : top3.length === 2 ? [MEDALS[1], MEDALS[0]] : [MEDALS[0]]
  const rankSuffix = (n) => {
    if (n === 1) return '1st'
    if (n === 2) return '2nd'
    if (n === 3) return '3rd'
    return n + 'th'
  }
  return (
    <>
      {top3.length > 0 && (
        <div className="lb-podium">
          {podiumOrder.map((entry, pi) => {
            const isMe = entry.id === userId
            return (
              <div key={entry.id} className={`lb-podium-slot ${podiumClasses[pi]} ${isMe ? 'lb-row-me' : ''}`}>
                <span className="lb-podium-medal">{podiumMedals[pi]}</span>
                <div className="lb-podium-avatar">
                  {entry.avatar
                    ? <img src={entry.avatar} alt="" />
                    : <span className="lb-avatar-empty">?</span>
                  }
                </div>
                <span className="lb-podium-name">{entry.name}{isMe ? ' (You)' : ''}</span>
                <span className="lb-podium-pts">{entry.points} pts</span>
              </div>
            )
          })}
        </div>
      )}
      {entries.length > 0 && (
        <div className="lb-list">
          {entries.map((entry, i) => {
            const rank = i + 1
            const isMe = entry.id === userId
            return (
              <div
                key={entry.id}
                className={`lb-row ${isMe ? 'lb-row-me' : ''}`}
                style={{ animationDelay: `${(i + 1) * 0.06}s` }}
              >
                <span className="lb-rank">{rankSuffix(rank)}</span>
                <span className="lb-avatar">
                  {entry.avatar
                    ? <img src={entry.avatar} alt="" className="lb-avatar-img" />
                    : <span className="lb-avatar-empty">?</span>
                  }
                </span>
                <span className="lb-name">{entry.name}{isMe ? ' (You)' : ''}</span>
                <span className="lb-points">{entry.points} pts</span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function Portal({ user, onLogout }) {
  // Start downloading the dojo background now so the dojo opens instantly.
  useEffect(() => { preloadDojoWallpapers() }, [])
  const [activeTab, setActiveTab] = useState(null)
  const [scoreValue, setScoreValue] = useState('')
  const [selectedEvent, setSelectedEvent] = useState('')
  const [scoreError, setScoreError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [showShop, setShowShop] = useState(false)
  // Parent message links open ?report=<courseId> (after the normal login).
  const [reportLink] = useState(() => { try { return new URLSearchParams(window.location.search).get('report') } catch { return null } })
  const [showReport, setShowReport] = useState(() => !!reportLink)
  const [showQuiz, setShowQuiz] = useState(false)
  const [quizNav, setQuizNav] = useState(null)
  const [showHomework, setShowHomework] = useState(false)
  const [homeworkNav, setHomeworkNav] = useState(null)
  const [showDojo, setShowDojo] = useState(false)
  const [showBattlegrounds, setShowBattlegrounds] = useState(false)
  const [showVocab, setShowVocab] = useState(false)
  const [rankTab, setRankTab] = useState('test')
  const [showPastLb, setShowPastLb] = useState(null)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showScorePopup, setShowScorePopup] = useState(null)
  const [showUnlockPopup, setShowUnlockPopup] = useState(false)
  const [lightMode, setLightMode] = useState(() => localStorage.getItem('theme') === 'light')
  const [themeFading, setThemeFading] = useState(false)
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en')
  const T = {
    greeting: { en: 'Hey', zh: '你好' },
    help: { en: '? Help', zh: '? 帮助' },
    shop: { en: 'Shop', zh: '商店' },
    logOut: { en: 'Log Out', zh: '登出' },
    today: { en: 'Today', zh: '今天' },
    toDo: { en: 'To Do', zh: '待办事项' },
    recentlyCompleted: { en: 'Recently Completed', zh: '最近完成' },
    overdue: { en: 'Overdue', zh: '已逾期' },
    noCompleted: { en: 'No completed assignments yet', zh: '暂无已完成作业' },
    leaderboards: { en: 'Leaderboards', zh: '排行榜' },
    addTestScore: { en: 'Add Test Score', zh: '添加考试成绩' },
    myProgress: { en: 'My Progress', zh: '我的进度' },
    portals: { en: 'Portals', zh: '入口' },
    assignments: { en: 'Assignments', zh: '作业' },
    checkpointTests: { en: 'Checkpoint Tests', zh: '阶段测试' },
    revisionDojo: { en: 'Revision Hall', zh: '复习大厅' },
    battlegrounds: { en: 'Battlegrounds', zh: '竞技场' },
    vocabBank: { en: 'Vocabulary Bank', zh: '词汇库' },
    myReports: { en: 'My Reports', zh: '我的报告' },
    locked: { en: 'Locked', zh: '已锁定' },
    back: { en: 'Back', zh: '返回' },
    nothingDue: { en: 'Nothing due — all caught up!', zh: '没有待办 — 全部完成！' },
  }
  const t = (key) => T[key]?.[lang] || T[key]?.en || key
  const [coinAnim, setCoinAnim] = useState(null)
  const [banner, setBanner] = useState(null)
  const [soundMuted, setSoundMuted] = useState(() => isMuted())
  const [playingTrack, setPlayingTrack] = useState(() => getCurrentTrackId())
  const [showJukebox, setShowJukebox] = useState(false)
  const [helpStep, setHelpStep] = useState(-1)
  const [activeNewsPost, setActiveNewsPost] = useState(null)

  const dailyQuote = useMemo(() => {
    const seed = new Date().toDateString() + (user?.id || '')
    let h = 0
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
    return QUOTES[Math.abs(h) % QUOTES.length]
  }, [user?.id])

  useEffect(() => {
    const unsub = onDataChange(() => setRefresh(r => r + 1))
    return unsub
  }, [])

  useEffect(() => {
    const unsub = onBroadcast((message) => {
      setBanner(message)
      const timer = setTimeout(() => setBanner(null), 5000)
      return () => clearTimeout(timer)
    })
    return unsub
  }, [])

  useEffect(() => {
    function handleClick(e) {
      if (e.target.closest('button, .btn, .shop-item, .portal-card, [role="button"], .hw-course-card, .hw-quiz-card, .qt-option')) playClick()
    }
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [])

  function handleToggleMute() {
    const nowMuted = toggleMute()
    setSoundMuted(nowMuted)
    if (nowMuted && playingTrack) { stopTrack(); setPlayingTrack(null) }
  }

  function handlePlayTrack(trackId) {
    if (getCurrentTrackId() === trackId) { stopTrack(); setPlayingTrack(null) }
    else { playTrack(trackId); setPlayingTrack(trackId) }
  }

  function handleNextTrack() {
    const owned = getPurchasedTracks(user.id)
    if (owned.length === 0) return
    const idx = owned.indexOf(playingTrack)
    const next = owned[(idx + 1) % owned.length]
    playTrack(next)
    setPlayingTrack(next)
  }

  const student = getStudentById(user.id)
  const classes = getClassesForStudent(user.id).sort((a, b) => a.name.localeCompare(b.name))
  const org = getOrganisation(user.orgId)
  const activeTerm = getActiveTerm(user.orgId)

  const leaderboard = useMemo(() => activeTab ? getLeaderboard(activeTab, activeTerm) : [], [activeTab, activeTerm, refresh])
  const homeworkLb = useMemo(() => activeTab ? getHomeworkLeaderboard(activeTab, activeTerm) : [], [activeTab, activeTerm, refresh])
  const testEvents = useMemo(() => activeTab ? getTestEventsForClass(activeTab).filter(e => !e.term || e.term === activeTerm) : [], [activeTab, activeTerm, refresh])
  const homeworkWeekly = useMemo(() => activeTab ? getHomeworkWeeklyStats(activeTab, user.id) : [], [activeTab, user.id, refresh])

  const pendingQuizCount = useMemo(() => {
    let count = 0
    for (const cls of classes) {
      for (const topic of getTopicsForClass(cls.id)) {
        for (const quiz of getQuizzesForTopic(topic.id)) {
          if (isQuizUnlocked(quiz.id, user.id) && !getAttemptForQuiz(quiz.id, user.id)) count++
        }
      }
    }
    return count
  }, [classes, user.id, refresh])

  const homeworkStatus = useMemo(() => getPendingHomeworkCount(user.id), [user.id, refresh])
  const newCourseCount = useMemo(() => getNewCourseCount(user.id), [user.id, refresh])
  const dojoDueCount = useMemo(() => getDueDojoCards(user.id).length, [user.id, refresh])
  const feedData = useMemo(() => getStudentFeedData(user.id), [user.id, refresh])
  const newsfeed = useMemo(() => getSchoolNewsfeed(user.orgId), [user.orgId, refresh])

  const ownedTracks = getPurchasedTracks(user.id)
  const hasJukebox = ownedTracks.length > 0
  const muteBtn = <div className="top-right-controls">
    <button className={`jukebox-btn ${hasJukebox ? '' : 'jukebox-btn-disabled'}`} onClick={() => { if (hasJukebox) setShowJukebox(v => !v) }} title={hasJukebox ? 'Jukebox' : 'No tracks purchased'}>🎵</button>
    {showJukebox && hasJukebox && <div className="jukebox-dropdown">
      <div className="jukebox-dropdown-title">Jukebox</div>
      {ownedTracks.map(tid => {
        const tr = MUSIC_TRACKS.find(t => t.id === tid)
        if (!tr) return null
        const isPlaying = playingTrack === tid
        return <button key={tid} className={`jukebox-track ${isPlaying ? 'jukebox-track-active' : ''}`} onClick={() => { handlePlayTrack(tid); setShowJukebox(false) }}>
          <span>{tr.emoji}</span><span className="jukebox-track-name">{tr.name}</span>{isPlaying && <span className="jukebox-playing">♪</span>}
        </button>
      })}
      {playingTrack && <button className="jukebox-stop" onClick={() => { stopTrack(); setPlayingTrack(null); setShowJukebox(false) }}>⏹ Stop</button>}
    </div>}
    {showJukebox && hasJukebox && <div className="jukebox-overlay" onClick={() => setShowJukebox(false)} />}
    <button className="sound-mute-btn" onClick={handleToggleMute} title={soundMuted ? 'Unmute' : 'Mute'}>{soundMuted ? '\u{1F507}' : '\u{1F50A}'}</button>
  </div>

  const themeWrap = lightMode ? 'theme-light' : ''
  if (showBattlegrounds) return <div className={themeWrap}>{muteBtn}<Battlegrounds user={user} onBack={() => setShowBattlegrounds(false)} /></div>
  if (showDojo) return <div className={themeWrap}>{muteBtn}<RevisionDojo user={user} onBack={() => setShowDojo(false)} onNavigateToQuiz={(nav) => { setShowDojo(false); setHomeworkNav(nav); setShowHomework(true) }} /></div>
  if (showHomework) return <div className={themeWrap}>{muteBtn}<HomeworkDashboard user={user} onBack={() => { setShowHomework(false); setHomeworkNav(null) }} initialNav={homeworkNav} /></div>
  if (showQuiz) return <div className={themeWrap}>{muteBtn}<QuizDashboard user={user} onBack={() => { setShowQuiz(false); setQuizNav(null) }} initialNav={quizNav} /></div>
  if (showReport) return <div className={themeWrap}>{muteBtn}<ReportPage studentId={user.id} initialCourseId={reportLink && reportLink !== 'all' ? reportLink : null} onBack={() => { setShowReport(false); if (reportLink) window.history.replaceState(null, '', window.location.pathname) }} /></div>
  if (showShop) return <div className={themeWrap}>{muteBtn}<Shop user={user} onBack={() => setShowShop(false)} /></div>
  if (showVocab) return <div className={themeWrap}>{muteBtn}<VocabularyBank user={user} onBack={() => setShowVocab(false)} /></div>

  if (activeNewsPost) return (
    <div className={`portal-page ${themeWrap}`}>
      {muteBtn}
      <div className="portal-inner">
        <div className="news-article-page">
          <button className="btn btn-outline" style={{ alignSelf: 'flex-start', marginBottom: 24 }} onClick={() => setActiveNewsPost(null)}>Back</button>
          <div className="news-article-card">
            <div className="news-article-header" style={{ borderLeftColor: activeNewsPost.color || '#42a5f5' }}>
              <span className="news-article-icon">{activeNewsPost.icon}</span>
              <h1 className="news-article-title">{activeNewsPost.title}</h1>
            </div>
            <div className="news-article-meta">
              <span>Posted {(() => {
                const diff = Date.now() - new Date(activeNewsPost.date).getTime()
                const mins = Math.floor(diff / 60000)
                if (mins < 60) return `${mins}m ago`
                const hrs = Math.floor(mins / 60)
                if (hrs < 24) return `${hrs}h ago`
                return `${Math.floor(hrs / 24)}d ago`
              })()}</span>
              <span>&bull;</span>
              <span>{activeNewsPost.views || 0} views</span>
            </div>
            <p className="news-article-body">{activeNewsPost.body}</p>
            <div className="news-article-footer">
              <span className="news-article-stat">&#9650; {activeNewsPost.upvotes || 0} upvotes</span>
            </div>
          </div>
          {newsfeed.filter(p => p.id !== activeNewsPost.id).length > 0 && (
            <>
              <h2 className="news-article-more-title">More News</h2>
              <div className="news-article-more">
                {newsfeed.filter(p => p.id !== activeNewsPost.id).map(post => (
                  <div key={post.id} className="news-article-more-card" style={{ borderLeftColor: post.color || '#42a5f5', cursor: 'pointer' }} onClick={() => setActiveNewsPost(post)}>
                    <span className="news-article-more-icon">{post.icon}</span>
                    <div>
                      <span className="news-article-more-name">{post.title}</span>
                      <span className="news-article-more-desc">{post.body}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )

  function handleAddScore(e) {
    e.preventDefault()
    const value = parseInt(scoreValue, 10)
    if (isNaN(value) || value <= 0) return
    if (!selectedEvent) {
      setScoreError('Select a test event first.')
      return
    }
    const ev = testEvents.find((te) => te.id === selectedEvent)
    if (ev && ev.totalMarks && value > ev.totalMarks) {
      setShowScorePopup(`Exceeded maximum score! This event has a maximum of ${ev.totalMarks} marks.`)
      setScoreValue('')
      return
    }
    addScore(user.id, activeTab, value, selectedEvent)
    setCoinAnim(value * 10)
    playCoinSound()
    setTimeout(() => setCoinAnim(null), 3000)
    setScoreValue('')
    setSelectedEvent('')
    setScoreError('')
    setShowUnlockPopup(true)
    setRefresh((r) => r + 1)
  }

  return (
    <div className={`portal-page ${lightMode ? 'theme-light' : ''} ${lang === 'zh' ? 'lang-zh' : ''}`}>
      {themeFading && <div className="theme-fade-overlay" />}
      {banner && <div className="broadcast-banner">{banner}</div>}

      {/* Coin Earn Animation */}
      {coinAnim && (
        <>
          <div className="coin-anim-overlay">
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} className="coin-anim-coin" style={{
                left: `${10 + Math.random() * 80}%`,
                animationDelay: `${Math.random() * 0.6}s`,
                animationDuration: `${1.4 + Math.random() * 1}s`,
                fontSize: `${1.2 + Math.random() * 0.8}rem`,
              }}>$</div>
            ))}
          </div>
          <div className="coin-anim-banner">
            <span className="coin-anim-plus">+{coinAnim}</span>
            <img src="/coin.png" alt="" className="coin-anim-icon" />
          </div>
        </>
      )}
      <div className="portal-inner">
        <ClockBar logo={org?.logo || '/logo.svg'} />

        {/* Header */}
        <div className="portal-header">
          <div className="portal-header-left" data-help="profile">
            <div className="portal-avatar-box">
              {student?.avatar ? (<>
                {(() => { const av = student.unlockedAvatars?.find(a => a.url === student.avatar); return av && av.stars >= 2 ? <div className={`portal-avatar-particles portal-avatar-particles-${av.rarity}`} /> : null })()}
                <img src={student.avatar} alt="" />
                {(() => { const av = student.unlockedAvatars?.find(a => a.url === student.avatar); return av && av.stars >= 2 ? <span className="portal-avatar-star-pips">{'★'.repeat(av.stars)}</span> : null })()}
              </>) : <span className="portal-avatar-placeholder">👤</span>}
            </div>
            <div>
              <h1 className="portal-greeting">{t('greeting')}, {student.name}!</h1>
              <div className="portal-quote-inline">
                <p className="portal-quote-text">{dailyQuote.text}</p>
                <p className="portal-quote-author">— {dailyQuote.author}</p>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn-help-icon" onClick={() => setHelpStep(0)} title={t('help')}>
                {t('help')}
              </button>
              <button className="btn-shop-icon" data-help="shop" onClick={() => setShowShop(true)}>
                <svg viewBox="0 0 24 24" className="shop-icon-svg">
                  <path d="M4 7h16l-1.5 9H5.5L4 7z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  <path d="M4 7L6 3h12l2 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  <line x1="12" y1="7" x2="12" y2="3" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="9" cy="19" r="1.5" fill="currentColor" />
                  <circle cx="15" cy="19" r="1.5" fill="currentColor" />
                </svg>
                {t('shop')}
              </button>
              <button className="btn-logout" onClick={() => setShowLogoutConfirm(true)}>{t('logOut')}</button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className={`theme-switch ${lightMode ? 'theme-switch-light' : ''}`} onClick={() => {
                if (themeFading) return
                setThemeFading(true)
                setTimeout(() => {
                  const next = !lightMode
                  setLightMode(next)
                  localStorage.setItem('theme', next ? 'light' : 'dark')
                }, 250)
                setTimeout(() => setThemeFading(false), 600)
              }}>
                <span className="theme-switch-label theme-switch-dark">🌙</span>
                <span className="theme-switch-label theme-switch-light-label">☀️</span>
                <span className="theme-switch-knob" />
              </div>
              <div className={`lang-switch ${lang === 'zh' ? 'lang-switch-zh' : ''}`} onClick={() => {
                const next = lang === 'en' ? 'zh' : 'en'
                setLang(next)
                localStorage.setItem('lang', next)
              }}>
                <span className="lang-switch-label lang-switch-en">EN</span>
                <span className="lang-switch-label lang-switch-zh-label">中</span>
                <span className="lang-switch-knob" />
              </div>
            </div>
          </div>
        </div>

        {/* News Ticker */}
        {newsfeed.length > 0 && (
          <div className="portal-ticker-wrap" data-help="ticker">
            <div className="portal-ticker-track">
              {[...newsfeed, ...newsfeed].map((post, i) => (
                <span key={i} className="portal-ticker-item" style={{ cursor: 'pointer' }} onClick={() => setActiveNewsPost(post)}>
                  <span className="portal-ticker-icon">{post.icon}</span>
                  <span className="portal-ticker-title">{post.title}</span>
                  <span className="portal-ticker-body">{post.body}</span>
                  <span className="portal-ticker-sep" />
                </span>
              ))}
            </div>
          </div>
        )}

        {/* === SECTION: TODAY === */}
        <div data-help="today">
        <p className="pixel-heading portal-section-heading">{t('today')}</p>
        <div className="portal-feed-row">
          {/* Left: To Do List */}
          <div className="portal-feed-col">
            <p className="portal-feed-label">{t('toDo')}</p>
            {feedData.dueAssignments.length > 0 ? (
              <div className="portal-todo-scroll">
                {feedData.dueAssignments.slice(0, 2).map(a => (
                  <div key={a.id} className={`portal-feed-item ${a.overdue ? 'portal-feed-overdue' : 'portal-feed-pending'}`} style={{ cursor: 'pointer' }} onClick={() => {
                    setHomeworkNav({ courseId: a.courseId, moduleId: a.moduleId, quizSetId: a.id })
                    setShowHomework(true)
                  }}>
                    <span className="portal-feed-icon">{a.overdue ? '🔴' : '📝'}</span>
                    <div className="portal-feed-text">
                      <span className="portal-feed-name">{a.name}</span>
                      <span className="portal-feed-meta">{a.course} — {a.module}</span>
                    </div>
                    {a.overdue && <span className="portal-feed-tag portal-feed-tag-overdue">{t('overdue')}</span>}
                    <span className="portal-todo-go">GO ▶</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="portal-feed-cat">
                <p className="portal-feed-cat-text">{t('nothingDue')}</p>
                <div className="portal-cat-floor">
                  <div className="portal-cat-walker">
                    <svg viewBox="0 0 64 40" className="portal-cat-svg" xmlns="http://www.w3.org/2000/svg">
                      {/* Tail */}
                      <path className="portal-cat-tail" d="M8,20 Q2,10 6,4" fill="none" stroke="var(--cat-color)" strokeWidth="2.5" strokeLinecap="round" />
                      {/* Body */}
                      <ellipse cx="28" cy="22" rx="18" ry="10" fill="var(--cat-color)" />
                      {/* Head */}
                      <circle cx="48" cy="18" r="10" fill="var(--cat-color)" />
                      {/* Ears */}
                      <polygon points="41,10 43,2 47,9" fill="var(--cat-color)" />
                      <polygon points="51,9 55,2 57,10" fill="var(--cat-color)" />
                      <polygon points="42,9 44,4 46,9" fill="var(--cat-ear)" />
                      <polygon points="52,9 54,4 56,9" fill="var(--cat-ear)" />
                      {/* Eyes */}
                      <ellipse cx="45" cy="17" rx="1.8" ry="2" fill="var(--cat-eye)" />
                      <ellipse cx="52" cy="17" rx="1.8" ry="2" fill="var(--cat-eye)" />
                      <circle cx="45.5" cy="16.5" r="0.7" fill="#fff" />
                      <circle cx="52.5" cy="16.5" r="0.7" fill="#fff" />
                      {/* Nose + mouth */}
                      <ellipse cx="48.5" cy="21" rx="1.5" ry="1" fill="var(--cat-nose)" />
                      <path d="M47,23 Q48.5,25 50,23" fill="none" stroke="var(--cat-eye)" strokeWidth="0.8" strokeLinecap="round" />
                      {/* Whiskers */}
                      <line x1="38" y1="19" x2="43" y2="20" stroke="var(--cat-whisker)" strokeWidth="0.6" />
                      <line x1="38" y1="22" x2="43" y2="22" stroke="var(--cat-whisker)" strokeWidth="0.6" />
                      <line x1="54" y1="20" x2="59" y2="19" stroke="var(--cat-whisker)" strokeWidth="0.6" />
                      <line x1="54" y1="22" x2="59" y2="22" stroke="var(--cat-whisker)" strokeWidth="0.6" />
                      {/* Legs */}
                      <rect className="portal-cat-leg-fl" x="34" y="30" width="3.5" height="9" rx="1.5" fill="var(--cat-color)" />
                      <rect className="portal-cat-leg-fr" x="40" y="30" width="3.5" height="9" rx="1.5" fill="var(--cat-color)" />
                      <rect className="portal-cat-leg-bl" x="16" y="30" width="3.5" height="9" rx="1.5" fill="var(--cat-color)" />
                      <rect className="portal-cat-leg-br" x="22" y="30" width="3.5" height="9" rx="1.5" fill="var(--cat-color)" />
                      {/* Belly stripe */}
                      <ellipse cx="28" cy="26" rx="12" ry="5" fill="var(--cat-belly)" />
                    </svg>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Recently Completed */}
          <div className="portal-feed-col">
            <p className="portal-feed-label">{t('recentlyCompleted')}</p>
            {feedData.recentCompleted.length > 0 ? (
              <div className="portal-completed-scroll">
                {feedData.recentCompleted.map(a => (
                  <div key={a.id} className="portal-feed-item portal-feed-done" onClick={() => {
                    if (a.source === 'progress') {
                      setQuizNav({ classId: a.classId, topicId: a.topicId, quizId: a.quizId })
                      setShowQuiz(true)
                    } else {
                      setHomeworkNav({ courseId: a.courseId, moduleId: a.moduleId, quizSetId: a.quizSetId })
                      setShowHomework(true)
                    }
                  }}>
                    <span className="portal-feed-icon">✅</span>
                    <div className="portal-feed-text">
                      <span className="portal-feed-name">{a.name}{a.isRedo ? ' (Redo)' : ''}</span>
                      {a.courseName && <span className="portal-feed-meta">{a.courseName}</span>}
                      <span className="portal-feed-meta">{a.score}/{a.total} ({a.total > 0 ? Math.round((a.score / a.total) * 100) : 0}%)</span>
                    </div>
                    <span className="portal-feed-arrow">›</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="portal-feed-item" style={{ justifyContent: 'center', borderLeftColor: 'transparent' }}>
                <span className="portal-feed-meta">{t('noCompleted')}</span>
              </div>
            )}
          </div>
        </div>
        </div>{/* end data-help=today */}

        {/* === SECTION: CLASSES === */}
        <div data-help="leaderboards">
        <p className="pixel-heading portal-section-heading">{t('leaderboards')}</p>
        {classes.length === 0 ? (
          <p className="text-dim">No classes assigned yet.</p>
        ) : (
          <div className="portal-class-grid">
            {classes.map((cls) => (
              <div key={cls.id} className={`portal-class-card-wrap ${activeTab === cls.id ? 'portal-class-card-wrap-active' : ''}`}>
                <div
                  className={`portal-class-card ${activeTab === cls.id ? 'portal-class-card-active' : ''}`}
                  onClick={() => setActiveTab(activeTab === cls.id ? null : cls.id)}
                >
                  <div className="portal-class-img" style={cls.image ? { backgroundImage: `url(${cls.image})` } : {}}>
                    {!cls.image && <span className="portal-class-placeholder">📖</span>}
                  </div>
                  <div className="portal-class-name" title={cls.name}>{cls.name}</div>
                </div>
                {activeTab === cls.id && <div className="portal-class-arrow" />}
              </div>
            ))}
          </div>
        )}

        {/* Active Class */}
        {activeTab && (
        <div className="portal-class-panel">
          <div className="portal-panel-header">
            {(() => {
              const cls = classes.find((c) => c.id === activeTab)
              return cls ? cls.name : ''
            })()}
            <span style={{ marginLeft: 12, opacity: 0.6 }}>{activeTerm}</span>
          </div>
          {/* Score Input */}
          <div className="portal-panel-section">
            <p className="pixel-heading">{t('addTestScore')}</p>
            {(() => {
              const studentScores = getScoresForStudentInClass(user.id, activeTab)
              const scoredEventIds = new Set(studentScores.map((s) => s.testEventId))
              const availableEvents = testEvents.filter((ev) => !scoredEventIds.has(ev.id))
              if (testEvents.length === 0) return <p className="text-dim">No test events yet. Your teacher will create them.</p>
              if (availableEvents.length === 0) return <p className="text-dim">All test scores submitted!</p>
              return (
              <form onSubmit={handleAddScore} className="score-form">
                <div className="event-btn-row">
                  {availableEvents.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      className={`event-btn ${selectedEvent === ev.id ? 'event-btn-active' : ''}`}
                      onClick={() => { setSelectedEvent(selectedEvent === ev.id ? '' : ev.id); setScoreError('') }}
                    >
                      {ev.name}
                    </button>
                  ))}
                </div>
                {selectedEvent && (() => {
                  const selEv = testEvents.find((te) => te.id === selectedEvent)
                  const maxMark = selEv && selEv.totalMarks ? selEv.totalMarks : null
                  return (
                  <div className="score-input-row">
                    <input
                      type="number"
                      value={scoreValue}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v !== '' && maxMark && parseInt(v, 10) > maxMark) {
                          setShowScorePopup(`Exceeded maximum score! This event has a maximum of ${maxMark} marks.`)
                          setScoreValue('')
                          return
                        }
                        setScoreValue(v)
                      }}
                      placeholder={maxMark ? `Max ${maxMark}` : 'Enter score'}
                      className="score-number-input"
                      min="1"
                      max={maxMark || undefined}
                    />
                    <button type="submit" className="btn">Add</button>
                  </div>
                  )
                })()}
              </form>
              )
            })()}
            {scoreError && <p className="error-text">{scoreError}</p>}
          </div>

          {/* Rankings Tabs */}
          <div className="portal-panel-tabs">
            <button className={`portal-panel-tab ${rankTab === 'test' ? 'portal-panel-tab-active' : ''}`} onClick={() => { setRankTab('test'); setShowPastLb(null) }}>
              Class Test Rankings
            </button>
            <button className={`portal-panel-tab ${rankTab === 'homework' ? 'portal-panel-tab-active' : ''}`} onClick={() => { setRankTab('homework'); setShowPastLb(null) }}>
              Assignment Rankings
            </button>
            <button className={`portal-panel-tab ${rankTab === 'past' ? 'portal-panel-tab-active' : ''}`} onClick={() => { setRankTab('past'); setShowPastLb(null) }}>
              Past Leaderboards
            </button>
          </div>

          <div className="portal-panel-section portal-panel-section-last">
            {rankTab === 'test' && (
              <>
                <p className="lb-title">
                  {classes.find((c) => c.id === activeTab)?.name} Testing Leaderboard — {activeTerm}
                </p>
                {leaderboard.length === 0 ? (
                  <p className="text-dim">No scores yet. Be the first!</p>
                ) : (
                  <LeaderboardDisplay entries={leaderboard} userId={user.id} />
                )}

                <p className="pixel-heading" style={{ marginTop: 24, marginBottom: 12 }}>{t('myProgress')}</p>
                <ProgressGraph
                  dataPoints={(() => {
                    const scores = getScoresForStudentInClass(user.id, activeTab).slice().sort((a, b) => new Date(a.date) - new Date(b.date))
                    const rankings = getRankingForStudentInClass(user.id, activeTab)
                    return scores.map((sc) => {
                      const ev = testEvents.find((e) => e.id === sc.testEventId)
                      const rankEntry = rankings.find((r) => r.eventId === sc.testEventId)
                      const pct = ev && ev.totalMarks ? Math.round((sc.value / ev.totalMarks) * 100) : sc.value
                      return {
                        date: sc.date,
                        value: pct,
                        label: ev ? ev.name : '',
                        rankLabel: rankEntry ? `#${rankEntry.rank} of ${rankEntry.totalStudents}` : undefined,
                      }
                    })
                  })()}
                />
              </>
            )}

            {rankTab === 'homework' && (
              <>
                <p className="lb-title">
                  {classes.find((c) => c.id === activeTab)?.name} HW Leaderboard — {activeTerm}
                </p>
                {homeworkLb.length === 0 ? (
                  <p className="text-dim">No assignment scores yet.</p>
                ) : (
                  <LeaderboardDisplay entries={homeworkLb} userId={user.id} />
                )}

                <p className="pixel-heading" style={{ marginTop: 24, marginBottom: 12 }}>{t('myProgress')}</p>
                <ProgressGraph
                  color="#16c784"
                  dataPoints={homeworkWeekly.map((hw) => ({
                    date: hw.date,
                    value: hw.value,
                    label: hw.moduleName,
                    rankLabel: `#${hw.rank} of ${hw.totalStudents}`,
                  }))}
                />
              </>
            )}

            {rankTab === 'past' && (() => {
              const snapshots = getPastLeaderboards(user.orgId)
              return snapshots.length === 0 ? (
                <p className="text-dim">No past leaderboard data yet. History is saved when the teacher switches terms.</p>
              ) : (
                <div>
                  {!showPastLb ? (
                    <div className="past-lb-term-list">
                      {snapshots.map(snap => (
                        <button key={snap.id} className="past-lb-term-btn" onClick={() => setShowPastLb(snap)}>
                          <span className="past-lb-term-name">{snap.term}</span>
                          <span className="past-lb-term-date">{new Date(snap.date).toLocaleDateString()}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <button className="dojo-back-to-list" onClick={() => setShowPastLb(null)} style={{ marginBottom: 16 }}>Back to terms</button>
                      <p className="lb-title">{showPastLb.term} — Final Standings</p>
                      {showPastLb.classes.map(cls => (
                        <div key={cls.classId} style={{ marginBottom: 24 }}>
                          <p className="pixel-heading" style={{ fontSize: '0.7rem', marginBottom: 8 }}>{cls.className}</p>
                          <p className="text-dim" style={{ fontSize: '0.65rem', marginBottom: 6 }}>Test Leaderboard</p>
                          <LeaderboardDisplay entries={cls.testLeaderboard.slice(0, 10)} userId={user.id} />
                          <p className="text-dim" style={{ fontSize: '0.65rem', marginBottom: 6, marginTop: 12 }}>HW Leaderboard</p>
                          <LeaderboardDisplay entries={cls.homeworkLeaderboard.slice(0, 10)} userId={user.id} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}
      </div>{/* end data-help=leaderboards */}

      {/* Action Buttons */}
      <p className="pixel-heading portal-section-heading" style={{ marginTop: 20 }}>{t('portals')}</p>
      <button className="btn-homework w-full mt-16" data-help="assignments" style={{ position: 'relative' }} onClick={() => setShowHomework(true)}>
        📚 {t('assignments')}
        {homeworkStatus.overdue > 0
          ? <span className="hw-badge-overdue">⏰ {homeworkStatus.overdue}</span>
          : (homeworkStatus.pending + newCourseCount) > 0
            ? <span className="hw-badge-warn">{homeworkStatus.pending + newCourseCount}</span>
            : null}
      </button>
      <button className="btn-progress-quiz w-full mt-16" data-help="checkpoints" style={{ position: 'relative' }} onClick={() => setShowQuiz(true)}>
        🎯 {t('checkpointTests')}
        {pendingQuizCount > 0 && <span className="quiz-alert-badge">{pendingQuizCount}</span>}
      </button>
      <button className="btn-dojo w-full mt-16" data-help="dojo" style={{ position: 'relative' }} onClick={() => setShowDojo(true)}>
        🥷🏻 {t('revisionDojo')}
        {dojoDueCount > 0 && <span className="hw-badge-warn">{dojoDueCount}</span>}
      </button>
      <button className="btn-vocab w-full mt-16" data-help="vocab" onClick={() => setShowVocab(true)}>
        🔤 {t('vocabBank')}
      </button>
      <button className="btn-battlegrounds w-full mt-16" data-help="battlegrounds" onClick={() => {
        if (student?.battlegroundsApproved) {
          setShowBattlegrounds(true)
        }
      }} style={!student?.battlegroundsApproved ? { opacity: 0.45, cursor: 'not-allowed' } : {}}>
        ⚔️ {t('battlegrounds')} {!student?.battlegroundsApproved && <span style={{ fontSize: '0.5rem', opacity: 0.7, marginLeft: 8 }}>🔒 {t('locked')}</span>}
      </button>
      <button className="btn-progress-tracker w-full mt-16" onClick={() => setShowReport(true)}>
        {t('myReports')}
      </button>

      {/* Help Walkthrough */}
      {helpStep >= 0 && (() => {
        const HELP_STEPS = [
          { selector: '[data-help="profile"]', title: 'Your Profile', desc: 'This is you! Your name and class are shown here.' },
          { selector: '[data-help="ticker"]', title: 'School News', desc: 'Announcements, tips and reminders from your school scroll here.' },
          { selector: '[data-help="today"]', title: 'Today', desc: 'Your pending assignments appear here. Red means overdue — complete these first! Completed quizzes show your score.' },
          { selector: '[data-help="leaderboards"]', title: 'Leaderboards', desc: 'See how you rank against classmates in each subject.' },
          { selector: '[data-help="assignments"]', title: 'Assignments', desc: 'All your homework and class quizzes, organised by course and week.' },
          { selector: '[data-help="checkpoints"]', title: 'Checkpoint Tests', desc: 'Formal tests set by your teacher. Timed and single-attempt.' },
          { selector: '[data-help="dojo"]', title: 'Revision Hall', desc: 'Review questions you got wrong. Master cards by getting 3 correct in a row. Earns tokens.' },
          { selector: '[data-help="battlegrounds"]', title: 'Battlegrounds', desc: 'Daily word games, live arena battles, and the Arcade.' },
          { selector: '[data-help="vocab"]', title: 'Vocabulary Bank', desc: 'Words you\'ve saved from quizzes. Study with flashcards and practice.' },
          { selector: '[data-help="shop"]', title: 'Shop', desc: 'Spend your coins here on avatars, eggs, and loot. Coins are earned by completing homework. Tokens are earned from revision, the Dojo, and vocabulary practice.' },
        ]
        const step = HELP_STEPS[helpStep]
        if (!step) { setHelpStep(-1); return null }
        const el = document.querySelector(step.selector)
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' })
        const rect = el ? el.getBoundingClientRect() : null
        const tooltipTop = rect
          ? (rect.height > window.innerHeight * 0.4
            ? Math.max(16, rect.top + rect.height / 2 - 80)
            : Math.min(rect.bottom + 16, window.innerHeight - 200))
          : null
        return (
          <div className="help-overlay" onClick={() => setHelpStep(-1)}>
            {rect && <div className="help-spotlight" style={{ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 }} />}
            <div className="help-tooltip" style={rect ? { top: tooltipTop, left: Math.max(16, Math.min(window.innerWidth / 2 - 170, window.innerWidth - 360)) } : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} onClick={e => e.stopPropagation()}>
              <p className="help-tooltip-title">{step.title}</p>
              <p className="help-tooltip-desc">{step.desc}</p>
              <div className="help-tooltip-nav">
                <span className="help-tooltip-count">{helpStep + 1} / {HELP_STEPS.length}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {helpStep > 0 && <button className="btn btn-outline" style={{ padding: '8px 20px', fontSize: '0.6rem' }} onClick={() => setHelpStep(helpStep - 1)}>Back</button>}
                  {helpStep < HELP_STEPS.length - 1 ? (
                    <button className="btn" style={{ padding: '8px 20px', fontSize: '0.6rem' }} onClick={() => setHelpStep(helpStep + 1)}>Next</button>
                  ) : (
                    <button className="btn" style={{ padding: '8px 20px', fontSize: '0.6rem' }} onClick={() => setHelpStep(-1)}>Done</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Progress test unlocked popup */}
      {showUnlockPopup && (
        <div className="neon-overlay">
          <div className="neon-popup unlock-popup">
            <div className="unlock-icon">🔓</div>
            <p className="unlock-title">PROGRESS TEST UNLOCKED</p>
            <p className="unlock-sub">A new quiz is now available!</p>
            <div className="neon-popup-actions" style={{ marginTop: 24 }}>
              <button className="btn" style={{ padding: '12px 36px' }} autoFocus onClick={() => setShowUnlockPopup(false)}>OK</button>
            </div>
          </div>
        </div>
      )}

      {/* Score exceeded popup */}
      {showScorePopup && (
        <div className="neon-overlay">
          <div className="neon-popup" style={{ maxWidth: 380 }}>
            <p className="neon-popup-text" style={{ fontSize: '0.85rem', color: 'var(--danger)', marginBottom: 16 }}>
              {showScorePopup}
            </p>
            <div className="neon-popup-actions">
              <button className="btn" style={{ padding: '10px 32px' }} autoFocus onClick={() => setShowScorePopup(null)}>OK</button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirm */}
      {showLogoutConfirm && (
        <div className="modal-overlay">
          <div className="modal">
            <p className="modal-text">Are you sure you want to log out?</p>
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={onLogout}>Log Out</button>
              <button className="btn btn-outline" onClick={() => setShowLogoutConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Mute Button */}
      {muteBtn}


      </div>
    </div>
  )
}

export default Portal
