import { useState, useEffect, useRef } from 'react'
import { getStudentById, spendTokens, addTokens, getArenaElo, updateArenaElo, getArenaTier, findGhostByElo, saveArenaGhost, saveArenaMatch } from '../../data/store.js'

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function generateMathQ() {
  const type = rand(0, 5)
  let question, answer
  switch (type) {
    case 0: { const a = rand(50, 999), b = rand(50, 999); question = `${a} + ${b}`; answer = a + b; break }
    case 1: { const a = rand(100, 999), b = rand(50, a); question = `${a} − ${b}`; answer = a - b; break }
    case 2: { const a = rand(3, 12), b = rand(3, 49); question = `${a} × ${b}`; answer = a * b; break }
    case 3: { const d = rand(3, 12), q = rand(5, 50); question = `${d * q} ÷ ${d}`; answer = q; break }
    case 4: { const p = [10, 20, 25, 50][rand(0, 3)]; const n = rand(2, 20) * (100 / p); question = `${p}% of ${n}`; answer = (p / 100) * n; break }
    case 5: { const a = rand(2, 9), b = rand(2, 9), c = rand(1, 20); question = `${a} × ${b} + ${c}`; answer = a * b + c; break }
  }
  const options = new Set([answer])
  while (options.size < 4) {
    const off = rand(1, Math.max(5, Math.floor(Math.abs(answer) * 0.15)))
    const wrong = answer + (Math.random() > 0.5 ? off : -off)
    if (wrong > 0 && wrong !== answer && !options.has(wrong)) options.add(wrong)
  }
  const shuffled = [...options].sort(() => Math.random() - 0.5)
  return { question, answer, options: shuffled, correctIdx: shuffled.indexOf(answer) }
}

function generateQuestions(count = 12) {
  return Array.from({ length: count }, () => generateMathQ())
}

const QUESTION_TIME = 12
const ARENA_NAMES = { maths: 'Maths Arena', comprehension: 'Comprehension Arena', general: 'General Ability Arena' }

