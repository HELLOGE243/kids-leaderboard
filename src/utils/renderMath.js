import katex from 'katex'
import 'katex/dist/katex.min.css'

/**
 * Renders the maths in a piece of explanation HTML.
 *
 * Explanations come back from the AI with any number, sum or equation wrapped
 * in \( … \) for inline maths or \[ … \] for a line of its own, which is what
 * the prompts ask for. Everything outside those delimiters is left exactly as
 * it was, so ordinary prose and the <b>/<i>/<u> tags the explanations use are
 * untouched.
 *
 * KaTeX is told not to throw: a malformed expression renders as the source
 * text in red rather than taking the review screen down with it.
 */
export function renderMath(html) {
  if (!html || typeof html !== 'string') return html || ''
  if (!/\\\(|\\\[|\$/.test(html)) return html

  const render = (tex, displayMode) => {
    try {
      // HTML only: the MathML layer katex also emits carries the source as text,
      // and where a browser fails to hide it the expression appears twice.
      return katex.renderToString(tex.trim(), { throwOnError: false, displayMode, output: 'html' })
    } catch {
      return tex
    }
  }

  // Whatever sits between the delimiters is handed to KaTeX as an expression, so
  // markup caught in the middle comes back as visible source. Prices are the way
  // this happens: "$15 ... $30" in a word problem reads as one long expression
  // and takes the picture between them with it.
  const isExpression = (tex) => !/[<>]/.test(tex) && tex.length <= 200

  return html
    // \[ ... \] - its own line
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => (isExpression(tex) ? render(tex, true) : `\\[${tex}\\]`))
    // \( ... \) - inline
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => (isExpression(tex) ? render(tex, false) : `\\(${tex}\\)`))
    // $$ ... $$, in case a model reaches for the older style
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => (isExpression(tex) ? render(tex, true) : `$$${tex}$$`))
    // A single $ is left alone: in these papers it is nearly always money, and
    // maths is written \( … \) by the editor, by the prompts and by the import.

}

export default renderMath
