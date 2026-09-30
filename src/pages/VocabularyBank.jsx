import { useState, useMemo, useEffect } from 'react'
import {
  addToVocabBank,
  getVocabBank,
  getVocabBankStats,
  removeFromVocabBank,
  updateVocabWord,
  recordVocabAnswer,
  relearnVocabWord,
  buildVocabQuiz,
  vocabPasses,
  vocabIsLearned,
  vocabAccuracy,
  VOCAB_PASSES_TO_LEARN,
  onDataChange,
} from '../data/store.js'
import { generateWordEntry, generateWordSentences } from '../utils/aiChat.js'
import { lookUpWord } from '../utils/dictionary.js'

/**
 * The words a student has collected, and the trainer that turns them into
 * something they know.
 *
 * Read as a dictionary: a gallery of cards, newest first, the word set large and
 * its meaning beneath. A word is unlearned until it has been answered correctly
 * five times in the trainer, and it is the unlearned words the trainer asks
 * about — ten at a time, or as many as there are. Learned words move to their own
 * shelf and can be put back in the deck whenever a student wants them again.
 */
const QUIZ_SIZE = 10

/** Five boxes, one ticked for each correct answer the word has to its name. */
function Checks({ passes }) {
  return (
    <span className="vbk-checks" title={`${passes} of ${VOCAB_PASSES_TO_LEARN} correct`}>
      {Array.from({ length: VOCAB_PASSES_TO_LEARN }, (_, i) => (
        <span key={i} className={`vbk-check${i < passes ? ' vbk-check-on' : ''}`}>
          {i < passes ? '✓' : ''}
        </span>
      ))}
    </span>
  )
}

