import { useEffect, useState } from 'react'
import { loadDailyQuest, pullQuestPaper, runQuestNight } from '../data/firebase.js'
import { getImportedQuizSet } from '../data/store.js'

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
 * Six papers a night - one news piece, one essay and one chapter of fiction,
 * each written twice, once at Year 6 level and once at Year 9. The night
 * measures the reading level, puts every question past a check that it cannot
 * be answered without the passage, and asks a model whether the piece is
 * suitable for a child. All of that is automatic, and the last of it is a
 * model's opinion - so there has to be a way for a person who disagrees to
 * take a paper down in one press.
 *
 * Deliberately publish-then-pull rather than approve-then-publish. An approval
 * queue means that the one morning nobody opens this panel, eighty students
 * have no reading set. A daily thing must not depend on a daily human act.
 *
 * Each paper is a real quiz set, so the questions are edited in the ordinary
 * quiz editor rather than in anything written for this screen, and the preview
 * below reads that set rather than the night's own copy. A teacher who fixes a
 * wrong answer sees the fix here, which would not be true of a second copy.
 *
 * Pulling goes through a function, because the rules forbid writing the day's
 * quest from a browser at all.
 *
 * @param {object} props
 * @param {() => void} [props.onChanged]
 * @param {(quizSetId: string) => void} [props.onEditQuiz] opens the quiz
 *   editor on one of today's papers
 */
function QuestAdmin({ onChanged, onEditQuiz }) {
  const [day, setDay] = useState(todayKey())
  const [state, setState] = useState({ loading: true, papers: [] })
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [report, setReport] = useState(null)
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
    setReport(null)
    setNote('Generating six papers. This takes a minute or two.')
    const out = await runQuestNight(day)
    setBusy('')
    // A night that sets nothing is the night you most need to read, and the
    // reasons are the only thing that says which gate refused. They came back
    // in the reply all along and were being thrown away here, so a run that
    // failed said "missed 6" and nothing else.
    setReport(out && !out.error ? out : null)
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

      {!!report?.missed?.length && (
        <div className="qa-misses">
          <p className="qa-misses-head">Why {report.missed.length} slot(s) came back empty</p>
          <ul>
            {report.missed.map((m, i) => (
              <li key={i}>
                <strong>{m.slot}</strong>
                <ul>
                  {(Array.isArray(m.why) ? m.why : [String(m.why)]).map((w, wi) => (
                    <li key={wi}>{w}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* A slot that was filled may still have thrown questions away on the
          way, and six kept out of eight asked is normal. Many dropped from
          one paper is a prompt that has drifted. */}
      {!!report?.made?.some((m) => m.dropped?.length) && (
        <details className="qa-misses">
          <summary>What was dropped from the papers that worked</summary>
          <ul>
            {report.made.filter((m) => m.dropped?.length).map((m, i) => (
              <li key={i}>
                <strong>{m.slot}</strong>
                <ul>{m.dropped.map((w, wi) => <li key={wi}>{w}</li>)}</ul>
              </li>
            ))}
          </ul>
        </details>
      )}

      {state.loading && <p className="td2-muted td2-small">Loading…</p>}

      {!state.loading && !state.papers.length && (
        <p className="td2-muted td2-small">
          Nothing is set for {day}. The job runs at 2.30am Sydney time; &ldquo;Generate now&rdquo;
          does the same work immediately.
        </p>
      )}

      {!!state.papers.length && (
        <>
          <p className="td2-muted td2-small">
            {state.papers.length} of 6 papers set for {day}. Each is a quiz set a student sits in
            the homework player.
          </p>
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
              {state.papers.map((p) => {
                // The set is the paper. Where it has not reached this device the
                // row still lists, because a title and a Pull button are useful
                // without it; only the preview needs the questions.
                const set = getImportedQuizSet(p.quizSetId)
                return (
                  <tr key={p.id}>
                    <td className="qa-slot">{p.genre}<br /><span>{BAND_LABEL[p.band] || p.band}</span></td>
                    <td>
                      <button className="qa-link" onClick={() => setOpen(open === p.id ? null : p.id)}>
                        {p.title}
                      </button>
                      {open === p.id && (
                        <div className="qa-preview">
                          <p className="qa-attrib">{p.attribution}</p>
                          {!set && (
                            <p className="td2-muted td2-small">
                              The questions have not loaded on this device yet. Press Reload.
                            </p>
                          )}
                          {set && (
                            <>
                              {/* The passage as a student gets it: the night
                                  writes it into every question, which is how an
                                  imported comprehension paper is stored. */}
                              <div dangerouslySetInnerHTML={{ __html: set.questions?.[0]?.text || '' }} />
                              <ol className="qa-qs">
                                {(set.questions || []).map((q, i) => (
                                  <li key={q.id || i}>
                                    <strong>{(q.tags || []).join(' ') || 'question'}</strong> &middot; {q.prompt}
                                    <ul>
                                      {(q.options || []).map((o, oi) => (
                                        <li key={oi} className={oi === q.correctIndex ? 'qa-right' : ''}>
                                          {'ABCD'[oi]}. {o}{oi === q.correctIndex ? '  ←' : ''}
                                        </li>
                                      ))}
                                    </ul>
                                    <em>{q.explanation}</em>
                                  </li>
                                ))}
                              </ol>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                    {/* The measured grade, not the one the model claimed. */}
                    <td>{p.readability?.fk ?? '--'}</td>
                    <td>{p.wordCount}w &middot; {p.minutes}m &middot; {p.questionCount}q</td>
                    <td className="qa-licence">{p.licence}</td>
                    <td className="qa-acts">
                      {onEditQuiz && (
                        <button
                          className="btn btn-outline qa-pull"
                          disabled={!!busy || !set}
                          title={set ? 'Edit the questions in the quiz editor' : 'Not loaded on this device yet'}
                          onClick={() => onEditQuiz(p.quizSetId)}
                        >
                          Edit
                        </button>
                      )}
                      <button
                        className="btn btn-outline qa-pull"
                        disabled={!!busy}
                        onClick={() => pull(p)}
                      >
                        {busy === p.id ? 'Pulling…' : 'Pull'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

export default QuestAdmin
