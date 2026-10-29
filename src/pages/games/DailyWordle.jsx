import { useState, useEffect, useCallback } from 'react'
import { getDailyGameState, saveDailyGameState, awardDailyGameTokens, getTodayTriviaKey, recordWordleSolve } from '../../data/store.js'
import { isRealWord } from '../../data/words5.js'

/**
 * The pool the daily word is drawn from.
 *
 * Sorted, with no repeats, and every entry checked against the guess
 * dictionary by scripts/check-wordle-answers.mjs. It used to hold HEMP, which
 * is four letters long and made the day it came up unsolvable; JOSIE, which is
 * a name; VOCAB, which is an abbreviation; and nine duplicates, which were
 * twice as likely to come up as anything else.
 */
const WORDS = [
  'ABYSS', 'ACORN', 'ADORN', 'ANGEL', 'APPLE', 'AXIOM', 'BADGE', 'BASIL', 'BEACH', 'BLAZE',
  'BLINK', 'BLISS', 'BLOOM', 'BRAVE', 'BRAWL', 'BREAD', 'BRINE', 'BRISK', 'BUDGE', 'CAMEL',
  'CEDAR', 'CHAIN', 'CHARM', 'CHESS', 'CHIMP', 'CIDER', 'CLEFT', 'CLIMB', 'CLOUD', 'COMET',
  'CORAL', 'CRANE', 'CREST', 'DANCE', 'DELTA', 'DENIM', 'DEPTH', 'DIVER', 'DODGE', 'DOUGH',
  'DRAPE', 'DREAM', 'DRIFT', 'DRYAD', 'DWARF', 'DWELT', 'EAGLE', 'EARTH', 'EASEL', 'ELBOW',
  'ELEGY', 'ELFIN', 'EMBER', 'ENSUE', 'ERUPT', 'EVENT', 'EXACT', 'EXILE', 'EXPEL', 'FABLE',
  'FAIRY', 'FERRY', 'FIBER', 'FJORD', 'FLAME', 'FLORA', 'FLOUR', 'FLUTE', 'FOCAL', 'FORGE',
  'FROST', 'FUDGE', 'GHOST', 'GIANT', 'GIDDY', 'GLEAM', 'GLOBE', 'GLYPH', 'GOLEM', 'GRAIN',
  'GRAPE', 'GRASP', 'GRAZE', 'GRILL', 'GRIMY', 'GUAVA', 'HAPPY', 'HASTE', 'HATCH', 'HAVEN',
  'HEART', 'HEIST', 'HERON', 'HOIST', 'HOUSE', 'HOVER', 'HUSKY', 'HYENA', 'IDIOM', 'IGLOO',
  'IMAGE', 'IMPEL', 'INGOT', 'INLET', 'IRONY', 'ISSUE', 'IVORY', 'JAUNT', 'JELLY', 'JEWEL',
  'JOKER', 'JOUST', 'JUDGE', 'JUICE', 'JUMBO', 'KAPOK', 'KAYAK', 'KNACK', 'KNEEL', 'KNELT',
  'KNIFE', 'KNOLL', 'KOALA', 'KRAFT', 'LASER', 'LATCH', 'LEMON', 'LEVER', 'LIGHT', 'LILAC',
  'LITHE', 'LLAMA', 'LOTUS', 'LUCID', 'LUNAR', 'LYRIC', 'MAGIC', 'MAIZE', 'MANGO', 'MAPLE',
  'MARSH', 'MELON', 'MINOR', 'MIRTH', 'MOCHA', 'MOOSE', 'MORSE', 'MULCH', 'NASAL', 'NERVE',
  'NERVY', 'NEXUS', 'NICHE', 'NOBLE', 'NORTH', 'NOTCH', 'NUDGE', 'NYLON', 'OAKEN', 'OASIS',
  'OCEAN', 'OLIVE', 'OMEGA', 'OPERA', 'ORBIT', 'OTTER', 'OUGHT', 'OUNCE', 'OUTDO', 'OXIDE',
  'PANIC', 'PATCH', 'PEARL', 'PIANO', 'PIXIE', 'PLANK', 'PLANT', 'PLAZA', 'PLUMB', 'PLUME',
  'POISE', 'PRANK', 'PRISM', 'QUAKE', 'QUEEN', 'QUEST', 'QUILT', 'QUOTA', 'RADAR', 'RANCH',
  'RAPID', 'RATIO', 'REGAL', 'REIGN', 'RELAY', 'RESIN', 'RIDGE', 'RIVET', 'ROBIN', 'ROVER',
  'SAVOR', 'SCONE', 'SHAWL', 'SHINY', 'SIEGE', 'SLEET', 'SNAIL', 'SOLAR', 'SPARK', 'SPICE',
  'STORK', 'STORM', 'SWIRL', 'TALON', 'TEMPO', 'THIEF', 'THORN', 'TIGER', 'TOKEN', 'TOWER',
  'TRACE', 'TRAIL', 'TROUT', 'TULIP', 'TUNIC', 'ULTRA', 'UMBRA', 'UNCLE', 'UNIFY', 'UNITY',
  'UPSET', 'URBAN', 'USHER', 'USURP', 'VALOR', 'VAULT', 'VENOM', 'VERGE', 'VERSE', 'VIGOR',
  'VINYL', 'VIOLA', 'VIPER', 'VIVID', 'VOILA', 'WAGER', 'WALTZ', 'WATCH', 'WEAVE', 'WHEAT',
  'WHELP', 'WHISK', 'WINDY', 'WRIST', 'WRUNG', 'YIELD', 'YOUTH', 'ZONES',
]

