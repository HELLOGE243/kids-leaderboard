import { useState } from 'react'
import { getAttemptForEditing, injectAnswersIntoAttempt, preloadAllStudents, isWritingType } from '../data/store.js'
import { RichText } from './RichTextEditor.jsx'

/**
 * Puts answers into a paper that has already been handed in.
 *
 * For the sitting that went wrong on the day — a screen that froze, a tablet
 * that dropped out — where the student has their answers on paper and the mark
 * on the screen is not the work they did. The teacher sets each answer as the
 * student gave it and the paper is marked again.
 *
 * Every question is shown, whichever way it is answered, so nothing is silently
 * beyond reach: multiple choice by option, cloze by blank, matching by
 * statement, sentence-dragging by gap. Writing is left alone — it is marked in
 * the writing screen, where the rubric lives.
 */
function letter(i) {
  return String.fromCharCode(65 + i)
}

function plain(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

/** One row of choices: what the student gave, and what the teacher may set. */
function ChoiceRow({ label, value, count, optionText, onChange }) {
  return (
    <div className="ai-row">
      <span className="ai-row-label">{label}</span>
      <div className="ai-row-choices">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            className={`ai-choice${value === i ? ' ai-choice-on' : ''}`}
            title={optionText ? optionText(i) : undefined}
            // A letter always sets that answer. Clicking the one already there
            // used to clear it, which is the last thing a teacher typing up a
            // student's paper means to do; — is how an answer is taken away.
            onClick={() => onChange(i)}
          >{letter(i)}</button>
        ))}
        <button
          type="button"
          className={`ai-choice ai-choice-blank${value === -1 || value == null ? ' ai-choice-on' : ''}`}
          onClick={() => onChange(-1)}
          title="No answer"
        >—</button>
      </div>
    </div>
  )
}