function Arena({ arenaId, userId, onBack }) {
  const student = getStudentById(userId)
  const [phase, setPhase] = useState('confirm')
  const [playerLives, setPlayerLives] = useState(6)
  const [opponentLives, setOpponentLives] = useState(6)
  const [questions, setQuestions] = useState([])
  const [qIdx, setQIdx] = useState(0)
  const [timer, setTimer] = useState(QUESTION_TIME)
  const [ghost, setGhost] = useState(null)
  const [selected, setSelected] = useState(null)
  const [ghostAnswered, setGhostAnswered] = useState(false)
  const [damageAnim, setDamageAnim] = useState(null)
  const [result, setResult] = useState(null)
  const [eloResult, setEloResult] = useState(null)
  const [myRun, setMyRun] = useState([])
  const [introCount, setIntroCount] = useState(3)
  const timerRef = useRef(null)
  const ghostTimerRef = useRef(null)
  const qStartRef = useRef(0)
  const pLivesRef = useRef(6)
  const oLivesRef = useRef(6)
  const endedRef = useRef(false)

  const { elo, tier } = getArenaElo(userId, arenaId)

  function startFight() {
    if (!spendTokens(userId, 1)) return
    const qs = generateQuestions()
    setQuestions(qs)
    const g = findGhostByElo(arenaId, elo, userId)
    setGhost(g)
    endedRef.current = false
    pLivesRef.current = 6
    oLivesRef.current = 6
    setPhase('intro')
    let count = 3
    const iv = setInterval(() => {
      count--
      setIntroCount(count)
      if (count <= 0) {
        clearInterval(iv)
        setPhase('fight')
        qStartRef.current = Date.now()
      }
    }, 1000)
  }

  useEffect(() => {
    if (phase !== 'fight' || endedRef.current) return
    setTimer(QUESTION_TIME)
    setSelected(null)
    setGhostAnswered(false)
    qStartRef.current = Date.now()

    timerRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 1) {
          clearInterval(timerRef.current)
          clearTimeout(ghostTimerRef.current)
          if (!endedRef.current) advanceQuestion()
          return 0
        }
        return t - 1
      })
    }, 1000)

    if (ghost?.answers?.[qIdx]) {
      const ga = ghost.answers[qIdx]
      if (ga.correct) {
        ghostTimerRef.current = setTimeout(() => {
          if (endedRef.current) return
          setGhostAnswered(true)
          pLivesRef.current = pLivesRef.current - 1
          setPlayerLives(pLivesRef.current)
          setDamageAnim('player')
          setTimeout(() => setDamageAnim(null), 600)
          if (pLivesRef.current <= 0) endMatch('lose')
        }, ga.timeMs)
      }
    }

    return () => {
      clearInterval(timerRef.current)
      clearTimeout(ghostTimerRef.current)
    }
  }, [phase, qIdx])

  function handleAnswer(idx) {
    if (selected !== null || phase !== 'fight' || endedRef.current) return
    setSelected(idx)
    const timeMs = Date.now() - qStartRef.current
    const correct = idx === questions[qIdx].correctIdx

    setMyRun(run => [...run, { questionIdx: qIdx, correct, timeMs, selectedIdx: idx }])

    if (correct && !ghostAnswered) {
      clearInterval(timerRef.current)
      clearTimeout(ghostTimerRef.current)
      oLivesRef.current = oLivesRef.current - 1
      setOpponentLives(oLivesRef.current)
      setDamageAnim('opponent')
      setTimeout(() => {
        setDamageAnim(null)
        if (oLivesRef.current <= 0) endMatch('win')
        else if (!endedRef.current) advanceQuestion()
      }, 800)
    } else if (!correct) {
      setTimeout(() => {
        if (!endedRef.current) advanceQuestion()
      }, 1000)
    }
  }

  function advanceQuestion() {
    if (endedRef.current) return
    clearInterval(timerRef.current)
    clearTimeout(ghostTimerRef.current)
    const next = qIdx + 1
    if (next >= questions.length) {
      const o = oLivesRef.current, p = pLivesRef.current
      endMatch(o < p ? 'win' : p < o ? 'lose' : 'draw')
    } else {
      setQIdx(next)
    }
  }

  function endMatch(outcome) {
    if (endedRef.current) return
    endedRef.current = true
    clearInterval(timerRef.current)
    clearTimeout(ghostTimerRef.current)
    setPhase('result')
    setResult(outcome)

    const ghostElo = ghost?.elo || 1000
    const won = outcome === 'win'

    saveArenaGhost(arenaId, {
      studentId: userId,
      studentName: student?.name || 'Player',
      studentAvatar: student?.avatar || null,
      elo,
      answers: myRun
    })

    if (ghost) {
      const { elo: newElo, change } = updateArenaElo(userId, arenaId, ghostElo, won)
      setEloResult({ newElo, change, oldElo: elo, opponentElo: ghostElo })
      saveArenaMatch(userId, arenaId, {
        date: new Date().toISOString(),
        opponent: ghost.studentName,
        opponentElo: ghostElo,
        result: outcome,
        playerLives: pLivesRef.current,
        opponentLives: oLivesRef.current,
        eloChange: change,
        newElo
      })
      if (won) addTokens(userId, 2)
    }
  }

  const opponentName = ghost?.studentName || 'No Opponent'
  const opponentAvatar = ghost?.studentAvatar || null
  const opponentTier = ghost ? getArenaTier(ghost.elo) : null

  if (phase === 'confirm') {
    const history = (() => {
      try {
        const raw = localStorage.getItem('leaderboard_data')
        if (!raw) return []
        const data = JSON.parse(raw)
        const s = data.students[userId]
        return (s?.arenaHistory?.[arenaId] || []).slice(-5).reverse()
      } catch { return [] }
    })()

    return (
      <div className="game-page arena-page">
        <div className="game-header">
          <button className="btn btn-outline" onClick={onBack}>Back</button>
          <div className="game-title">{ARENA_NAMES[arenaId] || 'Arena'}</div>
        </div>
        <div className="arena-confirm">
          <div className="arena-confirm-icon">⚔️</div>
          <div className="arena-tier-badge" style={{ '--tier-color': tier.color }}>
            <span>{tier.icon}</span>
            <span>{tier.name}</span>
            <span className="arena-tier-elo">{elo} ELO</span>
          </div>
          <div className="arena-confirm-cost">
            <img src="/token.png" alt="" style={{ width: 20, height: 20 }} />
            <span>1 Token Entry Fee</span>
          </div>
          <p className="arena-confirm-desc">
            Answer questions faster than your opponent's ghost to deal damage. First to knock out all 6 lives wins!
          </p>
          <div className="arena-confirm-reward">
            Win Reward: <img src="/token.png" alt="" style={{ width: 16, height: 16 }} /> +2 Tokens + ELO
          </div>
          {history.length > 0 && (
            <div className="arena-recent">
              <div className="arena-recent-title">Recent Matches</div>
              {history.map((m, i) => (
                <div key={i} className={`arena-recent-row arena-recent-${m.result}`}>
                  <span className="arena-recent-result">{m.result === 'win' ? 'W' : m.result === 'lose' ? 'L' : 'D'}</span>
                  <span className="arena-recent-opp">vs {m.opponent}</span>
                  <span className="arena-recent-elo-change">{m.eloChange > 0 ? '+' : ''}{m.eloChange}</span>
                </div>
              ))}
            </div>
          )}
          {(student?.tokens || 0) < 1 && <div className="arena-confirm-warn">Not enough tokens!</div>}
          <button className="btn arena-confirm-btn" onClick={startFight} disabled={(student?.tokens || 0) < 1}>
            Fight!
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'intro') {
    const opTier = opponentTier || tier
    return (
      <div className="game-page arena-page arena-intro">
        <div className="arena-vs-screen">
          <div className="arena-vs-player">
            <div className="arena-sprite arena-sprite-player">
              {student?.avatar ? <img src={student.avatar} alt="" /> : '🧑'}
            </div>
            <div className="arena-vs-name">{student?.name || 'You'}</div>
            <div className="arena-vs-tier" style={{ color: tier.color }}>{tier.icon} {elo}</div>
          </div>
          <div className="arena-vs-text">
            <span className="arena-vs-big">{introCount > 0 ? 'VS' : 'FIGHT!'}</span>
            {introCount > 0 && <span className="arena-vs-count">{introCount}</span>}
          </div>
          <div className="arena-vs-opponent">
            <div className="arena-sprite arena-sprite-opponent">
              {opponentAvatar ? <img src={opponentAvatar} alt="" /> : ghost ? '👤' : '❓'}
            </div>
            <div className="arena-vs-name">{opponentName}</div>
            {ghost && <div className="arena-vs-tier" style={{ color: opTier.color }}>{opTier.icon} {ghost.elo}</div>}
            {!ghost && <div className="arena-vs-tier" style={{ color: '#666' }}>Recording Match</div>}
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'result') {
    const newTier = eloResult ? getArenaTier(eloResult.newElo) : tier
    const tierChanged = eloResult && newTier.name !== tier.name
    return (
      <div className="game-page arena-page">
        <div className="arena-result-screen">
          <div className={`arena-result-banner arena-result-${result}`}>
            {result === 'win' ? '🏆 VICTORY!' : result === 'lose' ? '💀 DEFEAT' : '🤝 DRAW'}
          </div>
          <div className="arena-result-stats">
            <div className="arena-result-stat">
              <span className="arena-result-stat-label">Your Lives</span>
              <span className="arena-result-stat-val">{'❤️'.repeat(Math.max(0, playerLives))}{'🖤'.repeat(6 - Math.max(0, playerLives))}</span>
            </div>
            {ghost && (
              <div className="arena-result-stat">
                <span className="arena-result-stat-label">{ghost.studentName}</span>
                <span className="arena-result-stat-val">{'❤️'.repeat(Math.max(0, opponentLives))}{'🖤'.repeat(6 - Math.max(0, opponentLives))}</span>
              </div>
            )}
          </div>
          {eloResult && (
            <div className="arena-elo-change">
              <div className="arena-elo-row">
                <span className="arena-elo-old">{eloResult.oldElo}</span>
                <span className={`arena-elo-delta ${eloResult.change >= 0 ? 'arena-elo-up' : 'arena-elo-down'}`}>
                  {eloResult.change >= 0 ? '▲' : '▼'} {Math.abs(eloResult.change)}
                </span>
                <span className="arena-elo-new">{eloResult.newElo}</span>
              </div>
              <div className="arena-tier-badge" style={{ '--tier-color': newTier.color }}>
                <span>{newTier.icon}</span>
                <span>{newTier.name}</span>
              </div>
              {tierChanged && (
                <div className="arena-tier-up">
                  {eloResult.change > 0 ? '🎉 Tier Up!' : 'Tier Down'}
                </div>
              )}
            </div>
          )}
          {!ghost && (
            <div className="arena-no-ghost-msg">
              Ghost recorded! Your match will be used by other players.
            </div>
          )}
          {result === 'win' && ghost && (
            <div className="arena-result-reward">
              <img src="/token.png" alt="" style={{ width: 22, height: 22 }} />
              <span>+2 Tokens earned!</span>
            </div>
          )}
          <button className="btn" onClick={onBack} style={{ marginTop: 24 }}>Back to Battlegrounds</button>
        </div>
      </div>
    )
  }

  const q = questions[qIdx]
  if (!q) return null

  return (
    <div className="game-page arena-page arena-fight">
      <div className="arena-combatant arena-combatant-opponent">
        <div className="arena-combatant-info">
          <span className="arena-combatant-name">{opponentName}</span>
          <div className="arena-health-bar">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className={`arena-heart ${i < opponentLives ? 'arena-heart-full' : 'arena-heart-empty'}`}>
                {i < opponentLives ? '❤️' : '🖤'}
              </span>
            ))}
          </div>
        </div>
        <div className={`arena-sprite arena-sprite-opponent ${damageAnim === 'opponent' ? 'arena-sprite-hit' : ''}`}>
          {opponentAvatar ? <img src={opponentAvatar} alt="" /> : ghost ? '👤' : '❓'}
        </div>
      </div>

      <div className="arena-question-area">
        <div className="arena-timer-bar">
          <div className="arena-timer-fill" style={{ width: `${(timer / QUESTION_TIME) * 100}%` }} />
        </div>
        <div className="arena-q-label">Q{qIdx + 1}</div>
        <div className="arena-question">{q.question}</div>
        <div className="arena-options">
          {q.options.map((opt, i) => (
            <button
              key={i}
              className={`arena-option ${selected === i ? (i === q.correctIdx ? 'arena-option-correct' : 'arena-option-wrong') : ''} ${selected !== null && i === q.correctIdx && selected !== i ? 'arena-option-correct' : ''}`}
              onClick={() => handleAnswer(i)}
              disabled={selected !== null}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div className="arena-combatant arena-combatant-player">
        <div className={`arena-sprite arena-sprite-player ${damageAnim === 'player' ? 'arena-sprite-hit' : ''}`}>
          {student?.avatar ? <img src={student.avatar} alt="" /> : '🧑'}
        </div>
        <div className="arena-combatant-info">
          <span className="arena-combatant-name">{student?.name || 'You'}</span>
          <div className="arena-health-bar">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className={`arena-heart ${i < playerLives ? 'arena-heart-full' : 'arena-heart-empty'}`}>
                {i < playerLives ? '❤️' : '🖤'}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Arena
