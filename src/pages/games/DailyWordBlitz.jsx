import { useState, useEffect, useRef } from 'react'
import { getDailyGameState, saveDailyGameState, awardDailyGameCoins, getDailyPuzzles, setDailyPuzzles } from '../../data/store.js'
import { authedFetch } from '../../data/auth.js'

const GAME_DURATION = 120

const FALLBACK_WORDBLITZ = [
  { letters: ['S','T','A','R','E','N','D'], words: ['stare','snare','stand','rated','dents','rents','trend','trades','strand','dense','stead','tread','rest','nest','dent','rent','tend','send','dare','rate','date','star','tear','near','earn','read','sand','rand','dens','tens','arts','ants','tan','ran','den','net','set','sat','rat','ant','ate','eat','tea','are','ear','red','end'] },
  { letters: ['C','L','A','M','P','E','S'], words: ['clamp','clams','place','scale','ample','lamps','clasp','space','maple','medal','clap','lamp','camp','palm','calm','pale','male','sale','meal','seal','leap','plea','pace','cape','lace','mace','same','came','slap','maps','lap','map','cap','pal','ale','ace','cam','pea','sea','sap'] },
  { letters: ['B','R','I','G','H','T','N'], words: ['bring','night','right','thing','birth','girth','biting','bright','grit','grin','ring','bing','brit','hint','thin','girt','big','rig','nit','bin','bit','tin','hit','gin'] },
]

