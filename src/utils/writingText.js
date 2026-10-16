/**
 * Counting and reading a child's writing.
 *
 * The coach is paced by sentences, so what counts as one has to be decided
 * somewhere a test can reach it. These rules are deliberately forgiving: a
 * child who writes "Mr. Patel went home" has written one sentence, and a
 * child who ends with "!!!" has still only written one.
 */

/** The words, with the markup and the entities taken out. */
export function plainWords(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Titles and initials end in a full stop without ending a sentence.
const NOT_AN_ENDING = /\b(mr|mrs|ms|dr|st|mt|prof|etc|eg|ie|vs|jr|sr)$/i

/**
 * The sentences, as a child would count them.
 *
 * Splitting on terminal punctuation alone counts "Mr. Patel" as two and a
 * trailing "..." as three, which would hand out coach turns for nothing.
 *
 * @param {string} html
 * @returns {string[]}
 */
export function splitSentences(html) {
  const text = plainWords(html)
  if (!text) return []
  const out = []
  let buffer = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    buffer += ch
    if (ch !== '.' && ch !== '!' && ch !== '?') continue
    // Swallow a run of ending marks: "!!!" ends one sentence, not three.
    while ('.!?'.includes(text[i + 1])) { buffer += text[i + 1]; i++ }
    const words = buffer.trim().replace(/[.!?]+$/, '').split(/\s+/)
    const lastWord = words[words.length - 1] || ''
    if (NOT_AN_ENDING.test(lastWord)) continue        // Mr. / Dr. / St.
    if (lastWord.length === 1 && /[A-Z]/.test(lastWord)) continue  // an initial
    const sentence = buffer.trim()
    // Needs some substance: a stray "." is not a sentence.
    if (sentence.replace(/[^a-z0-9]/gi, '').length >= 3) out.push(sentence)
    buffer = ''
  }
  // Whatever is still being typed counts once it has a few words in it, so the
  // coach is not held up by a missing full stop at the very end.
  const rest = buffer.trim()
  if (rest.split(/\s+/).filter(Boolean).length >= 4) out.push(rest)
  return out
}

/** How many sentences have been written. */
export function countSentences(html) {
  return splitSentences(html).length
}

/** The most recent sentence, for reading back aloud. */
export function lastSentenceOf(html) {
  const all = splitSentences(html)
  return all.length ? all[all.length - 1] : ''
}

/**
 * The newest part of the writing, for a coach that should respond to what has
 * just been written rather than the whole piece again.
 * @param {string} html
 * @param {number} fromSentence how many sentences the coach has already seen
 */
export function sentencesSince(html, fromSentence = 0) {
  return splitSentences(html).slice(Math.max(0, fromSentence)).join(' ')
}
