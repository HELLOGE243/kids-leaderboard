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
      return katex.renderToString(tex.trim(), { throwOnError: false, displayMode })
    } catch {
      return tex
    }
  }

  return html
    // \[ ... \] - its own line
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => render(tex, true))
    // \( ... \) - inline
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => render(tex, false))
    // $$ ... $$ and $ ... $, in case a model reaches for the older style
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => render(tex, true))
    .replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_, before, tex) => before + render(tex, false))
}

export default renderMath
