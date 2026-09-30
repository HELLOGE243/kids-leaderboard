import { useMemo } from 'react'

/**
 * A cloze passage with its dropdowns sitting in the line of text.
 *
 * Two things had to be true at once, and each fix broke the other.
 *
 * Splitting the passage on ___ and injecting each piece as its own fragment put
 * every dropdown on a line of its own: a passage's paragraphs do not divide
 * evenly at its gaps, so a piece would end with a <p> still open, the browser
 * closed it, and a closed paragraph is a block.
 *
 * Writing the passage whole with the dropdowns built into the markup kept them
 * in the line, but React rebuilds the contents of an element it fills with html,
 * and a rebuilt dropdown is a new one — empty. A student answered, the passage
 * redrew, and the answer was gone; only the first gap of any passage was ever
 * recorded.
 *
 * So the passage is flattened to inline markup first — a paragraph ending
 * becomes the space between paragraphs, which reads the same — and then split at
 * its gaps. Every fragment is inline, so nothing pushes a dropdown onto its own
 * line, and the dropdowns are React's own elements, which it will not discard.
 */
function toInline(html) {
  return String(html || '')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '<br><br>')
    .replace(/<(p|div|h[1-6]|li|blockquote)\b[^>]*>/gi, '')
    // Whatever that leaves, never more than one blank line at a time.
    .replace(/(?:<br\s*\/?>\s*){3,}/gi, '<br><br>')
    .replace(/^(?:\s*<br\s*\/?>)+/i, '')
    .replace(/(?:<br\s*\/?>\s*)+$/i, '')
}

function ClozeText({ html, blanks = [], answers = [], onPick, disabled = false, className = '' }) {
  const parts = useMemo(() => toInline(html).split(/_{3,}/), [html])

  return (
    <div className={`qt-cloze-text ${className}`.trim()}>
      {parts.map((part, i) => {
        const blank = blanks[i]
        const value = answers[i]
        return (
          <span key={i}>
            <span dangerouslySetInnerHTML={{ __html: part }} />
            {i < parts.length - 1 && blank && (
              <select
                className="qt-cloze-inline-select"
                data-gap={i}
                disabled={disabled}
                value={value == null ? -1 : value}
                onChange={(e) => onPick(i, parseInt(e.target.value, 10))}
              >
                <option value={-1} disabled hidden />
                {(blank.options || []).map((opt, oi) => (opt ? <option key={oi} value={oi}>{opt}</option> : null))}
              </select>
            )}
          </span>
        )
      })}
    </div>
  )
}

export default ClozeText
