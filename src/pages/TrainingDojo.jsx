import { useState, useEffect, useRef } from 'react'
import {
  answerStage, nextStageIndex, stageState, questionForStage,
  recordReflection, reflectionTooShort, runEffort, MIN_REFLECTION_WORDS,
  retrainRun,
} from '../data/trainingDojo.js'
import { pickCelebration } from '../data/celebrations.js'
import SpriteAnimation from '../components/SpriteAnimation.jsx'
import { preloadSheet } from '../utils/spriteCache.js'
import PassBand from '../components/PassBand.jsx'
import DojoWaitMark from '../components/DojoWaitMark.jsx'
import { prepareDojoText } from '../utils/dojoText.js'
import { renderMath } from '../utils/renderMath.js'

/**
 * The Training Dojo: a short course built from one question a student missed.
 *
 * It opens over whatever surface launched it rather than in a browser tab. A
 * real tab would trip the screen guard on the quiz pages and would lose the
 * card, the attempt and the review state behind it.
 *
 * Every stage is shown in two beats - why this question is here, then the
 * question - because a worked example a student has not been told the point of
 * is just another question.
 *
 * A wrong answer is not a score, it is a detour. The student reads the working,
 * writes what they missed, has that checked, and then faces another question on
 * the same idea. There is no way past a stage except getting one right, so
 * finishing the suite means something that a tally out of eight never did.
 *
 * Progress is reported upward on every answer, so a student who closes the tab
 * mid-suite resumes where they stopped rather than starting again.
 *
 * @param {object} suite the generated suite, shared by every student
 * @param {object} run this student's progress through it
 * @param {object[]} heuristics the heuristics this suite is labelled with
 * @param {(run: object) => void} onProgress called with the run after each step
 * @param {(stageIndex: number) => Promise<object|null>} onNeedVariant asked for
 *   another question on a stage whose variants are used up
 * @param {(stageIndex: number, written: string) => Promise<object>} onCheckReflection
 * @param {() => void} onClose
 */
/** Model-written text, with its maths set as maths. */
function Tex({ children, className }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: renderMath(prepareDojoText(children)) }} />
}

