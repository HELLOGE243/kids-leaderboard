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
const DRAG_GAP = /(removed|gap|missing sentence|fits? (in|each)|replaces?|summari[sz]es? each paragraph|paragraph summary)/i

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

  if (allLetters(q) && answerTexts(q).length >= 5 && DRAG_INSTRUCTION.test(text) && DRAG_GAP.test(text)) {
    return DRAG_SUMMARY.test(text) ? 'drag-summary' : 'drag-sentence'
  }
  return 'multiple-choice'
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
  `Which(?:\\s|&nbsp;|<[^>]+>)+(?:sentence|paragraph(?:\\s|&nbsp;|<[^>]+>)+summary|summary|option)${INLINE}{0,80}?(?:replaces?|represents?|fits?|fills?)${INLINE}{0,80}\\??`,
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
  body = body.replace(DRAG_ITEM_LINE, '')
  const { html: passage, image } = takeFirstImage(body)

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
  const extracts = (ordered[0].q.multiDescriptions || []).filter((d) => htmlToText(d.description))
  const flags = []
  const matchQuestions = ordered.map((p, i) => {
    const question = cleanItem(items[i]) || htmlToText(p.q.description)
    return { question, correctExtract: correctIndex(p.q) }
  })
  if (matchQuestions.some((m) => m.correctExtract < 0)) flags.push('An item has no correct extract marked in CleverSpace.')
  if (matchQuestions.some((m) => !m.question)) flags.push('Could not separate an item question from the shared instructions.')
  return {
    type: 'multi-matching',
    text: ((prefix || '') + (suffix || '')).trim(),
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

/**
 * The shared material a composite part carries: its extracts (matching) or its
 * passage (drag). Parts of one item repeat it, sometimes with small edits.
 */
function sharedMaterial(kind, q) {
  if (kind === 'multi-matching') return (q.multiDescriptions || []).map((d) => d.description || '').join(' ')
  return q.description || ''
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
  if (range) return next.meta.itemNo >= range[0] && next.meta.itemNo <= range[1]
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
  let i = 0
  while (i < parts.length) {
    const p = parts[i]
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
