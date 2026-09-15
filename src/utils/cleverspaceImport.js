// =============================================================
// CleverSpace -> EduPortal question classifier
//
// CleverSpace stores almost everything as single-select questions, one per
// numbered item. Composite item types are spread across several of them:
//
//   Drag Sentences   "Six sentences have been removed ... (A - G) ... gap (27-32)"
//                    -> 6 questions (one per gap), answers are the letters A-G,
//                       all sharing one passage. The A-G sentences themselves
//                       are an IMAGE inside the passage.
//   Drag Summaries   "... best summarises each paragraph ..." - same shape.
//   Multi Matching   4 extracts + "Which speaker...?" items answered A-D.
//   Multi Extracts   extracts + an ordinary MCQ with written options.
//   Free Write       answersType FREE_WRITE.
//
// This module is pure (no DOM, no network) so it can be tested against real
// exports. It classifies each question, groups the parts of composite items
// back into one platform question, and flags anything that needs a human or an
// image read (the drag option list).
// =============================================================

const LETTERS = 'ABCDEFGH'

/** Minimal HTML -> text for matching and signatures (not for display). */
export function htmlToText(html) {
  return String(html || '')
    .replace(/data:image\/[^"')\s]+/g, '')
    .replace(/<(br|p|div|li|tr|h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

/** "Y3Reading_T4W3_ClassTestQ32" -> { quizKey, number: 3200 }; Q12(b) -> 1202. */
export function parseTitle(title) {
  const m = String(title || '').match(/^(.+?)Q(\d+)(?:\(([a-z])\))?$/)
  if (!m) return null
  const base = parseInt(m[2], 10)
  return { quizKey: m[1], itemNo: base, number: m[3] ? base * 100 + (m[3].charCodeAt(0) - 96) : base * 100 }
}

const answerTexts = (q) => (q.answers || []).map((a) => String(a.text || '').trim())
const correctIndex = (q) => (q.answers || []).findIndex((a) => a.isCorrect)
const allLetters = (q) => {
  const t = answerTexts(q)
  return t.length > 0 && t.every((x, i) => x === LETTERS[i])
}

const DRAG_INSTRUCTION = /(sentences?|summar\w*|options?)\b[\s\S]{0,120}?\(\s*A\s*[–—-]\s*[E-H]\s*\)/i
const DRAG_SUMMARY = /summari[sz]/i
const DRAG_GAP = /(removed|gap|missing sentence|fits?\s+(in|each|\d)|best fits|replaces?|summari[sz]es? each paragraph|paragraph summary)/i

/**
 * @returns {'free-writing'|'drag-sentence'|'drag-summary'|'multi-matching'|'multi-description'|'multiple-choice'}
 * Composite kinds ('drag-*', 'multi-matching') are per-part here; groupQuizSet
 * merges the parts.
 */
export function classify(q) {
  const text = htmlToText(q.description)
  if (q.answersType === 'FREE_WRITE' || /^Writing\b/i.test(q.subcategory || '')) return 'free-writing'

  const extracts = (q.multiDescriptions || []).filter((d) => htmlToText(d.description))
  if (extracts.length >= 2 && allLetters(q) && answerTexts(q).length <= extracts.length + 1) {
    return 'multi-matching'
  }
  if (extracts.length >= 1 && !allLetters(q)) return 'multi-description'

  // Drag: bare letters A-G (5+) as answers, the lettered options shown as an
  // image (or described as "(A - G)"), and a numbered gap to fill.
  const hasImage = /<img\b/i.test(q.description || '')
  if (allLetters(q) && answerTexts(q).length >= 5 && (hasImage || DRAG_INSTRUCTION.test(text)) && DRAG_GAP.test(text)) {
    // "Six sentences have been removed" is a sentence drag even when the per-gap
    // line was written "Which best summarises for 23…?".
    if (/sentences?\s+(?:have|has)\s+been\s+removed/i.test(text)) return 'drag-sentence'
    return DRAG_SUMMARY.test(text) ? 'drag-summary' : 'drag-sentence'
  }
  // Matching with the texts pasted into the description instead of the extract
  // fields: bare letters A-E as answers and sections headed A, B, C...
  if (allLetters(q) && answerTexts(q).length >= 2 && answerTexts(q).length <= 6 && !hasImage) {
    const body = splitAtDivider(q.description)?.passage || q.description
    if (splitLetteredSections(body, answerTexts(q).length)) return 'multi-matching'
  }
  return 'multiple-choice'
}

/**
 * Texts headed "A", "B", "C"... (a line that is just the letter, or a paragraph
 * starting "A When Jamie..."). Returns { intro, sections: [{title, content}] }
 * when every letter up to `count` is found in order, else null.
 */
export function splitLetteredSections(html, count) {
  const blocks = htmlBlocks(html)
  const starts = []
  let from = 0
  for (let k = 0; k < count; k++) {
    const L = LETTERS[k]
    const re = new RegExp(`^(?:Text\\s+|Extract\\s+|Section\\s+)?${L}(?:[.):]?\\s*$|[.):]?\\s+[A-Z“"'‘])`)
    let found = -1
    for (let b = from; b < blocks.length; b++) if (re.test(htmlToText(blocks[b]))) { found = b; break }
    if (found === -1) return null
    starts.push(found)
    from = found + 1
  }
  // Stop at the item's own question line ("____ / Which musician...?").
  let end = blocks.length
  for (let b = starts[count - 1] + 1; b < blocks.length; b++) {
    if (/^_{8,}$/.test(htmlToText(blocks[b]).trim())) { end = b; break }
  }
  const sections = starts.map((s, k) => {
    const next = k + 1 < count ? starts[k + 1] : end
    const own = htmlToText(blocks[s]).trim()
    // A heading line that is only the letter isn't content.
    const first = own.replace(/^(?:Text\s+|Extract\s+|Section\s+)?[A-H][.):]?$/, '') ? blocks[s].replace(new RegExp(`(>|^)(\\s|&nbsp;)*(?:<[^>]+>)*(\\s|&nbsp;)*${LETTERS[k]}[.):]?(?:<\\/[^>]+>)*(\\s|&nbsp;)+`), '$1') : ''
    const content = trimBlocks(first + blocks.slice(s + 1, next).join(''))
    return { title: LETTERS[k], content }
  })
  if (sections.some((sec) => htmlToText(sec.content).length < 40)) return null
  return { intro: trimBlocks(blocks.slice(0, starts[0]).join('')), sections, tail: blocks.slice(end).join('') }
}

/** Which gap/paragraph number a drag part refers to ("replaces 32", "represents 28"). */
export function dragGapNumber(q, fallback) {
  const text = htmlToText(q.description)
  const m = text.match(/(?:replaces?|represents?|fits?|for|summari[sz]es?)\s+(?:gap\s+|paragraph\s+)?(\d{1,3})\b/i)
  if (m) return parseInt(m[1], 10)
  return fallback
}

function commonPrefix(strings) {
  if (!strings.length) return ''
  let p = strings[0]
  for (const s of strings) {
    let i = 0
    while (i < p.length && i < s.length && p[i] === s[i]) i++
    p = p.slice(0, i)
  }
  return p
}

function commonSuffix(strings) {
  return [...commonPrefix(strings.map((s) => [...s].reverse().join('')))].reverse().join('')
}

/** Pulls the first embedded image out of HTML: { html without it, image data URI }. */
export function takeFirstImage(html) {
  const m = String(html || '').match(/<img\b[^>]*\bsrc=["'](data:image\/[^"']+)["'][^>]*>/i)
  if (!m) return { html, image: null }
  return { html: html.replace(m[0], ''), image: m[1] }
}

/**
 * Splits several parts' HTML into the shared body and each part's own item
 * text, using the longest common prefix/suffix. Composite items repeat the
 * same passage in every part and differ only in the item line.
 */
function splitShared(htmls) {
  if (htmls.length === 1) return { shared: htmls[0], prefix: htmls[0], suffix: '', items: [''] }
  let pre = commonPrefix(htmls)
  // Don't cut through a tag or a word/number ("replaces 2" | "7" / "8").
  const lt = pre.lastIndexOf('<')
  if (lt > pre.lastIndexOf('>')) pre = pre.slice(0, lt)
  pre = pre.replace(/[0-9A-Za-z]+$/, '')
  const rest = htmls.map((h) => h.slice(pre.length))
  let suf = commonSuffix(rest)
  const gt = suf.indexOf('>')
  if (gt !== -1 && (suf.indexOf('<') === -1 || gt < suf.indexOf('<'))) suf = suf.slice(gt + 1)
  suf = suf.replace(/^[0-9A-Za-z]+/, '')
  const items = rest.map((r) => (suf ? r.slice(0, r.length - suf.length) : r))
  return { shared: pre + '<span data-item-slot></span>' + suf, prefix: pre, suffix: suf, items }
}

const cleanItem = (html) => htmlToText(html).replace(/^[\s.…:?]+|[\s.…]+$/g, '').trim()

// A matching item's own question is its last line (usually ending "?"). The
// shared prefix can stop mid-heading, leaving "Energy.\nFor questions 29-38..."
// in front of it, so keep only that final question line.
function itemQuestion(html) {
  const lines = htmlToText(html).split('\n').map((l) => l.trim()).filter(Boolean)
  const q = [...lines].reverse().find((l) => /\?\s*$/.test(l)) || lines[lines.length - 1] || ''
  return q.replace(/^[\s.…:]+|[\s.…]+$/g, '').trim()
}

// The per-gap question line that each drag part carries ("Which sentence best
// replaces 32.........?"). It belongs to the individual CleverSpace item, not
// to the merged passage.
// Tags and entities can sit inside the line, so step over <...> as well as text.
// The gap number and dots are often already split off with the item, leaving a
// stub ("Which sentence best replaces </p>"), so the line ends at either a "?"
// or the end of its block. Inline tags (<strong>) are stepped over; block tags
// (</p>, <h3>, <figure>) are not, so the passage itself is never consumed.
const INLINE = '(?:<(?!\\/?(?:p|h\\d|div|figure|table|ul|ol|li)\\b)[^>]+>|&nbsp;|[^<?\\n])'
const DRAG_ITEM_LINE = new RegExp(
  `Which(?:\\s|&nbsp;|<[^>]+>)+(?:sentence|paragraph(?:(?:\\s|&nbsp;|<[^>]+>)+summary)?|summary|option|answer)${INLINE}{0,80}?(?:replaces?|represents?|fits?|fills?)${INLINE}{0,80}\\??`,
  'gi',
)

/** Declared item range from the instructions: "For questions 31 - 40", "each gap (27 - 32)". */
export function declaredRange(q) {
  const text = htmlToText(q.description)
  const m = text.match(/(?:questions?|gaps?|paragraphs?)\s*\(?\s*(\d{1,3})\s*[–—-]\s*(\d{1,3})/i)
  if (!m) return null
  const a = parseInt(m[1], 10)
  const b = parseInt(m[2], 10)
  return a <= b && b - a < 30 ? [a, b] : null
}

function wordSet(s) {
  return new Set(htmlToText(s).toLowerCase().match(/[a-z]{3,}/g) || [])
}

function similarity(a, b) {
  const A = wordSet(a)
  const B = wordSet(b)
  if (!A.size && !B.size) return 1
  let inter = 0
  for (const w of A) if (B.has(w)) inter++
  return inter / (A.size + B.size - inter)
}

function buildDrag(kind, parts) {
  const ordered = [...parts].sort((a, b) => a.meta.number - b.meta.number)
  const { prefix, suffix, items } = splitShared(ordered.map((p) => p.q.description || ''))
  // Instruction + passage without the per-gap "Which sentence best replaces 32...?" line.
  let body = (prefix || '') + (suffix || '')
  if (!prefix && !suffix) body = ordered[0].q.description || ''
  body = trimBlocks(body.replace(DRAG_ITEM_LINE, '').replace(DIVIDER, ''))
  let { html: passage, image } = takeFirstImage(body)
  // With a divider, the first item's own passage is exact; the shared-text
  // split can lose the start when items differ in their opening line.
  const div = splitAtDivider(ordered[0].q.description)
  if (div) {
    const fromLead = takeFirstImage(div.lead)
    const fromPassage = takeFirstImage(div.passage)
    image = fromLead.image || fromPassage.image || image
    passage = trimBlocks(fromLead.image ? div.passage : fromPassage.html)
    const instructions = htmlBlocks(fromLead.html).filter((b) => hasText(b) && !new RegExp(DRAG_ITEM_LINE.source, 'i').test(b))
    passage = instructions.join('') + passage
  }

  const gaps = ordered.map((p, i) => dragGapNumber(p.q, ordered[0].meta.itemNo + i))
  const correctOrder = ordered.map((p) => correctIndex(p.q))
  const optionCount = Math.max(...ordered.map((p) => answerTexts(p.q).length))

  const flags = []
  if (ordered.length < 3) flags.push(`Only ${ordered.length} gap(s) found for this passage - check for missing or mis-numbered items.`)
  if (!image) flags.push('Option list image not found - enter the sentences manually.')
  if (correctOrder.some((c) => c < 0)) flags.push('A gap has no correct answer marked in CleverSpace.')
  if (new Set(correctOrder).size !== correctOrder.length) flags.push('Two gaps share the same correct letter - check the answer key.')

  return {
    type: kind,
    dragType: kind === 'drag-summary' ? 'summary' : 'sentence',
    text: passage,
    prompt: '',
    // Filled from the option image by the review step (Claude vision).
    summaryOptions: Array.from({ length: optionCount }, (_, i) => LETTERS[i]),
    correctOrder,
    gapNumbers: gaps,
    optionsImage: image,
    needsOptionText: !!image,
    videoUrl: ordered.map((p) => p.q.solutionVideo).find(Boolean) || '',
    source: { items: ordered.map((p) => p.meta.itemNo), itemLines: items.map(cleanItem) },
    flags,
    number: ordered[0].meta.number,
  }
}

function buildMatching(parts) {
  const ordered = [...parts].sort((a, b) => a.meta.number - b.meta.number)
  const { prefix, suffix, items } = splitShared(ordered.map((p) => p.q.description || ''))
  let extracts = (ordered[0].q.multiDescriptions || []).filter((d) => htmlToText(d.description))
  let intro = ((prefix || '') + (suffix || '')).trim()
  const flags = []
  let inline = null
  if (!extracts.length) {
    // Texts pasted into the description, headed A, B, C...
    const div = splitAtDivider(ordered[0].q.description)
    inline = splitLetteredSections(div?.passage || ordered[0].q.description, answerTexts(ordered[0].q).length)
    if (inline) {
      extracts = inline.sections.map((s) => ({ title: s.title, description: s.content }))
      intro = trimBlocks((div ? '' : inline.intro) || '')
      if (div) intro = trimBlocks(splitLead(div.lead).instructions + inline.intro)
    }
  }
  const matchQuestions = ordered.map((p, i) => {
    let question = itemQuestion(items[i]) || itemQuestion(p.q.description)
    if (inline) {
      // Question sits in the lead (before the divider) or after the texts.
      const div = splitAtDivider(p.q.description)
      const own = div ? htmlToText(splitLead(div.lead).question) : ''
      const tail = splitLetteredSections(div?.passage || p.q.description, answerTexts(p.q).length)?.tail
      question = own || htmlToText(tail || '').replace(/_{3,}/g, ' ').replace(/[….]{2,}/g, ' ').replace(/\s+/g, ' ').trim() || question
    }
    return { question, correctExtract: correctIndex(p.q) }
  })
  if (ordered.length < 3) flags.push(`Only ${ordered.length} matching item(s) found - the export may be missing the rest of this section.`)
  if (matchQuestions.some((m) => m.correctExtract < 0)) flags.push('An item has no correct extract marked in CleverSpace.')
  if (matchQuestions.some((m) => !m.question)) flags.push('Could not separate an item question from the shared instructions.')
  return {
    type: 'multi-matching',
    text: intro,
    prompt: '',
    descriptions: extracts.map((d, i) => ({ title: String(d.title || LETTERS[i]).trim(), content: d.description || '' })),
    matchQuestions,
    videoUrl: ordered.map((p) => p.q.solutionVideo).find(Boolean) || '',
    source: { items: ordered.map((p) => p.meta.itemNo) },
    flags,
    number: ordered[0].meta.number,
  }
}

function buildSingle(kind, part) {
  const q = part.q
  const flags = []
  const base = {
    text: q.description || '',
    prompt: '',
    videoUrl: q.solutionVideo || '',
    source: { items: [part.meta.itemNo] },
    number: part.meta.number,
    flags,
  }
  if (kind === 'free-writing') return { ...base, type: 'free-writing' }
  const options = answerTexts(q)
  const ci = correctIndex(q)
  if (ci < 0) flags.push('No correct answer marked in CleverSpace.')
  if ((q.answers || []).filter((a) => a.isCorrect).length > 1) flags.push('CleverSpace marks more than one correct answer; only the first is kept.')
  if (kind === 'multi-description') {
    return {
      ...base,
      type: 'multi-description',
      options,
      correctIndex: Math.max(0, ci),
      descriptions: (q.multiDescriptions || []).map((d, i) => ({ title: String(d.title || LETTERS[i]).trim(), content: d.description || '' })),
    }
  }
  return { ...base, type: 'multiple-choice', options, correctIndex: Math.max(0, ci) }
}

// =============================================================
// Passages pasted inside single questions
//
// Most reading tests don't use CleverSpace's extract fields. Each item's
// description holds the instructions, its own question and then the whole
// passage, usually separated by a "---------------------" line:
//
//   Read the extract below...  /  Ted's tone ... is  /  -----  /  <passage>
//   Choose the word...  /  Which word best replaces 9?  /  -----  /  <cloze text>
//
// Some tests have no divider; then consecutive items repeat the same passage
// and differ only in the question line, so the shared text is the passage.
// Anything that still can't be split is marked for Claude to read.
// =============================================================

const DIVIDER = /<(p|h\d)[^>]*>(?:\s|&nbsp;|<\/?(?:strong|b|em|span|u)[^>]*>)*-{8,}(?:\s|&nbsp;|<\/?(?:strong|b|em|span|u)[^>]*>)*<\/\1>/i
const BLOCK_END = /(<\/(?:p|h\d|div|ul|ol|table|figure|blockquote)>|<br\s*\/?>)/i
const CLOZE_LEAD = /\b(fill|blank|gap|replaces?|missing word|most appropriate word)\b/i
// "(9)________", "9<strong> ______</strong>", "(10) ____"
// "7_</strong>_____" too: underscores may be broken up by formatting tags.
const BLANK = /(<(?:strong|b|u|em)>(?:\s|&nbsp;)*)?\(?\s*(\d{1,3})\s*\)?(?:\s|&nbsp;|<\/?(?:strong|b|u|em)>|_)*?_{3,}(?:_|<\/(?:strong|b|u|em)>)*/g
const LONG_PASSAGE = 600

/** Splits HTML into top-level blocks (paragraphs, headings...), keeping the markup. */
function htmlBlocks(html) {
  const parts = String(html || '').split(BLOCK_END)
  const out = []
  for (let i = 0; i < parts.length; i += 2) {
    const b = (parts[i] || '') + (parts[i + 1] || '')
    if (b) out.push(b)
  }
  return out
}

const hasText = (html) => htmlToText(html).replace(/-{3,}/g, '').trim().length > 0 || /<img\b/i.test(html)
const trimBlocks = (html) => {
  const b = htmlBlocks(html)
  while (b.length && !hasText(b[0])) b.shift()
  while (b.length && !hasText(b[b.length - 1])) b.pop()
  return b.join('')
}

/** Lead (instructions + question) -> { instructions, question } as HTML. */
function splitLead(leadHtml) {
  const blocks = htmlBlocks(leadHtml).filter(hasText)
  if (!blocks.length) return { instructions: '', question: '' }
  // The question is the last line that asks something; otherwise the last line.
  let qi = -1
  for (let i = blocks.length - 1; i >= 0; i--) if (/\?\s*$/.test(htmlToText(blocks[i]))) { qi = i; break }
  if (qi === -1) qi = blocks.length - 1
  return { instructions: blocks.filter((_, i) => i !== qi).join(''), question: blocks.slice(qi).join('') }
}

/** { lead, passage } when the description has a divider line, else null. */
export function splitAtDivider(html) {
  const m = String(html || '').match(DIVIDER)
  if (!m) return null
  const before = trimBlocks(html.slice(0, m.index))
  const after = trimBlocks(html.slice(m.index + m[0].length))
  // Usually question first, passage after; accept the reverse too.
  const [lead, passage] = htmlToText(after).length >= htmlToText(before).length ? [before, after] : [after, before]
  if (htmlToText(passage).length < 150) return null
  return { lead, passage }
}

/**
 * Splits at a passage found by Claude: `passageStart` is the passage's first
 * few words. Returns { lead, passage } or null if they can't be located.
 */
export function splitAtPassageStart(html, passageStart) {
  const words = htmlToText(passageStart).toLowerCase().match(/[a-z0-9’']+/g) || []
  if (words.length < 2) return null
  const blocks = htmlBlocks(html)
  const needle = words.slice(0, 6).join(' ')
  const at = blocks.findIndex((b) => (htmlToText(b).toLowerCase().match(/[a-z0-9’']+/g) || []).join(' ').includes(needle))
  if (at <= 0) return null
  return { lead: trimBlocks(blocks.slice(0, at).join('')), passage: trimBlocks(blocks.slice(at).join('')) }
}

/**
 * No divider: short opening lines ending with the question ("Which word fills
 * No10?") followed by a long passage. The lead ends at the last "?" among
 * those opening lines, so a short passage title after it stays with the passage.
 */
export function splitAtQuestionLine(html) {
  const blocks = htmlBlocks(html)
  let lastQ = -1
  for (let i = 0; i < blocks.length; i++) {
    const t = htmlToText(blocks[i])
    if (t.length >= 150) break
    if (/\?\s*$/.test(t)) lastQ = i
  }
  if (lastQ === -1) return null
  const passage = trimBlocks(blocks.slice(lastQ + 1).join(''))
  if (htmlToText(passage).length < 150) return null
  return { lead: trimBlocks(blocks.slice(0, lastQ + 1).join('')), passage }
}

const clozeBlankNumbers = (passage) => [...String(passage || '').matchAll(BLANK)].map((m) => parseInt(m[2], 10))
const isCloze = (lead, passage) => CLOZE_LEAD.test(htmlToText(lead)) && clozeBlankNumbers(passage).length > 0

/** The passage's heading (a short first line) for the extract tab, else "Extract". */
function passageTitle(passage) {
  const first = htmlToText(htmlBlocks(passage).find(hasText) || '')
  return first && first.length <= 60 && !/[.?!]$/.test(first) ? first : 'Extract'
}

/** One item with its passage split out -> a platform question. */
function extractQuestion(part, lead, passage, flags = []) {
  const q = part.q
  const { instructions, question } = splitLead(lead)
  const ci = correctIndex(q)
  const f = [...flags]
  if (ci < 0) f.push('No correct answer marked in CleverSpace.')
  if (!htmlToText(question)) f.push('Could not find this item\'s question line - check the prompt.')
  return {
    type: 'multi-description',
    text: instructions,
    prompt: question,
    descriptions: [{ title: passageTitle(passage), content: passage }],
    options: answerTexts(q),
    correctIndex: Math.max(0, ci),
    videoUrl: q.solutionVideo || '',
    source: { items: [part.meta.itemNo] },
    number: part.meta.number,
    flags: f,
  }
}

/**
 * Turns each gap marker that has a blank into "(N) ___" (the dropdown slot);
 * gaps without one stay as written. Also re-renders an already-built cloze
 * text, whose "(N) ___" markers match BLANK too.
 */
function renderCloze(passage, blankMap) {
  const blanks = []
  const missing = []
  const text = passage.replace(BLANK, (whole, _open, num) => {
    const n = parseInt(num, 10)
    if (!blankMap[n] || blanks.some((b) => b.gap === n)) { missing.push(n); return whole }
    blanks.push(blankMap[n])
    return `<strong>(${n})</strong> ___`
  })
  return { text, blanks, missing }
}

/**
 * A cloze passage split across export files arrives as two partial questions.
 * Merges `incoming` into `existing` when they share the passage.
 * @returns {boolean} whether it was merged
 */
export function mergeCloze(existing, incoming) {
  if (existing?.type !== 'dropdown-cloze' || incoming?.type !== 'dropdown-cloze') return false
  if (similarity(existing.text, incoming.text) < 0.6) return false
  const blankMap = {}
  for (const b of [...(incoming.blanks || []), ...(existing.blanks || [])]) if (b.gap != null) blankMap[b.gap] = b
  const { text, blanks, missing } = renderCloze(existing.text, blankMap)
  existing.text = text
  existing.blanks = blanks
  const others = (existing.reviewReason || '').replace(/No question found for gap\(s\)[^.]*\.[^.]*\./g, '').trim()
  const reason = [others, missing.length ? `No question found for gap(s) ${missing.join(', ')}.` : ''].filter(Boolean).join(' ')
  existing.needsReview = !!reason
  existing.reviewReason = reason
  existing.number = Math.min(existing.number ?? Infinity, incoming.number ?? Infinity)
  return true
}

/** Several "which word fills gap N" items sharing a passage -> one dropdown-cloze. */
function buildCloze(parts, lead, passage) {
  const ordered = [...parts].sort((a, b) => a.meta.number - b.meta.number)
  const flags = []
  const gaps = clozeBlankNumbers(passage)
  const used = new Set()
  const byGap = new Map()
  // Gap N is answered by item N, else by the item whose question names N.
  for (const n of gaps) {
    const p = ordered.find((x) => !used.has(x) && x.meta.itemNo === n)
      || ordered.find((x) => !used.has(x) && new RegExp(`(?:^|[^\\d])${n}(?:[^\\d]|$)`).test(htmlToText(splitAtDivider(x.q.description)?.lead || x.q.description).slice(-120)))
    if (p) { used.add(p); byGap.set(n, p) }
  }
  // Passages numbered 1-8 for items 9-16: pair what's left over in order.
  const missing = gaps.filter((n) => !byGap.has(n))
  const unused = ordered.filter((p) => !used.has(p))
  for (let k = 0; k < Math.min(missing.length, unused.length); k++) { byGap.set(missing[k], unused[k]); used.add(unused[k]) }

  const blankMap = {}
  for (const [n, p] of byGap) {
    const ci = correctIndex(p.q)
    if (ci < 0) flags.push(`Gap ${n} has no correct answer marked in CleverSpace.`)
    blankMap[n] = { options: answerTexts(p.q), correctIndex: Math.max(0, ci), gap: n }
  }
  const { text, blanks, missing: stillMissing } = renderCloze(passage, blankMap)
  if (stillMissing.length) flags.push(`No question found for gap(s) ${stillMissing.join(', ')} - those gaps are left as plain text; they may be in another export file.`)
  const extra = ordered.filter((p) => !used.has(p))
  if (extra.length) flags.push(`Item(s) ${extra.map((p) => p.meta.itemNo).join(', ')} did not match a gap in the passage.`)
  return {
    type: 'dropdown-cloze',
    text,
    prompt: '',
    instructions: splitLead(lead).instructions,
    blanks,
    videoUrl: ordered.map((p) => p.q.solutionVideo).find(Boolean) || '',
    source: { items: ordered.map((p) => p.meta.itemNo) },
    number: ordered[0].meta.number,
    flags,
  }
}

/**
 * Items without a divider that repeat one passage: the text they all share is
 * the passage; what differs is each item's question.
 * @returns {Array<{part, lead, passage}>|null}
 */
function splitSharedPassage(group) {
  if (group.length < 2) return null
  const htmls = group.map((p) => p.q.description || '')
  const { prefix, suffix, items } = splitShared(htmls)
  const passageSide = htmlToText(suffix).length >= htmlToText(prefix).length ? 'suffix' : 'prefix'
  const shared = passageSide === 'suffix' ? suffix : prefix
  // The shared side starts/ends mid-way through the question's own line; move
  // that partial line over to the question.
  const blocks = htmlBlocks(shared)
  let cut = 0
  if (passageSide === 'suffix') {
    while (cut < blocks.length && htmlToText(blocks[cut]).length < 80 && !hasPassageStart(blocks[cut])) cut++
    const passage = trimBlocks(blocks.slice(cut).join(''))
    if (htmlToText(passage).length < 150) return null
    const tail = blocks.slice(0, cut).join('')
    return group.map((part, i) => ({ part, lead: prefix + items[i] + tail, passage }))
  }
  let end = blocks.length
  while (end > 0 && htmlToText(blocks[end - 1]).length < 80) end--
  const passage = trimBlocks(blocks.slice(0, end).join(''))
  if (htmlToText(passage).length < 150) return null
  const head = blocks.slice(end).join('')
  return group.map((part, i) => ({ part, lead: head + items[i] + suffix, passage }))
}
const hasPassageStart = (block) => htmlToText(block).length >= 80

/**
 * Runs of plain multiple-choice items that carry a passage become extract
 * questions, or one dropdown-cloze per passage.
 */
function buildPassageItems(run, out) {
  let i = 0
  while (i < run.length) {
    const p = run[i]
    const div = splitAtDivider(p.q.description)
    const material = div ? div.passage : p.q.description
    const group = [p]
    let j = i + 1
    while (j < run.length) {
      const nd = splitAtDivider(run[j].q.description)
      if (!!nd !== !!div) break
      if (similarity(material, nd ? nd.passage : run[j].q.description) < 0.6) break
      group.push(run[j])
      j++
    }
    i = j

    let splits = null
    if (div) splits = group.map((part) => ({ part, ...splitAtDivider(part.q.description) }))
    else if (htmlToText(p.q.description).length >= LONG_PASSAGE) {
      const byLine = group.map((part) => ({ part, ...splitAtQuestionLine(part.q.description) }))
      splits = byLine.every((s) => s.passage) ? byLine : splitSharedPassage(group)
    }

    if (!splits) {
      for (const part of group) {
        const single = buildSingle('multiple-choice', part)
        // A long description that couldn't be split: let Claude find the passage.
        if (htmlToText(part.q.description).length >= LONG_PASSAGE) single.needsAiSplit = true
        out.push(single)
      }
      continue
    }
    const passage = splits[0].passage
    if (splits.every((s) => isCloze(s.lead, s.passage))) {
      out.push(buildCloze(group, splits[0].lead, passage))
    } else {
      for (const s of splits) out.push(extractQuestion(s.part, s.lead, s.passage))
    }
  }
}

/**
 * Applies Claude's reading of an unsplittable item (see needsAiSplit).
 * @param {object} pq the planned multiple-choice question (text = full description)
 * @param {{question: string, passageStart: string}} ai
 * @returns {object|null} the rebuilt question, or null if it can't be applied
 */
export function applyAiSplit(pq, ai) {
  const split = splitAtPassageStart(pq.text, ai?.passageStart)
  if (!split) return null
  const part = { q: { description: pq.text, answers: pq.options.map((text, i) => ({ text, isCorrect: i === pq.correctIndex })), solutionVideo: pq.videoUrl }, meta: { itemNo: Math.floor(pq.number / 100), number: pq.number } }
  if (isCloze(split.lead, split.passage)) return buildCloze([part], split.lead, split.passage)
  const built = extractQuestion(part, split.lead, split.passage, pq.flags)
  // Claude's question line is more reliable than guessing the last line.
  if (ai.question && !htmlToText(built.prompt).includes(ai.question.slice(0, 20))) built.prompt = `<p><strong>${ai.question.replace(/</g, '&lt;')}</strong></p>`
  return built
}

/**
 * The shared material a composite part carries: its extracts (matching) or its
 * passage (drag). Parts of one item repeat it, sometimes with small edits.
 */
function sharedMaterial(kind, q) {
  const md = (q.multiDescriptions || []).map((d) => d.description || '').join(' ')
  if (kind === 'multi-matching' && htmlToText(md)) return md
  return splitAtDivider(q.description)?.passage || q.description || ''
}

/**
 * Whether part `next` belongs to the same composite item as the group started
 * by `first`. The instructions usually declare the item range ("For questions
 * 31 - 40"), which is authoritative. Without one, fall back to the shared
 * passage/extracts being substantially the same - exact equality broke groups
 * apart whenever one item's copy of the passage had been edited slightly.
 */
function belongsToGroup(first, range, next) {
  if (next.kind !== first.kind) return false
  // A range that doesn't include the first item's own number was copied from
  // another test ("gap (15 – 20)" on items 23-28) - don't trust it.
  const rangeFits = range && first.meta.itemNo >= range[0] && first.meta.itemNo <= range[1]
  if (rangeFits) return next.meta.itemNo >= range[0] && next.meta.itemNo <= range[1]
  return similarity(sharedMaterial(first.kind, first.q), sharedMaterial(next.kind, next.q)) >= 0.6
}

/**
 * Converts one quiz set's CleverSpace questions into platform questions.
 * @param {Array} questions CleverSpace questions sharing a quiz key
 * @returns {Array} platform questions in order, each with `flags`
 */
export function groupQuizSet(questions) {
  const parts = questions
    .map((q) => ({ q, meta: parseTitle(q.title) || { quizKey: '', itemNo: 0, number: 0 }, kind: classify(q) }))
    .sort((a, b) => a.meta.number - b.meta.number)

  const out = []
  let run = []
  const flushRun = () => { if (run.length) buildPassageItems(run, out); run = [] }
  let i = 0
  while (i < parts.length) {
    const p = parts[i]
    if (p.kind === 'multiple-choice') { run.push(p); i++; continue }
    flushRun()
    if (p.kind === 'drag-sentence' || p.kind === 'drag-summary' || p.kind === 'multi-matching') {
      const range = declaredRange(p.q)
      const group = [p]
      const seenItems = new Set([p.meta.number])
      let j = i + 1
      while (j < parts.length && belongsToGroup(p, range, parts[j])) {
        // The same item exported twice would add a phantom gap/statement.
        if (!seenItems.has(parts[j].meta.number)) {
          group.push(parts[j])
          seenItems.add(parts[j].meta.number)
        }
        j++
      }
      out.push(p.kind === 'multi-matching' ? buildMatching(group) : buildDrag(p.kind, group))
      i = j
    } else {
      out.push(buildSingle(p.kind, p))
      i++
    }
  }
  flushRun()
  return out
}

/**
 * Full pipeline for an uploaded CleverSpace export.
 * @returns {{ sets: Array<{quizKey, questions, counts}>, unmatched: Array, totals: object }}
 */
export function planImport(questions) {
  const byKey = new Map()
  const unmatched = []
  for (const q of questions) {
    if (!q || !q.title) continue
    const meta = parseTitle(q.title)
    if (!meta) { unmatched.push(q); continue }
    if (!byKey.has(meta.quizKey)) byKey.set(meta.quizKey, [])
    byKey.get(meta.quizKey).push(q)
  }
  const totals = { sets: 0, sourceQuestions: questions.length, platformQuestions: 0, byType: {}, flagged: 0, needsOptionText: 0 }
  const sets = []
  for (const [quizKey, qs] of byKey) {
    // Duplicate uuids (same question exported twice) would double-count.
    const seen = new Set()
    const unique = qs.filter((q) => (q.uuid ? (seen.has(q.uuid) ? false : seen.add(q.uuid)) : true))
    const platform = groupQuizSet(unique)
    const counts = {}
    for (const pq of platform) {
      counts[pq.type] = (counts[pq.type] || 0) + 1
      totals.byType[pq.type] = (totals.byType[pq.type] || 0) + 1
      if (pq.flags.length) totals.flagged++
      if (pq.needsOptionText) totals.needsOptionText++
    }
    totals.platformQuestions += platform.length
    totals.sets++
    sets.push({ quizKey, questions: platform, counts })
  }
  return { sets, unmatched, totals }
}
