/**
 * Turns the way maths is ordinarily typed into the LaTeX that options render.
 *
 * A teacher writes "1/2", "3 1/4", "x^2" or "sqrt(9)" because that is what the
 * keyboard offers. This rewrites those into \frac, ^{}, \sqrt{} and the usual
 * operator symbols.
 *
 * Only the maths is wrapped, never the words around it: "1/2 of them" becomes
 * "\(\frac{1}{2}\) of them", so the prose keeps its ordinary font. Text that is
 * already LaTeX is returned untouched, so pressing the button twice is safe.
 */

export function isLatex(text) {
  return /\\\(|\\\[|\\frac|\\sqrt|\\times|\\le|\\ge|\\neq|\$/.test(text || '')
}

/** True when there is something in the text worth converting. */
export function looksLikeMath(text) {
  if (!text || isLatex(text)) return false
  return /[0-9a-zA-Z)}]\s*\/\s*[0-9a-zA-Z(]|[0-9a-zA-Z)}]\s*\^|\bsqrt\s*\(|[0-9a-zA-Z)}]\s*[*×÷]|<=|>=|!=/i.test(text)
}

/** The bare LaTeX for one expression, with no delimiters. */
export function toLatex(text) {
  let out = String(text || '')
  // sqrt first: it produces a {…} group the fraction rule can then sit on top of.
  out = out.replace(/\bsqrt\s*\(([^()]*)\)/gi, (_, inner) => `\\sqrt{${inner.trim()}}`)
  // A mixed number before a bare fraction, so "3 1/4" keeps its whole part.
  out = out.replace(/(\d+)\s+(\d+)\s*\/\s*(\d+)/g, (_, w, n, d) => `${w}\\frac{${n}}{${d}}`)
  // Either side of the slash may be a number, a bracketed sum or a \sqrt group.
  const TERM = String.raw`(?:\\sqrt\{[^{}]*\}|\([^()]*\)|[0-9a-zA-Z.]+)`
  out = out.replace(new RegExp(`(${TERM})\\s*/\\s*(${TERM})`, 'g'), (_, n, d) => {
    const strip = (s) => (/^\([^()]*\)$/.test(s) ? s.slice(1, -1) : s)
    return `\\frac{${strip(n)}}{${strip(d)}}`
  })
  out = out.replace(/\^\s*\(?(-?[0-9a-zA-Z]+)\)?/g, (_, exp) => `^{${exp}}`)
  out = out
    .replace(/\s*\*\s*/g, ' \\times ')
    .replace(/\s*×\s*/g, ' \\times ')
    .replace(/\s*÷\s*/g, ' \\div ')
    .replace(/\s*<=\s*/g, ' \\le ')
    .replace(/\s*>=\s*/g, ' \\ge ')
    .replace(/\s*!=\s*/g, ' \\neq ')
  return out.replace(/\s+/g, ' ').trim()
}

// A run of maths: numbers, letters and the operators that join them, stopping at
// ordinary words. "1/2 of them" matches only "1/2".
const MATH_RUN = /(?:\bsqrt\s*\([^()]*\)|\([^()]*\)|[0-9a-zA-Z.]+)(?:\s*(?:\/|\^|\*|×|÷|<=|>=|!=)\s*(?:\bsqrt\s*\([^()]*\)|\([^()]*\)|[0-9a-zA-Z.]+))+|\d+\s+\d+\s*\/\s*\d+/gi

/**
 * Converts every maths run in the text and wraps each one for inline display,
 * leaving the words between them alone.
 */
export function mathifyText(text) {
  const src = String(text || '')
  if (!src || isLatex(src)) return src
  return src.replace(MATH_RUN, (run) => {
    const latex = toLatex(run)
    return latex ? `\\(${latex}\\)` : run
  })
}

/** For a deliberate selection: convert it and wrap the whole thing. */
export function wrapMath(text) {
  const src = String(text || '')
  if (isLatex(src)) return src
  const inner = toLatex(src)
  return inner ? `\\(${inner}\\)` : '\\(\\)'
}

// A LaTeX command, or a braced sub/superscript: the mark of maths that has been
// written without any delimiters around it.
const BARE_LATEX = /\\[a-zA-Z]+|[\^_]\s*\{/
// Numbers and the operators that join an expression together. On their own they
// are not maths, but beside a \frac or a \sqrt they belong inside it.
const GLUE = /^[-+=<>(),.:;\d−×÷]+$/

/**
 * Some questions arrive with their maths written bare — an option that is simply
 * "\frac{1}{2}", with no \( … \) around it. Nothing renders that, so the student
 * reads the source instead of the fraction. This puts the delimiters where they
 * belong, around the maths and not around the words beside it.
 *
 * Text that already carries delimiters, or holds no LaTeX at all, is returned
 * untouched.
 */
export function prepareMath(text) {
  const src = String(text || '')
  if (!src || /\\\(|\\\[|\$/.test(src)) return src
  if (!BARE_LATEX.test(src)) return src

  const tokens = src.split(/(\s+)/)
  const out = []
  let run = []

  const flushRun = () => {
    if (!run.length) return
    // Whitespace that trails the maths belongs outside it.
    const tail = []
    while (run.length && /^\s*$/.test(run[run.length - 1])) tail.unshift(run.pop())
    // A run of numbers alone is not maths; it only counts with a command in it.
    if (run.some((t) => BARE_LATEX.test(t))) out.push(`\\(${run.join('')}\\)`)
    else out.push(run.join(''))
    out.push(...tail)
    run = []
  }

  // Numbers and operators seen before any command is held back: "2 \times 3" has
  // to keep its 2 inside the maths.
  let pending = []
  const dropPending = () => { out.push(...pending); pending = [] }

  for (const token of tokens) {
    if (/^\s*$/.test(token)) {
      if (run.length) run.push(token)
      else if (pending.length) pending.push(token)
      else out.push(token)
      continue
    }
    if (BARE_LATEX.test(token)) {
      run.push(...pending, token)
      pending = []
    } else if (GLUE.test(token)) {
      if (run.length) run.push(token)
      else pending.push(token)
    } else {
      flushRun()
      dropPending()
      out.push(token)
    }
  }
  flushRun()
  dropPending()
  return out.join('')
}

export default mathifyText
