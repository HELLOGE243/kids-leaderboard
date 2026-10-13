import { WRITING_RUBRIC } from '../data/store.js'

/**
 * A marked piece of writing, as the student is shown it.
 *
 * The teacher's marking is the whole point of a writing paper, so a parent
 * reading one has to see what the student sees: the piece with the teacher's
 * highlights, strikethroughs, insertions and corrections in place, the comments
 * in the margin beside them, the five rubric scores and whatever was written
 * underneath. It is rendered read-only - no rewrite, no coins, no revision.
 *
 * @param {object} props
 * @param {string} props.html what they wrote, as it was filed
 * @param {object|null} props.mark the teacher's mark, if it has been marked
 */
const SCORE_LABELS = ['', 'Beginning', 'Developing', 'Competent', 'Proficient', 'Advanced']
const SCORE_COLORS = ['', '#ff1744', '#ff9100', '#ffab00', '#66bb6a', '#00e5ff']

/** The piece as plain text, because annotation offsets are counted against it. */
function stripHtml(html) {
  let h = String(html || '').replace(/<br\s*\/?>/gi, '\n')
  h = h.replace(/<\/p>/gi, '\n\n').replace(/<\/div>/gi, '\n')
  const d = document.createElement('div')
  d.innerHTML = h
  return (d.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
}

function Annotated({ html, annotations }) {
  const plain = stripHtml(html)
  if (!plain) return <div><em>Nothing written</em></div>
  const sorted = [...(annotations || [])].filter((a) => a.startOffset != null)
    .sort((a, b) => a.startOffset - b.startOffset)
  if (!sorted.length) return <div className="qt-wr-annotated-text">{plain}</div>

  const comments = (annotations || []).filter((a) => a.action === 'comment')
  const parts = []
  let cursor = 0
  for (const ann of sorted) {
    // Marks laid over one another would double up the text between them.
    if (ann.startOffset < cursor) continue
    if (ann.startOffset > cursor) parts.push(<span key={`t${cursor}`}>{plain.slice(cursor, ann.startOffset)}</span>)
    const seg = plain.slice(ann.startOffset, ann.endOffset)
    if (ann.action === 'highlight') {
      parts.push(<mark key={ann.id} className="qt-wr-highlight" style={{ '--hl-color': ann.color }}>{seg}</mark>)
    } else if (ann.action === 'strikethrough') {
      parts.push(<span key={ann.id} className="qt-wr-strike">{seg}</span>)
    } else if (ann.action === 'comment') {
      const idx = comments.findIndex((a) => a.id === ann.id)
      parts.push(<span key={ann.id} className="qt-wr-comment-mark" data-comment-idx={idx + 1}>{seg}</span>)
    } else if (ann.action === 'insertion') {
      parts.push(
        <span key={ann.id} className="qt-wr-insertion-wrap">
          {seg}<span className="qt-wr-insertion-text">{ann.insertionText}</span>
        </span>
      )
    } else if (ann.action === 'correction') {
      parts.push(
        <span key={ann.id} className="qt-wr-correction-mark">
          <span className="qt-wr-correction-original">{seg}</span>
          {ann.suggestion && (
            <span className="qt-wr-correction-suggestion">
              <span className="qt-wr-correction-suggestion-label">Suggestion:</span> {ann.suggestion}
            </span>
          )}
        </span>
      )
    } else {
      parts.push(<span key={ann.id}>{seg}</span>)
    }
    cursor = ann.endOffset
  }
  if (cursor < plain.length) parts.push(<span key="end">{plain.slice(cursor)}</span>)

  return (
    <div className="qt-wr-annotated-wrap">
      <div className="qt-wr-annotated-text">{parts}</div>
      {comments.length > 0 && (
        <div className="qt-wr-margin-comments">
          {comments.map((ann, i) => (
            <div key={ann.id} className="qt-wr-margin-comment">
              <span className="qt-wr-margin-num">{i + 1}</span>
              <span className="qt-wr-margin-text">{ann.comment}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MarkedWriting({ html, mark }) {
  const band = mark ? SCORE_COLORS[Math.ceil(mark.totalScore / 5)] : null
  return (
    <>
      {mark && (
        <div className="qt-wr-score-banner" style={{ '--banner-color': band }}>
          <span className="qt-wr-score-banner-num">{mark.totalScore}</span>
          <span className="qt-wr-score-banner-of">/25</span>
        </div>
      )}

      <div className="qt-freewrite-review">
        <div className="qt-freewrite-review-label">What they wrote</div>
        <div className="qt-freewrite-review-text">
          <Annotated html={html} annotations={mark?.annotations} />
        </div>
      </div>

      {mark ? (
        <div className="qt-wr-feedback">
          <div className="qt-wr-feedback-header">
            <span className="qt-wr-feedback-title">Teacher feedback</span>
            <span className="qt-wr-feedback-score" style={{ color: band }}>{mark.totalScore}/25</span>
          </div>
          <div className="qt-wr-rubric-grid">
            {WRITING_RUBRIC.map((cat) => {
              const mc = (mark.categories || []).find((c) => c.key === cat.key)
              if (!mc) return null
              return (
                <div key={cat.key} className="qt-wr-rubric-item">
                  <div className="qt-wr-rubric-bar-wrap">
                    <div className="qt-wr-rubric-bar" style={{ width: `${(mc.score / 5) * 100}%`, background: SCORE_COLORS[mc.score] }} />
                  </div>
                  <div className="qt-wr-rubric-label">{cat.name}</div>
                  <div className="qt-wr-rubric-score" style={{ color: SCORE_COLORS[mc.score] }}>
                    {mc.score}/5 <span className="qt-wr-rubric-level">{SCORE_LABELS[mc.score]}</span>
                  </div>
                  {mc.comment && <div className="qt-wr-rubric-comment">{mc.comment}</div>}
                </div>
              )
            })}
          </div>
          {mark.overallComment && (
            <div className="qt-wr-overall">
              <div className="qt-wr-overall-label">Overall</div>
              <div className="qt-wr-overall-text">{mark.overallComment}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="rq-written-note">Their teacher has not marked this piece yet.</div>
      )}
    </>
  )
}

export default MarkedWriting
