/**
 * Getting a readable extract out of a Project Gutenberg plain-text book.
 *
 * Gutenberg is the whole reason the fiction and essay slots are legal: 70,000
 * public-domain works, chapter structure intact, free to copy and to serve.
 * What it is not is tidy. Every file carries a licence header and footer, a
 * transcriber's note, and chapter headings in whichever of six styles the
 * volunteer who typed it up preferred.
 *
 * The plan had the essay slot coming from The Conversation under CC BY-ND.
 * It does not, and the reason is the ND: no derivative works. Republishing an
 * article whole and attributed is fine, but their writing is pitched at adults,
 * so most of it fails the Y6 grade gate - and trimming or simplifying it to
 * pass is exactly the derivative the licence forbids. Public-domain essayists
 * can be extracted from freely, which is what the gate needs in order to mean
 * anything.
 *
 * Everything here is pure text work: no network, no model, no credentials.
 */

const { wordCount, fkGrade, passageFitsBand, BANDS } = require('./questLogic')

/**
 * The book itself, without Gutenberg's own wrapper.
 *
 * The markers have changed form over the years - "*** START OF THIS PROJECT
 * GUTENBERG EBOOK ***", "*** START OF THE PROJECT GUTENBERG EBOOK TITLE ***"
 * and a bare "*END*THE SMALL PRINT" in the oldest files - so the match is
 * loose on purpose. Where no marker is found the text is returned whole, which
 * is wrong but harmless: the licence prose then shows up as a candidate
 * extract and gets rejected by the grade gate like anything else.
 */
