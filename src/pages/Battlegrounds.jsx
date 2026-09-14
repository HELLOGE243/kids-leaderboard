import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getStudentById, getBattlegroundsOnlineCount, pingBattlegroundsPresence, hasDailyTriviaBeenAnswered, completeDailyTrivia, getDailyTrivia, setDailyTrivia, getDailyTriviaStats, getDailyGameState, getWordleHistory, getWordleSolveOrder, getWordleSolverCount, getArenaElo, getArenaTier, getArenaLeaderboard } from '../data/store.js'
import DailyWordle from './games/DailyWordle.jsx'
import DailyConnections from './games/DailyConnections.jsx'
import DailyWordHunt from './games/DailyWordHunt.jsx'
import Arena from './games/Arena.jsx'
import DutchGame from './games/DutchGame.jsx'
import QuizBlitz from './games/QuizBlitz.jsx'
import DailyVocabTrainer from './games/DailyVocabTrainer.jsx'

const DAILY_CHALLENGES = [
  { id: 'wordle', name: 'Wordle', icon: '🟩', desc: 'Guess the 5-letter word in 6 tries', reward: '10 coins', color: '#538d4e' },
  { id: 'connections', name: 'Connections', icon: '🔗', desc: 'Find 4 groups of synonyms', reward: '10 coins', color: '#b59f3b' },
  { id: 'wordhunt', name: 'Word Hunt', icon: '🔍', desc: 'Drag to trace words in a 4×4 grid', reward: '10 coins', color: '#4ecdc4' },
  { id: 'vocabtrainer', name: 'Vocab Trainer', icon: '📖', desc: 'Learn words and fill the passage', reward: '10 coins', color: '#6a5acd' },
]

const LIVE_ARENAS = [
  { id: 'maths', name: 'Maths Arena', icon: '➕', desc: 'Speed solve maths problems head-to-head', color: '#e94560', entry: '1 Token', bg: 'linear-gradient(135deg, #1a0a2e 0%, #3d0f3d 50%, #e94560 100%)' },
  { id: 'comprehension', name: 'Comprehension Arena', icon: '📖', desc: 'Reading passages, inference & vocabulary duels', color: '#00d4aa', entry: '1 Token', bg: 'linear-gradient(135deg, #0a1628 0%, #0d3b3b 50%, #00d4aa 100%)', subs: ['Inference', 'Vocabulary', 'Cloze'] },
  { id: 'general', name: 'General Ability Arena', icon: '🧠', desc: 'Logic, patterns & spatial reasoning battles', color: '#ffd700', entry: '1 Token', bg: 'linear-gradient(135deg, #1a1a0a 0%, #3d3d0f 50%, #ffd700 100%)' },
  { id: 'arcade', name: 'Arcade', icon: '🕹️', desc: 'Card games, quiz battles & party games', color: '#a86eff', entry: '2 Tokens', bg: 'linear-gradient(135deg, #1a0a28 0%, #2d1050 50%, #a86eff 100%)', isArcade: true },
]

const MINIGAMES = [
  { id: 'dutch', name: 'Dutch', icon: '🃏', desc: 'Discard your hand — lowest total wins! Memory & strategy.', players: '4', color: '#2e7d32', playable: true },
  { id: 'quizblitz', name: 'Quiz Blitz', icon: '⚡', desc: '1v1 quiz battle — answer fast for more points!', players: '2', color: '#3b82f6', playable: true },
  { id: 'bombparty', name: 'Bomb Party', icon: '💣', desc: 'Type a word with the given letters before the bomb explodes!', players: '2-4', color: '#e94560' },
  { id: 'pictionary', name: 'Pictionary', icon: '🎨', desc: 'Draw the word and race to guess what others are drawing!', players: '2-4', color: '#a86eff' },
]

