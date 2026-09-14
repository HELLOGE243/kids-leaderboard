import { useState, useEffect, useRef } from 'react'

const CPU_AVATARS = ['🤖','🦊','🐺','🦅','🐙','🦁']
const CPU_NAMES = ['Alex','Jordan','Riley','Sam','Charlie','Morgan','Quinn','Avery','Kai','Rowan']

const Q_EASY = [
  { q: "What is the capital of Australia?", o: ["Sydney","Melbourne","Canberra","Brisbane"], a: 2, cat: "Geography" },
  { q: "How many sides does a hexagon have?", o: ["5","6","7","8"], a: 1, cat: "Maths" },
  { q: "What planet is known as the Red Planet?", o: ["Venus","Mars","Jupiter","Saturn"], a: 1, cat: "Space" },
  { q: "What is the largest ocean on Earth?", o: ["Atlantic","Indian","Arctic","Pacific"], a: 3, cat: "Geography" },
  { q: "What gas do plants absorb from the air?", o: ["Oxygen","Nitrogen","Carbon dioxide","Hydrogen"], a: 2, cat: "Science" },
  { q: "How many continents are there?", o: ["5","6","7","8"], a: 2, cat: "Geography" },
  { q: "What is the boiling point of water?", o: ["90°C","100°C","110°C","120°C"], a: 1, cat: "Science" },
  { q: "Which is the tallest animal?", o: ["Elephant","Giraffe","Whale","Ostrich"], a: 1, cat: "Animals" },
  { q: "What is 15 × 12?", o: ["160","170","180","190"], a: 2, cat: "Maths" },
  { q: "What colour do you get mixing blue and yellow?", o: ["Orange","Purple","Green","Brown"], a: 2, cat: "General" },
  { q: "How many degrees in a right angle?", o: ["45","60","90","180"], a: 2, cat: "Maths" },
  { q: "What is the chemical symbol for water?", o: ["H₂O","CO₂","NaCl","O₂"], a: 0, cat: "Science" },
  { q: "Which planet is closest to the Sun?", o: ["Venus","Mars","Mercury","Earth"], a: 2, cat: "Space" },
  { q: "What is the largest mammal?", o: ["Elephant","Giraffe","Blue whale","Hippo"], a: 2, cat: "Animals" },
  { q: "How many players on a football team?", o: ["9","10","11","12"], a: 2, cat: "Sport" },
  { q: "What is 25% of 200?", o: ["25","40","50","75"], a: 2, cat: "Maths" },
  { q: "Which country is shaped like a boot?", o: ["Greece","Spain","Italy","Portugal"], a: 2, cat: "Geography" },
  { q: "How many minutes in 2 hours?", o: ["60","100","120","180"], a: 2, cat: "Maths" },
]