function stripGutenbergBoilerplate(raw) {
  let text = String(raw || '').replace(/\r\n/g, '\n')

  const start = text.search(/\*\*\*\s*START OF (?:THE|THIS)[^\n]*\*\*\*/i)
  if (start !== -1) {
    const nl = text.indexOf('\n', start)
    text = text.slice(nl === -1 ? start : nl + 1)
  }
  const end = text.search(/\*\*\*\s*END OF (?:THE|THIS)[^\n]*\*\*\*/i)
  if (end !== -1) text = text.slice(0, end)

  // A transcriber's note sits after the start marker and is not the book.
  text = text.replace(/^\s*\[?Transcriber['’]s Note[\s\S]{0,2000}?\]\s*\n/i, '')

  return text.trim()
}

/**
 * Chapter headings, in the styles Gutenberg volunteers actually used.
 *
 * The period is optional throughout, because it is usually absent: Treasure
 * Island heads its chapters with a bare "I" on a line of its own and puts the
 * title on the next line. An earlier version of this file required the period
 * and found one chapter in a book that has thirty-four.
 */
const TITLED_HEADINGS = [
  /^\s*((?:CHAPTER|ADVENTURE|BOOK|LETTER|STORY|TALE|ESSAY|SECTION|CANTO|ACT)\s+[IVXLCDM\d]+\.?(?:\s+.{0,80})?)\s*$/i,
  // "I. A SCANDAL IN BOHEMIA" - the numeral and the title on one line, which
  // is how the Holmes stories are headed.
  /^\s*((?:[IVXLCDM]{1,7}|\d{1,3})\.\s+\S.{0,70})\s*$/,
]

/**
 * Headings that are a numeral and nothing else.
 *
 * Kept as a second tier because they are also how a single story divides
 * itself internally. The Holmes collection numbers its twelve stories *and*
 * the three parts within each, so reading both tiers at once produced four
 * sections, the last of them 93,000 words long. A titled heading, where the
 * book has them, is always the better split.
 */
/**
 * Part headings: real, but coarse.
 *
 * Treasure Island is in six parts and thirty-four chapters. Splitting it at
 * the parts gives sections of fifteen thousand words, which is not a reading
 * extract, so where a book offers both the finer split wins.
 */
const PART_HEADINGS = [
  /^\s*(PART\s+(?:[IVXLCDM\d]+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE)\b.{0,80})\s*$/i,
]

const BARE_HEADINGS = [
  /^\s*([IVXLCDM]{1,7})\.?\s*$/,
  /^\s*(\d{1,3})\.?\s*$/,
]

/** A heading's own words are not the chapter; the shortest body worth having. */
const MIN_CHAPTER_WORDS = 150

/**
 * The book split at its chapter headings.
 *
 * Returns [{ heading, body }]. Where nothing looks like a heading - which is
 * most essay collections - the whole text comes back as one unnamed section
 * and the caller falls through to chunking it by paragraph.
 *
 * Two things make this harder than it looks. A bare numeral heading carries
 * its title on the following line, so that line is taken as part of the
 * heading rather than the first words of the chapter. And the table of
 * contents at the front of the book is a list of lines that look exactly like
 * headings - which is why a section shorter than MIN_CHAPTER_WORDS is dropped
 * rather than offered as a chapter.
 */
/**
 * A line from the table of contents, which looks exactly like a heading.
 *
 * Treasure Island lists its chapters as "XXXIV.  AND LAST . . . . . . . 283",
 * which matches the strongest heading pattern there is. Reading the contents
 * as headings gave thirty-four sections of nothing followed by one section
 * holding the entire novel.
 */
function looksLikeContents(line) {
  if (/\.\s*\.\s*\./.test(line)) return true          // dot leaders
  if (/\s{3,}\d{1,4}\s*$/.test(line)) return true       // a page number
  return false
}

function splitIntoChapters(text) {
  const lines = String(text || '').split('\n')

  const scan = (patterns) => {
    const found = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.length > 90 || !line.trim()) continue
      if (looksLikeContents(line)) continue
      for (const pattern of patterns) {
        const m = pattern.exec(line)
        if (m) { found.push({ i, bodyFrom: i + 1, heading: m[1].trim() }); break }
      }
    }
    return found
  }

  // A numeral alone is not a chapter title. Where the next non-blank line is
  // short and is followed by a blank, it is the title and belongs with it.
  const withTitles = (marks) => marks.map((mark) => {
    if (!/^(?:[IVXLCDM]{1,7}|\d{1,3})\.?$/i.test(mark.heading)) return mark
    let j = mark.i + 1
    while (j < lines.length && !lines[j].trim()) j++
    const candidate = (lines[j] || '').trim()
    const after = (lines[j + 1] || '').trim()
    if (candidate && candidate.length <= 80 && !after) {
      return { ...mark, heading: `${mark.heading}. ${candidate}`, bodyFrom: j + 1 }
    }
    return mark
  })

  /**
   * Marks turned into sections, keeping only those with a chapter's worth of
   * text under them.
   *
   * The filter is what distinguishes a heading from a line in the table of
   * contents, and it is applied before the tiers are compared rather than
   * after. A contents list produces thirty marks with nothing under them and
   * one with the whole book under it: counted raw that is thirty-one headings
   * and the strongest tier wins on a false count, which is how Treasure
   * Island came out as a single 69,000-word section.
   */
  const build = (raw) => {
    const marks = withTitles(raw)
    const out = []
    for (let k = 0; k < marks.length; k++) {
      const to = k + 1 < marks.length ? marks[k + 1].i : lines.length
      const body = lines.slice(marks[k].bodyFrom, to).join('\n').trim()
      if (body && wordCount(body) >= MIN_CHAPTER_WORDS) out.push({ heading: marks[k].heading, body })
    }
    return out
  }

  // A titled heading is the best split there is. Failing that, take whichever
  // of parts and bare numerals divides the book more finely - which for a
  // novel headed with bare numerals inside six parts means the chapters.
  let sections = build(scan(TITLED_HEADINGS))
  if (sections.length < 3) {
    const parts = build(scan(PART_HEADINGS))
    const bare = build(scan(BARE_HEADINGS))
    sections = bare.length >= parts.length ? bare : parts
  }
  if (sections.length < 3) return [{ heading: '', body: String(text || '').trim() }]
  return sections
}

/** Paragraphs, as blank-line-separated blocks of a Gutenberg text file. */
function paragraphsOf(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
}

/**
 * A run of whole paragraphs of about `target` words, starting at `from`.
 *
 * Whole paragraphs because an extract that begins mid-sentence reads as a
 * mistake, and a comprehension question about a half-sentence is unanswerable.
 * Returns null when there is not enough text left to reach the floor.
 */
function runFrom(paragraphs, from, target, floor) {
  const taken = []
  let count = 0
  for (let i = from; i < paragraphs.length; i++) {
    taken.push(paragraphs[i])
    count += wordCount(paragraphs[i])
    if (count >= target) break
  }
  if (count < floor) return null
  return { paragraphs: taken, words: count, nextIndex: from + taken.length }
}

/** HTML, the way the reading page wants it. */
function asHtml(paragraphs) {
  const escape = (t) => String(t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return paragraphs.map((p) => `<p>${escape(p)}</p>`).join('')
}

/**
 * The best extract this book can offer for a band, or null.
 *
 * Walks the chapters, and within a long chapter walks forward through it,
 * measuring each candidate run and keeping the first that fits the band
 * outright. If nothing fits, the closest near-miss is returned alongside the
 * reason, so a night that finds nothing can say what it was looking at rather
 * than only that it failed.
 *
 * Deliberately returns the *first* fit rather than the best: these are fixed
 * texts, so the best fit is the same extract every time the book comes up, and
 * the dedup key would then retire a whole novel after one use.
 */
function pickExtract(bookText, band, options) {
  const opts = options || {}
  const spec = BANDS[band]
  if (!spec) return { extract: null, reason: `unknown band ${band}` }

  const used = opts.usedChapters instanceof Set ? opts.usedChapters : new Set()
  const target = Math.round((spec.minWords + spec.maxWords) / 2)
  const chapters = splitIntoChapters(stripGutenbergBoilerplate(bookText))

  let nearest = null
  for (const chapter of chapters) {
    if (used.has(chapter.heading)) continue
    const paras = paragraphsOf(chapter.body)
    if (!paras.length) continue

    // Step through a long chapter in runs, so a 9,000-word chapter offers
    // several extracts rather than one unusable block.
    // Up to a dozen attempts spread through the section: a book that is one
    // undivided section is otherwise judged on four samples of itself.
    const step = Math.max(1, Math.floor(paras.length / 12))
    for (let start = 0; start < paras.length; start += step) {
      const run = runFrom(paras, start, target, spec.minWords)
      if (!run) break
      const html = asHtml(run.paragraphs)
      const misfit = passageFitsBand(html, band)
      if (!misfit) {
        return {
          extract: {
            html,
            words: run.words,
            fk: fkGrade(html),
            chapter: chapter.heading || `from paragraph ${start + 1}`,
          },
          reason: null,
        }
      }
      if (!nearest) nearest = { chapter: chapter.heading, misfit, words: run.words }
    }
  }

  return {
    extract: null,
    reason: nearest
      ? `nothing fit ${band}; closest was ${nearest.chapter || 'an unnamed section'} (${nearest.misfit})`
      : `nothing fit ${band}; no section held enough text`,
  }
}

module.exports = {
  stripGutenbergBoilerplate,
  splitIntoChapters,
  paragraphsOf,
  runFrom,
  asHtml,
  pickExtract,
}
