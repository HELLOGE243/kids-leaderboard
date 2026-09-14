import { useState, useEffect, useMemo } from 'react'
import { getDailyGameState, saveDailyGameState, awardDailyGameCoins } from '../../data/store.js'
import { authedFetch } from '../../data/auth.js'

const FALLBACK_SETS = [
  {
    words: [
      { word: 'abundant', definition: 'Existing in large quantities; more than enough', example: 'The garden had an abundant supply of fresh vegetables.' },
      { word: 'reluctant', definition: 'Unwilling and hesitant; not eager to do something', example: 'She was reluctant to leave the party early.' },
      { word: 'vivid', definition: 'Producing powerful feelings or strong, clear images in the mind', example: 'He gave a vivid description of the sunset.' },
      { word: 'venture', definition: 'A risky or daring journey or undertaking', example: 'Their venture into the dark forest was exciting.' },
      { word: 'peculiar', definition: 'Strange or odd; unusual', example: 'There was a peculiar smell coming from the kitchen.' },
      { word: 'essential', definition: 'Absolutely necessary; extremely important', example: 'Water is essential for survival.' },
    ],
    passage: 'The explorers set out on a dangerous _1_ through the rainforest. The _2_ supply of tropical fruit kept them well fed. One morning they noticed a _3_ sound coming from the trees. It was _4_ that they stayed calm and quiet. Though _5_ at first, they crept forward to investigate. The sight that greeted them was _6_ — a waterfall cascading into a crystal-clear pool.',
    blanks: ['venture', 'abundant', 'peculiar', 'essential', 'reluctant', 'vivid'],
  },
  {
    words: [
      { word: 'diligent', definition: 'Having or showing care in one\'s work or duties', example: 'The diligent student finished all homework on time.' },
      { word: 'tranquil', definition: 'Free from disturbance; calm and peaceful', example: 'The lake was tranquil in the early morning.' },
      { word: 'endeavour', definition: 'An attempt to achieve a goal; to try hard', example: 'She made every endeavour to improve her writing.' },
      { word: 'eloquent', definition: 'Fluent or persuasive in speaking or writing', example: 'The speaker gave an eloquent speech about kindness.' },
      { word: 'fragile', definition: 'Easily broken or damaged; delicate', example: 'Handle the fragile vase with care.' },
      { word: 'triumph', definition: 'A great victory or achievement', example: 'Winning the spelling bee was a great triumph.' },
    ],
    passage: 'After weeks of _1_ practice, Maya stepped onto the stage for the public speaking contest. The hall was _2_ as the audience waited. Her _3_ to win had pushed her to memorise every word. She spoke in an _4_ voice that captivated everyone. Her confidence was not _5_ — it was strong and steady. When the judges announced her name, it was a moment of _6_.',
    blanks: ['diligent', 'tranquil', 'endeavour', 'eloquent', 'fragile', 'triumph'],
  },
  {
    words: [
      { word: 'anticipate', definition: 'To expect or look forward to something', example: 'We anticipate good weather for the picnic.' },
      { word: 'diminish', definition: 'To make or become less; to reduce', example: 'The noise began to diminish as evening approached.' },
      { word: 'resilient', definition: 'Able to recover quickly from difficulties; tough', example: 'The resilient team bounced back after their loss.' },
      { word: 'elaborate', definition: 'Involving many carefully arranged parts; detailed', example: 'She created an elaborate plan for the school fair.' },
      { word: 'obscure', definition: 'Not clearly expressed or easily understood; hidden', example: 'The meaning of the ancient text was obscure.' },
      { word: 'commend', definition: 'To praise formally or officially', example: 'The teacher commended the class for their hard work.' },
    ],
    passage: 'The class had created an _1_ science project that impressed everyone. Even the most _2_ facts about space were presented clearly. The _3_ students did not let setbacks slow them down. Their teacher was quick to _4_ their effort. They could _5_ a great result at the science fair. Their excitement did not _6_ even when the competition was tough.',
    blanks: ['elaborate', 'obscure', 'resilient', 'commend', 'anticipate', 'diminish'],
  },
]

