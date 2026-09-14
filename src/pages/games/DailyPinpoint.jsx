import { useState, useEffect } from 'react'
import { getDailyGameState, saveDailyGameState, awardDailyGameCoins, getDailyPuzzles, setDailyPuzzles } from '../../data/store.js'
import { authedFetch } from '../../data/auth.js'

const CLUE_POINTS = [50, 40, 30, 20, 10]

function DailyPinpoint({ userId, onBack, onWin }) {
  const [puzzle, setPuzzle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [revealedClues, setRevealedClues] = useState(1)
  const [guess, setGuess] = useState('')
  const [guesses, setGuesses] = useState([])
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function load() {
      const saved = getDailyGameState(userId, 'pinpoint')
      let puzzles = getDailyPuzzles()

      if (!puzzles?.pinpoint) {
        try {
          const res = await authedFetch('/api/claude/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-sonnet-5',
              max_tokens: 400,
              messages: [{
                role: 'user',
                content: `Generate a Pinpoint puzzle for Year 6 students (age 11-12). Pick a single secret word (a noun, something kids would know). Create exactly 5 clues that progressively make the word easier to guess. Clue 1 is the most obscure/abstract, clue 5 is very obvious.

Return ONLY valid JSON:
{"answer":"...","clues":["hardest clue","harder clue","medium clue","easier clue","easiest clue"]}

The answer should be one word, capitalised. Clues should be 3-8 words each. No clue should contain the answer word.`
              }]
            })
          })
          const data = await res.json()
          const text = data.content?.[0]?.text || ''
          const match = text.match(/\{[\s\S]*\}/)
          if (match) {
            const parsed = JSON.parse(match[0])
            const existing = getDailyPuzzles() || {}
            setDailyPuzzles({ ...existing, pinpoint: parsed })
            puzzles = { ...existing, pinpoint: parsed }
          }
        } catch (e) {
          console.error('Failed to generate pinpoint:', e)
          setLoading(false)
          return
        }
      }

      if (puzzles?.pinpoint) {
        setPuzzle(puzzles.pinpoint)
        if (saved) {
          setRevealedClues(saved.revealedClues || 1)
          setGuesses(saved.guesses || [])
          setGameOver(saved.gameOver || false)
          setWon(saved.won || false)
        }
      }
      setLoading(false)
    }
    load()
  }, [userId])

  function showMsg(text) {
    setMessage(text)
    setTimeout(() => setMessage(''), 2500)
  }

  function handleGuess(e) {
    e.preventDefault()
    if (gameOver || !guess.trim() || !puzzle) return

    const g = guess.trim().toUpperCase()
    const newGuesses = [...guesses, g]
    setGuesses(newGuesses)
    setGuess('')

    if (g === puzzle.answer.toUpperCase()) {
      setGameOver(true)
      setWon(true)
      const coins = CLUE_POINTS[revealedClues - 1] || 10
      saveDailyGameState(userId, 'pinpoint', { revealedClues, guesses: newGuesses, gameOver: true, won: true })
      awardDailyGameCoins(userId, 'pinpoint', coins)
      if (onWin) onWin()
      showMsg(`Correct! +${coins} Coins!`)
    } else if (revealedClues < 5) {
      const next = revealedClues + 1
      setRevealedClues(next)
      saveDailyGameState(userId, 'pinpoint', { revealedClues: next, guesses: newGuesses, gameOver: false, won: false })
      showMsg('Not quite — here\'s another clue!')
    } else {
      setGameOver(true)
      setWon(false)
      saveDailyGameState(userId, 'pinpoint', { revealedClues: 5, guesses: newGuesses, gameOver: true, won: false })
      showMsg(`The answer was ${puzzle.answer}`)
    }
  }

  function handleSkip() {
    if (gameOver || revealedClues >= 5) return
    const next = revealedClues + 1
    setRevealedClues(next)
    saveDailyGameState(userId, 'pinpoint', { revealedClues: next, guesses, gameOver: false, won: false })
  }

  if (loading) return (
    <div className="game-page">
      <div className="game-header">
        <button className="btn btn-outline" onClick={onBack}>Back</button>
        <div className="game-title">Pinpoint</div>
      </div>
      <div className="game-loading"><div className="bg-trivia-spinner" /> Generating puzzle...</div>
    </div>
  )

  if (!puzzle) return (
    <div className="game-page">
      <div className="game-header">
        <button className="btn btn-outline" onClick={onBack}>Back</button>
        <div className="game-title">Pinpoint</div>
      </div>
      <div className="game-loading">Failed to load puzzle. Try again later.</div>
    </div>
  )

  return (
    <div className="game-page">
      <div className="game-header">
        <button className="btn btn-outline" onClick={onBack}>Back</button>
        <div className="game-title">Pinpoint</div>
        <div className="game-reward">
          <img src="/coin.png" alt="" style={{ width: 16, height: 16 }} />
          <span>{CLUE_POINTS[revealedClues - 1] || 10}</span>
        </div>
      </div>

      <p className="pp-instructions">Guess the secret word from the clues. Fewer clues = more coins!</p>

      {message && <div className="wdl-message">{message}</div>}

      <div className="pp-clues">
        {puzzle.clues.map((clue, i) => (
          <div key={i} className={`pp-clue ${i < revealedClues ? 'pp-clue-revealed' : 'pp-clue-hidden'}`}>
            <span className="pp-clue-num">{i + 1}</span>
            <span className="pp-clue-text">{i < revealedClues ? clue : '???'}</span>
            {i < revealedClues && (
              <span className="pp-clue-points">{CLUE_POINTS[i]} pts</span>
            )}
          </div>
        ))}
      </div>

      {guesses.length > 0 && (
        <div className="pp-guesses">
          {guesses.map((g, i) => (
            <div key={i} className={`pp-guess ${g === puzzle.answer.toUpperCase() ? 'pp-guess-correct' : 'pp-guess-wrong'}`}>
              {g} {g === puzzle.answer.toUpperCase() ? '✓' : '✗'}
            </div>
          ))}
        </div>
      )}

      {!gameOver && (
        <form className="pp-input-row" onSubmit={handleGuess}>
          <input
            className="pp-input"
            value={guess}
            onChange={e => setGuess(e.target.value)}
            placeholder="Type your guess..."
            autoFocus
          />
          <button type="submit" className="btn" disabled={!guess.trim()}>Guess</button>
          {revealedClues < 5 && (
            <button type="button" className="btn btn-outline" onClick={handleSkip}>Skip</button>
          )}
        </form>
      )}

      {gameOver && (
        <div className={`wdl-result ${won ? 'wdl-result-win' : 'wdl-result-lose'}`}>
          {won
            ? `Got it with ${revealedClues} clue${revealedClues !== 1 ? 's' : ''}!`
            : `The answer was ${puzzle.answer}`
          }
        </div>
      )}
    </div>
  )
}

export default DailyPinpoint
