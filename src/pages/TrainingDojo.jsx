import { useState, useEffect } from 'react'
import { answerStage, nextStageIndex } from '../data/trainingDojo.js'
import NinjaSalute from '../components/NinjaSalute.jsx'

/**
 * The Training Dojo: a short course built from one question a student missed.
 *
 * It opens over whatever surface launched it rather than in a browser tab. A
 * real tab would trip the screen guard on the quiz pages and would lose the
 * card, the attempt and the review state behind it.
 *
 * Every stage is shown in two beats - why this question is here, then the
 * question - because a worked example a student has not been told the point of
 * is just another question. The explanation is never skipped: answering
 * reveals it, and Next only appears afterwards.
 *
 * Progress is reported upward on every answer, so a student who closes the tab
 * mid-suite resumes where they stopped rather than starting again.
 *
 * @param {object} suite the generated suite, shared by every student
 * @param {object} run this student's progress through it
 * @param {object[]} heuristics the heuristics this suite is labelled with
 * @param {(run: object) => void} onProgress called with the run after each answer
 * @param {() => void} onClose
 */
function TrainingDojo({ suite, run, heuristics = [], onProgress, onClose, now = () => Date.now() }) {
  const stages = suite?.stages || []
  const [current, setCurrent] = useState(() => nextStageIndex(run, suite))
  const [live, setLive] = useState(run)
  const [picked, setPicked] = useState(null)
  const [finished, setFinished] = useState(!!run?.completedAt)

  // The page underneath keeps its scrollbar otherwise, and a wheel over the
  // dimmed area scrolls the quiz behind the dojo instead of the dojo.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  const stage = stages[current]
  const answered = live?.answers?.[current] || null
  const shown = picked != null ? picked : answered?.chosen

  function choose(index) {
    if (shown != null) return
    setPicked(index)
    const res = answerStage(live, current, index, suite, now())
    setLive(res.run)
    onProgress?.(res.run)
  }

  function next() {
    setPicked(null)
    if (current + 1 >= stages.length) { setFinished(true); return }
    setCurrent(current + 1)
  }

  const done = (live?.answers || []).filter(Boolean).length
  const right = (live?.answers || []).filter((a) => a?.correct).length

  if (finished) {
    return (
      <div className="td-overlay" role="dialog" aria-label="Training Dojo complete">
        <div className="td-panel td-panel-done">
          <NinjaSalute className="td-done-ninja" />
          <h2 className="td-done-title">Training complete</h2>
          <p className="td-done-score"><strong>{right}</strong> of <strong>{stages.length}</strong> along the way</p>
          <p className="td-done-sub">
            You have worked through every step behind that question. It is still in your revision
            deck &mdash; now you have the method for it.
          </p>
          {heuristics.length > 0 && (
            <div className="td-done-heuristics">
              <span className="td-done-label">Methods practised</span>
              {heuristics.map((h) => (
                <div key={h.id} className="td-heuristic-row">
                  <span className="td-heuristic-name">{h.name}</span>
                  {h.description && <span className="td-heuristic-desc">{h.description}</span>}
                </div>
              ))}
            </div>
          )}
          <button className="td-btn td-btn-primary" onClick={onClose}>Back to the question</button>
        </div>
      </div>
    )
  }

  if (!stage) {
    return (
      <div className="td-overlay" role="dialog" aria-label="Training Dojo">
        <div className="td-panel td-panel-done">
          <h2 className="td-done-title">Nothing to train here yet</h2>
          <p className="td-done-sub">This question has no training suite. Your teacher has been told.</p>
          <button className="td-btn td-btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    )
  }

  return (
    <div className="td-overlay" role="dialog" aria-label="Training Dojo">
      <div className="td-panel">
        <header className="td-head">
          <div className="td-head-left">
            <span className="td-badge">Training Dojo</span>
            <span className="td-origin">{suite?.setTitle}</span>
          </div>
          <div className="td-rail" aria-label={`Stage ${current + 1} of ${stages.length}`}>
            {stages.map((s, i) => {
              const a = live?.answers?.[i]
              const cls = i === current ? 'td-pip td-pip-now'
                : a ? (a.correct ? 'td-pip td-pip-right' : 'td-pip td-pip-wrong')
                  : 'td-pip'
              return <button key={s.id || i} className={cls} title={`Step ${i + 1}`} onClick={() => { setPicked(null); setCurrent(i) }} />
            })}
          </div>
          <button className="td-close" onClick={onClose} aria-label="Close and save my place">&#10005;</button>
        </header>

        <div className="td-body">
          <div className="td-skill">
            <span className="td-skill-label">Step {current + 1} of {stages.length} &middot; why this one</span>
            <p className="td-skill-note">{stage.skillNote}</p>
            {stage.knowledge && <p className="td-skill-knowledge">{stage.knowledge}</p>}
          </div>

          <div className="td-question">{stage.text}</div>

          <div className="td-options">
            {stage.options.map((opt, i) => {
              let cls = 'td-option'
              if (shown != null) {
                if (i === stage.correctIndex) cls += ' td-option-right'
                else if (i === shown) cls += ' td-option-wrong'
              }
              return (
                <button key={i} className={cls} onClick={() => choose(i)} disabled={shown != null}>
                  <span className="td-option-letter">{String.fromCharCode(65 + i)}</span>
                  <span className="td-option-text">{opt}</span>
                </button>
              )
            })}
          </div>

          {shown != null && (
            <div className={`td-explain${shown === stage.correctIndex ? ' is-right' : ''}`}>
              <span className="td-explain-label">
                {shown === stage.correctIndex ? 'Right — here is why' : 'Not quite — here is why'}
              </span>
              <p>{stage.explanation}</p>
            </div>
          )}
        </div>

        <footer className="td-foot">
          <span className="td-foot-count">{done} of {stages.length} answered</span>
          {shown != null
            ? <button className="td-btn td-btn-primary" onClick={next}>{current + 1 >= stages.length ? 'Finish' : 'Next step'}</button>
            : <span className="td-foot-hint">Choose an answer to see the working</span>}
        </footer>
      </div>
    </div>
  )
}

export default TrainingDojo
