import { useState, useEffect, useRef, useCallback } from 'react'
import { getDailyGameState, saveDailyGameState, awardDailyGameTokens, getDailyPuzzles, setDailyPuzzles, getDailyGameScores } from '../../data/store.js'
import { authedFetch } from '../../data/auth.js'

const GAME_DURATION = 90
const GRID_SIZE = 4
const MIN_WORD_LEN = 3
// Below this the timer stops being a label and starts being a warning.
const PANIC_AT = 15
// How close to the middle of a cell the pointer has to come, as a fraction of
// the cell's size. Hit-testing whole rectangles meant a diagonal drag clipped
// the corner of the cell it passed and locked onto that instead of the one
// being aimed at; requiring the pointer near a centre makes the diagonal
// neighbour the nearest thing when you are heading for it.
const CELL_HIT_RADIUS = 0.42

const FALLBACK_PUZZLES = [
  {
    grid: [['S','T','A','R'],['E','N','D','O'],['L','I','G','H'],['P','A','C','K']],
    words: ['star','stare','stand','send','send','line','light','lend','den','dig','dine','done','knit','knack','pack','page','pain','pale','gist','glen','gain','end','old','nil','age','rig','kin','tin','can','ace','ice','lid','hid','nod','lit','hit','ran','tan','din','gin']
  },
  {
    grid: [['B','R','I','T'],['A','N','G','E'],['L','O','S','T'],['M','E','D','S']],
    words: ['bring','rings','sting','angel','angle','stone','tones','notes','onset','store','rose','nose','lost','most','mole','sole','ring','sing','long','song','gone','rest','nest','best','some','dose','ride','tide','side','old','one','son','ten','rig','big','lot','not','set','red','med','ego','age']
  },
  {
    grid: [['W','O','R','D'],['H','U','N','T'],['S','A','M','E'],['L','I','K','E']],
    words: ['word','hunt','same','like','work','worm','worn','drum','turn','mask','mast','name','tame','dame','sake','make','hike','mike','ahem','runt','dunk','sunk','them','tune','dune','run','sun','nun','ham','ram','dam','sum','hum','nut','rut','hen','men','den','tan','man','kin','aim','elk']
  },
]

function isAdjacent(r1, c1, r2, c2) {
  return Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1 && !(r1 === r2 && c1 === c2)
}

/**
 * The line through the letters being traced.
 *
 * Drawn as one SVG polyline over the grid rather than as a border on each
 * cell, because the old per-cell marker could not show the segment between
 * two cells and so there was nothing at all to follow while dragging. The
 * last segment runs to wherever the finger is, so the line leads the eye.
 */
function WordHuntTrail({ points, pointer, gridRef }) {
  if (!points.length) return null
  const g = gridRef.current?.getBoundingClientRect()
  const live = pointer && g ? [pointer[0] - g.left, pointer[1] - g.top] : null
  const all = live ? [...points, live] : points
  const d = all.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  return (
    <svg className="wh-trail" aria-hidden="true">
      <path className="wh-trail-line" d={d} />
      {points.map(([x, y], i) => (
        <circle key={i} className="wh-trail-dot" cx={x} cy={y} r="5" />
      ))}
    </svg>
  )
}