const Q_MEDIUM = [
  { q: "What year did World War II end?", o: ["1943","1944","1945","1946"], a: 2, cat: "History" },
  { q: "What is the chemical symbol for gold?", o: ["Go","Gd","Au","Ag"], a: 2, cat: "Science" },
  { q: "Which Shakespeare play has 'To be or not to be'?", o: ["Macbeth","Hamlet","Othello","Romeo and Juliet"], a: 1, cat: "Literature" },
  { q: "What is the square root of 144?", o: ["10","11","12","14"], a: 2, cat: "Maths" },
  { q: "What is the longest river in the world?", o: ["Amazon","Nile","Mississippi","Yangtze"], a: 1, cat: "Geography" },
  { q: "In what year did humans first land on the Moon?", o: ["1967","1969","1971","1973"], a: 1, cat: "History" },
  { q: "What does DNA stand for?", o: ["Deoxyribonucleic acid","Dinitrogen acid","Dynamic nucleic acid","Dual nitrogen acid"], a: 0, cat: "Science" },
  { q: "What is the currency of Japan?", o: ["Yuan","Won","Yen","Ringgit"], a: 2, cat: "Geography" },
  { q: "How many bones in the adult human body?", o: ["186","206","216","256"], a: 1, cat: "Science" },
  { q: "What is the powerhouse of the cell?", o: ["Nucleus","Ribosome","Mitochondria","Cytoplasm"], a: 2, cat: "Science" },
  { q: "Which country gifted the Statue of Liberty?", o: ["UK","Spain","France","Germany"], a: 2, cat: "History" },
  { q: "What is π (pi) to 2 decimal places?", o: ["3.12","3.14","3.16","3.18"], a: 1, cat: "Maths" },
  { q: "What gas makes up most of Earth's atmosphere?", o: ["Oxygen","CO₂","Nitrogen","Argon"], a: 2, cat: "Science" },
  { q: "What is the fastest land animal?", o: ["Lion","Cheetah","Horse","Greyhound"], a: 1, cat: "Animals" },
  { q: "Which ocean is the Mariana Trench in?", o: ["Atlantic","Indian","Pacific","Arctic"], a: 2, cat: "Geography" },
  { q: "What is 3⁴ (3 to the power of 4)?", o: ["27","64","81","108"], a: 2, cat: "Maths" },
  { q: "Who painted the Mona Lisa?", o: ["Michelangelo","Da Vinci","Raphael","Donatello"], a: 1, cat: "Art" },
  { q: "What is the main ingredient of glass?", o: ["Calcium","Quartz","Sand","Salt"], a: 2, cat: "Science" },
]

const Q_HARD = [
  { q: "What is 17 squared?", o: ["256","272","289","294"], a: 2, cat: "Maths" },
  { q: "Which element has the highest melting point?", o: ["Iron","Tungsten","Titanium","Platinum"], a: 1, cat: "Science" },
  { q: "What is the speed of light (approximately)?", o: ["150,000 km/s","200,000 km/s","300,000 km/s","500,000 km/s"], a: 2, cat: "Physics" },
  { q: "In what year was the Magna Carta signed?", o: ["1066","1215","1415","1603"], a: 1, cat: "History" },
  { q: "Probability of rolling two sixes with two dice?", o: ["1/6","1/12","1/36","1/18"], a: 2, cat: "Maths" },
  { q: "Which planet has a day longer than its year?", o: ["Mercury","Venus","Neptune","Uranus"], a: 1, cat: "Space" },
  { q: "What is the chemical formula for sulfuric acid?", o: ["HCl","H₂SO₄","HNO₃","H₃PO₄"], a: 1, cat: "Science" },
  { q: "Who wrote the dystopian novel '1984'?", o: ["Aldous Huxley","Ray Bradbury","George Orwell","H.G. Wells"], a: 2, cat: "Literature" },
  { q: "What is 0.125 as a fraction?", o: ["1/4","1/6","1/8","1/10"], a: 2, cat: "Maths" },
  { q: "Smallest prime number greater than 50?", o: ["51","53","57","59"], a: 1, cat: "Maths" },
  { q: "What is Avogadro's number (approx)?", o: ["6.02 × 10²³","3.14 × 10²³","6.02 × 10²⁰","9.81 × 10²³"], a: 0, cat: "Science" },
  { q: "Which civilisation invented the concept of zero?", o: ["Greek","Roman","Indian","Egyptian"], a: 2, cat: "History" },
  { q: "What is the pH of pure water?", o: ["0","5","7","14"], a: 2, cat: "Science" },
  { q: "A shirt costs $80 after 20% off. Original price?", o: ["$96","$100","$104","$112"], a: 1, cat: "Maths" },
  { q: "What is the capital of Kazakhstan?", o: ["Almaty","Astana","Bishkek","Tashkent"], a: 1, cat: "Geography" },
  { q: "How many faces does a dodecahedron have?", o: ["8","10","12","20"], a: 2, cat: "Maths" },
  { q: "What percentage is 7 out of 8?", o: ["82.5%","85%","87.5%","90%"], a: 2, cat: "Maths" },
  { q: "Which bone is the smallest in the human body?", o: ["Stapes","Femur","Phalanx","Coccyx"], a: 0, cat: "Science" },
]

