import { useState, useEffect, useCallback } from 'react'
import { getDailyGameState, saveDailyGameState, awardDailyGameCoins, getDailyPuzzles, setDailyPuzzles } from '../../data/store.js'
import { authedFetch } from '../../data/auth.js'

const GROUP_COLORS = ['#f9df6d', '#a0c35a', '#b0c4ef', '#ba81c5']
const GROUP_LABELS = ['yellow', 'green', 'blue', 'purple']

const FALLBACK_CONNECTIONS = [
  { groups: [
    { theme: '___ Run (movies)', words: ['CHICKEN', 'BULL', 'HOME', 'HIT'] },
    { theme: 'Things with keys', words: ['PIANO', 'KEYBOARD', 'MAP', 'LOCK'] },
    { theme: '___ Break', words: ['LUNCH', 'PRISON', 'HEART', 'DAY'] },
    { theme: 'Hidden colours', words: ['REDDISH', 'BLUESTONE', 'PINKIE', 'GREENHOUSE'] },
  ]},
  { groups: [
    { theme: 'Cricket terms', words: ['DUCK', 'OVER', 'MAIDEN', 'BOUNCER'] },
    { theme: 'Words before "LIGHT"', words: ['FLASH', 'MOON', 'HIGH', 'SPOT'] },
    { theme: 'Things that can be "ROUND"', words: ['TABLE', 'TRIP', 'GROUND', 'ABOUT'] },
    { theme: '___HOUSE', words: ['WARE', 'GREEN', 'FIRE', 'POWER'] },
  ]},
  { groups: [
    { theme: 'Starts with a body part', words: ['KNEECAP', 'ELBOWROOM', 'HANDSOME', 'EYEBROW'] },
    { theme: 'Common phrases: "BREAK ___"', words: ['EVEN', 'FREE', 'DANCE', 'FAST'] },
    { theme: 'Double letters', words: ['BALLOON', 'COFFEE', 'GIRAFFE', 'BROCCOLI'] },
    { theme: 'Silent letters', words: ['KNIGHT', 'SALMON', 'CASTLE', 'ISLAND'] },
  ]},
  { groups: [
    { theme: 'Basketball slang', words: ['BRICK', 'SWISH', 'DIME', 'ANKLE'] },
    { theme: '___ FISH', words: ['SWORD', 'BLOW', 'STAR', 'JELLY'] },
    { theme: 'Slang for money', words: ['BREAD', 'DOUGH', 'CHEDDAR', 'PAPER'] },
    { theme: 'Found in a pencil case', words: ['RULER', 'RUBBER', 'SHARPENER', 'COMPASS'] },
  ]},
  { groups: [
    { theme: 'Taylor Swift songs', words: ['BLANK', 'SHAKE', 'STYLE', 'LOVE'] },
    { theme: 'Card games', words: ['SNAP', 'BRIDGE', 'POKER', 'DUTCH'] },
    { theme: 'Things with "SPACE"', words: ['OUTER', 'KEY', 'BACK', 'MY'] },
    { theme: 'Words meaning "steal"', words: ['NICK', 'SWIPE', 'PINCH', 'LIFT'] },
  ]},
  { groups: [
    { theme: 'Mario characters', words: ['PEACH', 'TOAD', 'BOO', 'ROSALINA'] },
    { theme: '___ BALL', words: ['BASKET', 'SNOW', 'FIRE', 'EYE'] },
    { theme: 'British slang for "good"', words: ['MINT', 'SICK', 'WICKED', 'PROPER'] },
    { theme: 'Words with all vowels missing', words: ['RHYTHM', 'CRYPT', 'GLYPH', 'LYNCH'] },
  ]},
  { groups: [
    { theme: 'Football positions', words: ['KEEPER', 'STRIKER', 'WINGER', 'SWEEPER'] },
    { theme: 'Minecraft blocks', words: ['OBSIDIAN', 'BEDROCK', 'DIAMOND', 'EMERALD'] },
    { theme: 'Phrases: "ON THE ___"', words: ['SPOT', 'FENCE', 'ROCKS', 'HOUSE'] },
    { theme: 'Palindromes', words: ['LEVEL', 'KAYAK', 'CIVIC', 'RADAR'] },
  ]},
]

