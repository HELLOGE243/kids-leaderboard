import { useState } from 'react'
import { putWorkInLibrary } from '../data/library.js'

/**
 * Putting a marked piece in front of the school.
 *
 * A child learns more from another child's paragraph that works than from
 * being told what a good paragraph looks like, which is what this shelf is
 * for. Two things are decided here rather than assumed: whether the writer is
 * named, and why the piece is worth reading - a piece on the shelf with no
 * reason attached is just a piece of writing.
 *
 * The teacher's annotations do not go with it. Those are corrections made to
 * one child, and the whole school is not the audience for them.
 *
 * @param {object} props
 * @param {object} props.submission the piece being marked
 * @param {object|null} props.mark its rubric mark, if it has one
 * @param {string} props.taskTitle what the task was
 */
function PublishToLibrary({ submission, mark, taskTitle }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [byline, setByline] = useState('first-name')
  const [state, setState] = useState('')

  async function publish() {
    if (!note.trim()) { setState('Say why it is worth reading first.'); return }
    setState('Publishing…')
    const id = await putWorkInLibrary({
      work: {
        attemptId: submission.attemptId,
        questionIndex: submission.questionIndex,
        studentId: String(submission.studentId),
        studentName: submission.studentName || '',
        yearGroup: submission.yearGroup || '',
        taskTitle: taskTitle || '',
        text: submission.answer || '',
        totalScore: mark?.totalScore ?? null,
      },
      byline,
      note,
    })
    setState(id ? 'On the shelf.' : 'Could not publish just now.')
    if (id) setTimeout(() => { setOpen(false); setState('') }, 1400)
  }

  if (!open) {
    return (
      <button className="wr-publish-btn" onClick={() => setOpen(true)} title="Put this piece in the library">
        📚 Put in the library
      </button>
    )
  }

  return (
    <div className="wr-publish">
      <label className="wr-publish-label" htmlFor="wr-pub-note">Why is this worth reading?</label>
      <textarea
        id="wr-pub-note"
        className="wr-publish-note"
        rows={2}
        value={note}
        onChange={(e) => { setNote(e.target.value); setState('') }}
        placeholder="e.g. Look at how the opening drops you straight into the action."
      />
      <div className="wr-publish-row">
        <label className="wr-publish-byline">
          <span>Signed</span>
          <select className="td2-select" value={byline} onChange={(e) => setByline(e.target.value)}>
            <option value="first-name">First name and year</option>
            <option value="anonymous">Anonymously</option>
          </select>
        </label>
        <button className="wr-publish-go" onClick={publish}>Publish</button>
        <button className="wr-publish-cancel" onClick={() => { setOpen(false); setState('') }}>Cancel</button>
      </div>
      {state && <p className="wr-publish-state">{state}</p>}
    </div>
  )
}

export default PublishToLibrary
