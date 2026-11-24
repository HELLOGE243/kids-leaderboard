import { useState } from 'react'
import { RichText } from './RichTextEditor.jsx'
import { extractTabLabel } from '../utils/extractLabel.js'

/**
 * Does this question carry extracts of its own?
 *
 * Only the two types that were built to share a passage between several
 * questions do. Every other type keeps whatever the student has to read in
 * `text`, and a stray `descriptions` array on one of those would be left over
 * from an edit rather than something to show.
 */
function hasExtracts(question) {
  const type = question?.type || 'multiple-choice'
  return (type === 'multi-description' || type === 'multi-matching')
    && (question?.descriptions || []).length > 0
}

/**
 * The left-hand pane of a question: what the student has to read.
 *
 * For most questions that is `text`. For a reading comprehension item it is
 * not - `text` holds only the paper's instruction line ("For questions 1 - 8,
 * choose the option..."), the question itself is in `prompt`, and the passages
 * live in `descriptions` as tabs. A pane that renders `text` alone therefore
 * shows an instruction with nothing to apply it to, which is what the daily
 * revision card was doing: the extract was never on the screen.
 *
 * The instruction line is deliberately dropped when there are extracts, so the
 * card reads exactly as the paper did.
 *
 * @param {object} question the question being shown
 * @param {(html: string) => string} resolve swaps stored image refs for data
 *   URIs where the surface has already loaded them; identity where it has not
 * @param {any} empty what to show when there is nothing to read at all
 */
export default function QuestionPassage({ question, resolve = (html) => html, empty = null }) {
  const [tab, setTab] = useState(0)
  const descriptions = question?.descriptions || []

  if (!hasExtracts(question)) {
    const text = question?.text
    if (!text) return empty
    return <div className="qt-question-text"><RichText html={resolve(text)} /></div>
  }

  // A card that is swapped underneath this component keeps its tab index, and
  // the next question may have fewer extracts than the last one did.
  const current = Math.min(tab, descriptions.length - 1)

  return (
    <>
      <div className="qt-desc-tabs">
        {descriptions.map((d, di) => (
          <button
            key={di}
            className={`qt-desc-tab${current === di ? ' qt-desc-tab-active' : ''}`}
            onClick={() => setTab(di)}
          >{extractTabLabel(d?.title, di)}</button>
        ))}
      </div>
      <div className="qt-desc-content">
        <RichText html={resolve(descriptions[current]?.content || '')} />
      </div>
    </>
  )
}