function DailyVocabTrainer({ userId, onBack, onCoinsEarned }) {
  const [state, setState] = useState(null)
  const [phase, setPhase] = useState('study')
  const [timer, setTimer] = useState(60)
  const [answers, setAnswers] = useState([])
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const existing = getDailyGameState(userId, 'vocabtrainer')
    if (existing?.gameOver) {
      setState(existing)
      setPhase('result')
      setAnswers(existing.answers || [])
      setSubmitted(true)
      setLoading(false)
      return
    }

    generateOrLoad()
  }, [userId])

  async function generateOrLoad() {
    const existing = getDailyGameState(userId, 'vocabtrainer')
    if (existing?.words) {
      setState(existing)
      setAnswers(new Array(existing.blanks.length).fill(''))
      setLoading(false)
      return
    }

    let set
    try {
      const res = await authedFetch('/api/claude/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          messages: [{ role: 'user', content: `Generate a vocabulary exercise for Year 5-6 students. Return a JSON object with:
- "words": array of 6 objects, each with "word", "definition" (simple, 1 sentence), "example" (1 sentence using the word)
- "passage": a short 4-6 sentence paragraph that uses all 6 words, but with blanks shown as _1_ through _6_
- "blanks": array of the 6 words in the order they appear as blanks in the passage

The words should be age-appropriate but challenging. The passage should be engaging and make the word meanings clear from context.
Return ONLY the JSON object, no other text.` }],
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const text = data.content?.[0]?.text || ''
        const match = text.match(/\{[\s\S]*\}/)
        if (match) set = JSON.parse(match[0])
      }
    } catch {}

    if (!set?.words?.length) {
      const dayIdx = Math.floor(Date.now() / 86400000) % FALLBACK_SETS.length
      set = FALLBACK_SETS[dayIdx]
    }

    const gameState = { words: set.words, passage: set.passage, blanks: set.blanks, gameOver: false }
    saveDailyGameState(userId, 'vocabtrainer', gameState)
    setState(gameState)
    setAnswers(new Array(set.blanks.length).fill(''))
    setLoading(false)
  }

  useEffect(() => {
    if (phase !== 'study' || loading) return
    if (timer <= 0) {
      setPhase('fill')
      return
    }
    const t = setTimeout(() => setTimer(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [timer, phase, loading])

  function handleSelectWord(blankIdx, word) {
    setAnswers(prev => {
      const next = [...prev]
      const existingIdx = next.indexOf(word)
      if (existingIdx >= 0) next[existingIdx] = ''
      next[blankIdx] = word
      return next
    })
  }

  function handleSubmit() {
    if (!state) return
    const correct = answers.filter((a, i) => a.toLowerCase() === state.blanks[i].toLowerCase()).length
    const score = Math.round((correct / state.blanks.length) * 100)
    const coins = correct >= state.blanks.length ? 10 : correct >= 4 ? 5 : correct >= 2 ? 2 : 0
    const result = { ...state, gameOver: true, answers, correct, score, coins }
    saveDailyGameState(userId, 'vocabtrainer', result)
    setState(result)
    setSubmitted(true)
    setPhase('result')
    if (coins > 0) {
      awardDailyGameCoins(userId, 'vocabtrainer', coins)
      onCoinsEarned?.(coins)
    }
  }

  if (loading) {
    return (
      <div className="vt-page">
        <div className="vt-loading">
          <span className="vt-loading-icon">📖</span>
          <p>Generating vocabulary challenge...</p>
        </div>
      </div>
    )
  }

  if (!state) return null

  const usedWords = new Set(answers.filter(Boolean))

  // Study phase
  if (phase === 'study') {
    return (
      <div className="vt-page">
        <div className="vt-header">
          <button className="btn btn-outline" onClick={onBack}>← Back</button>
          <h2 className="vt-title">📖 Vocab Trainer</h2>
          <div className="vt-timer">{timer}s</div>
        </div>
        <p className="vt-instruction">Study these words carefully. You'll need to fill them into a passage!</p>
        <div className="vt-word-grid">
          {state.words.map((w, i) => (
            <div key={i} className="vt-word-card">
              <span className="vt-word-term">{w.word}</span>
              <span className="vt-word-def">{w.definition}</span>
              <span className="vt-word-ex">{w.example}</span>
            </div>
          ))}
        </div>
        <button className="btn vt-ready-btn" onClick={() => { setPhase('fill'); setTimer(0) }}>I'm Ready →</button>
      </div>
    )
  }

  // Fill phase
  if (phase === 'fill' && !submitted) {
    const parts = state.passage.split(/(_\d+_)/)
    return (
      <div className="vt-page">
        <div className="vt-header">
          <button className="btn btn-outline" onClick={onBack}>← Back</button>
          <h2 className="vt-title">📖 Fill the Passage</h2>
        </div>
        <div className="vt-passage">
          {parts.map((part, i) => {
            const blankMatch = part.match(/^_(\d+)_$/)
            if (blankMatch) {
              const blankIdx = parseInt(blankMatch[1]) - 1
              const answer = answers[blankIdx]
              return (
                <span key={i} className={`vt-blank ${answer ? 'vt-blank-filled' : ''}`}>
                  {answer || `(${blankIdx + 1})`}
                </span>
              )
            }
            return <span key={i}>{part}</span>
          })}
        </div>
        <div className="vt-word-bank">
          <div className="vt-bank-label">Word Bank — tap a word, then tap a blank</div>
          <div className="vt-bank-words">
            {state.words.map((w, i) => (
              <button key={i} className={`vt-bank-word ${usedWords.has(w.word) ? 'vt-bank-word-used' : ''}`} onClick={() => {
                const firstEmpty = answers.indexOf('')
                if (firstEmpty >= 0 && !usedWords.has(w.word)) {
                  handleSelectWord(firstEmpty, w.word)
                }
              }}>
                {w.word}
              </button>
            ))}
          </div>
        </div>
        <div className="vt-passage-blanks">
          {state.blanks.map((_, i) => (
            <div key={i} className="vt-blank-slot">
              <span className="vt-blank-num">({i + 1})</span>
              <select className="vt-blank-select" value={answers[i] || ''} onChange={e => handleSelectWord(i, e.target.value)}>
                <option value="">Select word...</option>
                {state.words.map(w => (
                  <option key={w.word} value={w.word} disabled={usedWords.has(w.word) && answers[i] !== w.word}>{w.word}</option>
                ))}
              </select>
              {answers[i] && <button className="vt-blank-clear" onClick={() => { const next = [...answers]; next[i] = ''; setAnswers(next) }}>✕</button>}
            </div>
          ))}
        </div>
        <button className="btn vt-submit-btn" onClick={handleSubmit} disabled={answers.some(a => !a)}>
          {answers.some(a => !a) ? `Fill all ${state.blanks.length} blanks to submit` : 'Submit Answers'}
        </button>
      </div>
    )
  }

  // Result phase
  const correct = state.correct ?? answers.filter((a, i) => a.toLowerCase() === state.blanks[i]?.toLowerCase()).length
  const score = state.score ?? Math.round((correct / state.blanks.length) * 100)
  const coins = state.coins ?? 0

  return (
    <div className="vt-page">
      <div className="vt-header">
        <button className="btn btn-outline" onClick={onBack}>← Back</button>
        <h2 className="vt-title">📖 Vocab Trainer — Results</h2>
      </div>
      <div className="vt-result">
        <div className="vt-result-score" style={{ color: score >= 80 ? '#66bb6a' : score >= 50 ? '#ffab00' : '#ff1744' }}>{correct}/{state.blanks.length}</div>
        <p className="vt-result-label">{score === 100 ? 'Perfect!' : score >= 80 ? 'Great job!' : score >= 50 ? 'Good effort!' : 'Keep practising!'}</p>
        {coins > 0 && <p className="vt-result-coins">+{coins} coins earned!</p>}
      </div>
      <div className="vt-result-review">
        {state.blanks.map((blank, i) => {
          const ans = (state.answers || answers)[i]
          const isCorrect = ans?.toLowerCase() === blank.toLowerCase()
          return (
            <div key={i} className={`vt-result-row ${isCorrect ? 'vt-result-correct' : 'vt-result-wrong'}`}>
              <span className="vt-result-num">({i + 1})</span>
              <span className="vt-result-answer">{ans || '—'}</span>
              {!isCorrect && <span className="vt-result-actual">→ {blank}</span>}
              <span className="vt-result-check">{isCorrect ? '✓' : '✗'}</span>
            </div>
          )
        })}
      </div>
      <button className="btn" style={{ marginTop: 20 }} onClick={onBack}>Done</button>
    </div>
  )
}

export default DailyVocabTrainer
