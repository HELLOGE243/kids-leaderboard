import { useState, useEffect } from 'react'
import {
  loadTrainingSuites, saveTrainingSuite, deleteTrainingSuites, clearTrainingSuiteCache,
} from '../data/firebase.js'
import { suiteKey } from '../data/trainingDojo.js'
import { prepareDojoText } from '../utils/dojoText.js'
import { renderMath } from '../utils/renderMath.js'

// Out here for the same reason as in TrainingDojoLauncher: a call to the clock
// anywhere in a component body reads as a render-time side effect.
const nowMs = () => Date.now()

/**
 * The Training Dojo suite for one question, in the question editor.
 *
 * It is the only place anybody sees what the AI wrote before a child does, so
 * it shows the stages in full - the question, the four options, which one is
 * marked right, and the working - rather than a summary that would let a bad
 * one through.
 *
 * Destroying a suite does not disable the feature for that question: it clears
 * the cache, and the next student to miss it has a fresh one written. That is
 * the point. A bad course is thrown away and replaced, not switched off.
 *
 * Everything here writes to the shared document, so an edit lands for every
 * student at once.
 */
function TrainingSuiteAdmin({ setId, question, questionIndex }) {
  const [suite, setSuite] = useState(null)
  const [state, setState] = useState('idle')
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const key = suiteKey(question, questionIndex)

  useEffect(() => {
    if (!open || !setId) return undefined
    let alive = true
    // Marked loading asynchronously: setting it in the effect body is a second
    // render before the first has painted, and the panel is already closed-by-
    // default so there is nothing to flash.
    const mark = setTimeout(() => { if (alive) setState('loading') }, 0)
    loadTrainingSuites(setId)
      .then((all) => { if (alive) { setSuite(all?.[key] || null); setState('ready') } })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false; clearTimeout(mark) }
  }, [open, setId, key])

  async function destroy() {
    setState('saving')
    await deleteTrainingSuites(setId, [key])
    clearTrainingSuiteCache(setId)
    setSuite(null)
    setConfirming(false)
    setState('ready')
  }

  async function removeStage(i) {
    const stages = (suite.stages || []).filter((_, n) => n !== i)
    // A suite with nothing left is no suite. Destroyed rather than left as an
    // empty course a student would open onto a blank screen.
    if (!stages.length) return destroy()
    const next = { ...suite, stages, editedAt: nowMs() }
    setState('saving')
    setSuite(next)
    await saveTrainingSuite(setId, key, next)
    setState('ready')
  }

  async function edit(i, field, value) {
    const stages = [...(suite.stages || [])]
    stages[i] = { ...stages[i], [field]: value }
    const next = { ...suite, stages, editedAt: nowMs() }
    setSuite(next)
    await saveTrainingSuite(setId, key, next)
  }

  async function setCorrect(i, oi) {
    await edit(i, 'correctIndex', oi)
  }

  async function editOption(i, oi, value) {
    const options = [...(suite.stages[i].options || [])]
    options[oi] = value
    await edit(i, 'options', options)
  }

  const tex = (s) => ({ __html: renderMath(prepareDojoText(s)) })

  if (!setId) return null

  return (
    <div className="tsa">
      <button className="tsa-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? '▾' : '▸'} Training Dojo suite
        {suite && <span className="tsa-count">{(suite.stages || []).length} stages</span>}
      </button>

      {open && (
        <div className="tsa-body">
          {state === 'loading' && <p className="tsa-note">Reading the shared suite&hellip;</p>}
          {state === 'error' && <p className="tsa-note">That could not be read.</p>}
          {state !== 'loading' && !suite && (
            <p className="tsa-note">
              No suite has been written for this question yet. One is written the first time a
              student misses it, and appears here for you to check.
            </p>
          )}

          {suite && (
            <>
              <div className="tsa-head">
                <span className="tsa-meta">
                  Written {suite.generatedAt ? new Date(suite.generatedAt).toLocaleDateString() : 'at some point'}
                  {suite.editedAt && ' · edited since'}
                  {' · '}shared with every student
                </span>
                {confirming ? (
                  <span className="tsa-confirm">
                    Throw it away? The next student to miss this question gets a new one.
                    <button className="tsa-btn tsa-btn-danger" onClick={destroy}>Destroy</button>
                    <button className="tsa-btn" onClick={() => setConfirming(false)}>Keep</button>
                  </span>
                ) : (
                  <button className="tsa-btn tsa-btn-danger" onClick={() => setConfirming(true)}>Destroy suite</button>
                )}
              </div>

              {(suite.stages || []).map((st, i) => (
                <div key={i} className="tsa-stage">
                  <div className="tsa-stage-head">
                    <span className="tsa-step">{i + 1}</span>
                    <span className="tsa-knowledge" dangerouslySetInnerHTML={tex(st.knowledge)} />
                    <button className="tsa-btn tsa-btn-danger" onClick={() => removeStage(i)}>Remove</button>
                  </div>
                  <textarea
                    className="tsa-input"
                    rows={2}
                    defaultValue={st.text}
                    onBlur={(e) => e.target.value !== st.text && edit(i, 'text', e.target.value)}
                  />
                  <div className="tsa-options">
                    {(st.options || []).map((o, oi) => (
                      <div key={oi} className={`tsa-option${oi === st.correctIndex ? ' is-right' : ''}`}>
                        <button
                          className="tsa-mark"
                          title="Mark this one correct"
                          onClick={() => setCorrect(i, oi)}
                        >{String.fromCharCode(65 + oi)}</button>
                        <input
                          className="tsa-input"
                          defaultValue={o}
                          onBlur={(e) => e.target.value !== o && editOption(i, oi, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                  <textarea
                    className="tsa-input tsa-explain"
                    rows={2}
                    defaultValue={st.explanation}
                    onBlur={(e) => e.target.value !== st.explanation && edit(i, 'explanation', e.target.value)}
                  />
                  {(st.variants || []).length > 0 && (
                    <p className="tsa-note">
                      {st.variants.length} second-go question{st.variants.length === 1 ? '' : 's'} written for
                      students who missed this step.
                    </p>
                  )}
                </div>
              ))}
              {state === 'saving' && <p className="tsa-note">Saving&hellip;</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default TrainingSuiteAdmin
