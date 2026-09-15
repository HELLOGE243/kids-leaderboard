import { useMemo, useState } from 'react'
import { getTagLibrary, addTag, updateTag, TAG_SUBJECTS, subjectForQuizSet } from '../data/store.js'
import { aiTagQuestions } from '../utils/aiTagQuestions.js'

/**
 * Skill tags for the question being edited, plus AI tagging for the whole set
 * and a small tag manager. Tags change the editor's questions in place; they
 * are saved with the quiz.
 */
export default function QuestionTagBar({ questions, currentIdx, onChangeTags, quizSet }) {
  const [, bump] = useState(0)
  const refresh = () => bump((n) => n + 1)
  const [subject, setSubject] = useState(() => subjectForQuizSet(quizSet) || 'reading')
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [managerOpen, setManagerOpen] = useState(false)
  const [ai, setAi] = useState(null) // { running, done, total, error, results, suggestions, accepted }

  const library = getTagLibrary({ includeArchived: true })
  const byId = useMemo(() => Object.fromEntries(library.map((t) => [t.id, t])), [library])
  const active = library.filter((t) => !t.archived)
  const q = questions[currentIdx] || {}
  const current = (q.tags || []).filter((id) => byId[id])
  const options = active.filter((t) => t.subject === subject && !current.includes(t.id) && t.name.toLowerCase().includes(search.toLowerCase()))

  async function runAi() {
    const tagged = questions.map((qq, i) => ({ ...qq, id: qq.id || `idx-${i}` }))
    setAi({ running: true, done: 0, total: tagged.length })
    const res = await aiTagQuestions(tagged, active.filter((t) => t.subject === subject), (done, total) => setAi((a) => ({ ...a, done, total })))
    if (!res.ok) { setAi({ running: false, error: res.error }); return }
    const accepted = Object.fromEntries(res.results.filter((r) => r.tagIds.length && r.confidence !== 'low').map((r) => [r.questionId, true]))
    setAi({ running: false, results: res.results, suggestions: res.suggestions, accepted })
  }

  function applyAi() {
    const ids = questions.map((qq, i) => qq.id || `idx-${i}`)
    for (const r of ai.results) {
      if (!ai.accepted[r.questionId]) continue
      const i = ids.indexOf(r.questionId)
      if (i !== -1) onChangeTags(i, [...new Set([...(questions[i].tags || []), ...r.tagIds])])
    }
    setAi(null)
  }

  return (
    <div className="qtag-bar">
      <span className="qtag-label">Skills</span>
      <select className="qtag-subject" value={subject} onChange={(e) => { setSubject(e.target.value); setSearch('') }} title="Subject">
        {TAG_SUBJECTS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      {current.map((id) => (
        <span key={id} className="qtag-chip">
          {byId[id].name}
          <button aria-label={`Remove ${byId[id].name}`} onClick={() => onChangeTags(currentIdx, current.filter((t) => t !== id))}>×</button>
        </span>
      ))}
      {!current.length && <span className="qtag-none">No skills tagged</span>}
      <div className="qtag-add-wrap">
        <button className="qtag-btn" onClick={() => { setAdding(!adding); setSearch('') }}>+ Tag</button>
        {adding && (
          <div className="qtag-menu" onMouseLeave={() => setAdding(false)}>
            <input autoFocus className="qtag-search" placeholder="Search or create…" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                const pick = options[0] || (search.trim() && addTag(subject, search))
                if (pick) { onChangeTags(currentIdx, [...current, pick.id]); setSearch(''); setAdding(false); refresh() }
              }} />
            <div className="qtag-menu-list">
              {options.map((t) => (
                <button key={t.id} className="qtag-menu-item" onClick={() => { onChangeTags(currentIdx, [...current, t.id]); setAdding(false) }}>{t.name}</button>
              ))}
              {search.trim() && !active.some((t) => t.subject === subject && t.name.toLowerCase() === search.trim().toLowerCase()) && (
                <button className="qtag-menu-item qtag-menu-create" onClick={() => { const t = addTag(subject, search); if (t) onChangeTags(currentIdx, [...current, t.id]); setAdding(false); refresh() }}>
                  + Create “{search.trim()}”
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <span className="qtag-spacer" />
      <button className="qtag-btn qtag-btn-ai" onClick={runAi} disabled={ai?.running}>
        {ai?.running ? `Tagging… ${ai.done}/${ai.total}` : '✨ Auto-tag all with AI'}
      </button>
      <button className="qtag-btn" onClick={() => setManagerOpen(true)}>Manage tags</button>

      {ai && !ai.running && (
        <div className="modal-overlay qtag-overlay" onClick={() => setAi(null)}>
          <div className="qtag-modal" onClick={(e) => e.stopPropagation()}>
            <h3>AI tag suggestions</h3>
            {ai.error ? <p className="qtag-error">{ai.error}</p> : <>
              <p className="qtag-sub">Tick the suggestions to keep. Existing tags are kept; low-confidence ones start unticked.</p>
              <div className="qtag-review-list">
                {ai.results.map((r) => {
                  const i = questions.findIndex((qq, k) => (qq.id || `idx-${k}`) === r.questionId)
                  return (
                    <label key={r.questionId} className={`qtag-review-row qtag-conf-${r.confidence}`}>
                      <input type="checkbox" checked={!!ai.accepted[r.questionId]} disabled={!r.tagIds.length}
                        onChange={(e) => setAi((a) => ({ ...a, accepted: { ...a.accepted, [r.questionId]: e.target.checked } }))} />
                      <b>Q{i + 1}</b>
                      <span className="qtag-review-tags">{r.tagIds.length ? r.tagIds.map((id) => byId[id]?.name).join(', ') : 'No fitting tag'}</span>
                      <span className="qtag-conf">{r.confidence}</span>
                    </label>
                  )
                })}
              </div>
              {ai.suggestions?.length > 0 && (
                <div className="qtag-ideas">
                  <p className="qtag-sub"><b>Suggested new tags</b> — add any that are worth tracking, then run auto-tag again:</p>
                  {ai.suggestions.map((s) => (
                    <div key={s.name} className="qtag-idea">
                      <span><b>{s.name}</b> — {s.reason}</span>
                      <button className="qtag-btn" onClick={() => { addTag(subject, s.name); setAi((a) => ({ ...a, suggestions: a.suggestions.filter((x) => x !== s) })); refresh() }}>Add tag</button>
                    </div>
                  ))}
                </div>
              )}
            </>}
            <div className="qtag-modal-actions">
              <button className="qtag-btn" onClick={() => setAi(null)}>Cancel</button>
              {!ai.error && <button className="qtag-btn qtag-btn-primary" onClick={applyAi}>Apply {Object.values(ai.accepted).filter(Boolean).length} suggestions</button>}
            </div>
          </div>
        </div>
      )}

      {managerOpen && (
        <TagManager library={library} onClose={() => setManagerOpen(false)} onChange={refresh} />
      )}
    </div>
  )
}

function TagManager({ library, onClose, onChange }) {
  const [subject, setSubject] = useState('reading')
  const [newName, setNewName] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const list = library.filter((t) => t.subject === subject && (showArchived || !t.archived))
  return (
    <div className="modal-overlay qtag-overlay" onClick={onClose}>
      <div className="qtag-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Manage skill tags</h3>
        <div className="qtag-tabs">
          {TAG_SUBJECTS.map((s) => <button key={s.id} className={`qtag-tab${s.id === subject ? ' is-active' : ''}`} onClick={() => setSubject(s.id)}>{s.name}</button>)}
        </div>
        <form className="qtag-new" onSubmit={(e) => { e.preventDefault(); if (addTag(subject, newName)) { setNewName(''); onChange() } }}>
          <input className="qtag-search" placeholder="New tag name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="qtag-btn qtag-btn-primary" type="submit">Add</button>
        </form>
        <div className="qtag-review-list">
          {list.map((t) => (
            <div key={t.id} className={`qtag-manage-row${t.archived ? ' is-archived' : ''}`}>
              <input className="qtag-rename" defaultValue={t.name} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== t.name) { updateTag(t.id, { name: e.target.value }); onChange() } }} />
              <button className="qtag-btn" onClick={() => { updateTag(t.id, { archived: !t.archived }); onChange() }}>{t.archived ? 'Restore' : 'Archive'}</button>
            </div>
          ))}
        </div>
        <div className="qtag-modal-actions">
          <label className="qtag-sub"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
          <button className="qtag-btn qtag-btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
