import { useState, useEffect } from 'react'
import { loadHeuristics, updateHeuristic } from '../data/firebase.js'
import { DOJO_SUBJECTS, SUBJECT_NAMES } from '../data/trainingDojo.js'

/**
 * The named methods the Training Dojo labels questions with.
 *
 * The AI proposes these and reuses them when it can, but it will still write
 * "Translate word statements into an algebraic equation" beside an existing
 * "Translate word constraints into inequalities". Both are defensible, and
 * left alone the library grows a near-duplicate of everything in it. So the
 * one thing this screen must do, beyond renaming and retiring, is MERGE.
 *
 * Merging points one heuristic at another rather than deleting it: suites and
 * students' runs already carry the old id, and deleting it would leave those
 * rows labelled with a string nothing explains.
 */
function HeuristicLibrary() {
  const [subject, setSubject] = useState('math')
  const [map, setMap] = useState({})
  const [state, setState] = useState('idle')
  const [editing, setEditing] = useState(null)
  const [merging, setMerging] = useState(null)

  useEffect(() => {
    let alive = true
    const mark = setTimeout(() => { if (alive) setState('loading') }, 0)
    loadHeuristics(subject)
      .then((m) => { if (alive) { setMap(m || {}); setState('ready') } })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false; clearTimeout(mark) }
  }, [subject])

  const list = Object.values(map)
    .filter(Boolean)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
  const live = list.filter((h) => !h.archived && !h.mergedInto)

  async function save(id, fields) {
    const next = { ...map, [id]: { ...map[id], ...fields } }
    setMap(next)
    await updateHeuristic(subject, id, next[id])
  }

  async function merge(fromId, intoId) {
    if (!intoId || fromId === intoId) { setMerging(null); return }
    await save(fromId, { mergedInto: intoId, archived: true })
    setMerging(null)
  }

  return (
    <div className="hl">
      <div className="hl-bar">
        {DOJO_SUBJECTS.map((s) => (
          <button
            key={s}
            className={`hl-tab${subject === s ? ' is-on' : ''}`}
            onClick={() => { setSubject(s); setEditing(null); setMerging(null) }}
          >{SUBJECT_NAMES[s]}</button>
        ))}
        <span className="hl-count">{live.length} in use</span>
      </div>

      {state === 'loading' && <p className="tsa-note">Reading the library&hellip;</p>}
      {state === 'error' && <p className="tsa-note">That could not be read.</p>}
      {state === 'ready' && !list.length && (
        <p className="tsa-note">
          Nothing yet. Heuristics are named the first time a student opens a Training Dojo
          on a {SUBJECT_NAMES[subject].toLowerCase()} question.
        </p>
      )}

      {list.map((h) => (
        <div key={h.id} className={`hl-row${h.archived || h.mergedInto ? ' is-retired' : ''}`}>
          {editing === h.id ? (
            <div className="hl-edit">
              <input
                className="tsa-input"
                defaultValue={h.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== h.name && save(h.id, { name: e.target.value.trim() })}
              />
              <textarea
                className="tsa-input"
                rows={2}
                defaultValue={h.description}
                onBlur={(e) => e.target.value !== h.description && save(h.id, { description: e.target.value })}
              />
              <button className="tsa-btn" onClick={() => setEditing(null)}>Done</button>
            </div>
          ) : (
            <>
              <div className="hl-main">
                <span className="hl-name">{h.name}</span>
                {h.description && <span className="hl-desc">{h.description}</span>}
                <code className="hl-id">{h.id}</code>
                {h.mergedInto && (
                  <span className="hl-merged">merged into {map[h.mergedInto]?.name || h.mergedInto}</span>
                )}
              </div>
              <div className="hl-actions">
                <button className="tsa-btn" onClick={() => setEditing(h.id)}>Rename</button>
                {!h.mergedInto && (
                  <button className="tsa-btn" onClick={() => setMerging(merging === h.id ? null : h.id)}>Merge</button>
                )}
                <button className="tsa-btn" onClick={() => save(h.id, { archived: !h.archived })}>
                  {h.archived ? 'Restore' : 'Retire'}
                </button>
              </div>
            </>
          )}

          {merging === h.id && (
            <div className="hl-merge">
              <span>Merge &ldquo;{h.name}&rdquo; into:</span>
              <select className="tsa-input" defaultValue="" onChange={(e) => merge(h.id, e.target.value)}>
                <option value="">choose one&hellip;</option>
                {live.filter((o) => o.id !== h.id).map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              <span className="tsa-note">
                The old name stops being offered. Questions already labelled with it keep their
                label, so nothing a student has done loses its name.
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default HeuristicLibrary