function DailyWordBlitz({ userId, onBack, onWin }) {
  const [puzzle, setPuzzle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [found, setFound] = useState([])
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION)
  const [started, setStarted] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [message, setMessage] = useState('')
  const [shake, setShake] = useState(false)
  const [tappedIdx, setTappedIdx] = useState(null)
  const timerRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    async function load() {
      const saved = getDailyGameState(userId, 'wordblitz')
      let puzzles = getDailyPuzzles()

      if (!puzzles?.wordblitz) {
        try {
          const res = await authedFetch('/api/claude/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-sonnet-5',
              max_tokens: 600,
              messages: [{
                role: 'user',
                content: `Generate a Word Blitz puzzle for Year 6 students (age 11-12). Choose 7 common letters (avoid Q, X, Z) that can form many words. Letters can be reused within a word.

Return ONLY valid JSON:
{"letters":["A","B","C","D","E","F","G"],"words":["abc","add","bad",...]}

Include 20-50 valid English words of 3+ letters that can be made using these 7 letters (letters may repeat). All words must be common English words. List words in lowercase sorted by length descending.`
              }]
            })
          })
          const data = await res.json()
          const text = data.content?.[0]?.text || ''
          const match = text.match(/\{[\s\S]*\}/)
          if (match) {
            const parsed = JSON.parse(match[0])
            if (parsed.letters?.length === 7 && parsed.words?.length > 0) {
              const existing = getDailyPuzzles() || {}
              setDailyPuzzles({ ...existing, wordblitz: parsed })
              puzzles = { ...existing, wordblitz: parsed }
            }
          }
        } catch (e) {
          console.error('Failed to generate wordblitz:', e)
        }
      }

      if (!puzzles?.wordblitz) {
        const fallback = FALLBACK_WORDBLITZ[new Date().getDate() % FALLBACK_WORDBLITZ.length]
        const existing = getDailyPuzzles() || {}
        setDailyPuzzles({ ...existing, wordblitz: fallback })
        puzzles = { ...existing, wordblitz: fallback }
      }

      if (puzzles?.wordblitz) {
        setPuzzle(puzzles.wordblitz)
        if (saved?.gameOver) {
          setFound(saved.found || [])
          setGameOver(true)
          setStarted(true)
          setTimeLeft(0)
        }
      }
      setLoading(false)
    }
    load()
  }, [userId])

  useEffect(() => {
    if (started && !gameOver && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            clearInterval(timerRef.current)
            endGame()
            return 0
          }
          return t - 1
        })
      }, 1000)
      return () => clearInterval(timerRef.current)
    }
  }, [started, gameOver])

  function endGame() {
    setGameOver(true)
    saveDailyGameState(userId, 'wordblitz', { found, gameOver: true })
    awardDailyGameCoins(userId, 'wordblitz', 10)
    if (onWin) onWin()
  }

  function showMsg(text) {
    setMessage(text)
    setTimeout(() => setMessage(''), 1500)
  }

  function handleLetterTap(letter, idx) {
    if (gameOver) return
    setInput(prev => prev + letter.toLowerCase())
    setTappedIdx(idx)
    setTimeout(() => setTappedIdx(null), 150)
  }

  function handleDelete() {
    setInput(prev => prev.slice(0, -1))
  }

  function handleClear() {
    setInput('')
  }

  function submitWord() {
    if (!puzzle || gameOver || !input.trim()) return

    const word = input.trim().toLowerCase()
    setInput('')

    if (word.length < 3) {
      setShake(true)
      setTimeout(() => setShake(false), 400)
      showMsg('Too short! 3+ letters')
      return
    }

    if (found.includes(word)) {
      showMsg('Already found!')
      return
    }

    if (puzzle.words.includes(word)) {
      const newFound = [...found, word]
      setFound(newFound)
      showMsg(`+${word.length} points!`)
    } else {
      setShake(true)
      setTimeout(() => setShake(false), 400)
      showMsg('Not a valid word')
    }

    if (inputRef.current) inputRef.current.focus()
  }

  function handleSubmit(e) {
    e.preventDefault()
    submitWord()
  }

  function startGame() {
    setStarted(true)
    setTimeLeft(GAME_DURATION)
  }

  if (loading) return (
    <div className="game-page">
      <div className="game-header">
        <button className="btn btn-outline" onClick={onBack}>Back</button>
        <div className="game-title">Word Blitz</div>
      </div>
      <div className="game-loading"><div className="bg-trivia-spinner" /> Generating puzzle...</div>
    </div>
  )

  if (!puzzle) return (
    <div className="game-page">
      <div className="game-header">
        <button className="btn btn-outline" onClick={onBack}>Back</button>
        <div className="game-title">Word Blitz</div>
      </div>
      <div className="game-loading">Failed to load puzzle. Try again later.</div>
    </div>
  )

  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60
  const totalWords = puzzle.words.length
  const score = found.reduce((sum, w) => sum + w.length, 0)

  // Split 7 letters into rows: 3 top, 1 center, 3 bottom
  const topRow = puzzle.letters.slice(0, 3)
  const centerLetter = puzzle.letters[3]
  const bottomRow = puzzle.letters.slice(4, 7)

  return (
    <div className="game-page">
      <div className="game-header">
        <button className="btn btn-outline" onClick={onBack}>Back</button>
        <div className="game-title">Word Blitz</div>
        <div className="game-reward">
          <img src="/coin.png" alt="" style={{ width: 16, height: 16 }} />
          <span>{10}</span>
        </div>
      </div>

      {message && <div className="wdl-message">{message}</div>}

      {!started && !gameOver && (
        <div className="wb-start">
          <div className="wb-grid-preview">
            <div className="wb-grid-row">
              {topRow.map((l, i) => (
                <span key={i} className="wb-letter-big">{l}</span>
              ))}
            </div>
            <div className="wb-grid-row">
              <span className="wb-letter-big wb-letter-center">{centerLetter}</span>
            </div>
            <div className="wb-grid-row">
              {bottomRow.map((l, i) => (
                <span key={i + 4} className="wb-letter-big">{l}</span>
              ))}
            </div>
          </div>
          <p className="wb-start-text">Make as many words as you can using these 7 letters. Letters can be reused! You have 2 minutes!</p>
          <button className="btn" onClick={startGame} style={{ padding: '14px 40px' }}>Start!</button>
        </div>
      )}

      {started && (
        <>
          <div className="wb-status-bar">
            <div className="wb-timer" style={timeLeft <= 15 ? { color: '#e94560' } : {}}>
              {mins}:{String(secs).padStart(2, '0')}
            </div>
            <div className="wb-score">{score} pts</div>
            <div className="wb-found-count">{found.length}/{totalWords} words</div>
          </div>

          {/* Current word display */}
          <div className={`wb-current-word ${shake ? 'wdl-row-shake' : ''}`}>
            {input ? input.toUpperCase() : <span className="wb-current-placeholder">Tap letters...</span>}
            <span className="wb-cursor">|</span>
          </div>

          {/* Letter grid */}
          <div className="wb-grid">
            <div className="wb-grid-row">
              {topRow.map((l, i) => (
                <button
                  key={i}
                  className={`wb-letter ${tappedIdx === i ? 'wb-letter-active' : ''}`}
                  onClick={() => handleLetterTap(l, i)}
                  disabled={gameOver}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="wb-grid-row">
              <button
                className={`wb-letter wb-letter-center ${tappedIdx === 3 ? 'wb-letter-active' : ''}`}
                onClick={() => handleLetterTap(centerLetter, 3)}
                disabled={gameOver}
              >
                {centerLetter}
              </button>
            </div>
            <div className="wb-grid-row">
              {bottomRow.map((l, i) => (
                <button
                  key={i + 4}
                  className={`wb-letter ${tappedIdx === (i + 4) ? 'wb-letter-active' : ''}`}
                  onClick={() => handleLetterTap(l, i + 4)}
                  disabled={gameOver}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          {!gameOver && (
            <div className="wb-action-row">
              <button className="wb-action-btn" onClick={handleDelete} disabled={!input}>
                <span style={{ fontSize: '1.1rem' }}>&#9003;</span>
              </button>
              <button className="wb-action-btn" onClick={handleClear} disabled={!input}>
                Clear
              </button>
              <button
                className={`wb-action-btn wb-action-submit ${input.length >= 3 ? 'wb-action-submit-ready' : ''}`}
                onClick={submitWord}
                disabled={input.length < 3}
              >
                Submit
              </button>
            </div>
          )}

          {/* Hidden text input for keyboard typing */}
          {!gameOver && (
            <form className="wb-keyboard-input" onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                className="pp-input"
                value={input}
                onChange={e => setInput(e.target.value.replace(/[^a-zA-Z]/g, ''))}
                placeholder="or type here..."
                maxLength={15}
              />
            </form>
          )}

          <div className="wb-found-list">
            {found.sort((a, b) => b.length - a.length).map(w => (
              <span key={w} className="wb-found-word">
                {w} <span className="wb-found-pts">+{w.length}</span>
              </span>
            ))}
          </div>

          {gameOver && (
            <div className="wdl-result wdl-result-win">
              {found.length} words found — {score} points!
              <div style={{ marginTop: 8, fontSize: '0.75rem', opacity: 0.7 }}>
                Missed words: {puzzle.words.filter(w => !found.includes(w)).slice(0, 10).join(', ')}
                {puzzle.words.filter(w => !found.includes(w)).length > 10 ? '...' : ''}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default DailyWordBlitz
