import { useState } from 'react'
import ReviewHelp, { NoPasteInput } from './ReviewHelp.jsx'
import { checkDefinition } from '../utils/aiChat.js'

/**
 * Review for one cloze gap the student got wrong.
 *
 * Steps 1 and 2 are the usual explanations. Step 3 is what a cloze question is
 * really testing: the student has to define every word that was offered for the
 * gap, typed out rather than pasted. The gap is finished only when all of them
 * pass, and the question's token is awarded once every wrong gap is finished.
 */
function ClozeGapReview({ gap, gapIndex, sentence, chat, onChange, studentPick, fetchConcept, onAskTeacher, asked }) {
  const [drafts, setDrafts] = useState({})
  const [checking, setChecking] = useState(null)

  const words = (gap.options || []).map((w, i) => ({ word: w, index: i })).filter((o) => o.word && o.word.trim())
  const defs = chat.defs || {}
  const passed = words.filter((w) => defs[w.index]?.ok).length
  const isDone = words.length > 0 && passed === words.length

  async function check(optIndex, word) {
    const studentDefinition = (drafts[optIndex] || '').trim()
    if (!studentDefinition || checking != null) return
    setChecking(optIndex)
    const result = await checkDefinition({ word, context: sentence, studentDefinition })
    setChecking(null)
    const nextDefs = { ...defs, [optIndex]: { text: studentDefinition, ok: result.ok, reply: result.reply } }
    const allOk = words.every((w) => nextDefs[w.index]?.ok)
    onChange({ ...chat, defs: nextDefs, step: allOk ? 'done' : chat.step })
  }

  function renderMine() {
    return (
      <div className="qt-cloze-defs">
        <div className="qt-help-lead">
          Define <b>every word</b> that was offered for this gap — in your own words, typed out.
          <span className="qt-cloze-defs-count"> {passed}/{words.length} done</span>
        </div>
        {words.map(({ word, index }) => {
          const entry = defs[index]
          const done = !!entry?.ok
          return (
            <div key={index} className={`qt-cloze-def-row${done ? ' is-done' : ''}`}>
              <span className="qt-cloze-def-word">{word}{done && ' ✓'}</span>
              {done ? (
                <span className="qt-cloze-def-saved">{entry.text}</span>
              ) : (
                <>
                  <NoPasteInput
                    value={drafts[index] ?? entry?.text ?? ''}
                    onChange={(v) => setDrafts((p) => ({ ...p, [index]: v }))}
                    placeholder={`What does "${word}" mean?`}
                    disabled={checking === index}
                    onEnter={() => check(index, word)}
                  />
                  <button className="qt-help-send" disabled={checking === index} onClick={() => check(index, word)}>
                    {checking === index ? 'Checking…' : 'Check'}
                  </button>
                </>
              )}
              {entry && !entry.ok && <span className="qt-help-feedback qt-help-feedback-retry">{entry.reply}</span>}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="qt-cloze-gap-review">
      <div className="qt-cloze-gap-review-head">
        <span className="qt-cloze-gap-review-num">Gap {gapIndex + 1}</span>
        <span className="qt-cloze-gap-review-picked">
          You chose <b>{studentPick >= 0 ? (gap.options[studentPick] || '—') : 'nothing'}</b> · correct answer <b>{gap.options[gap.correctIndex] || '—'}</b>
        </span>
        {isDone && <span className="qt-cloze-gap-review-done">All words defined ✓</span>}
      </div>
      <ReviewHelp
        chat={chat}
        onChange={onChange}
        wrongLabel="Why did I get this wrong?"
        conceptLabel="Explain the right word"
        mineLabel="Define every word"
        mineDoneLabel="Words defined ✓"
        bountyLabel={`${words.length} words`}
        fetchConcept={fetchConcept}
        renderMine={renderMine}
        isDone={isDone}
        onAskTeacher={onAskTeacher}
        asked={asked}
        compact
      />
    </div>
  )
}

export default ClozeGapReview
