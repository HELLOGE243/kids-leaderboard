import { useState } from 'react'
import { getDailyReadings, addDailyReading, removeDailyReading } from '../data/store.js'
import { YEAR_BANDS } from '../data/library.js'

/**
 * Setting the reading challenge.
 *
 * One piece per day, pasted in rather than linked to. A link is a promise
 * about somebody else's website - it rots, it asks for a login, it carries
 * advertising - and a reading set for a whole school on a given day cannot
 * rest on that. The link can go in as well, for a child who wants the
 * original.
 *
 * Dates are set rather than inferred, so a week can be loaded on Sunday
 * evening and released a day at a time.
 */
function ReadingsAdmin({ onChanged }) {
  const [, bump] = useState(0)
  const refresh = () => { bump((n) => n + 1); onChanged?.() }

  const [title, setTitle] = useState('')
  const [source, setSource] = useState('')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [forDate, setForDate] = useState(new Date().toISOString().slice(0, 10))
  const [band, setBand] = useState('all')
  const [minutes, setMinutes] = useState('')
  const [note, setNote] = useState('')

  const readings = getDailyReadings()
  const today = new Date().toISOString().slice(0, 10)

  function add(e) {
    e.preventDefault()
    if (!title.trim()) { setNote('Give it a headline.'); return }
    if (!text.trim()) { setNote('Paste the piece itself — a link on its own is not a reading.'); return }
    addDailyReading({ title, source, url, text, forDate, yearBand: band, minutes })
    setTitle(''); setSource(''); setUrl(''); setText(''); setMinutes('')
    setNote('Added.')
    setTimeout(() => setNote(''), 1600)
    refresh()
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  return (
    <div className="lib-admin">
      <div className="td2-group">
        <div className="td2-group-title">Set a reading</div>
        <form className="lib-admin-form" onSubmit={add}>
          <input className="td2-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Headline" />
          <input className="td2-input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Where it is from" />
          <label className="ra-field">
            <span>For</span>
            <input className="td2-input" type="date" value={forDate} onChange={(e) => setForDate(e.target.value)} />
          </label>
          <select className="td2-select" value={band} onChange={(e) => setBand(e.target.value)}>
            {YEAR_BANDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <label className="ra-field">
            <span>Minutes</span>
            <input
              className="td2-input ra-mins"
              type="number"
              min="0"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="5"
            />
          </label>
          <input className="td2-input lib-admin-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link to the original (optional)" />
          <textarea
            className="td2-input ra-text"
            rows={10}
            value={text}
            onChange={(e) => { setText(e.target.value); setNote('') }}
            placeholder="Paste the piece here. Paragraphs are kept."
          />
          <div className="ra-foot">
            <span className="td2-muted td2-small">{words ? `${words} words` : 'nothing pasted yet'}</span>
            <button className="td2-btn" type="submit">Set this reading</button>
          </div>
        </form>
        {note && <p className="td2-muted td2-small">{note}</p>}
      </div>

      <div className="td2-group">
        <div className="td2-group-title">Set so far ({readings.length})</div>
        {readings.length === 0 ? (
          <p className="td2-empty">Nothing set yet.</p>
        ) : readings.map((r) => (
          <div key={r.id} className="td2-item">
            <span className="td2-grow">
              <b>{r.title}</b>
              <span className="td2-muted td2-small">
                {' '}{r.forDate}{r.forDate === today ? ' · today' : r.forDate > today ? ' · upcoming' : ''}
                {r.source ? ` · ${r.source}` : ''}
                {r.yearBand !== 'all' ? ` · ${YEAR_BANDS.find((b) => b.id === r.yearBand)?.label}` : ''}
              </span>
            </span>
            <button className="td2-btn-ghost td2-btn-sm" onClick={() => { removeDailyReading(r.id); refresh() }}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ReadingsAdmin
