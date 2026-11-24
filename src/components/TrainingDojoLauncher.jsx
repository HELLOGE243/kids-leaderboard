import { useState, useEffect, useRef } from 'react'
import TrainingDojo from '../pages/TrainingDojo.jsx'
import {
  canTrain, suiteKey, newRun, stageState, addVariant, waitWord, DOJO_WAIT_WORDS,
} from '../data/trainingDojo.js'
import { buildSuite, buildVariant, checkReflection } from '../data/dojoAi.js'
import {
  loadTrainingSuites, saveTrainingSuite, loadHeuristics, saveHeuristics,
} from '../data/firebase.js'
import { getTrainingRun, saveTrainingRun } from '../data/store.js'

// Out here rather than in the component: the clock is read inside an async
// click handler, but a call to it anywhere in a component body reads as a
// render-time side effect.
const nowMs = () => Date.now()

/**
 * The purple button, and everything behind it.
 *
 * One component so the three surfaces that carry the button - the daily
 * revision card, the Revision Hall and Review All - each need one line. They
 * all want the same thing and none of them should have to know how a suite is
 * found, built, cached or resumed.
 *
 * The order of work when it is opened:
 *   1. read the shared suite for this question
 *   2. if there is none, build it - that student pays, everyone after reads it
 *   3. open the dojo on this student's own run, or a new one
 * A suite that fails to build is said so plainly and nothing is cached, so
 * the next student tries again rather than inheriting a broken course.
 *
 * @param {object} question the question the student got wrong
 * @param {string} sourceId the quiz set it came from
 * @param {number} questionIndex its position, for questions with no id
 * @param {string} subject 'math' or 'thinking'; anything else hides the button
 * @param {object} student
 * @param {string} [setTitle] shown in the dojo's header
 * @param {boolean} [wrongOnly] true on the revision surfaces, where the button
 *   is only offered on a question they actually missed
 */
function TrainingDojoLauncher({
  question, sourceId, questionIndex, subject, student, setTitle, year, className = '',
}) {
  const [open, setOpen] = useState(false)
  const [suite, setSuite] = useState(null)
  const [run, setRun] = useState(null)
  const [heuristics, setHeuristics] = useState([])
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  // The waiting screen rotates a phrase rather than naming the real step,
  // which is one API call followed by another and means nothing to a child.
  // The start is drawn once per mount so two students waiting on the same
  // question do not read the same line, and the tick only runs while there
  // is something to wait for.
  const [tick, setTick] = useState(0)
  const [waitStart] = useState(() => Math.floor(Math.random() * DOJO_WAIT_WORDS.length))
  const waiting = open && !!status
  useEffect(() => {
    if (!waiting) return undefined
    const id = setInterval(() => setTick((t) => t + 1), 2400)
    return () => clearInterval(id)
  }, [waiting])

  const key = suiteKey(question, questionIndex)
  const existing = student?.id ? getTrainingRun(student.id, sourceId, key) : null

  if (!canTrain(question, subject) || !student?.id || !sourceId) return null

  async function launch() {
    setError('')
    setStatus('Opening the dojo…')
    setOpen(true)

    let found = null
    try {
      const all = await loadTrainingSuites(sourceId)
      found = all?.[key] || null
    } catch {
      // A cache that cannot be read is treated as one that holds nothing: the
      // course gets built again rather than the student being told no.
    }

    if (!found) {
      setStatus('Working out what this question is really testing…')
      let library = []
      try {
        const map = await loadHeuristics(subject)
        library = Object.values(map || {}).filter((h) => h && !h.archived)
      } catch {
        // Without the library the model proposes fresh heuristics instead of
        // reusing one. A duplicate in the library is a tidying job; refusing
        // to teach the child is not.
      }

      const built = await buildSuite({ question, subject, library, year }, (step) => {
        if (alive.current) setStatus(step + '…')
      })
      if (!alive.current) return
      if (!built.ok) {
        setError(built.error || 'The dojo could not be built for this one.')
        setStatus('')
        return
      }
      found = { ...built.suite, setTitle: setTitle || '', questionKey: key, sourceId }
      // Cached before the student sees it, so a child who closes the dojo
      // straight away has still paid it forward.
      await saveTrainingSuite(sourceId, key, found)
      if (built.added?.length) await saveHeuristics(subject, built.added)
    }

    if (!alive.current) return
    // Named for the completion screen: "methods practised" is the one line a
    // student takes away, and an id is not a method.
    try {
      const map = await loadHeuristics(subject)
      setHeuristics((found.heuristicIds || []).map((id) => map?.[id]).filter(Boolean))
    } catch {
      // The completion screen simply omits the list.
    }

    const theirs = existing || newRun(found, {
      sourceId, questionKey: key, subject,
      questionSnippet: String(question?.text || question?.prompt || '')
        .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      now: nowMs(),
    })
    setSuite(found)
    setRun(theirs)
    setStatus('')
  }

  function onProgress(next) {
    setRun(next)
    saveTrainingRun(student.id, next)
  }

  // Another question on a step whose variants are used up. Written once and
  // kept on the shared suite, so the next student to miss it gets this one.
  async function onNeedVariant(index) {
    const stage = suite?.stages?.[index]
    if (!stage) return null
    const res = await buildVariant({
      question, stage, existing: stage.variants || [], year,
    })
    if (!res.ok) { console.warn('Training Dojo: a variant could not be written:', res.error); return null }
    const next = addVariant(suite, index, res.variant)
    setSuite(next)
    await saveTrainingSuite(sourceId, key, next)
    return res.variant
  }

  function onCheckReflection(index, written) {
    const at = stageState(run, index).variant || 0
    const stage = at === 0
      ? suite?.stages?.[index]
      : (suite?.stages?.[index]?.variants || [])[at - 1]
    const attempts = stageState(run, index).attempts
    const chosenIndex = attempts[attempts.length - 1]?.chosen
    return checkReflection({ stage, chosenIndex, written })
  }

  function close() {
    setOpen(false)
    setSuite(null)
    setStatus('')
    setError('')
  }

  const label = existing?.completedAt ? 'Review Training Dojo'
    : existing ? `Resume Training Dojo (${(existing.stages || []).filter((s) => s?.passed).length}/${existing.stageCount})`
      : 'Open Training Dojo'

  return (
    <>
      <button
        className={`td-launch${existing && !existing.completedAt ? ' td-launch-resume' : ''} ${className}`}
        onClick={launch}
        disabled={open}
      >
        <span className="td-launch-icon" aria-hidden="true">&#9881;</span>
        {label}
      </button>

      {open && !suite && (
        <div className="td-overlay" role="dialog" aria-label="Training Dojo">
          <div className="td-panel td-panel-done">
            {error ? (
              <>
                <h2 className="td-done-title">Not this time</h2>
                <p className="td-done-sub">{error}</p>
                <button className="td-btn td-btn-primary" onClick={close}>Close</button>
              </>
            ) : (
              <>
                <div className="td-waiting">
                  <span className="td-waiting-spin" aria-hidden="true" />
                  <p>{waitWord(tick, waitStart)}&hellip;</p>
                </div>
                <button className="td-btn" onClick={close}>Cancel</button>
              </>
            )}
          </div>
        </div>
      )}

      {open && suite && run && (
        <TrainingDojo
          suite={suite}
          run={run}
          heuristics={heuristics}
          onProgress={onProgress}
          onNeedVariant={onNeedVariant}
          onCheckReflection={onCheckReflection}
          onClose={close}
        />
      )}
    </>
  )
}

export default TrainingDojoLauncher
