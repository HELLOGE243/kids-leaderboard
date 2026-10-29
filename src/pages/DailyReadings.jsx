import { useEffect, useMemo, useRef, useState } from 'react'
import SpeakButton from '../components/SpeakButton.jsx'
import { RichText } from '../components/RichTextEditor.jsx'
import {
  getTodaysReading, getOutstandingReadings, getDailyReadings,
  markReadingDone, getReadingLog, getReadingStreak, READING_TOKENS,
} from '../data/store.js'

/**
 * The reading challenge: what the school is asking every child to read today.
 *
 * Separate from the library on purpose. The library is an invitation - a shelf
 * of things worth your time, taken or not. This is the work: one piece a day,
 * set for everybody, and a child who missed Monday is handed Monday rather
 * than told they are behind.
 *
 * Finishing pays tokens, which is what the Battlegrounds pay, because reading
 * is the kind of effort that should buy a game rather than buy a prize - the
 * coins are kept for the papers.
 *
 * A reading cannot be marked read until it has been open long enough to have
 * been read. Not a serious lock, and not meant as one: it is there so that
 * "done" means something to the child who presses it.
 *
 * @param {object} props
 * @param {{id: string, name: string, yearGroup?: string}} props.student
 * @param {() => void} props.onBack
 * @param {boolean} [props.embedded] true when the Reading Room is drawing the header
 */
function DailyReadings({ student, onBack, embedded = false }) {
  const [, bump] = useState(0)
  const [open, setOpen] = useState(null)
  const [openedAt, setOpenedAt] = useState(0)
  const [tick, setTick] = useState(0)
  const bodyRef = useRef(null)

  const today = getTodaysReading(student?.yearGroup)
  const outstanding = useMemo(
    () => getOutstandingReadings(student?.id, student?.yearGroup),
    [student?.id, student?.yearGroup, tick])
  const doneIds = useMemo(
    () => new Set(getReadingLog(student?.id).map((r) => r.readingId)),
    [student?.id, tick])
  const streak = useMemo(() => getReadingStreak(student?.id), [student?.id, tick])
  const recent = useMemo(
    () => getDailyReadings().filter((r) => doneIds.has(r.id)).slice(0, 8),
    [doneIds])

  // A ticking clock while a piece is open, so the button can unlock itself.
  useEffect(() => {
    if (!open) return undefined
    const t = setInterval(() => bump((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [open])

  const heldFor = open ? Math.floor((Date.now() - openedAt) / 1000) : 0
  const needed = open ? Math.min(60, Math.max(20, (open.minutes || 1) * 15)) : 0
  const canFinish = open && !doneIds.has(open.id) && heldFor >= needed

  function start(reading) {
    setOpen(reading)
    setOpenedAt(Date.now())
    setTimeout(() => bodyRef.current?.scrollTo?.({ top: 0 }), 0)
  }

  function finish() {
    if (!canFinish) return
    markReadingDone(student.id, open.id, heldFor)
    setOpen(null)
    setTick((n) => n + 1)
  }

  if (open) {
    const already = doneIds.has(open.id)
    return (
      <div className="dr-page">
  {!embedded && (
      <header className="dr-top">
          <button className="btn btn-outline" onClick={() => setOpen(null)}>← Back</button>
          <div className="dr-top-mid">
            <h2 className="dr-title">{open.title}</h2>
            <span className="dr-sub">
              {open.source ? `${open.source} · ` : ''}{prettyDay(open.forDate)}
              {open.minutes ? ` · about ${open.minutes} min` : ''}
            </span>
          </div>
          <SpeakButton text={plain(open.text)} speechKey={`reading-${open.id}`} label="Read it to me" />
        </header>
      )}

        <article className="dr-reader" ref={bodyRef}>
          <RichText html={open.text || ''} />
          {open.url && (
            <p className="dr-source-link">
              <a href={open.url} target="_blank" rel="noopener noreferrer">See where this came from →</a>
            </p>
          )}
        </article>

        <footer className="dr-foot">
          {already ? (
            <span className="dr-done-note">✓ You have already read this one.</span>
          ) : canFinish ? (
            <button className="dr-finish" onClick={finish}>
              I have read this — collect {READING_TOKENS} tokens
            </button>
          ) : (
            <span className="dr-wait">Keep reading… you can mark this done in {needed - heldFor}s</span>
          )}
        </footer>
      </div>
    )
  }

  return (
    <div className="dr-page">
      <header className="dr-top">
        <button className="btn btn-outline" onClick={onBack}>← Back</button>
        <div className="dr-top-mid">
          <h2 className="dr-title">Daily Readings</h2>
          <span className="dr-sub">One piece a day. Finishing one pays {READING_TOKENS} tokens.</span>
        </div>
        <div className={`dr-streak${streak > 0 ? ' is-on' : ''}`} title="Days in a row">
          <span className="dr-streak-num">{streak}</span>
          <span className="dr-streak-label">day{streak === 1 ? '' : 's'} in a row</span>
        </div>
      </header>

      <section className="dr-section">
        <h3 className="dr-section-title">Today</h3>
        {!today ? (
          <p className="dr-empty">Nothing set for today yet.</p>
        ) : doneIds.has(today.id) ? (
          <div className="dr-card is-done">
            <div className="dr-card-main">
              <span className="dr-card-title">{today.title}</span>
              <span className="dr-card-meta">{today.source}</span>
            </div>
            <span className="dr-card-tick">✓ Read</span>
            <button className="dr-card-open" onClick={() => start(today)}>Read it again</button>
          </div>
        ) : (
          <div className="dr-card is-today">
            <div className="dr-card-main">
              <span className="dr-card-title">{today.title}</span>
              <span className="dr-card-meta">
                {today.source}{today.minutes ? ` · about ${today.minutes} min` : ''}
              </span>
            </div>
            <button className="dr-card-open is-primary" onClick={() => start(today)}>Start reading</button>
          </div>
        )}
      </section>

      {outstanding.filter((r) => !today || r.id !== today.id).length > 0 && (
        <section className="dr-section">
          <h3 className="dr-section-title">Still to read</h3>
          <p className="dr-section-note">Missed days, oldest first. They still count.</p>
          {outstanding.filter((r) => !today || r.id !== today.id).map((r) => (
            <div key={r.id} className="dr-card">
              <div className="dr-card-main">
                <span className="dr-card-title">{r.title}</span>
                <span className="dr-card-meta">{prettyDay(r.forDate)}{r.source ? ` · ${r.source}` : ''}</span>
              </div>
              <button className="dr-card-open" onClick={() => start(r)}>Read</button>
            </div>
          ))}
        </section>
      )}

      {recent.length > 0 && (
        <section className="dr-section">
          <h3 className="dr-section-title">Read</h3>
          {recent.map((r) => (
            <div key={r.id} className="dr-card is-done">
              <div className="dr-card-main">
                <span className="dr-card-title">{r.title}</span>
                <span className="dr-card-meta">{prettyDay(r.forDate)}</span>
              </div>
              <span className="dr-card-tick">✓</span>
              <button className="dr-card-open" onClick={() => start(r)}>Again</button>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

/** "Monday 19 October", or the raw date if it will not parse. */
function prettyDay(iso) {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso || ''
  const today = new Date().toISOString().slice(0, 10)
  if (iso === today) return 'Today'
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

function plain(html) {
  return String(html || '')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .trim()
}

export default DailyReadings
