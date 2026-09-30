import { useMemo, useLayoutEffect, useRef } from 'react'

/**
 * A cloze passage with its dropdowns sitting in the line of text.
 *
 * The passage used to be split on each ___ and every piece injected as its own
 * fragment of HTML. A passage's paragraphs do not divide evenly at its gaps, so
 * a piece would end with a <p> still open; the browser closed it at the end of
 * that fragment, and a closed paragraph is a block — which put every dropdown on
 * a line of its own, below the sentence it belonged to.
 *
 * The passage is written once here, whole, with the dropdown built into the
 * markup where the gap is. The paragraphs stay as the teacher wrote them and a
 * gap stays in its sentence.
 *
 * The selects are not React's to control: the browser keeps the chosen option,
 * and React hears the change through the handler on the wrapper, since its
 * events are delegated from the root and so reach it from any node inside. That
 * also means the passage is not rebuilt on every answer, so a dropdown never
 * loses focus mid-question.
 */
function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function ClozeText({ html, blanks = [], answers = [], onPick, disabled = false, className = '' }) {
  const hostRef = useRef(null)

  // Built from the passage and its gaps alone. Answers are applied to the live
  // selects afterwards, so choosing one does not rewrite the passage.
  const markup = useMemo(() => {
    let gap = -1
    return String(html || '').replace(/_{3,}/g, () => {
      gap += 1
      const blank = blanks[gap]
      if (!blank) return '______'
      const options = (blank.options || [])
        .map((opt, oi) => (opt ? `<option value="${oi}">${escapeHtml(opt)}</option>` : ''))
        .join('')
      return `<select class="qt-cloze-inline-select" data-gap="${gap}"${disabled ? ' disabled' : ''}>`
        + '<option value="-1" disabled hidden selected></option>'
        + `${options}</select>`
    })
  }, [html, blanks, disabled])

  // Put the stored answers back on the selects: on first paint, and whenever a
  // paper is resumed with work already in it.
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.querySelectorAll('select[data-gap]').forEach((select) => {
      const gap = Number(select.dataset.gap)
      const value = answers[gap]
      const wanted = value == null || value === -1 ? '-1' : String(value)
      if (select.value !== wanted) select.value = wanted
    })
  }, [markup, answers])

  return (
    <div
      ref={hostRef}
      className={`qt-cloze-text ${className}`.trim()}
      onChange={(e) => {
        const gap = e.target?.dataset?.gap
        if (gap === undefined) return
        onPick(Number(gap), parseInt(e.target.value, 10))
      }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}

export default ClozeText
