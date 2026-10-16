import { useEffect, useMemo, useState } from 'react'
import SpeakButton from '../components/SpeakButton.jsx'
import { RichText } from '../components/RichTextEditor.jsx'
import { getLibraryWorks, bylineFor, suitsYear } from '../data/library.js'
import { getLibraryNews, getLibraryBook } from '../data/store.js'

/**
 * The library: what the school is reading, and what it has written.
 *
 * Three shelves. Peer works are pieces a teacher thought the rest of the
 * school should read - a child learns more from another child's paragraph
 * that works than from being told what a good paragraph looks like. The
 * reading list and the book of the week are chosen by the school.
 *
 * Everything here can be read aloud, because the point of a library is that
 * you can get at what is in it.
 *
 * @param {object} props
 * @param {{id: string, name: string, yearGroup?: string}} props.student
 * @param {() => void} props.onBack
 */
function Library({ student, onBack }) {
  const [shelf, setShelf] = useState('works')
  const [works, setWorks] = useState(null)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    let alive = true
    getLibraryWorks().then((rows) => { if (alive) setWorks(rows) })
    return () => { alive = false }
  }, [])

  const news = useMemo(
    () => getLibraryNews().filter((n) => suitsYear(n, student?.yearGroup)),
    [student?.yearGroup])
  const book = useMemo(() => {
    const b = getLibraryBook()
    return b && suitsYear(b, student?.yearGroup) ? b : null
  }, [student?.yearGroup])

  const mine = (works || []).filter((w) => String(w.studentId) === String(student?.id))

  return (
    <div className="lib-page">
      <header className="lib-top">
        <button className="btn btn-outline" onClick={onBack}>← Back</button>
        <h2 className="lib-title">Library</h2>
        <span className="lib-sub">What we are reading, and what we have written</span>
      </header>

      <nav className="lib-tabs">
        {[
          ['works', `Peer works${works ? ` (${works.length})` : ''}`],
          ['news', `Reading list${news.length ? ` (${news.length})` : ''}`],
          ['book', 'Book of the week'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`lib-tab${shelf === id ? ' is-active' : ''}`}
            onClick={() => { setShelf(id); setOpen(null) }}
          >{label}</button>
        ))}
      </nav>

      {shelf === 'works' && (
        <section className="lib-shelf">
          {mine.length > 0 && (
            <p className="lib-mine">
              {mine.length === 1 ? 'One of your pieces is' : `${mine.length} of your pieces are`} on this shelf.
            </p>
          )}
          {works === null ? (
            <p className="lib-empty">Fetching the shelf…</p>
          ) : works.length === 0 ? (
            <p className="lib-empty">
              Nothing here yet. When a teacher reads a piece they think the school should see, it appears here.
            </p>
          ) : (
            <div className="lib-works">
              {works.map((w) => (
                <button key={w.id} className="lib-work" onClick={() => setOpen(w)}>
                  <span className="lib-work-task">{w.taskTitle || 'A piece of writing'}</span>
                  <span className="lib-work-by">{bylineFor(w)}</span>
                  {w.teacherNote && <span className="lib-work-note">“{w.teacherNote}”</span>}
                  {Number(w.totalScore) > 0 && <span className="lib-work-score">{w.totalScore}/25</span>}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {shelf === 'news' && (
        <section className="lib-shelf">
          {news.length === 0 ? (
            <p className="lib-empty">No articles on the list just now. Check back next week.</p>
          ) : (
            <div className="lib-news">
              {news.map((n) => (
                <article key={n.id} className="lib-news-item">
                  <h3 className="lib-news-title">{n.title}</h3>
                  {n.source && <span className="lib-news-source">{n.source}</span>}
                  {n.blurb && <p className="lib-news-blurb">{n.blurb}</p>}
                  <div className="lib-news-foot">
                    {n.url && (
                      <a className="lib-news-link" href={n.url} target="_blank" rel="noopener noreferrer">
                        Read it →
                      </a>
                    )}
                    <SpeakButton
                      text={`${n.title}. ${n.blurb || ''}`}
                      speechKey={`news-${n.id}`}
                      label="Read this to me"
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {shelf === 'book' && (
        <section className="lib-shelf">
          {!book ? (
            <p className="lib-empty">No book chosen this week yet.</p>
          ) : (
            <article className="lib-book">
              {book.cover && <img className="lib-book-cover" src={book.cover} alt="" />}
              <div className="lib-book-body">
                <h3 className="lib-book-title">{book.title}</h3>
                {book.author && <p className="lib-book-author">by {book.author}</p>}
                {book.why && <p className="lib-book-why">{book.why}</p>}
                <SpeakButton
                  text={`${book.title}, by ${book.author}. ${book.why || ''}`}
                  speechKey="library-book"
                  label="Read this to me"
                />
              </div>
            </article>
          )}
        </section>
      )}

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(null)}>
          <div className="lib-reader" onClick={(e) => e.stopPropagation()}>
            <header className="lib-reader-head">
              <div>
                <h3 className="lib-reader-task">{open.taskTitle || 'A piece of writing'}</h3>
                <span className="lib-work-by">{bylineFor(open)}</span>
              </div>
              <button className="td2-icon-btn" aria-label="Close" onClick={() => setOpen(null)}>✕</button>
            </header>
            {open.teacherNote && (
              <p className="lib-reader-note"><b>Why read this:</b> {open.teacherNote}</p>
            )}
            <div className="lib-reader-body">
              <RichText html={open.text || ''} />
            </div>
            <SpeakButton text={open.text || ''} speechKey={`work-${open.id}`} label="Read it to me" />
          </div>
        </div>
      )}
    </div>
  )
}

export default Library
