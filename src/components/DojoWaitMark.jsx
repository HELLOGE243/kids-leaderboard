import { useState, useEffect } from 'react'
import { mathMark, MATH_MARKS } from '../data/trainingDojo.js'

/**
 * What turns while the dojo is being written, in place of a spinner.
 *
 * A spinner says "something is happening" and nothing else. These say which
 * dojo is being built before the first question arrives, which is the one
 * piece of information available during the wait that is worth anything to
 * the student: mathematics fades through signs and constants, thinking
 * skills breathes a brain.
 *
 * Signs and constants rather than digits, deliberately. A number on the
 * screen while a child waits for a question looks like part of the question.
 *
 * @param {'math'|'thinking'} subject
 * @param {boolean} [ready] true once the question is in hand: the mark pops
 *   and fades rather than vanishing mid-breath.
 */
function DojoWaitMark({ subject, ready = false }) {
  const [tick, setTick] = useState(0)
  // Drawn once per mount, so two students waiting on the same question do not
  // watch the same symbol at the same moment.
  const [start] = useState(() => Math.floor(Math.random() * MATH_MARKS.length))

  const cycling = subject === 'math' && !ready
  useEffect(() => {
    if (!cycling) return undefined
    const id = setInterval(() => setTick((t) => t + 1), 900)
    return () => clearInterval(id)
  }, [cycling])

  if (subject === 'thinking') {
    return (
      <span className={`td-mark td-mark-brain${ready ? ' is-ready' : ''}`} aria-hidden="true">
        &#129504;
      </span>
    )
  }

  if (subject !== 'math') return <span className="td-waiting-spin" aria-hidden="true" />

  return (
    <span className={`td-mark td-mark-math${ready ? ' is-ready' : ''}`} aria-hidden="true">
      {/* Keyed on the symbol, so React replaces the node rather than editing
          its text - which is what restarts the fade on every change. */}
      <span key={mathMark(tick, start)} className="td-mark-glyph">
        {mathMark(tick, start)}
      </span>
    </span>
  )
}

export default DojoWaitMark
