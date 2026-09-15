import { useRef, useState } from 'react'
import {
  getImportedQuizSets, getTagLibrary, addTag, setQuestionTags, subjectForQuizSet, TAG_SUBJECTS,
} from '../data/store.js'
import { surveyTaxonomy, reviewTagUsage, tagQuestions, describeBrief, CHECKPOINT_EVERY } from '../utils/bulkTagging.js'

// Tags every untagged question across the quiz library in one run, refining the
// tag list as it goes: a survey first, then a checkpoint every few hundred
// questions that can split a tag which has become a catch-all - and when it
// does, the questions already given that tag are tagged again against the finer
// tags, so early and late questions end up consistent.

const BATCH_SETS = 1 // save after each set, so a stopped run keeps its work

export default function BulkTagPanel({ onClose }) {
  const [subject, setSubject] = useState('reading')
  const [autoRefine, setAutoRefine] = useState(true)
  const [includeTagged, setIncludeTagged] = useState(false)
  const [state, setState] = useState({ phase: 'idle' })
  const [pending, setPending] = useState(null) // taxonomy proposal awaiting the teacher
  const stopRef = useRef(false)
  const resolveRef = useRef(null)

  const sets = getImportedQuizSets().filter((s) => subjectForQuizSet(s) === subject)
  const countUntagged = sets.reduce((n, s) => n + s.questions.filter((q) => includeTagged || !q.tags?.length).length, 0)

  const log = (line) => setState((st) => ({ ...st, lines: [line, ...(st.lines || [])].slice(0, 200) }))

  /** Shows a proposal and waits for the teacher, unless running automatically. */
  function propose(kind, items) {
    if (!items.length) return Promise.resolve([])
    if (autoRefine) return Promise.resolve(items)
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setPending({ kind, items, chosen: items.map(() => true) })
    })
  }

  function answerProposal(accepted) {
    const resolve = resolveRef.current
    setPending(null)
    resolveRef.current = null
    resolve?.(accepted)
  }

  async function run() {
    stopRef.current = false
    const subjectName = TAG_SUBJECTS.find((s) => s.id === subject)?.name || subject
    setState({ phase: 'survey', done: 0, total: countUntagged, lines: [] })

    // Every question in scope, with its set, in a stable order.
    const work = sets.flatMap((s) => s.questions.filter((q) => q.id && (includeTagged || !q.tags?.length)).map((q) => ({ setId: s.id, q })))
    if (!work.length) { setState({ phase: 'done', lines: ['Nothing to tag: every question in these sets already has tags.'] }); return }

    let tags = getTagLibrary().filter((t) => t.subject === subject)

    // --- 1. Survey -------------------------------------------------------
    log(`Reading a sample of ${Math.min(120, work.length)} questions to check the tag list…`)
    const survey = await surveyTaxonomy(work.map((w) => w.q), tags, subjectName)
    if (!survey.ok) { setState((st) => ({ ...st, phase: 'error', error: survey.error })); return }
    if (survey.additions.length) {
      const accepted = await propose('additions', survey.additions)
      for (const a of accepted) { addTag(subject, a.name); log(`Added tag "${a.name}" — ${a.reason}`) }
      tags = getTagLibrary().filter((t) => t.subject === subject)
    } else {
      log('The existing tags cover this subject well; none added.')
    }

    // --- 2. Tag, with checkpoints ----------------------------------------
    const assigned = new Map() // questionId -> { setId, q, tagIds }
    let sinceCheckpoint = 0
    setState((st) => ({ ...st, phase: 'tagging', done: 0, total: work.length }))

    const tagList = (items, label) => tagQuestions(items.map((w) => w.q), tags, () => {})
      .then((res) => {
        if (!res.ok) throw new Error(res.error)
        for (const r of res.results) {
          const w = items.find((x) => x.q.id === r.questionId)
          if (w && r.tagIds.length) assigned.set(r.questionId, { setId: w.setId, q: w.q, tagIds: r.tagIds })
        }
        log(`${label}: tagged ${res.results.filter((r) => r.tagIds.length).length} of ${items.length}`)
      })

    const saveSet = (setId) => {
      const byQuestion = {}
      for (const [qid, v] of assigned) if (v.setId === setId) byQuestion[qid] = v.tagIds
      if (Object.keys(byQuestion).length) setQuestionTags(setId, byQuestion)
    }

    for (const set of sets) {
      if (stopRef.current) break
      const items = work.filter((w) => w.setId === set.id)
      if (!items.length) continue
      try {
        await tagList(items, set.friendlyTitle || set.rawTitle)
      } catch (e) {
        log(`⚠ ${set.friendlyTitle || set.rawTitle}: ${e.message}`)
        continue
      }
      saveSet(set.id)
      sinceCheckpoint += items.length
      setState((st) => ({ ...st, done: assigned.size }))

      // --- 3. Checkpoint: has any tag become a catch-all? ----------------
      if (sinceCheckpoint >= CHECKPOINT_EVERY && !stopRef.current) {
        sinceCheckpoint = 0
        await checkpoint()
      }
    }

    // A short library never reaches a mid-run checkpoint, so always review once
    // at the end - that is where a catch-all tag is most visible.
    if (!stopRef.current && sinceCheckpoint >= 60) await checkpoint()

    setState((st) => ({ ...st, phase: stopRef.current ? 'stopped' : 'done', done: assigned.size }))

    async function checkpoint() {
      {
        setState((st) => ({ ...st, phase: 'reviewing' }))
        log(`Checkpoint at ${assigned.size} questions — reviewing how the tags are being used…`)
        const usage = tags.map((t) => {
          const mine = [...assigned.values()].filter((v) => v.tagIds.includes(t.id))
          return { tag: t.name, count: mine.length, examples: mine.map((v) => describeBrief(v.q)) }
        }).filter((u) => u.count)
        const review = await reviewTagUsage(usage, subjectName, assigned.size)
        if (review.ok && review.splits.length) {
          const accepted = await propose('splits', review.splits)
          for (const split of accepted) {
            const old = tags.find((t) => t.name === split.tagName)
            if (!old) continue
            const made = split.newTags.map((n) => addTag(subject, n)).filter(Boolean)
            if (!made.length) continue
            tags = getTagLibrary().filter((t) => t.subject === subject)
            log(`Split "${split.tagName}" into ${made.map((m) => m.name).join(', ')} — ${split.reason}`)

            // --- 4. Retag everything that carried the old tag -------------
            const affected = [...assigned.entries()].filter(([, v]) => v.tagIds.includes(old.id)).map(([, v]) => v)
            setState((st) => ({ ...st, phase: 'retagging', retag: { tag: split.tagName, count: affected.length } }))
            const finer = tags.filter((t) => made.some((m) => m.id === t.id))
            for (let i = 0; i < affected.length && !stopRef.current; i += 40) {
              const chunk = affected.slice(i, i + 40)
              const res = await tagQuestions(chunk.map((v) => v.q), finer, () => {})
              if (!res.ok) { log(`⚠ Retag failed: ${res.error}`); break }
              for (const r of res.results) {
                const cur = assigned.get(r.questionId)
                if (!cur) continue
                // The old tag is replaced by whichever finer tags fit.
                const kept = cur.tagIds.filter((id) => id !== old.id)
                cur.tagIds = [...new Set([...kept, ...r.tagIds])]
              }
              for (const setId of new Set(chunk.map((c) => c.setId))) saveSet(setId)
            }
            log(`Retagged ${affected.length} earlier questions against the new tags.`)
          }
        } else if (review.ok) {
          log('Checkpoint: the tags are holding up; no splits needed.')
        }
        setState((st) => ({ ...st, phase: 'tagging', retag: null }))
      }
    }
  }

  const phase = state.phase
  const busy = ['survey', 'tagging', 'reviewing', 'retagging'].includes(phase)
  const pctDone = state.total ? Math.round((state.done / state.total) * 100) : 0

  return (
    <div className="modal-overlay qtag-overlay" onClick={busy ? undefined : onClose}>
      <div className="qtag-modal bulk-tag" onClick={(e) => e.stopPropagation()}>
        <h3>Tag every question with AI</h3>
        <p className="qtag-sub">Works through the quiz library, and refines the tag list as it sees more questions — when a tag turns out to cover two different skills, it splits it and re-tags the earlier questions to match.</p>

        <div className="bt-controls">
          <label>Subject
            <select className="qtag-search" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy}>
              {TAG_SUBJECTS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="bt-check"><input type="checkbox" checked={autoRefine} onChange={(e) => setAutoRefine(e.target.checked)} disabled={busy} /> Apply tag changes automatically (otherwise it asks)</label>
          <label className="bt-check"><input type="checkbox" checked={includeTagged} onChange={(e) => setIncludeTagged(e.target.checked)} disabled={busy} /> Re-tag questions that already have tags</label>
        </div>

        <p className="qtag-sub"><b>{sets.length}</b> quiz sets · <b>{countUntagged}</b> questions to tag</p>

        {busy && (
          <div className="bt-progress">
            <div className="bt-bar"><span style={{ width: `${pctDone}%` }} /></div>
            <p className="qtag-sub">
              {phase === 'survey' && 'Surveying the questions…'}
              {phase === 'tagging' && `Tagging — ${state.done} of ${state.total} (${pctDone}%)`}
              {phase === 'reviewing' && 'Checkpoint: reviewing how the tags are being used…'}
              {phase === 'retagging' && `Re-tagging ${state.retag?.count} earlier questions after splitting “${state.retag?.tag}”…`}
            </p>
          </div>
        )}

        {pending && (
          <div className="bt-proposal">
            <h4>{pending.kind === 'additions' ? 'New tags suggested' : 'Tags to split'}</h4>
            {pending.items.map((item, i) => (
              <label key={i} className="bt-proposal-row">
                <input type="checkbox" checked={pending.chosen[i]} onChange={(e) => setPending((p) => ({ ...p, chosen: p.chosen.map((c, k) => (k === i ? e.target.checked : c)) }))} />
                <span>
                  <b>{item.name || `${item.tagName} → ${item.newTags.join(', ')}`}</b>
                  <small>{item.reason}</small>
                </span>
              </label>
            ))}
            <div className="qtag-modal-actions">
              <button className="qtag-btn" onClick={() => answerProposal([])}>Skip all</button>
              <button className="qtag-btn qtag-btn-primary" onClick={() => answerProposal(pending.items.filter((_, i) => pending.chosen[i]))}>Apply selected</button>
            </div>
          </div>
        )}

        {state.lines?.length > 0 && (
          <div className="bt-log">{state.lines.map((l, i) => <div key={i}>{l}</div>)}</div>
        )}
        {phase === 'error' && <p className="qtag-error">⚠ {state.error}</p>}
        {phase === 'done' && <p className="qtag-sub">✓ Finished — {state.done} questions tagged and saved.</p>}
        {phase === 'stopped' && <p className="qtag-sub">Stopped. Everything tagged so far has been saved; run it again to continue.</p>}

        <div className="qtag-modal-actions">
          {busy
            ? <button className="qtag-btn" onClick={() => { stopRef.current = true; log('Stopping after this batch…') }}>Stop</button>
            : <>
              <button className="qtag-btn" onClick={onClose}>Close</button>
              <button className="qtag-btn qtag-btn-primary" onClick={run} disabled={!countUntagged}>{phase === 'idle' ? 'Start tagging' : 'Run again'}</button>
            </>}
        </div>
      </div>
    </div>
  )
}