const Q_TIME = 10
const OPT_COLORS = ['#e94560', '#3b82f6', '#22c55e', '#f59e0b']

function shufflePick(arr, n) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
}

function buildQuestions() {
  return [...shufflePick(Q_EASY, 5), ...shufflePick(Q_MEDIUM, 5), ...shufflePick(Q_HARD, 5)]
}

function QuizBlitz({ userId, onBack }) {
  const [phase, setPhase] = useState('matchmaking')
  const [cpuName] = useState(() => CPU_NAMES[Math.floor(Math.random() * CPU_NAMES.length)])
  const [cpuAvatar] = useState(() => CPU_AVATARS[Math.floor(Math.random() * CPU_AVATARS.length)])
  const [questions] = useState(() => buildQuestions())
  const [qIdx, setQIdx] = useState(0)
  const [timeLeft, setTimeLeft] = useState(Q_TIME)
  const [playerAns, setPlayerAns] = useState(null)
  const [cpuAns, setCpuAns] = useState(null)
  const [playerTotal, setPlayerTotal] = useState(0)
  const [cpuTotal, setCpuTotal] = useState(0)
  const [countdown, setCountdown] = useState(3)
  const [streak, setStreak] = useState(0)

  const mountedRef = useRef(true)
  const timerRef = useRef(null)
  const cpuRef = useRef(null)
  const startRef = useRef(null)
  const revealRef = useRef(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearInterval(timerRef.current)
      clearTimeout(cpuRef.current)
      clearTimeout(revealRef.current)
    }
  }, [])

  useEffect(() => {
    if (phase !== 'matchmaking') return
    const t = setTimeout(() => mountedRef.current && setPhase('countdown'), 2200)
    return () => clearTimeout(t)
  }, [phase])

  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) {
      setPhase('playing')
      startQuestion(0)
      return
    }
    const t = setTimeout(() => mountedRef.current && setCountdown(c => c - 1), 700)
    return () => clearTimeout(t)
  }, [phase, countdown])

  function startQuestion(qi) {
    startRef.current = Date.now()
    setTimeLeft(Q_TIME)
    setPlayerAns(null)
    setCpuAns(null)

    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      if (!mountedRef.current) return
      const remaining = Math.max(0, Q_TIME - (Date.now() - startRef.current) / 1000)
      setTimeLeft(remaining)
      if (remaining <= 0) {
        clearInterval(timerRef.current)
        handleTimeUp(qi)
      }
    }, 50)

    scheduleCpu(qi)
  }

  function scheduleCpu(qi) {
    clearTimeout(cpuRef.current)
    const diff = qi < 5 ? 0 : qi < 10 ? 1 : 2
    const minDelay = [1500, 2500, 3000][diff]
    const spread = [2500, 3000, 4500][diff]
    const accuracy = [0.88, 0.68, 0.42][diff]
    const delay = minDelay + Math.random() * spread

    cpuRef.current = setTimeout(() => {
      if (!mountedRef.current) return
      const q = questions[qi]
      const correct = Math.random() < accuracy
      const idx = correct ? q.a : [0,1,2,3].filter(i => i !== q.a)[Math.floor(Math.random() * 3)]
      const elapsed = (Date.now() - startRef.current) / 1000
      const pts = correct ? Math.max(0, Math.floor((Q_TIME - elapsed) * 100)) : 0
      const ans = { idx, time: elapsed, correct, pts }
      setCpuAns(ans)
      if (correct) setCpuTotal(t => t + pts)
    }, Math.min(delay, 9500))
  }

  function handleTimeUp(qi) {
    clearTimeout(cpuRef.current)
    setCpuAns(prev => prev || { idx: -1, time: Q_TIME, correct: false, pts: 0 })
    setPlayerAns(prev => prev || { idx: -1, time: Q_TIME, correct: false, pts: 0 })
    transitionToReveal(qi)
  }

  function handleAnswer(ansIdx) {
    if (phase !== 'playing' || playerAns !== null) return
    const q = questions[qIdx]
    const elapsed = (Date.now() - startRef.current) / 1000
    const correct = ansIdx === q.a
    const pts = correct ? Math.max(0, Math.floor((Q_TIME - elapsed) * 100)) : 0
    const ans = { idx: ansIdx, time: elapsed, correct, pts }
    setPlayerAns(ans)
    if (correct) {
      setPlayerTotal(t => t + pts)
      setStreak(s => s + 1)
    } else {
      setStreak(0)
    }
  }

  useEffect(() => {
    if (phase !== 'playing') return
    if (playerAns !== null && cpuAns !== null) {
      clearInterval(timerRef.current)
      clearTimeout(cpuRef.current)
      transitionToReveal(qIdx)
    }
  }, [playerAns, cpuAns, phase])

  function transitionToReveal(qi) {
    revealRef.current = setTimeout(() => {
      if (!mountedRef.current) return
      if (qi >= 14) {
        setPhase('results')
      } else {
        const next = qi + 1
        setQIdx(next)
        startQuestion(next)
      }
    }, 2200)
  }

  function getDiffLabel(idx) {
    if (idx < 5) return 'Easy'
    if (idx < 10) return 'Medium'
    return 'Hard'
  }
  function getDiffColor(idx) {
    if (idx < 5) return '#22c55e'
    if (idx < 10) return '#f59e0b'
    return '#e94560'
  }

  const q = questions[qIdx]
  const timerPct = (timeLeft / Q_TIME) * 100
  const bothAnswered = playerAns !== null && cpuAns !== null

  if (phase === 'matchmaking') {
    return (
      <div className="qb-page">
        <div className="qb-matchmaking">
          <div className="qb-mm-spinner" />
          <div className="qb-mm-text">Finding opponent...</div>
          <div className="qb-mm-dots"><span>.</span><span>.</span><span>.</span></div>
        </div>
      </div>
    )
  }

  if (phase === 'countdown') {
    return (
      <div className="qb-page">
        <div className="qb-vs-intro">
          <div className="qb-vs-player">
            <div className="qb-vs-avatar">👤</div>
            <div className="qb-vs-name">You</div>
          </div>
          <div className="qb-vs-badge">VS</div>
          <div className="qb-vs-player">
            <div className="qb-vs-avatar">{cpuAvatar}</div>
            <div className="qb-vs-name">{cpuName}</div>
          </div>
        </div>
        <div className="qb-countdown">{countdown > 0 ? countdown : 'GO!'}</div>
      </div>
    )
  }

  if (phase === 'results') {
    const playerWon = playerTotal > cpuTotal
    const tie = playerTotal === cpuTotal
    return (
      <div className="qb-page">
        <div className="qb-results">
          <div className="qb-results-title">{tie ? "It's a draw!" : playerWon ? 'You win!' : `${cpuName} wins!`}</div>
          <div className="qb-results-scores">
            <div className={`qb-results-player ${playerWon ? 'qb-results-winner' : ''}`}>
              <div className="qb-results-avatar">👤</div>
              <div className="qb-results-name">You</div>
              <div className="qb-results-pts">{playerTotal.toLocaleString()}</div>
              {playerWon && <div className="qb-results-crown">👑</div>}
            </div>
            <div className="qb-results-vs">vs</div>
            <div className={`qb-results-player ${!playerWon && !tie ? 'qb-results-winner' : ''}`}>
              <div className="qb-results-avatar">{cpuAvatar}</div>
              <div className="qb-results-name">{cpuName}</div>
              <div className="qb-results-pts">{cpuTotal.toLocaleString()}</div>
              {!playerWon && !tie && <div className="qb-results-crown">👑</div>}
            </div>
          </div>
          <div className="qb-results-btns">
            <button className="btn" onClick={() => {
              setQIdx(0); setPlayerTotal(0); setCpuTotal(0); setStreak(0); setCountdown(3); setPhase('countdown')
            }}>Play Again</button>
            <button className="btn btn-outline" onClick={onBack}>Back</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="qb-page">
      {/* Scoreboard */}
      <div className="qb-scoreboard">
        <div className="qb-sb-player">
          <span className="qb-sb-avatar">👤</span>
          <span className="qb-sb-score">{playerTotal.toLocaleString()}</span>
          {playerAns?.correct && <span className="qb-sb-plus">+{playerAns.pts}</span>}
        </div>
        <div className="qb-sb-center">
          <span className="qb-sb-q">{qIdx + 1}/15</span>
          <span className="qb-sb-diff" style={{ color: getDiffColor(qIdx) }}>{getDiffLabel(qIdx)}</span>
        </div>
        <div className="qb-sb-player qb-sb-right">
          {cpuAns?.correct && <span className="qb-sb-plus">+{cpuAns.pts}</span>}
          <span className="qb-sb-score">{cpuTotal.toLocaleString()}</span>
          <span className="qb-sb-avatar">{cpuAvatar}</span>
        </div>
      </div>

      {/* Timer bar */}
      <div className="qb-timer-bar">
        <div
          className={`qb-timer-fill ${timeLeft <= 3 ? 'qb-timer-urgent' : ''}`}
          style={{ width: `${timerPct}%` }}
        />
      </div>

      {/* Category */}
      <div className="qb-category">{q.cat}</div>

      {/* Question */}
      <div className="qb-question">{q.q}</div>

      {/* Streak */}
      {streak >= 2 && !bothAnswered && <div className="qb-streak">🔥 {streak} streak!</div>}

      {/* Answer grid */}
      <div className="qb-answers">
        {q.o.map((opt, i) => {
          let cls = 'qb-answer'
          if (bothAnswered) {
            if (i === q.a) cls += ' qb-answer-correct'
            else if (playerAns?.idx === i && !playerAns.correct) cls += ' qb-answer-wrong'
            else cls += ' qb-answer-dim'
          } else if (playerAns !== null) {
            if (playerAns.idx === i) cls += playerAns.correct ? ' qb-answer-correct' : ' qb-answer-wrong'
            else cls += ' qb-answer-dim'
          }

          return (
            <button
              key={i}
              className={cls}
              style={{ '--opt-bg': OPT_COLORS[i] }}
              onClick={() => handleAnswer(i)}
              disabled={playerAns !== null}
            >
              <span className="qb-answer-letter">{String.fromCharCode(65 + i)}</span>
              <span className="qb-answer-text">{opt}</span>
            </button>
          )
        })}
      </div>

      {/* Both answered feedback */}
      {bothAnswered && (
        <div className="qb-feedback">
          <div className="qb-fb-row">
            <span className="qb-fb-name">You</span>
            {playerAns.idx === -1
              ? <span className="qb-fb-timeout">Timed out</span>
              : playerAns.correct
                ? <span className="qb-fb-correct">✓ {playerAns.time.toFixed(1)}s → +{playerAns.pts}</span>
                : <span className="qb-fb-wrong">✗ Wrong</span>}
          </div>
          <div className="qb-fb-row">
            <span className="qb-fb-name">{cpuName}</span>
            {cpuAns.idx === -1
              ? <span className="qb-fb-timeout">Timed out</span>
              : cpuAns.correct
                ? <span className="qb-fb-correct">✓ {cpuAns.time.toFixed(1)}s → +{cpuAns.pts}</span>
                : <span className="qb-fb-wrong">✗ Wrong</span>}
          </div>
        </div>
      )}

      <button className="qb-back-btn" onClick={onBack}>Quit</button>
    </div>
  )
}

export default QuizBlitz
