import { useState, useEffect, useCallback } from 'react'
import { getDailyGameState, saveDailyGameState, awardDailyGameCoins, getTodayTriviaKey, recordWordleSolve } from '../../data/store.js'

const WORDS = [
  'CRANE','BRAVE','FLAME','GHOST','STORM','PLANT','DREAM','HOUSE','OCEAN','BEACH',
  'CLOUD','EARTH','FAIRY','GIANT','HAPPY','JUICE','KNEEL','LIGHT','MAGIC','NOBLE',
  'OLIVE','PEARL','QUEEN','ROVER','SHINY','TIGER','ULTRA','VIVID','WATCH','YIELD',
  'APPLE','BREAD','CHESS','DANCE','EAGLE','FROST','GRAPE','HEART','IMAGE','JELLY',
  'KNIFE','LUNAR','MAPLE','NERVE','ORBIT','PIANO','QUILT','RANCH','SOLAR','TOWER',
  'UNITY','VALOR','WHEAT','YOUTH','ZONES','ANGEL','BLOOM','CHARM','DRIFT','ELBOW',
  'FORGE','GLEAM','HAVEN','IVORY','JOKER','KAYAK','LEMON','MOOSE','NYLON','OPERA',
  'PRISM','QUEST','ROBIN','SPARK','TRAIL','UNCLE','VAULT','WINDY','AXIOM','BLAZE',
  'CIDER','DWARF','EVENT','FLUTE','GRAIN','HATCH','INGOT','JEWEL','KOALA','LILAC',
  'MELON','NORTH','OXIDE','PLUME','RADAR','SCONE','TULIP','USHER','VENOM','WALTZ',
  'BADGE','CAMEL','DEPTH','EMBER','FIBER','GLOBE','HASTE','IGLOO','JUDGE','KNACK',
  'LATCH','MARSH','NUDGE','OASIS','PATCH','RIDGE','SNAIL','THIEF','UPSET','VIGOR',
  'WRIST','BLINK','CHAIN','DODGE','EXACT','FLOUR','GRAZE','HOVER','INLET','JUMBO',
  'PLAZA','QUAKE','RATIO','SWIRL','TOKEN','UMBRA','VERSE','WEAVE','BASIL','CLIMB',
  'DELTA','EXPEL','FUDGE','GRILL','HAVEN','IVORY','JAUNT','LASER','MANGO','NOTCH',
  'OTTER','PANIC','RAPID','SIEGE','TROUT','UNIFY','VOILA','WHISK','CEDAR','DOUGH',
  'ERUPT','FABLE','GRASP','HYENA','IMPEL','LOTUS','MAIZE','NEXUS','OUNCE','PLANK',
  'REGAL','SPICE','THORN','URBAN','VINYL','WHELP','ADORN','BRAWL','CORAL','DENIM',
  'EASEL','FOCAL','GOLEM','HERON','IRONY','LLAMA','MORSE','NASAL','OUTDO','PIXIE',
  'RESIN','SHAWL','TALON','USURP','VIPER','BRISK','COMET','DRAPE','EXILE','FERRY',
  'GUAVA','HEMP','ISSUE','KRAFT','LEVER','MINOR','NOBLE','OXIDE','POISE','QUOTA',
  'RELAY','SAVOR','TEMPO','UNITY','VIOLA','WHEAT','BRINE','CREST','DIVER','ENSUE',
  'FLORA','GLYPH','HEIST','JOUST','KNELT','LITHE','MOCHA','OAKEN','PRANK','RIVET',
  'STORK','TUNIC','VOCAB','WAGER','ACORN','BLISS','CHIMP','DWELT','ELEGY','FROST',
  'GIDDY','HOIST','INLET','KNOLL','LYRIC','MULCH','NERVY','OUGHT','PLUMB','REIGN',
  'SLEET','TRACE','USHER','VERGE','WRUNG','ABYSS','BUDGE','CLEFT','DRYAD','ELFIN',
  'FJORD','GRIMY','HUSKY','IDIOM','JOSIE','KAPOK','LUCID','MIRTH','NICHE','OMEGA',
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
          awardDailyGameCoins(userId, 'wordle', 10)
          recordWordleSolve(userId)
          if (onWin) onWin()
          showMsg('You got it! +10 Coins!')
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
