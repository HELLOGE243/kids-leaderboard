import { useEffect, useState } from 'react'
import { loadDailyQuest, pullQuestPaper, runQuestNight } from '../data/firebase.js'

/** The Sydney date, which is the date the night sets a quest for. */
function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

const BAND_LABEL = { y6: 'Year 6', y9: 'Year 9' }

/**
 * Today's reading quest, as a teacher sees it.
 *
 * The night generates six papers, measures the reading level, puts every
 * question past a check that it cannot be answered without the passage, and
 * asks a model whether the piece is suitable for a child. All of that is
 * automatic, and the last of it is a model's opinion - so there has to be a
 * way for a person who disagrees to take a paper down in one press.
 *
 * Deliberately publish-then-pull rather than approve-then-publish. An approval
 * queue means that the one morning nobody opens this panel, eighty students
 * have no reading set. A daily thing must not depend on a daily human act.
 *
 * Pulling goes through a function, because the rules forbid writing the day's
 * quest from a browser at all.
 */
function QuestAdmin({ onChanged }) {
  const [day, setDay] = useState(todayKey())
  const [state, setState] = useState({ loading: true, papers: [] })
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(null)

  function load(forDay) {
    setState({ loading: true, papers: [] })
    loadDailyQuest(forDay).then((got) => setState({ loading: false, papers: got.papers }))
  }

  useEffect(() => { load(day) }, [day])

  async function pull(paper) {
    // A press that removes a child's reading for the day deserves a question.
    const sure = window.confirm(
      `Take "${paper.title}" down?\n\nIt will be replaced from the bank if there is anything `
      + 'suitable, and it will never be set again.')
    if (!sure) return
    setBusy(paper.id)
    setNote('')
    const out = await pullQuestPaper(day, paper.id)
    setBusy('')
    setNote(out.pulled
      ? `Pulled. ${out.replacedWith ? `Replaced with "${out.replacedWith}".` : 'Nothing in the bank to replace it with.'}`
      : `Could not pull it: ${out.why}`)
    load(day)
    onChanged?.()
  }

  async function runNow() {
    setBusy('run')
    setNote('Generating six papers. This takes a minute or two.')
    const out = await runQuestNight(day)
    setBusy('')
    setNote(out.error
      ? `It failed: ${out.error}`
      : `Set ${out.set} of 6. Generated ${out.made?.length ?? 0}, reused ${out.reused?.length ?? 0}, `
        + `missed ${out.missed?.length ?? 0}.`)
    load(day)
    onChanged?.()
  }

  return (
    <div className="qa-wrap">
      <div className="qa-bar">
        <label className="qa-field">
          <span>Day</span>
          <input type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <button className="btn btn-outline" disabled={!!busy} onClick={() => load(day)}>
          Reload
        </button>
        <button className="btn btn-outline" disabled={!!busy} onClick={runNow}>
          {busy === 'run' ? 'Running…' : 'Generate now'}
        </button>
      </div>

      {note && <p className="qa-note">{note}</p>}

      {state.loading && <p className="td2-muted td2-small">Loading…</p>}

      {!state.loading && !state.papers.length && (
        <p className="td2-muted td2-small">
          Nothing is set for {day}. The job runs at 2.30am Sydney time; &ldquo;Generate now&rdquo;
          does the same work immediately.
        </p>
      )}

      {!!state.papers.length && (
        <table className="qa-table">
          <thead>
            <tr>
              <th>Slot</th>
              <th>Title</th>
              <th>Level</th>
              <th>Length</th>
              <th>Licence</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.papers.map((p) => (
              <tr key={p.id}>
                <td className="qa-slot">{p.genre}<br /><span>{BAND_LABEL[p.band] || p.band}</span></td>
                <td>
                  <button className="qa-link" onClick={() => setOpen(open === p.id ? null : p.id)}>
                    {p.title}
                  </button>
                  {open === p.id && (
                    <div className="qa-preview">
                      <p className="qa-attrib">{p.attribution}</p>
                      <div dangerouslySetInnerHTML={{ __html: p.text }} />
                      <ol className="qa-qs">
                        {p.questions.map((q, i) => (
                          <li key={i}>
                            <strong>{q.type}</strong> &middot; {q.question}
                            <ul>
                              {q.options.map((o, oi) => (
                                <li key={oi} className={oi === q.correct ? 'qa-right' : ''}>
                                  {'ABCD'[oi]}. {o}{oi === q.correct ? '  ←' : ''}
                                </li>
                              ))}
                            </ul>
                            <em>{q.explanation}</em>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </td>
                {/* The measured grade, not the one the model claimed. */}
                <td>{p.readability?.fk ?? '--'}</td>
                <td>{p.wordCount}w &middot; {p.minutes}m</td>
                <td className="qa-licence">{p.licence}</td>
                <td>
                  <button
                    className="btn btn-outline qa-pull"
                    disabled={!!busy}
                    onClick={() => pull(p)}
                  >
                    {busy === p.id ? 'Pulling…' : 'Pull'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default QuestAdmin