function VocabularyBank({ user, onBack }) {
  const [refresh, setRefresh] = useState(0)
  const [search, setSearch] = useState('')
  const [shelf, setShelf] = useState('unlearned')
  const [sort, setSort] = useState('recent')
  const [editing, setEditing] = useState(null)
  const [defInput, setDefInput] = useState('')
  const [defining, setDefining] = useState(null)
  // Adding a word by hand: from a book, a lesson, anywhere off the screen.
  const [adding, setAdding] = useState(false)
  const [newWord, setNewWord] = useState('')
  const [newDef, setNewDef] = useState('')
  const [newContext, setNewContext] = useState('')
  const [addNote, setAddNote] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const [newPos, setNewPos] = useState('')
  const [newLow, setNewLow] = useState('')
  const [newHigh, setNewHigh] = useState('')

  // The trainer
  const [quiz, setQuiz] = useState(null)
  const [qIdx, setQIdx] = useState(0)
  const [picked, setPicked] = useState(null)
  const [score, setScore] = useState(0)
  const [learnedThisRound, setLearnedThisRound] = useState([])
  // How many of this question's sentences the student has asked to see.
  const [hintsShown, setHintsShown] = useState(0)
  const [finished, setFinished] = useState(false)

  useEffect(() => onDataChange(() => setRefresh((r) => r + 1)), [])

  const words = useMemo(() => getVocabBank(user.id), [user.id, refresh])
  const stats = useMemo(() => getVocabBankStats(user.id), [user.id, refresh])

  const shelved = useMemo(() => {
    let onShelf = words.filter((w) => (shelf === 'learned' ? vocabIsLearned(w) : !vocabIsLearned(w)))
    const q = search.trim().toLowerCase()
    if (q) {
      onShelf = onShelf.filter((w) => w.word.toLowerCase().includes(q) || String(w.definition || '').toLowerCase().includes(q))
    }
    if (sort === 'missed') {
      // Worst first, and a word never asked has nothing to say about itself, so
      // it waits behind the ones that do.
      return [...onShelf].sort((a, b) => {
        const A = vocabAccuracy(a)
        const B = vocabAccuracy(b)
        if (!A && !B) return 0
        if (!A) return 1
        if (!B) return -1
        return A.percent - B.percent || B.asked - A.asked
      })
    }
    return onShelf   // getVocabBank already returns newest first
  }, [words, shelf, search, sort])

  const readyToPractise = useMemo(
    () => words.filter((w) => !vocabIsLearned(w) && String(w.definition || '').trim()).length,
    [words],
  )

  /**
   * Fills in a word's entry: the dictionary for its meaning, the AI only for the
   * two sentences it cannot supply. A word the dictionary does not hold — a name,
   * a very new word — falls back to the AI for the whole entry.
   */
  async function defineWord(w) {
    setDefining(w.id)
    try {
      const found = await lookUpWord(w.word)
      if (found) {
        // The dictionary's first sense goes in at once — free, offline and
        // immediate — and stands on its own if nothing else answers.
        updateVocabWord(user.id, w.id, {
          definition: found.definition,
          partOfSpeech: found.partOfSpeech,
          definedBy: 'dictionary',
        })
        const written = await generateWordSentences(w.word, found.definition, found.senses)
        if (written) {
          // It also says which of the dictionary's meanings it wrote for, which
          // is the one a student is likely to meet.
          const chosen = found.senses[(written.chose || 1) - 1] || found.senses[0]
          updateVocabWord(user.id, w.id, {
            definition: chosen.definition,
            partOfSpeech: chosen.partOfSpeech,
            sentenceLow: written.sentenceLow,
            sentenceHigh: written.sentenceHigh,
          })
        }
        return
      }
      const entry = await generateWordEntry(w.word, w.context || '')
      if (entry) {
        updateVocabWord(user.id, w.id, {
          definition: entry.definition || w.definition || '',
          partOfSpeech: entry.partOfSpeech || w.partOfSpeech || '',
          sentenceLow: entry.sentenceLow || '',
          sentenceHigh: entry.sentenceHigh || '',
          definedBy: 'ai',
        })
      }
    } finally {
      setDefining(null)
      setRefresh((r) => r + 1)
    }
  }

  function saveDefinition(w) {
    updateVocabWord(user.id, w.id, { definition: defInput.trim() })
    setEditing(null)
    setDefInput('')
    setRefresh((r) => r + 1)
  }

  function addWord() {
    const word = newWord.trim()
    if (!word) return
    const already = words.some((w) => w.word.toLowerCase() === word.toLowerCase())
    const id = addToVocabBank(user.id, word, newContext.trim(), 'Added by me', newDef.trim())
    if (id) {
      updateVocabWord(user.id, id, {
        partOfSpeech: newPos,
        sentenceLow: newLow.trim(),
        sentenceHigh: newHigh.trim(),
      })
    }
    setAddNote(already ? `“${word}” was already in your bank.` : `“${word}” added.`)
    setNewWord(''); setNewDef(''); setNewContext('')
    setNewPos(''); setNewLow(''); setNewHigh('')
    setShelf('unlearned')
    setRefresh((r) => r + 1)
  }

  /** Fills the meaning in for a word being typed, so adding one is two taps. */
  /**
   * Fills the form in for the word being typed: the dictionary writes the
   * meaning, the AI writes the two sentences. Everything lands in the fields
   * themselves, so it can be read and changed before the word is kept.
   *
   * A meaning already typed is respected — the sentences are written for that,
   * and the dictionary is not allowed to overrule it.
   */
  async function lookUpNewWord() {
    const word = newWord.trim()
    if (!word) return
    setLookingUp(true)
    try {
      const own = newDef.trim()
      if (own) {
        const written = await generateWordSentences(word, own)
        if (written) { setNewLow(written.sentenceLow || ''); setNewHigh(written.sentenceHigh || '') }
        return
      }
      const found = await lookUpWord(word)
      if (found) {
        setNewDef(found.definition)
        setNewPos(found.partOfSpeech)
        const written = await generateWordSentences(word, found.definition, found.senses)
        const chosen = written ? (found.senses[(written.chose || 1) - 1] || found.senses[0]) : found.senses[0]
        setNewDef(chosen.definition)
        setNewPos(chosen.partOfSpeech)
        setNewLow(written?.sentenceLow || '')
        setNewHigh(written?.sentenceHigh || '')
        return
      }
      const entry = await generateWordEntry(word, newContext.trim())
      if (entry) {
        if (entry.definition) setNewDef(entry.definition)
        setNewPos(entry.partOfSpeech || '')
        setNewLow(entry.sentenceLow || '')
        setNewHigh(entry.sentenceHigh || '')
      }
    } finally {
      setLookingUp(false)
    }
  }

  function startQuiz() {
    const built = buildVocabQuiz(user.id, QUIZ_SIZE)
    if (built.length === 0) return
    setQuiz(built)
    setQIdx(0)
    setPicked(null)
    setScore(0)
    setLearnedThisRound([])
    setHintsShown(0)
    setFinished(false)
  }

  function answer(optionIdx) {
    if (picked !== null) return
    const q = quiz[qIdx]
    const right = optionIdx === q.correctIndex
    setPicked(optionIdx)
    if (right) setScore((s) => s + 1)
    const { justLearned } = recordVocabAnswer(user.id, q.wordId, right)
    if (justLearned) setLearnedThisRound((l) => [...l, q.word])
  }

  function nextQuestion() {
    if (qIdx + 1 >= quiz.length) {
      setFinished(true)
      return
    }
    setQIdx((i) => i + 1)
    setPicked(null)
    setHintsShown(0)
  }

  /* ---------- the trainer ---------- */
  if (quiz && finished) {
    return (
      <div className="vbk">
        <div className="vbk-bar">
          <button className="btn btn-outline btn-small" onClick={() => { setQuiz(null); setFinished(false); setRefresh((r) => r + 1) }}>← Back to the bank</button>
        </div>
        <div className="vbk-done">
          <p className="vbk-done-score">{score} / {quiz.length}</p>
          <p className="vbk-done-note">
            {score === quiz.length ? 'Every one right.' : 'Wrong answers cost a word one of its five.'}
          </p>
          {learnedThisRound.length > 0 && (
            <div className="vbk-done-learned">
              <p className="vbk-done-learned-title">Learned</p>
              {learnedThisRound.map((w) => <span key={w} className="vbk-done-chip">{w}</span>)}
            </div>
          )}
          <div className="vbk-done-actions">
            <button className="btn" onClick={startQuiz} disabled={readyToPractise === 0}>Another round</button>
            <button className="btn btn-outline" onClick={() => { setQuiz(null); setFinished(false); setRefresh((r) => r + 1) }}>Back to the bank</button>
          </div>
        </div>
      </div>
    )
  }

  if (quiz) {
    const q = quiz[qIdx]
    return (
      <div className="vbk">
        <div className="vbk-bar">
          <button className="btn btn-outline btn-small" onClick={() => { setQuiz(null); setFinished(false); setRefresh((r) => r + 1) }}>← Leave</button>
          <span className="vbk-bar-count">{qIdx + 1} of {quiz.length}</span>
        </div>
        <div className="vbk-quiz">
          <p className="vbk-quiz-ask">{q.ask === 'context' ? 'Which word fits the sentence?' : 'Which word has this meaning?'}</p>
          <p className={`vbk-quiz-prompt${q.ask === 'context' ? ' vbk-quiz-prompt-sentence' : ''}`}>{q.prompt}</p>
          {q.hints.length > 0 && (
            <div className="vbk-hints">
              {q.hints.slice(0, hintsShown).map((h, hi) => (
                <p key={hi} className="vbk-hint">
                  <span className="vbk-hint-tag">{hi === 0 ? 'Hint 1' : 'Hint 2'}</span>
                  {h}
                </p>
              ))}
              {picked === null && hintsShown < q.hints.length && (
                <button className="vbk-hint-btn" onClick={() => setHintsShown((n) => n + 1)}>
                  {hintsShown === 0 ? 'Show a sentence using it' : 'Show a clearer sentence'}
                </button>
              )}
            </div>
          )}

          <div className="vbk-quiz-options">
            {q.options.map((opt, oi) => {
              let cls = 'vbk-quiz-option'
              if (picked !== null) {
                if (oi === q.correctIndex) cls += ' vbk-quiz-option-right'
                else if (oi === picked) cls += ' vbk-quiz-option-wrong'
              }
              return <button key={oi} className={cls} onClick={() => answer(oi)}>{opt}</button>
            })}
          </div>
          {picked !== null && (
            <div className="vbk-quiz-after">
              <p className="vbk-quiz-verdict">
                {picked === q.correctIndex ? 'Correct.' : `The word was ${q.word}.`}
              </p>
              <button className="btn" onClick={nextQuestion}>
                {qIdx + 1 >= quiz.length ? 'Finish' : 'Next word'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ---------- the bank ---------- */
  return (
    <div className="vbk">
      <div className="vbk-bar">
        <button className="btn btn-outline btn-small" onClick={onBack}>← Back</button>
        <h2 className="vbk-title">Vocabulary Bank</h2>
        <button className="btn btn-small vbk-add-btn" onClick={() => { setAdding((a) => !a); setAddNote('') }}>
          {adding ? 'Close' : '+ Add a word'}
        </button>
      </div>

      {adding && (
        <div className="vbk-add">
          <div className="vbk-add-row">
            <input
              className="vbk-add-word"
              placeholder="Word"
              value={newWord}
              autoFocus
              onChange={(e) => setNewWord(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newDef.trim()) addWord() }}
            />
            <button className="vbk-act" disabled={!newWord.trim() || lookingUp} onClick={lookUpNewWord}>
              {lookingUp ? 'Defining…' : 'Define the word'}
            </button>
          </div>
          <textarea
            className="vbk-add-def"
            placeholder="What does it mean?"
            value={newDef}
            onChange={(e) => setNewDef(e.target.value)}
          />
          <input
            className="vbk-add-context"
            placeholder="Where you met it (optional)"
            value={newContext}
            onChange={(e) => setNewContext(e.target.value)}
          />

          {/* The two sentences the word will be practised against. Written by
              Define the word, and open to correction before the word is kept. */}
          <div className="vbk-add-pair">
            <label className="vbk-add-label">
              <span className="vbk-sentence-tag">few clues</span>
              <input
                className="vbk-add-sentence"
                placeholder="A sentence that gives little away"
                value={newLow}
                onChange={(e) => setNewLow(e.target.value)}
              />
            </label>
            <label className="vbk-add-label">
              <span className="vbk-sentence-tag vbk-sentence-tag-strong">strong clues</span>
              <input
                className="vbk-add-sentence"
                placeholder="A sentence that makes the meaning clear"
                value={newHigh}
                onChange={(e) => setNewHigh(e.target.value)}
              />
            </label>
            {(newLow || newHigh) && !(newLow.toLowerCase().includes(newWord.trim().toLowerCase()) && newHigh.toLowerCase().includes(newWord.trim().toLowerCase())) && newWord.trim() && (
              <p className="vbk-add-warn">Each sentence should use “{newWord.trim()}” — the trainer blanks it out to make the hint.</p>
            )}
          </div>

          <div className="vbk-add-actions">
            <button className="btn btn-small" disabled={!newWord.trim()} onClick={addWord}>Add to bank</button>
            {addNote && <span className="vbk-add-note">{addNote}</span>}
          </div>
        </div>
      )}

      <div className="vbk-train">
        <div className="vbk-train-text">
          <p className="vbk-train-title">Flashcard trainer</p>
          <p className="vbk-train-sub">
            {readyToPractise === 0
              ? (stats.needDefinition > 0
                ? `${stats.needDefinition} word${stats.needDefinition === 1 ? '' : 's'} need a meaning before they can be practised.`
                : 'Every word here is learned. Add more, or put one back in the deck.')
              : `${Math.min(readyToPractise, QUIZ_SIZE)} question${Math.min(readyToPractise, QUIZ_SIZE) === 1 ? '' : 's'} ready from your unlearned words. ${VOCAB_PASSES_TO_LEARN} correct answers and a word is learned.`}
          </p>
        </div>
        <button className="btn vbk-train-btn" onClick={startQuiz} disabled={readyToPractise === 0}>Start</button>
      </div>

      <div className="vbk-shelves">
        <button className={`vbk-shelf${shelf === 'unlearned' ? ' vbk-shelf-on' : ''}`} onClick={() => setShelf('unlearned')}>
          Unlearned <span className="vbk-shelf-n">{stats.unlearned}</span>
        </button>
        <button className={`vbk-shelf${shelf === 'learned' ? ' vbk-shelf-on' : ''}`} onClick={() => setShelf('learned')}>
          Learned <span className="vbk-shelf-n">{stats.learned}</span>
        </button>
        <input
          className="vbk-search"
          placeholder="Search your words…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="vbk-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="recent">Newest first</option>
          <option value="missed">Most missed first</option>
        </select>
      </div>

      {shelved.length === 0 ? (
        <div className="vbk-empty">
          <p className="vbk-empty-title">
            {shelf === 'learned' ? 'Nothing learned yet.' : words.length === 0 ? 'Your bank is empty.' : 'No words here.'}
          </p>
          <p className="vbk-empty-sub">
            {shelf === 'learned'
              ? `Answer a word correctly ${VOCAB_PASSES_TO_LEARN} times in the trainer and it moves here.`
              : 'Double-tap any word while reviewing a quiz to keep it, or add one yourself.'}
          </p>
        </div>
      ) : (
        <div className="vbk-gallery">
          {shelved.map((w) => {
            const passes = vocabPasses(w)
            const learned = vocabIsLearned(w)
            const isEditing = editing === w.id
            return (
              <article key={w.id} className={`vbk-card${learned ? ' vbk-card-learned' : ''}`}>
                <header className="vbk-card-head">
                  <h3 className="vbk-word">
                    {w.word}
                    {w.partOfSpeech && <span className="vbk-pos">{w.partOfSpeech}</span>}
                  </h3>
                  {learned ? <span className="vbk-learned-tag">Learned</span> : <Checks passes={passes} />}
                </header>

                {isEditing ? (
                  <div className="vbk-edit">
                    <textarea
                      className="vbk-edit-box"
                      value={defInput}
                      autoFocus
                      placeholder="What does it mean?"
                      onChange={(e) => setDefInput(e.target.value)}
                    />
                    <div className="vbk-edit-actions">
                      <button className="btn btn-small" onClick={() => saveDefinition(w)}>Save</button>
                      <button className="btn btn-outline btn-small" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </div>
                ) : w.definition ? (
                  <p className="vbk-def">{w.definition}</p>
                ) : (
                  <p className="vbk-def vbk-def-missing">No meaning yet — add one to practise this word.</p>
                )}

                {(w.sentenceLow || w.sentenceHigh) && (
                  <div className="vbk-sentences">
                    {w.sentenceLow && (
                      <p className="vbk-sentence">
                        <span className="vbk-sentence-tag">few clues</span>
                        {w.sentenceLow}
                      </p>
                    )}
                    {w.sentenceHigh && (
                      <p className="vbk-sentence">
                        <span className="vbk-sentence-tag vbk-sentence-tag-strong">strong clues</span>
                        {w.sentenceHigh}
                      </p>
                    )}
                  </div>
                )}

                {w.context && <p className="vbk-context">“{w.context}”</p>}
                {(() => {
                  const record = vocabAccuracy(w)
                  if (!record) return null
                  const weak = record.percent < 60 && record.asked >= 2
                  return (
                    <p className={`vbk-record${weak ? ' vbk-record-weak' : ''}`}>
                      {record.right} of {record.asked} right · {record.percent}%
                    </p>
                  )
                })()}
                {w.source && <p className="vbk-source">{w.source}</p>}

                <footer className="vbk-card-actions">
                  {!isEditing && (
                    <button className="vbk-act" onClick={() => { setEditing(w.id); setDefInput(w.definition || '') }}>
                      {w.definition ? 'Edit' : 'Add meaning'}
                    </button>
                  )}
                  {!isEditing && !(w.definition && w.sentenceLow && w.sentenceHigh) && (
                    <button className="vbk-act" disabled={defining === w.id} onClick={() => defineWord(w)}>
                      {defining === w.id ? 'Defining…' : 'Define the word'}
                    </button>
                  )}
                  {learned && (
                    <button className="vbk-act" onClick={() => { relearnVocabWord(user.id, w.id); setRefresh((r) => r + 1) }}>
                      Practise again
                    </button>
                  )}
                  <button className="vbk-act vbk-act-danger" onClick={() => { removeFromVocabBank(user.id, w.id); setRefresh((r) => r + 1) }}>
                    Remove
                  </button>
                </footer>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default VocabularyBank
