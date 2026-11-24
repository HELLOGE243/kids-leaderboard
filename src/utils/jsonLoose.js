/**
 * Reading JSON that has LaTeX in it.
 *
 * Lives on its own rather than in aiChat.js because aiChat reaches for the
 * browser's auth, and this is wanted by a node script and by a test that have
 * no browser. It is a pure function; nothing about it needed the network.
 */

/**
 * JSON.parse for model output that contains LaTeX.
 *
 * A model asked for \(3 	imes 4\) inside a JSON string writes a single
 * backslash, which is not a legal JSON escape, and the whole reply fails to
 * parse. Any backslash that does not begin a legal escape is doubled before
 * parsing, so the maths survives and the JSON is valid.
 */
export function parseJsonLoose(text) {
  try {
    return JSON.parse(text)
  } catch {
    // A model asked for LaTeX writes a single backslash inside a JSON string -
    // \times, \frac, \( - which is not a legal JSON escape, so the whole reply
    // fails to parse. Those backslashes are doubled and the maths survives.
    //
    // \t and \f are legal JSON escapes AND the start of \times and \frac, so
    // the next characters decide: a run of two or more letters is a LaTeX
    // command, a lone escape character is JSON's own.
    const slash = String.fromCharCode(92)
    const jsonEscapes = ['"', slash, '/', 'b', 'f', 'n', 'r', 't', 'u']
    const isLetter = (ch) => !!ch && ch >= 'a' && ch <= 'z' || !!ch && ch >= 'A' && ch <= 'Z'
    let out = ''
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch !== slash) { out += ch; continue }
      const next = text[i + 1]
      const latexCommand = isLetter(next) && isLetter(text[i + 2])
      if (!latexCommand && jsonEscapes.includes(next)) out += ch
      else out += slash + slash
    }
    return JSON.parse(out)
  }
}

export default parseJsonLoose