function seededIdx(seed, max) {
  let h = seed | 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b)
  h = (h ^ (h >>> 16)) >>> 0
  return h % max
}

function getTodayWord() {
  const d = getTodayTriviaKey()
  const seed = d.split('-').reduce((a, b) => a * 100 + parseInt(b), 0)
  return WORDS[seededIdx(seed, WORDS.length)]
}

const KEYBOARD_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','DEL']
]

function DailyWordle({ userId, onBack, onWin }) {
  const answer = getTodayWord()
  const saved = getDailyGameState(userId, 'wordle')

  const [guesses, setGuesses] = useState(saved?.guesses || [])
  const [current, setCurrent] = useState('')
  const [shake, setShake] = useState(false)
  const [gameOver, setGameOver] = useState(saved?.gameOver || false)
  const [won, setWon] = useState(saved?.won || false)
  const [revealRow, setRevealRow] = useState(-1)
  const [message, setMessage] = useState('')

  const maxGuesses = 6

  const letterStates = {}
  for (let gi = 0; gi < guesses.length; gi++) {
    if (gi === revealRow) continue
    const guess = guesses[gi]
    for (let i = 0; i < 5; i++) {
      const l = guess[i]
      const state = getLetterState(guess, i, answer)
      const prev = letterStates[l]
      if (state === 'correct' || (!prev && state === 'present') || (!prev && state === 'absent')) {
        letterStates[l] = state
      }
      if (state === 'correct') letterStates[l] = 'correct'
    }
  }

  function getLetterState(guess, idx, ans) {
    if (guess[idx] === ans[idx]) return 'correct'
    if (ans.includes(guess[idx])) {
      const ansCount = [...ans].filter(c => c === guess[idx]).length
      const correctCount = [...guess].filter((c, i) => c === guess[idx] && ans[i] === c).length
      const priorPresent = [...guess].slice(0, idx).filter((c, i) => c === guess[idx] && ans[i] !== c).length
      if (correctCount + priorPresent < ansCount) return 'present'
    }
    return 'absent'
  }

  function showMsg(text) {
    setMessage(text)
    setTimeout(() => setMessage(''), 2000)
  }

  const submitGuess = useCallback(() => {
    if (gameOver) return
    if (current.length !== 5) {
      setShake(true)
      setTimeout(() => setShake(false), 500)
      showMsg('Not enough letters')
      return
    }

    // Any five letters used to be accepted, so a player could burn all six
    // rows on strings that are not words - and, worse, never find out that was
    // what they were doing.
    if (!isRealWord(current)) {
      setShake(true)
      setTimeout(() => setShake(false), 500)
      showMsg('Not in the word list')
      return
    }

    const newGuesses = [...guesses, current]
    setRevealRow(guesses.length)
    setTimeout(() => setRevealRow(-1), 1800)

    const isWin = current === answer
    const isLoss = newGuesses.length >= maxGuesses && !isWin

    setGuesses(newGuesses)
    setCurrent('')

    if (isWin || isLoss) {
      setTimeout(() => {
        setGameOver(true)
        setWon(isWin)
        const state = { guesses: newGuesses, gameOver: true, won: isWin }
        saveDailyGameState(userId, 'wordle', state)
        if (isWin) {
          awardDailyGameTokens(userId, 'wordle', 10)
          recordWordleSolve(userId)
          if (onWin) onWin()
          showMsg('You got it! +10 Tokens!')
        } else {
          saveDailyGameState(userId, 'wordle', { ...state, answer })
          showMsg(`The word was ${answer}`)
        }
      }, 1600)
    } else {
      saveDailyGameState(userId, 'wordle', { guesses: newGuesses, gameOver: false, won: false })
    }
  }, [current, guesses, gameOver, answer, userId, onWin])

  const handleKey = useCallback((key) => {
    if (gameOver) return
    if (key === 'ENTER') { submitGuess(); return }
    if (key === 'DEL' || key === 'BACKSPACE') { setCurrent(c => c.slice(0, -1)); return }
    if (/^[A-Z]$/.test(key) && current.length < 5) setCurrent(c => c + key)
  }, [current, gameOver, submitGuess])

  useEffect(() => {
    function onKeyDown(e) {
      const k = e.key.toUpperCase()
      if (k === 'ENTER' || k === 'BACKSPACE' || (k.length === 1 && /[A-Z]/.test(k))) {
        e.preventDefault()
        handleKey(k)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleKey])

  const rows = []
  for (let r = 0; r < maxGuesses; r++) {
    const guess = guesses[r]
    const isCurrentRow = r === guesses.length && !gameOver
    const tiles = []
    for (let c = 0; c < 5; c++) {
      let letter = ''
      let state = 'empty'
      let animDelay = ''
      if (guess) {
        letter = guess[c]
        state = getLetterState(guess, c, answer)
        if (r === revealRow) animDelay = `${c * 0.3}s`
      } else if (isCurrentRow && current[c]) {
        letter = current[c]
        state = 'tbd'
      }
      tiles.push(
        <div
          key={c}
          className={`wdl-tile wdl-tile-${state} ${r === revealRow ? 'wdl-tile-reveal' : ''} ${isCurrentRow && shake && !letter ? 'wdl-tile-shake' : ''} ${isCurrentRow && current[c] ? 'wdl-tile-pop' : ''}`}
          style={animDelay ? { animationDelay: animDelay } : {}}
        >
          {letter}
        </div>
      )
    }
    rows.push(<div key={r} className={`wdl-row ${r === guesses.length - 1 && shake ? 'wdl-row-shake' : ''}`}>{tiles}</div>)
  }

  return (
    <div className="game-page">
      <div className="game-header">
        <button className="btn btn-outline" onClick={onBack}>Back</button>
        <div className="game-title">Wordle</div>
        <div className="game-reward">
          <img src="/coin.png" alt="" style={{ width: 16, height: 16 }} />
          <span>10</span>
        </div>
      </div>

      {message && <div className="wdl-message">{message}</div>}

      <div className="wdl-board">{rows}</div>

      {gameOver && (
        <div className={`wdl-result ${won ? 'wdl-result-win' : 'wdl-result-lose'}`}>
          {won ? `Solved in ${guesses.length}/6!` : `The word was ${answer}`}
        </div>
      )}

      <div className="wdl-keyboard">
        {KEYBOARD_ROWS.map((row, ri) => (
          <div key={ri} className="wdl-kb-row">
            {row.map(key => {
              const state = letterStates[key] || ''
              const isWide = key === 'ENTER' || key === 'DEL'
              return (
                <button
                  key={key}
                  className={`wdl-key ${state ? `wdl-key-${state}` : ''} ${isWide ? 'wdl-key-wide' : ''}`}
                  onClick={() => handleKey(key)}
                  disabled={gameOver}
                >
                  {key === 'DEL' ? '⌫' : key}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export default DailyWordle
