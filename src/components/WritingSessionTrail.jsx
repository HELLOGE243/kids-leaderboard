import { useEffect, useState } from 'react'
import { loadWritingSessionsForAttempt } from '../data/firebase.js'

/**
 * How a guided piece was helped along, for the teacher marking it.
 *
 * A mark on a guided piece means something different from a mark on one
 * written cold, and the difference is here: how many coaching turns were
 * spent, which sparks the child took, and what the coach told them. A child
 * who took every card every time is leaning rather than learning, and that is
 * worth seeing beside the rubric rather than guessing at.
 *
 * @param {object} props
 * @param {string} props.studentId
 * @param {string} props.quizSetId
 * @param {number} [props.questionIndex] just this question, if given
 */
function WritingSessionTrail({ studentId, quizSetId, questionIndex = null }) {
  const [sessions, setSessions] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    loadWritingSessionsForAttempt(studentId, quizSetId).then((rows) => {
      if (!alive) return
      setSessions(questionIndex === null
        ? rows
        : rows.filter((r) => Number(r.questionIndex) === Number(questionIndex)))
    })
    return () => { alive = false }
  }, [studentId, quizSetId, questionIndex])

  if (!sessions || sessions.length === 0) return null

  const turns = sessions.flatMap((s) => s.turns || [])
  const evaluations = turns.filter((t) => t.kind === 'evaluate').length
  const offered = turns.flatMap((t) => t.cards || []).length
  const taken = sessions.flatMap((s) => s.cardsTaken || []).length
  const leaning = offered > 0 && taken / offered > 0.75 && taken >= 4

  return (
    <section className="wst">
      <button className="wst-head" onClick={() => setOpen((v) => !v)}>
        {open ? '▾' : '▸'} Written with a coach
        <span className="wst-sum">
          {evaluations} check{evaluations === 1 ? '' : 's'} · {taken} of {offered} ideas taken
        </span>
      </button>

      {leaning && (
        <p className="wst-flag">
          Took nearly every idea offered — worth asking how much of the thinking was theirs.
        </p>
      )}

      {open && (
        <ol className="wst-turns">
          {turns.map((t, i) => (
            <li key={t.id || i} className="wst-turn">
              <span className="wst-kind">{t.kind === 'evaluate' ? 'Check' : t.kind === 'brainstorm' ? 'Ideas to start' : 'Suggestion'}</span>
              {t.glow && <p><b>Working well:</b> {t.glow}</p>}
              {t.grow && <p><b>Look again at:</b> {t.grow}</p>}
              {t.missing && <p><b>Still missing:</b> {t.missing}</p>}
              {t.next && <p><b>Try next:</b> {t.next}</p>}
              {t.text && !t.glow && <p>{t.text}</p>}
              {(t.cards || []).length > 0 && (
                <ul className="wst-cards">
                  {t.cards.map((c, ci) => (
                    <li key={c.id || ci} className={c.taken ? 'is-taken' : ''}>
                      {c.text}{c.taken ? ' — taken' : ''}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export default WritingSessionTrail