function TrainingDojo({
  suite, run, heuristics = [], onProgress, onNeedVariant, onCheckReflection, onClose,
  now = () => Date.now(),
}) {
  const stages = suite?.stages || []
  const [current, setCurrent] = useState(() => nextStageIndex(run, suite))
  const [live, setLive] = useState(run)
  const [picked, setPicked] = useState(null)
  const [finished, setFinished] = useState(!!run?.completedAt)
  const [written, setWritten] = useState('')
  const [checking, setChecking] = useState(false)
  const [feedback, setFeedback] = useState('')
  // A sentence the model says WOULD count, kept back until the second refusal.
  const [example, setExample] = useState('')
  const [buildingVariant, setBuildingVariant] = useState(false)
  const [passNonce, setPassNonce] = useState(null)
  const bandSeq = useRef(0)
  // Right answers in a row, this sitting. A wrong one puts it back to nothing,
  // which is what makes the prismatic band worth reaching.
  const [streak, setStreak] = useState(0)
  // What they actually pressed on the attempt that sent them here, so the
  // detour can show it back to them. The run holds it too, but the run is a
  // list of attempts across variants and this is the one that is on screen.
  // Seeded from the run, not just set on the press: a student who closed the
  // dojo mid-detour and came back would otherwise be asked what they got
  // wrong with no sign of which one they had picked.
  const [missed, setMissed] = useState(() => {
    const at = nextStageIndex(run, suite)
    const tries = stageState(run, at).attempts || []
    const last = tries[tries.length - 1]
    return last && !last.correct && typeof last.chosen === 'number' ? last.chosen : null
  })
  // Refused reflections on this stage. At two, the detour stops asking them
  // to find the words on their own and shows them what to write.
  const [refused, setRefused] = useState(0)

  // The completion sheet is fetched the moment the dojo opens, so it is
  // decoded and waiting by the time the last question is passed rather than
  // downloading over the top of its own animation.
  useEffect(() => { preloadSheet(pickCelebration('complete')) }, [])

  // The page underneath keeps its scrollbar otherwise, and a wheel over the
  // dimmed area scrolls the quiz behind the dojo instead of the dojo.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  const state = stageState(live, current)
  const question = questionForStage(suite, live, current)
  const stage = stages[current]
  const skillNote = String((question || stage || {}).skillNote || (stage || {}).skillNote || '')
  const showingAnswer = picked != null
  const chosen = picked
  const needsReflection = state.needsReflection && !showingAnswer

  function save(next) {
    setLive(next)
    onProgress?.(next)
  }

  function choose(index) {
    if (showingAnswer || !question) return
    setPicked(index)
    setFeedback('')
    const res = answerStage(live, current, index, suite, now())
    save(res.run)
    if (res.correct) {
      bandSeq.current += 1
      setStreak((n) => n + 1)
      setPassNonce(bandSeq.current)
    } else {
      setStreak(0)
      setMissed(index)
    }
  }

  // After a right answer: on to the next unpassed stage, or the finish.
  function next() {
    setPicked(null)
    setWritten('')
    setFeedback('')
    setRefused(0)
    setMissed(null)
    const after = nextStageIndex(live, suite)
    if (stages.every((_, i) => stageState(live, i).passed)) { setFinished(true); return }
    setCurrent(after)
  }

  // Round two, by choice. Everything on screen goes back to the start,
  // including the streak - a prismatic band earned on a second lap through
  // questions they have already seen would not mean what the first one did.
  function trainAgain() {
    const fresh = retrainRun(live, suite, now())
    save(fresh)
    setFinished(false)
    setCurrent(0)
    setPicked(null)
    setWritten('')
    setFeedback('')
    setExample('')
    setRefused(0)
    setMissed(null)
    setStreak(0)
  }

  // After a wrong answer: read the working, then write what was missed.
  function toReflection() {
    setPicked(null)
    setFeedback('')
  }

  async function submitReflection() {
    if (checking || reflectionTooShort(written)) return
    setChecking(true)
    setFeedback('')
    let verdict = { understood: true, feedback: '' }
    try {
      verdict = await onCheckReflection?.(current, written) || verdict
    } catch {
      // A check that could not run must not trap a child who has written
      // something. The caller logs it; the student moves on.
      verdict = { understood: true, feedback: '' }
    }
    const res = recordReflection(live, current, written, verdict, now())
    save(res.run)
    setChecking(false)
    if (!res.understood) {
      setRefused((n) => n + 1)
      setFeedback(res.feedback || 'Have another look at the working above, then try again.')
      if (verdict.example) setExample(verdict.example)
      return
    }
    setRefused(0)
    setExample('')
    setWritten('')
    setFeedback('')
    // They have earned another go; make sure there is a question for it.
    if (!questionForStage(suite, res.run, current)) {
      setBuildingVariant(true)
      try { await onNeedVariant?.(current) } finally { setBuildingVariant(false) }
    }
  }

  if (finished) {
    const effort = runEffort(live)
    const sheet = pickCelebration('complete')
    return (
      <div className="td-overlay" role="dialog" aria-label="Training Dojo complete">
        <div className="td-panel td-panel-done">
          {sheet
            ? <SpriteAnimation sheet={sheet} size={230} className="td-done-sprite" />
            : <div className="td-done-badge">&#9733;</div>}
          <h2 className="td-done-title">Training complete</h2>
          <p className="td-done-score">
            All <strong>{effort.stages}</strong> passed
            {effort.retries > 0 && <> &middot; <strong>{effort.retries}</strong> second {effort.retries === 1 ? 'go' : 'goes'}</>}
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
          {/* Two ways out. Going again is not undoing: the run keeps its id
              and its count of finishes, so My Progress still says they have
              done this one. */}
          <div className="td-done-actions">
            <button className="td-btn" onClick={trainAgain}>Train again</button>
            <button className="td-btn td-btn-primary" onClick={onClose}>Back to the question</button>
          </div>
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

  const passedCount = stages.filter((_, i) => stageState(live, i).passed).length

  return (
    <div className="td-overlay" role="dialog" aria-label="Training Dojo">
      <PassBand nonce={passNonce} streak={streak} />
      <div className="td-panel">
        <header className="td-head">
          <div className="td-head-left">
            <span className="td-badge">Training Dojo</span>
            <span className="td-origin">{suite?.setTitle}</span>
          </div>
          <div className="td-rail" aria-label={`Stage ${current + 1} of ${stages.length}`}>
            {stages.map((s, i) => {
              const st = stageState(live, i)
              const cls = i === current ? 'td-pip td-pip-now'
                : st.passed ? 'td-pip td-pip-right'
                  : st.attempts.length ? 'td-pip td-pip-trying'
                    : 'td-pip'
              return (
                <button
                  key={i}
                  className={cls}
                  title={`Step ${i + 1}`}
                  onClick={() => { setPicked(null); setWritten(''); setFeedback(''); setCurrent(i) }}
                />
              )
            })}
          </div>
          <button className="td-close" onClick={onClose} aria-label="Close and save my place">&#10005;</button>
        </header>

        <div className="td-body">
          <div className="td-skill">
            <span className="td-skill-label">
              Step {current + 1} of {stages.length}
              {state.variant > 0 && <> &middot; another go</>}
              {state.variant === 0 && <> &middot; why this one</>}
            </span>
            <p className="td-skill-note"><Tex>{skillNote}</Tex></p>
            {/* Only when it adds something. A variant's note often comes back as
                the step's own description, and the same sentence printed twice
                reads as a bug rather than as emphasis. */}
            {stage.knowledge && stage.knowledge.trim() !== skillNote.trim()
              && <p className="td-skill-knowledge"><Tex>{stage.knowledge}</Tex></p>}
          </div>

          {buildingVariant ? (
            <div className="td-waiting">
              <DojoWaitMark subject={suite?.subject} />
              <p>Writing you another question on this&hellip;</p>
            </div>
          ) : !question ? (
            <div className="td-waiting">
              <p>This step has no question ready. Close the dojo and come back in a moment.</p>
            </div>
          ) : needsReflection ? (
            // The detour. The working stays on screen while they write, because
            // the point is for them to read it, not to recall it.
            <div className="td-reflect">
              {/* The question comes with them onto the detour. Writing what
                  you missed with the question gone from the screen is a
                  memory test, and the thing being asked for is reasoning. */}
              <div className="td-reflect-recap">
                <div className="td-question td-question-recap"><Tex>{question.text}</Tex></div>
                <div className="td-options td-options-recap">
                  {question.options.map((opt, i) => {
                    let cls = 'td-option td-option-recap'
                    if (i === question.correctIndex) cls += ' td-option-right'
                    else if (i === missed) cls += ' td-option-wrong'
                    return (
                      <div key={i} className={cls}>
                        <span className="td-option-letter">{String.fromCharCode(65 + i)}</span>
                        <Tex className="td-option-text">{opt}</Tex>
                        {i === missed && <span className="td-option-tag">you chose this</span>}
                        {i === question.correctIndex && <span className="td-option-tag">the answer</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="td-explain">
                <span className="td-explain-label">The working</span>
                <p><Tex>{question.explanation}</Tex></p>
              </div>
              <label className="td-reflect-label" htmlFor="td-reflect-box">
                In your own words: what did you miss?
              </label>
              <p className="td-reflect-hint">
                Not &ldquo;I misread it&rdquo; &mdash; say what the right answer does that yours did not.
                Spelling does not matter.
              </p>
              <textarea
                id="td-reflect-box"
                className="td-reflect-box"
                rows={4}
                value={written}
                onChange={(e) => setWritten(e.target.value)}
                placeholder="I chose&hellip; but actually&hellip;"
                disabled={checking}
              />
              {feedback && <p className="td-reflect-feedback">{feedback}</p>}
              {/* Turned down twice is the point where a child stops learning
                  and starts guessing at what the marker wants. They are shown
                  a sentence that would count and asked to write it in their
                  own words - shown, not pasted in, because typing it is the
                  last bit of the thinking and a button would skip it. */}
              {refused >= 2 && example && (
                <div className="td-reflect-help">
                  <span className="td-reflect-help-label">Stuck? Something like this would do it</span>
                  <p className="td-reflect-help-text"><Tex>{example}</Tex></p>
                  <span className="td-reflect-help-note">
                    Type it in your own words in the box &mdash; it does not have to match.
                  </span>
                </div>
              )}
              <div className="td-reflect-foot">
                <span className="td-reflect-count">
                  {reflectionTooShort(written)
                    ? `At least ${MIN_REFLECTION_WORDS} words`
                    : 'Ready'}
                </span>
                <button
                  className="td-btn td-btn-primary"
                  onClick={submitReflection}
                  disabled={checking || reflectionTooShort(written)}
                >{checking ? 'Reading…' : 'That is what I missed'}</button>
              </div>
            </div>
          ) : (
            <>
              <div className="td-question"><Tex>{question.text}</Tex></div>
              <div className="td-options">
                {question.options.map((opt, i) => {
                  let cls = 'td-option'
                  if (showingAnswer) {
                    if (i === question.correctIndex) cls += ' td-option-right'
                    else if (i === chosen) cls += ' td-option-wrong'
                  }
                  return (
                    <button key={i} className={cls} onClick={() => choose(i)} disabled={showingAnswer}>
                      <span className="td-option-letter">{String.fromCharCode(65 + i)}</span>
                      <Tex className="td-option-text">{opt}</Tex>
                    </button>
                  )
                })}
              </div>
              {showingAnswer && (
                <div className={`td-explain${chosen === question.correctIndex ? ' is-right' : ''}`}>
                  <span className="td-explain-label">
                    {chosen === question.correctIndex ? 'Right — here is why' : 'Not this time — here is why'}
                  </span>
                  <p><Tex>{question.explanation}</Tex></p>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="td-foot">
          <span className="td-foot-count">{passedCount} of {stages.length} passed</span>
          {showingAnswer
            ? (chosen === question?.correctIndex
              ? <button className="td-btn td-btn-primary" onClick={next}>
                {passedCount >= stages.length ? 'Finish' : 'Next step'}
              </button>
              : <button className="td-btn td-btn-primary" onClick={toReflection}>Tell me what I missed</button>)
            : needsReflection || buildingVariant
              ? <span className="td-foot-hint">Every step has to be passed to finish</span>
              : <span className="td-foot-hint">Choose an answer to see the working</span>}
        </footer>
      </div>
    </div>
  )
}

export default TrainingDojo
