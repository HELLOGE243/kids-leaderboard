import { useEffect, useMemo, useState } from 'react'
import { loadDailyQuest } from '../data/firebase.js'
import { questBandFor, questPapersFor, getHomeworkAttempt } from '../data/store.js'

/** The Sydney date, because the night sets the quest on a local date. */
function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

const GENRE_LABEL = { news: 'News', essay: 'Essay', fiction: 'Fiction' }
const GENRE_BLURB = {
  news: 'Something that happened this week',
  essay: 'Somebody making an argument',
  fiction: 'A chapter out of a novel',
}

/**
 * The day's three reading tasks.
 *
 * One news piece, one essay and one chapter of fiction, each with six
 * comprehension questions, set for the whole school overnight and pitched at
 * the reader's own year group. Everybody in a band reads the same three
 * things, which is the only way "how did the school do on today's reading"
 * means anything.
 *
 * This screen is a board, not a player. Each paper is a real quiz set, so
 * pressing Start hands it to the homework player - the same timer rules,
 * resume after a closed tab, answer grid, flagging, review, archive and coin
 * award as every other paper on the site. The quest had its own reader once,
 * and it was a second-best copy of all of that.
 *
 * @param {object} props
 * @param {{id: string, name: string, yearGroup?: string}} props.student
 * @param {() => void} props.onBack
 * @param {(quizSetId: string) => void} props.onOpenQuiz hands a paper to the
 *   homework player; without it the cards explain rather than mislead
 * @param {boolean} [props.embedded] true when the Reading Room draws the header
 */
function DailyQuest({ student, onBack, onOpenQuiz, embedded = false }) {
  const [state, setState] = useState({ loading: true, day: null, papers: [] })
  const [band, setBand] = useState(() => questBandFor(student?.yearGroup))

  useEffect(() => {
    let alive = true
    loadDailyQuest(todayKey()).then((got) => {
      if (alive) setState({ loading: false, day: got.day, papers: got.papers })
    })
    return () => { alive = false }
  }, [])

  // The papers for the band being read, which is the student's own unless
  // they have asked for the other one.
  const mine = useMemo(
    () => questPapersFor(state.papers, band === 'y9' ? 9 : 6),
    [state.papers, band])

  // What has been sat is what the homework record says has been sat. The
  // quest keeps no separate log, because two records of the same attempt
  // disagree the first time one of them fails to save.
  const marks = useMemo(() => {
    const out = {}
    for (const p of mine) {
      const attempt = getHomeworkAttempt(p.quizSetId, student?.id)
      if (attempt) out[p.quizSetId] = attempt
    }
    return out
  }, [mine, student?.id])

  const ownBand = questBandFor(student?.yearGroup)
  const otherBand = ownBand === 'y6' ? 'y9' : 'y6'
  const doneToday = mine.filter((p) => marks[p.quizSetId]).length

  const header = embedded ? null : (
    <header className="dq-top">
      <button className="btn btn-outline" onClick={onBack}>&larr; Back</button>
      <div className="dq-top-mid">
        <h2 className="dq-title">Today&rsquo;s Quest</h2>
        <span className="dq-sub">Three things to read, and six questions on each</span>
      </div>
    </header>
  )

  return (
    <div className="dq-page">
      {header}

      {state.loading && <p className="dq-empty">Fetching today&rsquo;s reading&hellip;</p>}

      {!state.loading && !mine.length && (
        <div className="dq-empty">
          <p>There is no quest set for today yet.</p>
          <p className="text-dim">
            It is written overnight. If this says the same thing tomorrow, tell a teacher.
          </p>
        </div>
      )}

      {!!mine.length && (
        <>
          <div className="dq-board-head">
            <p className="dq-board-count">{doneToday} of {mine.length} done</p>
            <p className="dq-board-pay text-dim">
              Each one is a paper like any other: coins for the answers, and you can
              leave it open and come back.
            </p>
          </div>

          <div className="dq-cards">
            {mine.map((paper) => {
              const mark = marks[paper.quizSetId]
              return (
                <article key={paper.id} className={`dq-card${mark ? ' is-done' : ''}`}>
                  <span className="dq-tag">{GENRE_LABEL[paper.genre] || paper.genre}</span>
                  <h3 className="dq-card-title">{paper.title}</h3>
                  <p className="dq-card-blurb text-dim">{GENRE_BLURB[paper.genre] || ''}</p>
                  <p className="dq-card-meta">
                    about {paper.minutes} min &middot; {paper.questionCount} questions
                  </p>
                  {mark
                    ? (
                      <>
                        <p className="dq-card-score">{mark.score}/{mark.total}</p>
                        <button
                          className="btn btn-outline"
                          disabled={!onOpenQuiz}
                          onClick={() => onOpenQuiz?.(paper.quizSetId)}
                        >
                          See it again
                        </button>
                      </>
                    )
                    : (
                      <button
                        className="btn btn-primary"
                        disabled={!onOpenQuiz}
                        onClick={() => onOpenQuiz?.(paper.quizSetId)}
                      >
                        Start
                      </button>
                    )}
                </article>
              )
            })}
          </div>

          {/* A strong Year 6 should be allowed to reach, and a Year 9 having a
              hard week should be allowed not to. */}
          <button
            className="dq-swap"
            onClick={() => setBand((b) => (b === 'y6' ? 'y9' : 'y6'))}
          >
            {band === ownBand
              ? `Try the ${otherBand === 'y9' ? 'harder' : 'easier'} papers instead`
              : 'Back to my own papers'}
          </button>
        </>
      )}
    </div>
  )
}

export default DailyQuest
