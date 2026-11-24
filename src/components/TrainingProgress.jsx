import { useState } from 'react'
import { progressTree, runStatus } from '../data/trainingDojo.js'

/**
 * My Progress: every Training Dojo this student has opened, by method.
 *
 * Grouped subject, then heuristic, then question - because the thing a student
 * (and a parent reading over their shoulder) wants to see is not a list of
 * questions but a list of methods, with the evidence underneath each one.
 *
 * A suite left half-done is shown as such and is resumable. That is deliberate:
 * an unfinished suite is the most useful row on this screen, and hiding it
 * until it is complete would hide exactly the work worth going back to.
 */
function TrainingProgress({ runs = [], heuristicsById = {}, onOpen }) {
  const [open, setOpen] = useState(() => new Set())
  const tree = progressTree(runs, heuristicsById)

  function toggle(key) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (!tree.length) {
    return (
      <div className="tp-empty">
        <p className="tp-empty-title">No training yet</p>
        <p className="tp-empty-sub">
          Open a Training Dojo from a maths or thinking skills question you got wrong,
          and it will be recorded here under the method it teaches.
        </p>
      </div>
    )
  }

  return (
    <div className="tp">
      {tree.map((subject) => {
        // A run appears under every heuristic it carries, so flattening the
        // groups counts a three-heuristic question three times. The header
        // counts questions, which is what "3 of 5 complete" has to mean.
        const all = [...new Map(subject.groups.flatMap((g) => g.runs).map((r) => [r.id, r])).values()]
        const complete = all.filter((r) => r.completedAt).length
        return (
          <section key={subject.subject} className="tp-subject">
            <header className="tp-subject-head">
              <h3 className="tp-subject-name">{subject.name}</h3>
              <span className="tp-subject-count">{complete} of {all.length} complete</span>
            </header>

            {subject.groups.map((group) => {
              const key = `${subject.subject}:${group.id}`
              const isOpen = open.has(key)
              const doneHere = group.runs.filter((r) => r.completedAt).length
              const heuristic = heuristicsById[group.id]
              return (
                <div key={group.id} className={`tp-group${isOpen ? ' is-open' : ''}`}>
                  <button className="tp-group-head" onClick={() => toggle(key)}>
                    <span className="tp-caret" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                    <span className="tp-group-name">{group.name}</span>
                    <span className={`tp-group-count${doneHere === group.runs.length ? ' is-done' : ''}`}>
                      {doneHere}/{group.runs.length}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="tp-group-body">
                      {heuristic?.description && <p className="tp-group-desc">{heuristic.description}</p>}
                      {group.runs.map((run) => {
                        const status = runStatus(run)
                        return (
                          <div key={run.id} className="tp-run">
                            <div className="tp-run-main">
                              <span className={`tp-dot tp-dot-${status.state}`} aria-hidden="true" />
                              <span className="tp-run-q">{run.questionSnippet || 'A question from your deck'}</span>
                            </div>
                            <div className="tp-run-right">
                              <span className={`tp-status tp-status-${status.state}`}>
                                {status.state === 'complete' ? 'Complete'
                                  : status.state === 'unfinished' ? `${status.answered} of ${status.total}`
                                    : 'Not started'}
                              </span>
                              <button className="tp-run-btn" onClick={() => onOpen?.(run)}>
                                {status.state === 'complete' ? 'Review' : status.state === 'unfinished' ? 'Resume' : 'Start'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}

export default TrainingProgress