function PlayerProfile({ userId, student, refresh, open, onToggle }) {
  if (!open) return null

  const wordleState = getDailyGameState(userId, 'wordle')
  const connState = getDailyGameState(userId, 'connections')
  const huntState = getDailyGameState(userId, 'wordhunt')
  const triviaAnswered = hasDailyTriviaBeenAnswered(userId)

  const vocabState = getDailyGameState(userId, 'vocabtrainer')
  const dailies = [
    { name: 'Wordle', icon: '🟩', done: !!wordleState?.gameOver },
    { name: 'Connections', icon: '🔗', done: !!connState?.gameOver },
    { name: 'Word Hunt', icon: '🔍', done: !!huntState?.gameOver },
    { name: 'Vocab', icon: '📖', done: !!vocabState?.gameOver },
    { name: 'Trivia', icon: '🧪', done: triviaAnswered },
  ]
  const dailyDone = dailies.filter(d => d.done).length

  const ARENAS = [
    { id: 'maths', name: 'Maths', icon: '➕', color: '#e94560' },
    { id: 'comprehension', name: 'Comprehension', icon: '📖', color: '#00d4aa' },
    { id: 'general', name: 'General Ability', icon: '🧠', color: '#ffd700' },
  ]

  const arenaStats = ARENAS.map(arena => {
    const { elo, tier } = getArenaElo(userId, arena.id)
    const lb = getArenaLeaderboard(arena.id)
    const rank = lb.findIndex(e => e.id === userId) + 1
    const entry = lb.find(e => e.id === userId)
    return { ...arena, elo, tier, rank: rank || null, wins: entry?.wins || 0, losses: entry?.losses || 0, total: lb.length }
  })

  const wordleHistory = getWordleHistory(userId)
  const wordleWinRate = wordleHistory.played > 0 ? Math.round((wordleHistory.won / wordleHistory.played) * 100) : 0

  return createPortal(
    <div className="bg-profile-overlay" onClick={onToggle}>
      <div className="bg-profile-panel" onClick={e => e.stopPropagation()}>
        <button className="bg-profile-close" onClick={onToggle}>✕</button>

        {/* Player header */}
        <div className="bg-sp-header">
          <div className="bg-sp-avatar">{student?.avatar ? <img src={student.avatar} alt="" /> : '👤'}</div>
          <div className="bg-sp-name">{student?.name || 'Player'}</div>
        </div>

        {/* Daily Challenges */}
        <div className="bg-sp-section-title">Today's Challenges</div>
        <div className="bg-sp-daily-row">
          {dailies.map(d => (
            <div key={d.name} className={`bg-sp-daily-chip ${d.done ? 'bg-sp-daily-done' : ''}`}>
              <span>{d.icon}</span>
              <span className="bg-sp-daily-label">{d.name}</span>
              {d.done && <span className="bg-sp-daily-check">✓</span>}
            </div>
          ))}
        </div>
        <div className="bg-sp-daily-summary">{dailyDone}/4 completed today</div>

        {/* Arena Rankings - Main Feature */}
        <div className="bg-sp-section-title">⚔️ Arena Rankings</div>
        <div className="bg-sp-arena-grid">
          {arenaStats.map(a => (
            <div key={a.id} className="bg-sp-arena-card" style={{ borderColor: a.color }}>
              <div className="bg-sp-arena-head">
                <span className="bg-sp-arena-icon">{a.icon}</span>
                <span className="bg-sp-arena-name">{a.name}</span>
              </div>
              <div className="bg-sp-arena-elo" style={{ color: a.tier.color }}>
                <span className="bg-sp-arena-tier-icon">{a.tier.icon}</span>
                <span>{a.elo}</span>
              </div>
              <div className="bg-sp-arena-tier">{a.tier.name}</div>
              <div className="bg-sp-arena-record">
                <span className="bg-sp-arena-w">{a.wins}W</span>
                <span className="bg-sp-arena-l">{a.losses}L</span>
              </div>
              {a.rank && <div className="bg-sp-arena-rank">#{a.rank} <span className="bg-sp-arena-of">of {a.total}</span></div>}
            </div>
          ))}
        </div>

        {/* Minigames / Wordle Stats */}
        <div className="bg-sp-section-title">🎮 Game Stats</div>
        <div className="bg-sp-mini-grid">
          <div className="bg-sp-mini-card">
            <div className="bg-sp-mini-head">🟩 Wordle</div>
            <div className="bg-sp-mini-stats">
              <div className="bg-sp-mini-stat"><span className="bg-sp-mini-num">{wordleHistory.played}</span><span className="bg-sp-mini-label">Played</span></div>
              <div className="bg-sp-mini-stat"><span className="bg-sp-mini-num">{wordleWinRate}%</span><span className="bg-sp-mini-label">Win Rate</span></div>
              <div className="bg-sp-mini-stat"><span className="bg-sp-mini-num">{wordleHistory.won}</span><span className="bg-sp-mini-label">Wins</span></div>
            </div>
          </div>
          <div className="bg-sp-mini-card">
            <div className="bg-sp-mini-head">🧪 Daily Trivia</div>
            <div className="bg-sp-mini-stats">
              <div className="bg-sp-mini-stat"><span className="bg-sp-mini-num">{triviaAnswered ? '✓' : '—'}</span><span className="bg-sp-mini-label">Today</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

function DailyTrivia({ userId }) {
  const [open, setOpen] = useState(false)
  const [trivia, setTrivia] = useState(() => getDailyTrivia())
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [result, setResult] = useState(null)
  const [answered, setAnswered] = useState(() => hasDailyTriviaBeenAnswered(userId))
  const [stats, setStats] = useState(null)

  useEffect(() => {
    const FALLBACK_TRIVIA = [
      { question: "What is the hardest natural substance on Earth?", options: ["Gold", "Diamond", "Iron", "Titanium"], correct: 1, category: "Science", explanation: "Diamond is the hardest known natural material, scoring 10 on the Mohs hardness scale." },
      { question: "Which planet in our solar system has the most moons?", options: ["Jupiter", "Saturn", "Neptune", "Uranus"], correct: 1, category: "Space", explanation: "Saturn has over 140 confirmed moons, more than any other planet." },
      { question: "What does the 'www' stand for in a website address?", options: ["World Wide Web", "Western Web Works", "Wire Woven Web", "World Web Window"], correct: 0, category: "Technology", explanation: "WWW stands for World Wide Web, invented by Tim Berners-Lee in 1989." },
      { question: "Which country invented paper?", options: ["Egypt", "Greece", "China", "India"], correct: 2, category: "History", explanation: "Paper was invented in China around 105 AD during the Han Dynasty." },
      { question: "What is the largest organ in the human body?", options: ["Heart", "Liver", "Brain", "Skin"], correct: 3, category: "Science", explanation: "Skin is the largest organ, covering about 2 square metres in adults." },
    ]

    async function fetchTrivia() {
      const existing = getDailyTrivia()
      if (existing) { setTrivia(existing); return }

      setLoading(true)
      try {
        const res = await fetch('/api/claude/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 400,
            messages: [{
              role: 'user',
              content: `Generate a single trivia question suitable for Year 6 students (age 11-12) that is slightly harder than average. Pick randomly from: science, history, cooking, chemistry, everyday life, general knowledge, geography, space, animals, inventions, or life advice.

Return ONLY valid JSON in this exact format, no other text:
{"question":"...","options":["A","B","C","D"],"correct":0,"category":"...","explanation":"..."}

correct is the 0-based index of the right answer. Keep the question engaging and the explanation brief (1 sentence). Make the wrong options plausible.`
            }]
          })
        })
        const data = await res.json()
        const text = data.content?.[0]?.text || ''
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          setDailyTrivia(parsed)
          setTrivia(parsed)
          setLoading(false)
          return
        }
      } catch (e) {
        console.error('Trivia fetch failed:', e)
      }
      const dayNum = new Date().getDate()
      const fallback = FALLBACK_TRIVIA[dayNum % FALLBACK_TRIVIA.length]
      setDailyTrivia(fallback)
      setTrivia(fallback)
      setLoading(false)
    }
    if (!trivia && !answered) fetchTrivia()
    if (answered && !trivia) {
      const existing = getDailyTrivia()
      if (existing) { setTrivia(existing); setStats(getDailyTriviaStats()) }
    }
  }, [])

  function handleOpen() {
    if (answered && !stats) setStats(getDailyTriviaStats())
    setOpen(!open)
  }

  function handleAnswer(idx) {
    if (selected !== null) return
    setSelected(idx)
    const correct = idx === trivia.correct
    setResult(correct)
    completeDailyTrivia(userId, correct, idx)
    setAnswered(true)
    setStats(getDailyTriviaStats())
  }

  const OPTION_COLORS = ['#e94560', '#00d4aa', '#ffd700', '#6a5acd']

  return (
    <div className="bg-trivia-wrap">
      <div className={`bg-trivia-banner ${open ? 'bg-trivia-banner-open' : ''} ${answered ? 'bg-trivia-banner-done' : ''}`} onClick={handleOpen}>
        <div className="bg-trivia-banner-glow" />
        <span className="bg-trivia-banner-icon">🧪</span>
        <div className="bg-trivia-banner-content">
          <span className="bg-trivia-banner-title">Daily Trivia</span>
          <span className="bg-trivia-banner-sub">
            {answered ? 'Completed!' : trivia ? `Today's topic: ${trivia.category}` : loading ? 'Loading...' : 'Tap to answer — earn a bonus token!'}
          </span>
        </div>
        <div className="bg-trivia-banner-reward">
          {answered ? (
            <span className="bg-trivia-banner-check">✓</span>
          ) : (
            <div className="bg-trivia-banner-token-badge">
              <img src="/token.png" alt="" style={{ width: 18, height: 18 }} />
              <span>+1</span>
            </div>
          )}
        </div>
        <span className={`bg-trivia-chevron ${open ? 'bg-trivia-chevron-open' : ''}`}>▾</span>
      </div>

      {open && !answered && (
        <div className="bg-trivia-panel">
          {loading && (
            <div className="bg-trivia-loading">
              <div className="bg-trivia-spinner" />
              <span>Generating today's question...</span>
            </div>
          )}

          {trivia && (
            <div className="bg-trivia-quiz">
              <div className="bg-trivia-category">{trivia.category}</div>
              <div className="bg-trivia-question">{trivia.question}</div>
              <div className="bg-trivia-options">
                {trivia.options.map((opt, i) => (
                  <button
                    key={i}
                    className={`bg-trivia-option ${selected === i ? (i === trivia.correct ? 'bg-trivia-correct' : 'bg-trivia-wrong') : ''} ${selected !== null && i === trivia.correct && selected !== i ? 'bg-trivia-correct' : ''}`}
                    onClick={() => handleAnswer(i)}
                    disabled={selected !== null}
                    style={{ '--opt-color': OPTION_COLORS[i] }}
                  >
                    <span className="bg-trivia-option-letter" style={{ background: OPTION_COLORS[i] }}>{String.fromCharCode(65 + i)}</span>
                    <span className="bg-trivia-option-text">{opt}</span>
                  </button>
                ))}
              </div>

              {selected !== null && (
                <div className={`bg-trivia-result ${result ? 'bg-trivia-result-correct' : 'bg-trivia-result-wrong'}`}>
                  <div className="bg-trivia-result-icon">{result ? '🎉' : '😔'}</div>
                  <div className="bg-trivia-result-text">
                    {result ? <>Correct! <span style={{ display: 'block', marginTop: 4, fontWeight: 700 }}><img src="/token.png" alt="" style={{ width: 16, height: 16, verticalAlign: 'middle', marginRight: 4 }} />+1 Token earned!</span></> : 'Not quite!'}
                  </div>
                  <div className="bg-trivia-explanation">{trivia.explanation}</div>
                  {stats && (
                    <div className="bg-trivia-stats">
                      <div className="bg-trivia-stats-header">{stats.pct}% of students got this right · {stats.total} answered</div>
                      <div className="bg-trivia-stats-bars">
                        {trivia.options.map((opt, i) => {
                          const isCorrect = i === trivia.correct
                          const isChosen = i === selected
                          return (
                            <div key={i} className="bg-trivia-stats-row">
                              <span className="bg-trivia-stats-label">{String.fromCharCode(65 + i)}</span>
                              <div className="bg-trivia-stats-bar-wrap">
                                <div
                                  className={`bg-trivia-stats-bar ${isCorrect ? 'bg-trivia-stats-bar-correct' : ''} ${isChosen && !isCorrect ? 'bg-trivia-stats-bar-wrong' : ''}`}
                                  style={{ width: `${Math.max(stats.choicePcts[i], 2)}%` }}
                                />
                              </div>
                              <span className="bg-trivia-stats-pct">{stats.choicePcts[i]}%</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {open && answered && trivia && (
        <div className="bg-trivia-panel">
          <div className="bg-trivia-quiz">
            <div className="bg-trivia-category">{trivia.category}</div>
            <div className="bg-trivia-question">{trivia.question}</div>
            <div className="bg-trivia-options">
              {trivia.options.map((opt, i) => (
                <button
                  key={i}
                  className={`bg-trivia-option ${i === trivia.correct ? 'bg-trivia-correct' : ''}`}
                  disabled
                  style={{ '--opt-color': OPTION_COLORS[i] }}
                >
                  <span className="bg-trivia-option-letter" style={{ background: OPTION_COLORS[i] }}>{String.fromCharCode(65 + i)}</span>
                  <span className="bg-trivia-option-text">{opt}</span>
                  {stats && <span className="bg-trivia-option-pct">{stats.choicePcts[i]}%</span>}
                </button>
              ))}
            </div>
            <div className="bg-trivia-explanation">{trivia.explanation}</div>
            {stats && (
              <div className="bg-trivia-stats">
                <div className="bg-trivia-stats-header">{stats.pct}% got this right · {stats.total} answered</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Battlegrounds({ user, onBack }) {
  const student = getStudentById(user.id)
  const [carouselIdx, setCarouselIdx] = useState(0)
  const [onlineCount, setOnlineCount] = useState(0)
  const [activeGame, setActiveGame] = useState(null)
  const [refresh, setRefresh] = useState(0)
  const [profileOpen, setProfileOpen] = useState(false)
  const [confirmGame, setConfirmGame] = useState(null)
  const [warnGame, setWarnGame] = useState(null)
  const [warnSkipChecked, setWarnSkipChecked] = useState(false)
  const intervalRef = useRef(null)

  function tryEnterGame(gameId, cost, label) {
    if (cost > 0) {
      setConfirmGame({ gameId, cost, label })
    } else {
      setActiveGame(gameId)
    }
  }

  function tryEnterDaily(gameId) {
    try {
      if (localStorage.getItem('bg-skip-daily-warning')) {
        setActiveGame(gameId)
        return
      }
    } catch {}
    setWarnGame(gameId)
    setWarnSkipChecked(false)
  }

  function confirmDailyEnter() {
    if (!warnGame) return
    if (warnSkipChecked) {
      try { localStorage.setItem('bg-skip-daily-warning', '1') } catch {}
    }
    setActiveGame(warnGame)
    setWarnGame(null)
  }

  function confirmEnter() {
    if (!confirmGame) return
    setActiveGame(confirmGame.gameId)
    setConfirmGame(null)
  }

  useEffect(() => {
    pingBattlegroundsPresence(user.id)
    setOnlineCount(getBattlegroundsOnlineCount(user.orgId))

    intervalRef.current = setInterval(() => {
      pingBattlegroundsPresence(user.id)
      setOnlineCount(getBattlegroundsOnlineCount(user.orgId))
    }, 30000)

    return () => clearInterval(intervalRef.current)
  }, [user.id, user.orgId])

  useEffect(() => {
    const t = setInterval(() => {
      setCarouselIdx(i => (i + 1) % LIVE_ARENAS.length)
    }, 5000)
    return () => clearInterval(t)
  }, [])

  const gameProps = { userId: user.id, onBack: () => { setActiveGame(null); setRefresh(r => r + 1) }, onWin: () => setRefresh(r => r + 1) }
  if (activeGame === 'wordle') return <DailyWordle {...gameProps} />
  if (activeGame === 'connections') return <DailyConnections {...gameProps} />
  if (activeGame === 'wordhunt') return <DailyWordHunt {...gameProps} />
  if (activeGame === 'vocabtrainer') return <DailyVocabTrainer {...gameProps} />
  if (activeGame === 'dutch') return <DutchGame userId={user.id} onBack={() => { setActiveGame(null); setRefresh(r => r + 1) }} />
  if (activeGame === 'quizblitz') return <QuizBlitz userId={user.id} onBack={() => { setActiveGame(null); setRefresh(r => r + 1) }} />
  if (activeGame?.startsWith('arena:')) return <Arena arenaId={activeGame.split(':')[1]} userId={user.id} onBack={() => { setActiveGame(null); setRefresh(r => r + 1) }} />

  if (activeGame === 'arcade') return (
    <div className="bg-page">
      <div className="bg-stars" />
      <div className="bg-stars bg-stars-2" />
      <div className="bg-stars bg-stars-3" />
      <div className="bg-header">
        <button className="btn btn-outline" onClick={() => setActiveGame(null)}>Back</button>
        <div>
          <div className="bg-title">Arcade</div>
          <span className="bg-subtitle">Card games, battles & party games</span>
        </div>
        <div className="bg-header-right">
          <div className="bg-token-display">
            <img src="/token.png" alt="" style={{ width: 18, height: 18 }} />
            <span>{student?.tokens ?? 0}</span>
          </div>
        </div>
      </div>
      <div className="bg-minigame-grid" style={{ marginTop: 24 }}>
        {MINIGAMES.map(g => (
          <div key={g.id} className={`bg-minigame-card ${!g.playable ? 'bg-minigame-locked' : ''}`} style={{ '--card-accent': g.color }}>
            {!g.playable && <div className="bg-minigame-lock-overlay"><span className="bg-minigame-lock-icon">🔒</span></div>}
            <div className="bg-minigame-icon">{g.icon}</div>
            <div className="bg-minigame-name">{g.name}</div>
            <div className="bg-minigame-desc">{g.desc}</div>
            <div className="bg-minigame-footer">
              <span className="bg-minigame-players">👥 {g.players}</span>
              <button className={`bg-minigame-play ${g.playable ? 'bg-minigame-playable' : ''}`} onClick={() => g.playable && tryEnterGame(g.id, 2, g.name)}>
                {g.playable ? 'Play' : 'Coming Soon'}
              </button>
            </div>
          </div>
        ))}
      </div>
      {confirmGame && createPortal(
        <div className="bg-confirm-overlay" onClick={() => setConfirmGame(null)}>
          <div className="bg-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="bg-confirm-icon">
              <img src="/token.png" alt="" style={{ width: 32, height: 32 }} />
            </div>
            <div className="bg-confirm-title">Enter {confirmGame.label}?</div>
            <div className="bg-confirm-cost">
              This will cost <strong>{confirmGame.cost} {confirmGame.cost === 1 ? 'token' : 'tokens'}</strong>
            </div>
            <div className="bg-confirm-balance">
              Your balance: <span style={{ color: 'var(--token)', fontWeight: 700 }}>{student?.tokens ?? 0} tokens</span>
            </div>
            {(student?.tokens ?? 0) < confirmGame.cost && (
              <div className="bg-confirm-warn">Not enough tokens!</div>
            )}
            <div className="bg-confirm-actions">
              <button className="btn btn-outline" onClick={() => setConfirmGame(null)}>Cancel</button>
              <button className="btn" onClick={confirmEnter} disabled={(student?.tokens ?? 0) < confirmGame.cost}>
                Spend {confirmGame.cost} {confirmGame.cost === 1 ? 'Token' : 'Tokens'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )

  return (
    <div className="bg-page">
      <div className="bg-stars" />
      <div className="bg-stars bg-stars-2" />
      <div className="bg-stars bg-stars-3" />

      {/* Header */}
      <div className="bg-header">
        <button className="btn btn-outline" onClick={onBack}>Back</button>
        <div>
          <div className="bg-title">Battlegrounds</div>
        </div>
        <div className="bg-header-right">
          <div className="bg-online-indicator">
            <span className="bg-online-dot" />
            <span className="bg-online-count">{onlineCount} online</span>
          </div>
          <div className="bg-profile-toggle-wrap">
            <button className={`bg-profile-toggle ${profileOpen ? 'bg-profile-toggle-active' : ''}`} onClick={() => setProfileOpen(p => !p)}>
              {student?.avatar ? <img src={student.avatar} alt="" /> : '👤'}
            </button>
            <PlayerProfile userId={user.id} student={student} refresh={refresh} open={profileOpen} onToggle={() => setProfileOpen(p => !p)} />
          </div>
          <div className="bg-token-display">
            <img src="/token.png" alt="" style={{ width: 18, height: 18 }} />
            <span>{student?.tokens ?? 0}</span>
          </div>
        </div>
      </div>

      {/* === DAILY TRIVIA BANNER === */}
      <DailyTrivia userId={user.id} />

      {/* === DAILY CHALLENGES === */}
      <div className="bg-section-header">
        <span className="bg-section-icon">📅</span>
        <span className="bg-section-title">Daily Challenges</span>
        <span className="bg-section-badge">Earn Coins</span>
      </div>
      <div className="bg-daily-grid">
        {DAILY_CHALLENGES.map(ch => {
          const done = getDailyGameState(user.id, ch.id)?.gameOver
          return (
            <div key={ch.id} className="bg-daily-card" style={{ '--card-accent': ch.color }}>
              <div className="bg-daily-icon">{ch.icon}</div>
              <div className="bg-daily-info">
                <div className="bg-daily-name">{ch.name}</div>
                <div className="bg-daily-desc">{ch.desc}</div>
              </div>
              <div className="bg-daily-reward">
                <img src="/coin.png" alt="" style={{ width: 14, height: 14 }} />
                {ch.reward}
              </div>
              <button className={`bg-daily-play ${done ? 'bg-daily-done' : ''}`} onClick={() => !done && tryEnterDaily(ch.id)}>
                {done ? '✓ Done' : 'Play'}
              </button>
            </div>
          )
        })}
      </div>

      {/* === LIVE CHALLENGES === */}
      <div className="bg-section-header">
        <span className="bg-section-icon">⚔️</span>
        <span className="bg-section-title">Live Challenges</span>
        <span className="bg-section-badge">Multiplayer</span>
      </div>
      <div className="bg-carousel-wrap">
        <button className="bg-carousel-arrow bg-carousel-prev" onClick={() => setCarouselIdx(i => (i - 1 + LIVE_ARENAS.length) % LIVE_ARENAS.length)}>‹</button>
        <div className="bg-carousel-track">
          {LIVE_ARENAS.map((arena, i) => {
            const offset = ((i - carouselIdx) + LIVE_ARENAS.length) % LIVE_ARENAS.length
            const isCenter = offset === 0
            const isLeft = offset === LIVE_ARENAS.length - 1
            const isRight = offset === 1
            return (
              <div
                key={arena.id}
                className={`bg-arena-card ${isCenter ? 'bg-arena-active' : ''} ${isLeft ? 'bg-arena-left' : ''} ${isRight ? 'bg-arena-right' : ''} ${!isCenter && !isLeft && !isRight ? 'bg-arena-hidden' : ''}`}
                style={{ background: arena.bg }}
              >
                <div className="bg-arena-icon">{arena.icon}</div>
                <div className="bg-arena-name">{arena.name}</div>
                <div className="bg-arena-desc">{arena.desc}</div>
                {arena.subs && (
                  <div className="bg-arena-subs">
                    {arena.subs.map(s => <span key={s} className="bg-arena-sub-tag">{s}</span>)}
                  </div>
                )}
                <button className="bg-arena-enter" style={{ '--arena-color': arena.color }} onClick={() => arena.isArcade ? setActiveGame('arcade') : tryEnterGame(`arena:${arena.id}`, 1, arena.name)}>{arena.isArcade ? 'Enter Arcade' : 'Enter Arena'}</button>
                <div className="bg-arena-entry">
                  {arena.isArcade ? <span>🎮</span> : <img src="/token.png" alt="" style={{ width: 14, height: 14 }} />}
                  {arena.isArcade ? 'Free Entry' : arena.entry}
                </div>
              </div>
            )
          })}
        </div>
        <button className="bg-carousel-arrow bg-carousel-next" onClick={() => setCarouselIdx(i => (i + 1) % LIVE_ARENAS.length)}>›</button>
        <div className="bg-carousel-dots">
          {LIVE_ARENAS.map((_, i) => (
            <button key={i} className={`bg-carousel-dot ${i === carouselIdx ? 'bg-carousel-dot-active' : ''}`} onClick={() => setCarouselIdx(i)} />
          ))}
        </div>
      </div>

      {confirmGame && createPortal(
        <div className="bg-confirm-overlay" onClick={() => setConfirmGame(null)}>
          <div className="bg-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="bg-confirm-icon">
              <img src="/token.png" alt="" style={{ width: 32, height: 32 }} />
            </div>
            <div className="bg-confirm-title">Enter {confirmGame.label}?</div>
            <div className="bg-confirm-cost">
              This will cost <strong>{confirmGame.cost} {confirmGame.cost === 1 ? 'token' : 'tokens'}</strong>
            </div>
            <div className="bg-confirm-balance">
              Your balance: <span style={{ color: 'var(--token)', fontWeight: 700 }}>{student?.tokens ?? 0} tokens</span>
            </div>
            {(student?.tokens ?? 0) < confirmGame.cost && (
              <div className="bg-confirm-warn">Not enough tokens!</div>
            )}
            <div className="bg-confirm-actions">
              <button className="btn btn-outline" onClick={() => setConfirmGame(null)}>Cancel</button>
              <button className="btn" onClick={confirmEnter} disabled={(student?.tokens ?? 0) < confirmGame.cost}>
                Spend {confirmGame.cost} {confirmGame.cost === 1 ? 'Token' : 'Tokens'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {warnGame && createPortal(
        <div className="bg-confirm-overlay" onClick={() => setWarnGame(null)}>
          <div className="bg-confirm-modal bg-warn-modal" onClick={e => e.stopPropagation()}>
            <div className="bg-warn-icon">⚠️</div>
            <div className="bg-confirm-title">Heads Up!</div>
            <div className="bg-warn-text">You only get <strong>one attempt</strong> per day.</div>
            <div className="bg-warn-text">Leaving mid-game will <strong>lock the challenge</strong> until tomorrow.</div>
            <label className="bg-warn-checkbox">
              <input type="checkbox" checked={warnSkipChecked} onChange={e => setWarnSkipChecked(e.target.checked)} />
              <span>Don't show this again</span>
            </label>
            <div className="bg-confirm-actions">
              <button className="btn btn-outline" onClick={() => setWarnGame(null)}>Cancel</button>
              <button className="btn" onClick={confirmDailyEnter}>Start Game</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default Battlegrounds
