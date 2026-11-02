import { useEffect, useMemo, useState } from 'react'
import SpeakButton from '../components/SpeakButton.jsx'
import { loadDailyQuest } from '../data/firebase.js'
import {
  questPapersFor, questBandFor, recordQuestDone, getQuestLog, getQuestStreak,
  QUEST_TOKENS, QUEST_COIN_PER_CORRECT, QUEST_COIN_BONUS,
} from '../data/store.js'

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
 * Reading pays tokens and the questions pay coins, so a child who reads the
 * piece and then answers badly is still paid for the reading. Nothing can be
 * paid twice: the log is checked before the award.
 *
 * @param {object} props
 * @param {{id: string, name: string, yearGroup?: string}} props.student
 * @param {() => void} props.onBack
 * @param {boolean} [props.embedded] true when the Reading Room draws the header
 */
function DailyQuest({ student, onBack, embedded = false }) {
  const [state, setState] = useState({ loading: true, day: null, papers: [] })
  const [band, setBand] = useState(() => questBandFor(student?.yearGroup))
  const [open, setOpen] = useState(null)
  const [answers, setAnswers] = useState([])
  const [currentQ, setCurrentQ] = useState(0)
  const [result, setResult] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    loadDailyQuest(todayKey()).then((got) => {
      if (alive) setState({ loading: false, day: got.day, papers: got.papers })
    })
    return () => { alive = false }
  }, [])

  const log = useMemo(() => getQuestLog(student?.id), [student?.id, tick])
  const doneIds = useMemo(() => new Set(log.map((r) => r.paperId)), [log])
  const streak = useMemo(() => getQuestStreak(student?.id), [student?.id, tick])

  // The papers for the band being read, which is the student's own unless
  // they have asked for the other one.
  const mine = useMemo(
    () => questPapersFor(state.papers, band === 'y9' ? 9 : 6),
    [state.papers, band])

  const ownBand = questBandFor(student?.yearGroup)
  const otherBand = ownBand === 'y6' ? 'y9' : 'y6'
  const doneToday = mine.filter((p) => doneIds.has(p.id)).length

  function start(paper) {
    setOpen(paper)
    setAnswers(new Array(paper.questions.length).fill(-1))
    setCurrentQ(0)
    setResult(null)
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
  }

  function close() {
    setOpen(null)
    setResult(null)
    setTick((n) => n + 1)
  }

  function choose(index) {
    setAnswers((prev) => {
      const next = [...prev]
      next[currentQ] = index
      return next
    })
  }

  function submit() {
    if (!open) return
    const got = recordQuestDone(student?.id, open, answers, state.day)
    // null means it was already logged: show the score without paying again.
    const correct = open.questions.reduce((n, q, i) => n + (answers[i] === q.correct ? 1 : 0), 0)
    setResult(got || { correct, total: open.questions.length, tokens: 0, coins: 0, already: true })
    setTick((n) => n + 1)
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
  }

  const header = embedded ? null : (
    <header className="dq-top">
      <button className="btn btn-outline" onClick={onBack}>&larr; Back</button>
      <div className="dq-top-mid">
        <h2 className="dq-title">Today&rsquo;s Quest</h2>
        <span className="dq-sub">Three things to read, and six questions on each</span>
      </div>
      <div className={`dq-streak${streak > 0 ? ' is-on' : ''}`} title="Days in a row">
        <span className="dq-streak-num">{streak}</span>
        <span className="dq-streak-label">day{streak === 1 ? '' : 's'} in a row</span>
      </div>
    </header>
  )

  // --- a paper, open --------------------------------------------------------

  if (open && result) {
    const pct = result.total ? Math.round((result.correct / result.total) * 100) : 0
    return (
      <div className="dq-page">
        {header}
        <div className="dq-result">
          <h3 className="dq-result-score">{result.correct} <span>/ {result.total}</span></h3>
          <p className="dq-result-pct">{pct}%</p>
          {result.already
            ? <p className="dq-result-paid text-dim">You have already been paid for this one.</p>
            : (
              <p className="dq-result-paid">
                +{result.tokens} tokens for reading
                {result.coins > 0 ? `, +${result.coins} coins for the questions` : ''}
              </p>
            )}

          <ol className="dq-review">
            {open.questions.map((q, i) => {
              const given = answers[i]
              const right = given === q.correct
              return (
                <li key={i} className={right ? 'dq-review-right' : 'dq-review-wrong'}>
                  <p className="dq-review-q">{q.question}</p>
                  <p className="dq-review-given">
                    <span className="dq-review-mark">{right ? '✓' : '✗'}</span>
                    {given >= 0 ? q.options[given] : 'No answer'}
                  </p>
                  {!right && <p className="dq-review-answer">Answer: {q.options[q.correct]}</p>}
                  {q.explanation && <p className="dq-review-why">{q.explanation}</p>}
                </li>
              )
            })}
          </ol>

          <button className="btn btn-primary" onClick={close}>Back to today&rsquo;s quest</button>
        </div>
      </div>
    )
  }

  if (open) {
    const q = open.questions[currentQ]
    const answered = answers.filter((a) => a >= 0).length
    return (
      <div className="dq-page">
        {header}
        <div className="dq-reader">
          <article className="dq-passage">
            <div className="dq-passage-head">
              <span className="dq-tag">{GENRE_LABEL[open.genre] || open.genre}</span>
              <h3>{open.title}</h3>
              <p className="dq-passage-meta">
                {open.wordCount} words &middot; about {open.minutes} min
              </p>
              {/* The key is what tells this button whether it is the one
                  talking; without one, every SpeakButton on the site shares
                  the same undefined identity. */}
              <SpeakButton
                text={String(open.text).replace(/<[^>]+>/g, ' ')}
                speechKey={`quest-${open.id}`}
                label="Read aloud"
              />
            </div>
            {/* The passage is generated server-side from a public-domain text
                or written by the job itself, and holds only <p> tags. */}
            <div className="dq-passage-body" dangerouslySetInnerHTML={{ __html: open.text }} />
            <footer className="dq-attrib">
              <p>{open.attribution}</p>
              {open.sourceUrl && (
                <p>
                  <a href={open.sourceUrl} target="_blank" rel="noopener noreferrer">
                    {open.licence === 'original' ? 'Where this came from' : 'Read the whole thing'}
                  </a>
                </p>
              )}
              {/* A report we wrote ourselves must show what it was written
                  from, so a teacher can check it rather than trust it. */}
              {open.sources?.length > 1 && (
                <ul className="dq-sources">
                  {open.sources.map((u, i) => (
                    <li key={u}>
                      <a href={u} target="_blank" rel="noopener noreferrer">Source {i + 1}</a>
                    </li>
                  ))}
                </ul>
              )}
            </footer>
          </article>

          <aside className="dq-questions">
            <div className="dq-q-progress">
              <span>Question {currentQ + 1} of {open.questions.length}</span>
              <span className="text-dim">{answered} answered</span>
            </div>
            <p className="dq-q-text">{q.question}</p>
            <div className="dq-q-options">
              {q.options.map((o, i) => (
                <button
                  key={i}
                  className={`dq-option${answers[currentQ] === i ? ' is-picked' : ''}`}
                  onClick={() => choose(i)}
                >
                  <span className="dq-option-letter">{'ABCD'[i]}</span>
                  <span>{o}</span>
                </button>
              ))}
            </div>
            <div className="dq-q-nav">
              <button
                className="btn btn-outline"
                disabled={currentQ === 0}
                onClick={() => setCurrentQ((n) => n - 1)}
              >
                Previous
              </button>
              {currentQ + 1 < open.questions.length
                ? (
                  <button className="btn btn-primary" onClick={() => setCurrentQ((n) => n + 1)}>
                    Next
                  </button>
                )
                : (
                  <button
                    className="btn btn-primary"
                    disabled={answered < open.questions.length}
                    title={answered < open.questions.length ? 'Answer all six first' : ''}
                    onClick={submit}
                  >
                    Finish
                  </button>
                )}
            </div>
            <button className="dq-leave" onClick={close}>Leave this for now</button>
          </aside>
        </div>
      </div>
    )
  }

  // --- the three cards -----------------------------------------------------

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
              {QUEST_TOKENS} tokens each for reading, {QUEST_COIN_PER_CORRECT} coins an answer,
              {' '}{QUEST_COIN_BONUS} more for all six
            </p>
          </div>

          <div className="dq-cards">
            {mine.map((paper) => {
              const done = doneIds.has(paper.id)
              const mark = log.find((r) => r.paperId === paper.id)
              return (
                <article key={paper.id} className={`dq-card${done ? ' is-done' : ''}`}>
                  <span className="dq-tag">{GENRE_LABEL[paper.genre] || paper.genre}</span>
                  <h3 className="dq-card-title">{paper.title}</h3>
                  <p className="dq-card-blurb text-dim">{GENRE_BLURB[paper.genre] || ''}</p>
                  <p className="dq-card-meta">
                    about {paper.minutes} min &middot; {paper.questions.length} questions
                  </p>
                  {done
                    ? (
                      <>
                        <p className="dq-card-score">{mark?.correct}/{mark?.total}</p>
                        <button className="btn btn-outline" onClick={() => start(paper)}>
                          Read it again
                        </button>
                      </>
                    )
                    : (
                      <button className="btn btn-primary" onClick={() => start(paper)}>
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
