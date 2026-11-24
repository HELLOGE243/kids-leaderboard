import { isLatex, mathifyText, prepareMath } from './mathify.js'

/**
 * Gets a line of model-written dojo text ready to be rendered as maths.
 *
 * This is the deciding half - what to mark up and what to escape - and it
 * deliberately does not call KaTeX. renderMath pulls in katex's stylesheet,
 * which a plain node test cannot load, so keeping the rules here means every
 * one of them is tested without a bundler. The component composes the two.
 *
 * There are two ways LaTeX gets into these questions and both are needed.
 *
 * The prompts ask for it, because only the model knows that "2x - 7 = x + 5"
 * is an equation and that "9-10 year olds" is a range. A detector cannot tell
 * those apart: mathifyText deliberately does not treat + - = as operators, so
 * it leaves every algebraic equation alone rather than wrapping ages, scores
 * and dates by mistake. Asking the model is the only way to get algebra set.
 *
 * And the detector runs anyway, because a model told to use LaTeX will still
 * sometimes type "1/2". It only runs when the line carries no LaTeX at all, so
 * it can never fight with what the model did mark up.
 *
 * Everything outside the maths is escaped. The text is the model's, it is
 * about to be set as HTML, and a stray "<" in prose - "pick a value where
 * x < y" written as words rather than as an expression - would otherwise eat
 * the rest of the sentence.
 *
 * @returns {string} HTML-safe text with its maths in \( … \), ready for renderMath
 */
export function prepareDojoText(src) {
  const text = String(src == null ? '' : src)
  if (!text) return ''
  const withMath = isLatex(text) ? prepareMath(text) : mathifyText(text)
  return escapeOutsideMath(withMath)
}

// \( … \) and \[ … \] regions are handed to KaTeX as source and must not be
// escaped; everything between them is prose and must be.
const MATH_REGION = /(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g

export function escapeOutsideMath(text) {
  return String(text == null ? '' : text)
    .split(MATH_REGION)
    .map((part, i) => (i % 2 === 1 ? part : escapeHtml(part)))
    .join('')
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export default prepareDojoText