function DailyConnections({ userId, onBack, onWin }) {
  const [puzzle, setPuzzle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState([])
  const [solved, setSolved] = useState([])
  const [mistakes, setMistakes] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)
  const [shake, setShake] = useState(false)
  const [message, setMessage] = useState('')
  const maxMistakes = 4

  useEffect(() => {
    async function load() {
      const saved = getDailyGameState(userId, 'connections')
      let puzzles = getDailyPuzzles()

      if (!puzzles?.connections) {
        try {
          const res = await authedFetch('/api/claude/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-sonnet-5',
              max_tokens: 800,
              messages: [{
                role: 'user',
                content: `Generate a Connections puzzle for Year 6 students (age 11-12). Create 4 groups of 4 words each. Each group shares a theme — use vocabulary, synonyms, and categories that are slightly challenging. The groups should go from easier to harder.

Return ONLY valid JSON:
{"groups":[{"theme":"...","words":["w1","w2","w3","w4"]},{"theme":"...","words":["w1","w2","w3","w4"]},{"theme":"...","words":["w1","w2","w3","w4"]},{"theme":"...","words":["w1","w2","w3","w4"]}]}

Each word should be a single word (no spaces). Make the connections tricky — some words should plausibly fit multiple groups.`
              }]
            })
          })
          const data = await res.json()
          const text = data.content?.[0]?.text || ''
          const match = text.match(/\{[\s\S]*\}/)
          if (match) {
            const parsed = JSON.parse(match[0])
            if (parsed.groups?.length === 4) {
              const existing = getDailyPuzzles() || {}
              setDailyPuzzles({ ...existing, connections: parsed })
              puzzles = { ...existing, connections: parsed }
            }
          }
        } catch (e) {
          console.error('Failed to generate connections:', e)
        }
      }

      if (!puzzles?.connections) {
        const fallback = FALLBACK_CONNECTIONS[new Date().getDate() % FALLBACK_CONNECTIONS.length]
        const existing = getDailyPuzzles() || {}
        setDailyPuzzles({ ...existing, connections: fallback })
        puzzles = { ...existing, connections: fallback }
      }

      if (puzzles?.connections) {
        setPuzzle(puzzles.connections)
        if (saved) {
          setSolved(saved.solved || [])
          setMistakes(saved.mistakes || 0)
          setGameOver(saved.gameOver || false)
          setWon(saved.won || false)
        }
      }
      setLoading(false)
    }
    load()
  }, [userId])

  const shuffledWords = useCallback(() => {
    if (!puzzle) return []
    const solvedWords = new Set(solved.flatMap(g => puzzle.groups[g].words))
    const remaining = puzzle.groups.flatMap((g, i) => g.words.map(w => ({ word: w, group: i })))
      .filter(w => !solvedWords.has(w.word))
    const seed = userId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = (seed * (i + 1) * 31) % (i + 1)
      ;[remaining[i], remaining[j]] = [remaining[j], remaining[i]]
    }
    return remaining
  }, [puzzle, solved, userId])

  function showMsg(text) {
    setMessage(text)
    setTimeout(() => setMessage(''), 2000)
  }

  function toggleWord(word) {
    if (gameOver) return
    if (selected.includes(word)) {
      setSelected(s => s.filter(w => w !== word))
    } else if (selected.length < 4) {
      setSelected(s => [...s, word])
    }
  }

  function submitGroup() {
    if (selected.length !== 4 || !puzzle) return

    const matchGroup = puzzle.groups.findIndex(g =>
      g.words.every(w => selected.includes(w))
    )

    if (matchGroup !== -1) {
      const newSolved = [...solved, matchGroup]
      setSolved(newSolved)
      setSelected([])

      if (newSolved.length === 4) {
        setGameOver(true)
        setWon(true)
        saveDailyGameState(userId, 'connections', { solved: newSolved, mistakes, gameOver: true, won: true })
        awardDailyGameCoins(userId, 'connections', 10)
        if (onWin) onWin()
        showMsg('Solved! +10 Coins!')
      } else {
        saveDailyGameState(userId, 'connections', { solved: newSolved, mistakes, gameOver: false, won: false })
      }
    } else {
      const newMistakes = mistakes + 1
      setMistakes(newMistakes)
      setShake(true)
      setTimeout(() => setShake(false), 500)

      if (newMistakes >= maxMistakes) {
        setGameOver(true)
        setWon(false)
        const allSolved = puzzle.groups.map((_, i) => i)
        setSolved(allSolved)
        saveDailyGameState(userId, 'connections', { solved: allSolved, mistakes: newMistakes, gameOver: true, won: false })
        showMsg('Out of attempts!')
      } else {
        saveDailyGameState(userId, 'connections', { solved, mistakes: newMistakes, gameOver: false, won: false })
        showMsg(`Not quite! ${maxMistakes - newMistakes} mistakes left`)
      }
    }
  }

  if (loading) return (
    <div className="game-page">
      <div className="game-header">
        <button className="btn btn-outline" onClick={onBack}>Back</button>
        <div className="game-title">Connections</div>
      </div>
      <div className="game-loading"><div className="bg-trivia-spinner" /> Generating puzzle...</div>
    </div>
  )

  if (!puzzle) return (
    <div className="game-page">
      <div className="game-header">
        <button className="btn btn-outline" onClick={onBack}>Back</button>
        <div className="game-title">Connections</div>
      </div>
      <div className="game-loading">Failed to load puzzle. Try again later.</div>
    </div>
  )

  const words = shuffledWords()

  return (
    <div className="game-page">
      <div className="game-header">
        <button className="btn btn-outline" onClick={onBack}>Back</button>
        <div className="game-title">Connections</div>
        <div className="game-reward">
          <img src="/coin.png" alt="" style={{ width: 16, height: 16 }} />
          <span>10</span>
        </div>
      </div>

      <p className="conn-instructions">Create four groups of four!</p>

      {message && <div className="wdl-message">{message}</div>}

      {/* Solved groups */}
      {solved.map((gi, si) => (
        <div key={gi} className="conn-solved-group" style={{ background: GROUP_COLORS[gi] }}>
          <div className="conn-solved-theme">{puzzle.groups[gi].theme}</div>
          <div className="conn-solved-words">{puzzle.groups[gi].words.join(', ')}</div>
        </div>
      ))}

      {/* Remaining words grid */}
      {!gameOver && (
        <div className={`conn-grid ${shake ? 'wdl-row-shake' : ''}`}>
          {words.map(({ word }) => (
            <button
              key={word}
              className={`conn-word ${selected.includes(word) ? 'conn-word-selected' : ''}`}
              onClick={() => toggleWord(word)}
            >
              {word}
            </button>
          ))}
        </div>
      )}

      {!gameOver && (
        <div className="conn-actions">
          <button className="btn btn-outline" onClick={() => setSelected([])} disabled={selected.length === 0}>Deselect All</button>
          <button className="btn" onClick={submitGroup} disabled={selected.length !== 4}>Submit</button>
        </div>
      )}

      {!gameOver && (
        <div className="conn-mistakes">
          <span className="conn-mistakes-label">Mistakes remaining:</span>
          {Array.from({ length: maxMistakes }).map((_, i) => (
            <span key={i} className={`conn-mistake-dot ${i < mistakes ? 'conn-mistake-used' : ''}`} />
          ))}
        </div>
      )}

      {gameOver && (
        <div className={`wdl-result ${won ? 'wdl-result-win' : 'wdl-result-lose'}`}>
          {won ? `Solved with ${mistakes} mistake${mistakes !== 1 ? 's' : ''}!` : 'Better luck tomorrow!'}
        </div>
      )}
    </div>
  )
}

export default DailyConnections
