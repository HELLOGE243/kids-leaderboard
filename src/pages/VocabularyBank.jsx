import { useState, useMemo, useEffect } from 'react'
import { getVocabBank, removeFromVocabBank, updateVocabWord, getVocabBankStats, archiveVocabWord, onDataChange } from '../data/store.js'
import { generateVocabExercise, generateGrammarExercises, generateWordDefinition } from '../utils/aiChat.js'

function VocabularyBank({ user, onBack }) {
  const [refresh, setRefresh] = useState(0)
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState('list')
  const [flashIdx, setFlashIdx] = useState(0)
  const [flashFlipped, setFlashFlipped] = useState(false)
  const [editingDef, setEditingDef] = useState(null)
  const [defInput, setDefInput] = useState('')
  const [practiceExercises, setPracticeExercises] = useState([])
  const [practiceIdx, setPracticeIdx] = useState(0)
  const [practiceAnswer, setPracticeAnswer] = useState(null)
  const [practiceScore, setPracticeScore] = useState(0)
  const [practiceLoading, setPracticeLoading] = useState(false)
  const [grammarLoading, setGrammarLoading] = useState(false)
  const [aiDefLoading, setAiDefLoading] = useState(null)
  const [showArchived, setShowArchived] = useState(false)
  const [flashQuizOptions, setFlashQuizOptions] = useState([])
  const [flashQuizAnswer, setFlashQuizAnswer] = useState(null)
  const [flashQuizCorrect, setFlashQuizCorrect] = useState(-1)
  const [flashQuizScore, setFlashQuizScore] = useState(0)

  useEffect(() => {
    const unsub = onDataChange(() => setRefresh(r => r + 1))
    return unsub
  }, [])

  const words = useMemo(() => getVocabBank(user.id, showArchived), [user.id, refresh, showArchived])
  const allActiveWords = useMemo(() => getVocabBank(user.id, false), [user.id, refresh])
  const stats = useMemo(() => getVocabBankStats(user.id), [user.id, refresh])

  const filtered = useMemo(() => {
    if (!search.trim()) return words
    const q = search.toLowerCase()
    return words.filter(w => w.word.toLowerCase().includes(q) || w.definition.toLowerCase().includes(q))
  }, [words, search])

  function handleDelete(wordId) {
    removeFromVocabBank(user.id, wordId)
  }

  function startEditDef(w) {
    setEditingDef(w.id)
    setDefInput(w.definition)
  }

  function saveDef(wordId) {
    updateVocabWord(wordId, { definition: defInput })
    setEditingDef(null)
  }

  async function fetchAiDef(w) {
    if (aiDefLoading) return
    setAiDefLoading(w.id)
    const result = await generateWordDefinition(w.word)
    if (result?.definition) {
      updateVocabWord(w.id, { definition: result.definition })
    }
    setAiDefLoading(null)
  }

  function handleFlashKnow() {
    if (filtered[flashIdx]) {
      updateVocabWord(filtered[flashIdx].id, { familiarity: Math.min((filtered[flashIdx].familiarity || 0) + 1, 5) })
    }
    nextFlash()
  }

  function handleFlashDontKnow() {
    if (filtered[flashIdx]) {
      updateVocabWord(filtered[flashIdx].id, { familiarity: 0 })
    }
    nextFlash()
  }

  function nextFlash() {
    setFlashFlipped(false)
    if (flashIdx + 1 >= filtered.length) {
      setFlashIdx(0)
      setMode('list')
    } else {
      setFlashIdx(flashIdx + 1)
    }
  }

  async function startGrammar() {
    if (grammarLoading) return
    setGrammarLoading(true)
    const exercises = await generateGrammarExercises()
    if (exercises.length) {
      setPracticeExercises(exercises)
      setPracticeIdx(0)
      setPracticeAnswer(null)
      setPracticeScore(0)
      setMode('grammar')
    }
    setGrammarLoading(false)
  }

  async function startPractice() {
    if (words.length < 5 || practiceLoading) return
    setPracticeLoading(true)
    const subset = words.slice(0, 10)
    const exercises = await generateVocabExercise(subset)
    if (exercises.length) {
      setPracticeExercises(exercises)
      setPracticeIdx(0)
      setPracticeAnswer(null)
      setPracticeScore(0)
      setMode('practice')
    }
    setPracticeLoading(false)
  }

  function handlePracticeAnswer(optIdx) {
    if (practiceAnswer !== null) return
    setPracticeAnswer(optIdx)
    if (optIdx === practiceExercises[practiceIdx].correctIndex) {
      setPracticeScore(s => s + 1)
      const w = practiceExercises[practiceIdx].word
      const found = words.find(v => v.word.toLowerCase() === w?.toLowerCase())
      if (found) updateVocabWord(found.id, { familiarity: Math.min((found.familiarity || 0) + 1, 5) })
    }
  }

  function nextPractice() {
    if (practiceIdx + 1 >= practiceExercises.length) {
      setMode('list')
      return
    }
    setPracticeIdx(i => i + 1)
    setPracticeAnswer(null)
  }

  // Practice / Grammar mode
  if ((mode === 'practice' || mode === 'grammar') && practiceExercises.length > 0) {
    const modeTitle = mode === 'grammar' ? 'Grammar Practice' : 'Vocab Practice'
    const ex = practiceExercises[practiceIdx]
    if (!ex) {
      return (
        <div className="vb-page">
          <div className="vb-header">
            <button className="btn btn-outline" onClick={() => setMode('list')}>← Back</button>
            <h2 className="vb-title">{modeTitle} Complete!</h2>
          </div>
          <div className="vb-practice-done">
            <div className="vb-practice-score">{practiceScore}/{practiceExercises.length}</div>
            <p>Great work practising your vocabulary!</p>
            <button className="btn" onClick={() => setMode('list')}>Done</button>
          </div>
        </div>
      )
    }
    return (
      <div className="vb-page">
        <div className="vb-header">
          <button className="btn btn-outline" onClick={() => setMode('list')}>← Back</button>
          <h2 className="vb-title">{modeTitle}</h2>
          <span className="vb-flash-progress">{practiceIdx + 1}/{practiceExercises.length}</span>
        </div>
        <div className="vb-practice-q">
          <div className="vb-practice-type">{ex.type === 'cloze' ? 'Fill the blank' : ex.type === 'definition' ? 'Match the definition' : 'Correct usage'}</div>
          <div className="vb-practice-text">{ex.question}</div>
        </div>
        <div className="vb-practice-opts">
          {ex.options.map((opt, oi) => {
            let cls = 'vb-practice-opt'
            if (practiceAnswer !== null) {
              if (oi === ex.correctIndex) cls += ' vb-practice-opt-correct'
              else if (oi === practiceAnswer) cls += ' vb-practice-opt-wrong'
            }
            return <button key={oi} className={cls} onClick={() => handlePracticeAnswer(oi)}>{opt}</button>
          })}
        </div>
        {practiceAnswer !== null && (
          <>
            {ex.explanation && <div className="vb-practice-explain">{ex.explanation}</div>}
            <button className="btn vb-practice-next" onClick={nextPractice}>
              {practiceIdx + 1 >= practiceExercises.length ? 'See Results' : 'Next →'}
            </button>
          </>
        )}
      </div>
    )
  }

  // Flashcard quiz mode
  if (mode === 'flash' && filtered.length > 0) {
    const card = filtered[flashIdx]
    if (!card) {
      return (
        <div className="vb-page">
          <div className="vb-header">
            <button className="btn btn-outline" onClick={() => setMode('list')}>← Back</button>
            <h2 className="vb-title">Flashcard Quiz Complete!</h2>
          </div>
          <div className="vb-practice-done">
            <div className="vb-practice-score">{flashQuizScore}/{Math.min(5, filtered.length)}</div>
            <p>Great work reviewing your vocabulary!</p>
            <button className="btn" onClick={() => setMode('list')}>Done</button>
          </div>
        </div>
      )
    }
    const withDefs = allActiveWords.filter(w => w.definition && w.id !== card.id)
    const needsQuizSetup = flashQuizOptions.length === 0
    if (needsQuizSetup && card.definition && withDefs.length >= 3) {
      const correct = card.definition
      const distractors = [...withDefs].sort(() => Math.random() - 0.5).slice(0, 3).map(w => w.definition)
      const opts = [correct, ...distractors].sort(() => Math.random() - 0.5)
      setTimeout(() => {
        setFlashQuizOptions(opts)
        setFlashQuizCorrect(opts.indexOf(correct))
        setFlashQuizAnswer(null)
      }, 0)
    }
    const hasQuiz = flashQuizOptions.length >= 4 && card.definition
    return (
      <div className="vb-page">
        <div className="vb-header">
          <button className="btn btn-outline" onClick={() => setMode('list')}>← Back</button>
          <h2 className="vb-title">Flashcard Quiz</h2>
          <span className="vb-flash-progress">{flashIdx + 1} / {Math.min(5, filtered.length)}</span>
        </div>
        <div className="vb-flash-area">
          <div className="vb-flashcard" style={{ cursor: 'default', transform: 'none' }}>
            <div className="vb-flashcard-front" style={{ position: 'relative', backfaceVisibility: 'visible' }}>
              <span className="vb-flashcard-word">{card.word}</span>
              <span className="vb-flashcard-tap">Choose the correct definition</span>
            </div>
          </div>
          {hasQuiz ? (
            <div className="vb-practice-opts" style={{ marginTop: 16 }}>
              {flashQuizOptions.map((opt, oi) => {
                let cls = 'vb-practice-opt'
                if (flashQuizAnswer !== null) {
                  if (oi === flashQuizCorrect) cls += ' vb-practice-opt-correct'
                  else if (oi === flashQuizAnswer) cls += ' vb-practice-opt-wrong'
                }
                return <button key={oi} className={cls} onClick={() => {
                  if (flashQuizAnswer !== null) return
                  setFlashQuizAnswer(oi)
                  if (oi === flashQuizCorrect) {
                    setFlashQuizScore(s => s + 1)
                    const newFam = Math.min((card.familiarity || 0) + 1, 5)
                    updateVocabWord(card.id, { familiarity: newFam })
                    if (newFam >= 3) archiveVocabWord(card.id)
                  } else {
                    updateVocabWord(card.id, { familiarity: 0 })
                  }
                }}>{opt}</button>
              })}
            </div>
          ) : (
            <div className="vb-flash-buttons" style={{ marginTop: 16 }}>
              <p style={{ fontSize: '0.8rem', color: '#888', textAlign: 'center', marginBottom: 8 }}>
                {!card.definition ? 'No definition set — using flip mode' : 'Not enough words with definitions for quiz mode'}
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, cursor: 'pointer' }} onClick={() => setFlashFlipped(!flashFlipped)}>
                {!flashFlipped ? <span style={{ fontSize: '0.85rem', color: '#42a5f5' }}>Tap to reveal</span> : (
                  <>
                    <span style={{ fontSize: '0.85rem' }}>{card.definition || 'No definition'}</span>
                  </>
                )}
              </div>
              {flashFlipped && (
                <div className="vb-flash-buttons">
                  <button className="vb-flash-btn vb-flash-no" onClick={handleFlashDontKnow}>✗ Don't Know</button>
                  <button className="vb-flash-btn vb-flash-yes" onClick={handleFlashKnow}>✓ Know It</button>
                </div>
              )}
            </div>
          )}
          {flashQuizAnswer !== null && (
            <button className="btn vb-practice-next" style={{ marginTop: 12 }} onClick={() => {
              if (flashIdx + 1 >= Math.min(5, filtered.length)) {
                setFlashIdx(flashIdx + 1)
                setFlashQuizOptions([])
                setFlashQuizAnswer(null)
              } else {
                setFlashIdx(flashIdx + 1)
                setFlashQuizOptions([])
                setFlashQuizAnswer(null)
              }
            }}>
              {flashIdx + 1 >= Math.min(5, filtered.length) ? 'See Results' : 'Next →'}
            </button>
          )}
        </div>
      </div>
    )
  }

  // List mode
  return (
    <div className="vb-page">
      <div className="vb-header">
        <button className="btn btn-outline" onClick={onBack}>← Back</button>
        <h2 className="vb-title">📖 Vocabulary Bank</h2>
      </div>

      <div className="vb-stats-row">
        <div className="vb-stat">
          <span className="vb-stat-num">{stats.total}</span>
          <span className="vb-stat-label">Total Words</span>
        </div>
        <div className="vb-stat">
          <span className="vb-stat-num">{stats.thisWeek}</span>
          <span className="vb-stat-label">This Week</span>
        </div>
        <div className="vb-stat">
          <span className="vb-stat-num">{stats.mastered}</span>
          <span className="vb-stat-label">Mastered</span>
        </div>
        {stats.archived > 0 && (
          <div className="vb-stat">
            <span className="vb-stat-num">{stats.archived}</span>
            <span className="vb-stat-label">Archived</span>
          </div>
        )}
      </div>

      <div className="vb-controls">
        <input className="vb-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search words..." />
        {allActiveWords.length >= 5 && <>
          <button className="vb-flash-start" onClick={() => { setMode('flash'); setFlashIdx(0); setFlashFlipped(false); setFlashQuizOptions([]); setFlashQuizAnswer(null); setFlashQuizScore(0) }}>🃏 Flashcard Quiz</button>
          <button className="vb-flash-start" onClick={startPractice} disabled={practiceLoading} style={{ borderColor: '#66bb6a', color: '#66bb6a', background: 'rgba(102,187,106,0.1)' }}>{practiceLoading ? '⏳...' : '✏️ Practice'}</button>
        </>}
        <button className="vb-flash-start" onClick={startGrammar} disabled={grammarLoading} style={{ borderColor: '#ffab00', color: '#ffab00', background: 'rgba(255,171,0,0.08)' }}>{grammarLoading ? '⏳...' : '📝 Grammar'}</button>
        {stats.archived > 0 && (
          <button className="vb-flash-start" onClick={() => setShowArchived(!showArchived)} style={{ borderColor: '#888', color: '#888', background: 'rgba(0,0,0,0.04)' }}>
            {showArchived ? 'Hide Archived' : `Show Archived (${stats.archived})`}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="vb-empty">
          <span className="vb-empty-icon">📚</span>
          <p>{words.length === 0 ? 'Your vocabulary bank is empty.' : 'No words match your search.'}</p>
          {words.length === 0 && <p className="vb-empty-hint">Double-tap any word during quiz review to save it here.</p>}
        </div>
      ) : (
        <div className="vb-word-list">
          {filtered.map(w => (
            <div key={w.id} className="vb-word-card">
              <div className="vb-word-top">
                <span className="vb-word-text">{w.word}</span>
                <div className="vb-word-fam">
                  {[1, 2, 3, 4, 5].map(lvl => (
                    <span key={lvl} className={`vb-word-dot ${(w.familiarity || 0) >= lvl ? 'vb-word-dot-fill' : ''}`} />
                  ))}
                </div>
                <button className="vb-word-del" onClick={() => handleDelete(w.id)}>✕</button>
              </div>
              <div className="vb-word-def-row">
                {editingDef === w.id ? (
                  <div className="vb-word-def-edit">
                    <input className="vb-word-def-input" value={defInput} onChange={e => setDefInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveDef(w.id)} autoFocus />
                    <button className="btn btn-small" onClick={() => saveDef(w.id)}>Save</button>
                  </div>
                ) : w.definition ? (
                  <span className="vb-word-def" onClick={() => startEditDef(w)}>{w.definition}</span>
                ) : (
                  <div className="vb-word-def-actions">
                    <button className="vb-ai-def-btn" onClick={() => fetchAiDef(w)} disabled={aiDefLoading === w.id}>
                      {aiDefLoading === w.id ? 'Generating...' : 'AI Define'}
                    </button>
                    <span className="vb-word-def-or">or</span>
                    <span className="vb-word-def-empty" onClick={() => startEditDef(w)}>type manually</span>
                  </div>
                )}
              </div>
              {w.source && <span className="vb-word-source">from: {w.source}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default VocabularyBank