function AnswerInjector({ studentId, studentName, quizSetId, teacherName, onClose, onSaved }) {
  const loaded = getAttemptForEditing(quizSetId, studentId)
  const [answers, setAnswers] = useState(() => (loaded ? JSON.parse(JSON.stringify(loaded.answers)) : []))
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  if (!loaded) {
    return (
      <div className="neon-overlay" onClick={onClose}>
        <div className="neon-popup" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
          <p>No handed-in paper found for this student and quiz.</p>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    )
  }

  const { questions, attempt } = loaded

  const setOne = (qi, value) => setAnswers((prev) => {
    const next = [...prev]
    next[qi] = value
    return next
  })

  const setPart = (qi, part, value) => setAnswers((prev) => {
    const next = [...prev]
    const arr = Array.isArray(next[qi]) ? [...next[qi]] : []
    arr[part] = value
    next[qi] = arr
    return next
  })

  async function save() {
    setBusy(true)
    await preloadAllStudents()
    const res = injectAnswersIntoAttempt(quizSetId, studentId, answers, teacherName)
    setStatus(res.changed
      ? `Saved. ${res.changed} ${res.changed === 1 ? 'answer' : 'answers'} changed — the paper now marks ${res.score}/${res.total}.`
      : 'Nothing was changed.')
    setBusy(false)
    if (onSaved) onSaved(res)
  }

  return (
    <div className="neon-overlay" onClick={onClose}>
      <div className="neon-popup ai-panel" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>Set answers — {studentName}</h2>
        <p className="td2-muted td2-small" style={{ marginBottom: 6 }}>
          {loaded.set.friendlyTitle || loaded.set.rawTitle} · handed in {attempt.date ? new Date(attempt.date).toLocaleString() : '—'}
          {' · '}currently {attempt.score}/{attempt.total}
        </p>
        <p className="td2-muted td2-small" style={{ marginBottom: 14 }}>
          Set each answer as the student gave it. The paper is marked again when you save, and every change is
          recorded against it. The archived copy of what was submitted is never altered.
        </p>

        {(attempt.adjustments || []).length > 0 && (
          <p className="ai-history">
            Already adjusted {attempt.adjustments.length === 1 ? 'once' : `${attempt.adjustments.length} times`}
            {' — last by '}{attempt.adjustments[attempt.adjustments.length - 1].by}
            {' on '}{new Date(attempt.adjustments[attempt.adjustments.length - 1].at).toLocaleString()}.
          </p>
        )}

        <div className="ai-questions">
          {questions.map((q, qi) => {
            const type = q.type || 'multiple-choice'
            const given = answers[qi]
            const header = (
              <div className="ai-q-head">
                <span className="ai-q-num">Q{qi + 1}</span>
                <span className="ai-q-text">{plain(q.text) ? plain(q.text).slice(0, 110) : <RichText html={q.prompt} />}</span>
              </div>
            )

            if (isWritingType(type)) {
              return (
                <div key={qi} className="ai-q">
                  {header}
                  <p className="ai-note">Writing — marked in the writing screen, not here.</p>
                </div>
              )
            }

            if (type === 'multiple-choice' || type === 'multi-description') {
              const count = (q.options || []).filter(Boolean).length || 4
              return (
                <div key={qi} className="ai-q">
                  {header}
                  <ChoiceRow
                    label="Answer"
                    value={typeof given === 'number' ? given : -1}
                    count={count}
                    optionText={(i) => plain(q.options?.[i])}
                    onChange={(v) => setOne(qi, v)}
                  />
                  <p className="ai-key">Correct: {letter(q.correctIndex)}</p>
                </div>
              )
            }

            if (type === 'dropdown-cloze') {
              const blanks = q.blanks || []
              return (
                <div key={qi} className="ai-q">
                  {header}
                  {blanks.map((b, bi) => (
                    <ChoiceRow
                      key={bi}
                      label={`Blank ${bi + 1}`}
                      value={Array.isArray(given) ? given[bi] : -1}
                      count={(b.options || []).filter(Boolean).length || 4}
                      optionText={(i) => plain(b.options?.[i])}
                      onChange={(v) => setPart(qi, bi, v)}
                    />
                  ))}
                  <p className="ai-key">Correct: {blanks.map((b) => letter(b.correctIndex)).join(' ')}</p>
                </div>
              )
            }

            if (type === 'multi-matching') {
              const rows = q.matchQuestions || []
              const extracts = (q.descriptions || []).length || 4
              return (
                <div key={qi} className="ai-q">
                  {header}
                  {rows.map((mq, mi) => (
                    <ChoiceRow
                      key={mi}
                      label={`${mi + 1}. ${plain(mq.question).slice(0, 48)}`}
                      value={Array.isArray(given) ? given[mi] : -1}
                      count={extracts}
                      onChange={(v) => setPart(qi, mi, v)}
                    />
                  ))}
                  <p className="ai-key">Correct: {rows.map((mq) => letter(mq.correctExtract)).join(' ')}</p>
                </div>
              )
            }

            if (type === 'drag-drop' || type === 'drag-sentence' || type === 'drag-summary') {
              const gaps = q.correctOrder || []
              const choices = (q.summaryOptions || []).filter(Boolean).length || gaps.length + 1
              return (
                <div key={qi} className="ai-q">
                  {header}
                  {gaps.map((_, gi) => (
                    <ChoiceRow
                      key={gi}
                      label={`Gap ${q.gapNumbers?.[gi] ?? gi + 1}`}
                      value={Array.isArray(given) ? given[gi] : -1}
                      count={choices}
                      optionText={(i) => plain(q.summaryOptions?.[i])}
                      onChange={(v) => setPart(qi, gi, v)}
                    />
                  ))}
                  <p className="ai-key">Correct: {gaps.map((cidx) => letter(cidx)).join(' ')}</p>
                </div>
              )
            }

            return (
              <div key={qi} className="ai-q">
                {header}
                <p className="ai-note">This question type cannot be set here.</p>
              </div>
            )
          })}
        </div>

        {status && <p className="ai-status">{status}</p>}
        <div className="ai-actions">
          <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save and mark again'}</button>
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export default AnswerInjector
