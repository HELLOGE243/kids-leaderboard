import { useState } from 'react'
import {
  getLibraryNews, addLibraryNews, removeLibraryNews,
  getLibraryBook, setLibraryBook,
} from '../data/store.js'
import { YEAR_BANDS, getLibraryWorks, takeWorkOffShelf, bylineFor } from '../data/library.js'

/**
 * What the school is asking its students to read.
 *
 * The reading list and the book of the week are chosen here. The peer works
 * shelf is filled from the marking screen, where the piece is in front of the
 * teacher; what it needs here is a way to take something back off it.
 */
function LibraryAdmin({ onChanged }) {
  const [, bump] = useState(0)
  const refresh = () => { bump((n) => n + 1); onChanged?.() }

  const [title, setTitle] = useState('')
  const [source, setSource] = useState('')
  const [url, setUrl] = useState('')
  const [blurb, setBlurb] = useState('')
  const [band, setBand] = useState('all')

  const book = getLibraryBook()
  const [bTitle, setBTitle] = useState(book?.title || '')
  const [bAuthor, setBAuthor] = useState(book?.author || '')
  const [bWhy, setBWhy] = useState(book?.why || '')
  const [bBand, setBBand] = useState(book?.yearBand || 'all')

  const [works, setWorks] = useState(null)
  const news = getLibraryNews()

  function addArticle(e) {
    e.preventDefault()
    if (!title.trim()) return
    addLibraryNews({ title, source, url, blurb, yearBand: band })
    setTitle(''); setSource(''); setUrl(''); setBlurb(''); setBand('all')
    refresh()
  }

  function saveBook(e) {
    e.preventDefault()
    if (!bTitle.trim()) return
    setLibraryBook({ title: bTitle, author: bAuthor, why: bWhy, yearBand: bBand })
    refresh()
  }

  return (
    <div className="lib-admin">
      <div className="td2-group">
        <div className="td2-group-title">Book of the week</div>
        <form className="lib-admin-form" onSubmit={saveBook}>
          <input className="td2-input" value={bTitle} onChange={(e) => setBTitle(e.target.value)} placeholder="Title" />
          <input className="td2-input" value={bAuthor} onChange={(e) => setBAuthor(e.target.value)} placeholder="Author" />
          <select className="td2-select" value={bBand} onChange={(e) => setBBand(e.target.value)}>
            {YEAR_BANDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <textarea
            className="td2-input lib-admin-why"
            rows={2}
            value={bWhy}
            onChange={(e) => setBWhy(e.target.value)}
            placeholder="Why this one — a line or two the students will read"
          />
          <button className="td2-btn" type="submit">{book ? 'Change the book' : 'Set the book'}</button>
        </form>
        {book && <p className="td2-muted td2-small">Showing now: <b>{book.title}</b>{book.author ? ` — ${book.author}` : ''}</p>}
      </div>

      <div className="td2-group">
        <div className="td2-group-title">Reading list ({news.length})</div>
        <form className="lib-admin-form" onSubmit={addArticle}>
          <input className="td2-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Headline" />
          <input className="td2-input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Where it is from" />
          <select className="td2-select" value={band} onChange={(e) => setBand(e.target.value)}>
            {YEAR_BANDS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <input className="td2-input lib-admin-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link (https://…)" />
          <textarea
            className="td2-input lib-admin-why"
            rows={2}
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            placeholder="A line on why it is worth their time"
          />
          <button className="td2-btn" type="submit">Add to the list</button>
        </form>
        {news.map((n) => (
          <div key={n.id} className="td2-item">
            <span className="td2-grow">
              <b>{n.title}</b>
              <span className="td2-muted td2-small"> {n.source}{n.yearBand !== 'all' ? ` · ${YEAR_BANDS.find((b) => b.id === n.yearBand)?.label}` : ''}</span>
            </span>
            <button className="td2-btn-ghost td2-btn-sm" onClick={() => { removeLibraryNews(n.id); refresh() }}>Remove</button>
          </div>
        ))}
      </div>

      <div className="td2-group">
        <div className="td2-group-title">Peer works on the shelf</div>
        <p className="td2-muted td2-small" style={{ marginBottom: 8 }}>
          Pieces are put here from the writing marking screen, where you can see the writing.
        </p>
        {works === null ? (
          <button className="td2-btn-ghost td2-btn-sm" onClick={() => getLibraryWorks().then(setWorks)}>
            Show what is published
          </button>
        ) : works.length === 0 ? (
          <p className="td2-empty">Nothing published yet.</p>
        ) : works.map((w) => (
          <div key={w.id} className="td2-item">
            <span className="td2-grow">
              <b>{w.taskTitle || 'A piece of writing'}</b>
              <span className="td2-muted td2-small"> {bylineFor(w)}</span>
            </span>
            <button
              className="td2-btn-ghost td2-btn-sm"
              onClick={async () => { await takeWorkOffShelf(w.id); setWorks(await getLibraryWorks()); refresh() }}
            >Take off</button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default LibraryAdmin