function DailyWordHunt({ userId, onBack, onWin }) {
  const [puzzle, setPuzzle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [found, setFound] = useState([])
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION)
  const [started, setStarted] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [message, setMessage] = useState('')
  const [path, setPath] = useState([])
  const [dragging, setDragging] = useState(false)
  const [lastValid, setLastValid] = useState(null)
  // Where the finger is right now, so the trail can be drawn from the last
  // letter to the pointer rather than stopping at the last letter.
  const [pointer, setPointer] = useState(null)
  const [stats, setStats] = useState(null)
  const timerRef = useRef(null)
  const gridRef = useRef(null)
  const cellRefs = useRef({})
  // The dictionary is 387KB and belongs nowhere near the main bundle, so it
  // is fetched while the puzzle is being generated and parked here. Until it
  // arrives the game falls back to the generated word list, which is what it
  // always used.
  const dictRef = useRef(null)

  useEffect(() => {
    let alive = true
    import('../../data/wordsEn.js')
      .then((m) => { if (alive) dictRef.current = m.isEnglishWord })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    async function load() {
      const saved = getDailyGameState(userId, 'wordhunt')
      let puzzles = getDailyPuzzles()

      if (!puzzles?.wordhunt) {
        try {
          const res = await authedFetch('/api/claude/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-sonnet-5',
              max_tokens: 800,
              messages: [{
                role: 'user',
                content: `Generate a Word Hunt puzzle (like Boggle) for students aged 11-12. Create a 4x4 grid of letters where many words can be formed by tracing adjacent letters (horizontally, vertically, or diagonally). Each cell can only be used once per word.

Choose letters that form MANY valid 3-6 letter English words. Use common consonants (S,T,R,N,L) and vowels. Avoid Q,X,Z.

Return ONLY valid JSON:
{"grid":[["A","B","C","D"],["E","F","G","H"],["I","J","K","L"],["M","N","O","P"]],"words":["word1","word2",...]}

grid: 4 arrays of 4 uppercase letters.
words: 30-60 valid English words of 3+ letters that can be traced through adjacent cells (each cell used at most once per word). Common English words only, lowercase. Include the adjacency path mentally — every word MUST be traceable.`
              }]
            })
          })
          const data = await res.json()
          const text = data.content?.[0]?.text || ''
          const match = text.match(/\{[\s\S]*\}/)
          if (match) {
            const parsed = JSON.parse(match[0])
            if (parsed.grid?.length === 4 && parsed.grid[0]?.length === 4 && parsed.words?.length > 0) {
              const existing = getDailyPuzzles() || {}
              setDailyPuzzles({ ...existing, wordhunt: parsed })
              puzzles = { ...existing, wordhunt: parsed }
            }
          }
        } catch (e) {
          console.error('Failed to generate wordhunt:', e)
        }
      }

      if (!puzzles?.wordhunt) {
        const fallback = FALLBACK_PUZZLES[new Date().getDate() % FALLBACK_PUZZLES.length]
        const existing = getDailyPuzzles() || {}
        setDailyPuzzles({ ...existing, wordhunt: fallback })
        puzzles = { ...existing, wordhunt: fallback }
      }

      if (puzzles?.wordhunt) {
        setPuzzle(puzzles.wordhunt)
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
            setGameOver(true)
            return 0
          }
          return t - 1
        })
      }, 1000)
      return () => clearInterval(timerRef.current)
    }
  }, [started, gameOver])

  useEffect(() => {
    if (gameOver && started && puzzle) {
      const pts = found.reduce((sum, w) => sum + (w.length <= 3 ? 1 : w.length <= 4 ? 2 : w.length <= 5 ? 4 : 6), 0)
      // The score is written down, not just the words, so the board can be
      // compared against everyone else's without re-scoring each of them.
      saveDailyGameState(userId, 'wordhunt', { found, score: pts, gameOver: true })
      awardDailyGameTokens(userId, 'wordhunt', 10)
      setStats(getDailyGameScores('wordhunt', (st) => st.score, userId))
      if (onWin) onWin()
    }
  }, [gameOver])

  function showMsg(text) {
    setMessage(text)
    setTimeout(() => setMessage(''), 1200)
  }

  function getWordFromPath(p) {
    if (!puzzle) return ''
    return p.map(([r, c]) => puzzle.grid[r][c]).join('').toLowerCase()
  }

  /**
   * Which letter the pointer is on.
   *
   * The nearest cell centre, and only if the pointer is actually near it. The
   * old version returned whichever rectangle contained the point, so a drag
   * from one corner of the board towards the opposite one passed through the
   * edge of the cell between them and snapped there - which is why dragging
   * diagonally kept flicking to a corner tile.
   */
  function getCellFromPoint(x, y) {
    let best = null
    let bestDist = Infinity
    let size = 0
    for (const key in cellRefs.current) {
      const el = cellRefs.current[key]
      if (!el) continue
      const rect = el.getBoundingClientRect()
      size = Math.max(size, rect.width, rect.height)
      const dx = x - (rect.left + rect.width / 2)
      const dy = y - (rect.top + rect.height / 2)
      const dist = Math.hypot(dx, dy)
      if (dist < bestDist) {
        bestDist = dist
        best = key.split('-').map(Number)
      }
    }
    if (!best || bestDist > size * CELL_HIT_RADIUS) return null
    return best
  }

  /** Centres of the traced cells, in the grid's own coordinates. */
  function pathPoints() {
    const grid = gridRef.current
    if (!grid) return []
    const g = grid.getBoundingClientRect()
    return path.map(([r, c]) => {
      const el = cellRefs.current[`${r}-${c}`]
      if (!el) return null
      const rect = el.getBoundingClientRect()
      return [rect.left + rect.width / 2 - g.left, rect.top + rect.height / 2 - g.top]
    }).filter(Boolean)
  }

  /** A short buzz when a letter is picked up, where the device has one. */
  function buzz(ms) {
    try { navigator.vibrate?.(ms) } catch { /* not every device, not every browser */ }
  }

  function handlePointerDown(r, c, e) {
    if (gameOver || !started) return
    setDragging(true)
    setPath([[r, c]])
    if (e) setPointer([e.clientX, e.clientY])
    buzz(12)
  }

  const handlePointerMove = useCallback((e) => {
    if (!dragging || gameOver) return
    e.preventDefault()
    const touch = e.touches ? e.touches[0] : e
    setPointer([touch.clientX, touch.clientY])
    const cell = getCellFromPoint(touch.clientX, touch.clientY)
    if (!cell) return
    const [r, c] = cell

    setPath(prev => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      if (last[0] === r && last[1] === c) return prev

      // Dragging back onto the cell before this one undoes the last step.
      // findIndex answers -1 when the cell is not in the path at all, and for
      // a path of one cell length - 2 is also -1 - so every first move looked
      // like a backtrack and cleared the trace. Pressing a letter worked and
      // sliding did nothing, which is what "the word search is undraggable"
      // was.
      const prevIdx = prev.findIndex(([pr, pc]) => pr === r && pc === c)
      if (prevIdx !== -1 && prevIdx === prev.length - 2) {
        return prev.slice(0, -1)
      }

      if (prev.some(([pr, pc]) => pr === r && pc === c)) return prev

      if (!isAdjacent(last[0], last[1], r, c)) return prev

      buzz(10)
      return [...prev, [r, c]]
    })
  }, [dragging, gameOver])

  const handlePointerUp = useCallback(() => {
    if (!dragging) return
    setDragging(false)
    setPointer(null)

    const word = getWordFromPath(path)
    if (word.length < MIN_WORD_LEN) {
      if (path.length > 1) showMsg('Too short!')
      setPath([])
      return
    }

    if (found.includes(word)) {
      showMsg('Already found!')
      setPath([])
      return
    }

    // The path already proves the word can be traced on this grid. All that is
    // left to establish is that it is English - which the generated word list
    // was being asked to decide, and could not: it is always a fraction of
    // what a 4x4 board contains, so real words were being rejected.
    const inDictionary = dictRef.current ? dictRef.current(word) : false
    if (inDictionary || puzzle.words.includes(word)) {
      const pts = word.length <= 3 ? 1 : word.length <= 4 ? 2 : word.length <= 5 ? 4 : 6
      setFound(prev => [...prev, word])
      showMsg(`${word.toUpperCase()} +${pts}`)
      buzz(28)
    } else {
      showMsg('Not a word')
    }
    setPath([])
  }, [dragging, path, found, puzzle])

  useEffect(() => {
    const opts = { passive: false }
    window.addEventListener('pointermove', handlePointerMove, opts)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('touchmove', handlePointerMove, opts)
    window.addEventListener('touchend', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, opts)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('touchmove', handlePointerMove)
      window.removeEventListener('touchend', handlePointerUp)
    }
  }, [handlePointerMove, handlePointerUp])

  function isInPath(r, c) {
    return path.some(([pr, pc]) => pr === r && pc === c)
  }

  function getPathIndex(r, c) {
    return path.findIndex(([pr, pc]) => pr === r && pc === c)
  }

  function startGame() {
    setStarted(true)
    setTimeLeft(GAME_DURATION)
  }

  const score = found.reduce((sum, w) => {
    const len = w.length
    return sum + (len <= 3 ? 1 : len <= 4 ? 2 : len <= 5 ? 4 : 6)
  }, 0)

  const currentWord = getWordFromPath(path)

  if (loading) return (
    <div className="game-page">
      <div className="game-header">
        <button className="btn btn-outline" onClick={onBack}>Back</button>
        <div className="game-title">Word Hunt</div>
      </div>
      <div className="game-loading"><div className="bg-trivia-spinner" /> Generating puzzle...</div>
    </div>
  )

  if (!puzzle) return (
    <div className="game-page">
      <div className="game-header">
        <button className="btn btn-outline" onClick={onBack}>Back</button>
        <div className="game-title">Word Hunt</div>
      </div>
      <div className="game-loading">Failed to load puzzle.</div>
    </div>
  )

  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60

  return (
    <div className="game-page">
      <div className="game-header">
        <button className="btn btn-outline" onClick={onBack}>Back</button>
        <div className="game-title">Word Hunt</div>
        <div className="game-reward">
          <img src="/token.png" alt="" style={{ width: 16, height: 16 }} />
          <span>10</span>
        </div>
      </div>

      {message && <div className="wdl-message">{message}</div>}

      {!started && !gameOver && (
        <div className="wh-start">
          <div className="wh-preview-grid">
            {puzzle.grid.map((row, r) => (
              <div key={r} className="wh-preview-row">
                {row.map((letter, c) => (
                  <span key={c} className="wh-preview-cell">{letter}</span>
                ))}
              </div>
            ))}
          </div>
          <p className="wh-start-text">Drag across adjacent letters to form words. Find as many as you can in 90 seconds!</p>
          <div className="wh-scoring">
            <span>3 letters = 1pt</span>
            <span>4 letters = 2pts</span>
            <span>5 letters = 4pts</span>
            <span>6+ letters = 6pts</span>
          </div>
          <button className="btn" onClick={startGame} style={{ padding: '14px 40px', marginTop: 12 }}>Start!</button>
        </div>
      )}

      {started && (
        <>
          <div className="wb-status-bar">
            <div className={`wb-timer${timeLeft <= PANIC_AT && timeLeft > 0 ? ' wh-timer-panic' : ''}`}>
              {mins}:{String(secs).padStart(2, '0')}
            </div>
            <div className="wb-score">{score} pts</div>
            <div className="wb-found-count">{found.length} words</div>
          </div>

          <div className="wh-current-word">
            {currentWord ? currentWord.toUpperCase() : ' '}
          </div>

          <div
            className="wh-grid"
            ref={gridRef}
            style={{ touchAction: 'none' }}
          >
            <WordHuntTrail points={pathPoints()} pointer={pointer} gridRef={gridRef} />
            {puzzle.grid.map((row, r) => (
              <div key={r} className="wh-grid-row">
                {row.map((letter, c) => {
                  const active = isInPath(r, c)
                  const idx = getPathIndex(r, c)
                  return (
                    <div
                      key={c}
                      ref={el => cellRefs.current[`${r}-${c}`] = el}
                      className={`wh-cell${active ? ' wh-cell-active' : ''}${idx === 0 ? ' wh-cell-start' : ''}${active && idx === path.length - 1 && dragging ? ' wh-cell-held' : ''}`}
                      onPointerDown={(e) => { e.preventDefault(); handlePointerDown(r, c, e) }}
                      onTouchStart={(e) => { e.preventDefault(); handlePointerDown(r, c, e.touches?.[0]) }}
                    >
                      <span className="wh-cell-letter">{letter}</span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="wh-found-list">
            {[...found].sort((a, b) => b.length - a.length).map(w => (
              <span key={w} className="wh-found-word">
                {w}
                <span className="wh-found-pts">+{w.length <= 3 ? 1 : w.length <= 4 ? 2 : w.length <= 5 ? 4 : 6}</span>
              </span>
            ))}
          </div>

          {gameOver && <div className="wh-timesup" role="status">Time&rsquo;s up!</div>}

          {gameOver && (
            <div className="wdl-result wdl-result-win">
              {found.length} word{found.length === 1 ? '' : 's'} &mdash; {score} points
              {stats && stats.played > 1 && (
                <div className="wh-compare">
                  <div className="wh-compare-row">
                    <span className="wh-compare-big">#{stats.rank}</span>
                    <span className="wh-compare-of">of {stats.played} today</span>
                  </div>
                  <div className="wh-compare-bars">
                    <span className="wh-compare-bar" style={{ width: `${stats.best ? Math.round((score / stats.best) * 100) : 0}%` }} />
                  </div>
                  <div className="wh-compare-meta">
                    <span>Average {stats.average}</span>
                    <span>Best {stats.best}</span>
                  </div>
                </div>
              )}
              <div style={{ marginTop: 8, fontSize: '0.75rem', opacity: 0.7 }}>
                Missed: {puzzle.words.filter(w => !found.includes(w)).slice(0, 12).join(', ')}
                {puzzle.words.filter(w => !found.includes(w)).length > 12 ? '...' : ''}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default DailyWordHunt
