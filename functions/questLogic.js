/**
 * The parts of the daily reading quest that are decisions rather than calls.
 *
 * Everything here is pure: given a passage and some questions it says whether
 * they are fit to put in front of a child, and at which level. That means the
 * whole judgement half of the job can be tested on a laptop with no
 * credentials, no network and no cost - which is how the balance repair got
 * proven before it ever touched the database.
 *
 * It lives in functions/ rather than scripts/lib/ because the deployed job is
 * its main caller; the test harness reaches in from outside.
 */

/** Text as a reader meets it: no tags, no entities, single spaces. */
function stripHtml(html) {
  return String(html || '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&(?:#39|apos|rsquo|lsquo);/gi, "'")
    .replace(/&(?:quot|ldquo|rdquo);/gi, '"')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function words(text) {
  return stripHtml(text).split(/[^A-Za-z0-9'-]+/).filter((w) => /[A-Za-z0-9]/.test(w))
}

/**
 * Sentences, counted the way a reading-level formula needs them.
 *
 * An abbreviation is not the end of a sentence, and a passage of dialogue is
 * full of them. Counting "Mr. Holmes said so." as two sentences halves the
 * average sentence length and makes Conan Doyle look like a picture book.
 */
function sentences(text) {
  const flat = stripHtml(text)
    .replace(/\b(Mr|Mrs|Ms|Dr|St|Prof|Sgt|Capt|Lt|Rev|Hon|Jr|Sr|vs|etc|eg|ie|approx|No)\./gi, '$1')
    .replace(/\b([A-Z])\./g, '$1')
  const parts = flat.split(/[.!?]+(?=\s|$)/).map((s) => s.trim()).filter(Boolean)
  return parts.length || (words(text).length ? 1 : 0)
}

/**
 * Syllables in one word, by the vowel-group rule.
 *
 * Wrong on individual words - "fire" and "poem" both come out as one - but
 * the formula wants an average over several hundred words, where the errors
 * cancel. Anything cleverer needs a pronunciation dictionary, which is
 * megabytes to ship for a number used to make one yes-or-no decision.
 */
function syllablesIn(word) {
  const w = String(word).toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  if (w.length <= 3) return 1
  const trimmed = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '')
  const groups = trimmed.match(/[aeiouy]{1,2}/g)
  return Math.max(1, groups ? groups.length : 1)
}

/**
 * Flesch-Kincaid grade level: roughly the US school year that can read it.
 *
 * Crude by design. It cannot tell that a short sentence about mitosis is
 * harder than a long one about a dog, so it is used as a floor and not as a
 * judgement - it catches the Y9 paper that is really Y12 and leaves the rest
 * to a teacher's eye.
 */
function fkGrade(text) {
  const ws = words(text)
  const ss = sentences(text)
  if (!ws.length || !ss) return null
  const syl = ws.reduce((n, w) => n + syllablesIn(w), 0)
  const grade = 0.39 * (ws.length / ss) + 11.8 * (syl / ws.length) - 15.59
  return Math.round(grade * 10) / 10
}

function wordCount(text) {
  return words(text).length
}

/** A piece read at a child's pace, not an adult's. */
function readingMinutes(count) {
  return Math.max(1, Math.round(Number(count || 0) / 180))
}

/**
 * The two levels the quest is written for, and what each will accept.
 *
 * The word counts are ranges rather than targets: a chapter does not end
 * where a word budget does, and refusing a good extract for being forty words
 * long is how a night ends with nothing set.
 */
const BANDS = {
  y6: { fkMin: 5.0, fkMax: 7.9, minWords: 400, maxWords: 650 },
  y9: { fkMin: 8.0, fkMax: 11.5, minWords: 600, maxWords: 900 },
}

const GENRES = ['news', 'essay', 'fiction']

/** Which band a student reads, from their year group. */
function bandFromYearGroup(yearGroup) {
  const year = Number(String(yearGroup == null ? '' : yearGroup).replace(/[^0-9]/g, '')) || 0
  if (!year) return 'y6'
  return year >= 8 ? 'y9' : 'y6'
}

/**
 * Whether a passage belongs in a band, and if not, why not.
 *
 * Returns null when it fits, so a caller reads it as "no objection".
 */
function passageFitsBand(text, band) {
  const spec = BANDS[band]
  if (!spec) return `unknown band ${band}`
  const count = wordCount(text)
  if (count < spec.minWords) return `${count} words, short of ${spec.minWords}`
  if (count > spec.maxWords) return `${count} words, over ${spec.maxWords}`
  const fk = fkGrade(text)
  if (fk === null) return 'nothing readable in it'
  if (fk < spec.fkMin) return `reads at grade ${fk}, under ${spec.fkMin} for ${band}`
  if (fk > spec.fkMax) return `reads at grade ${fk}, over ${spec.fkMax} for ${band}`
  return null
}

/**
 * The six question types, in the order a paper asks them.
 *
 * Left to itself a model writes six detail-retrieval questions, because those
 * are the easiest to write and to mark. A Cambridge paper does not: it opens
 * on the whole piece, works through located detail, and closes on what the
 * writer was doing. Specifying the mix is what makes it a paper rather than a
 * quiz, so the mix is checked rather than requested.
 */
const QUESTION_PLAN = ['gist', 'detail', 'detail', 'inference', 'vocabulary', 'purpose']

/** The types a paper must contain at least one of, whatever else it has. */
const REQUIRED_TYPES = ['gist', 'inference', 'vocabulary', 'purpose']

/** Two questions asking the same thing in different words share a stem. */
function questionStem(question) {
  return String(question || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Cheap rejections of one question, before anything is spent judging it.
 *
 * Returns a reason or null. The expensive check - whether it can be answered
 * without reading the passage at all - costs a model call and happens later,
 * only to questions that get past here.
 */
function questionStructurallyOk(q, seenStems) {
  if (!q || typeof q !== 'object') return 'not an object'
  if (typeof q.question !== 'string' || q.question.trim().length < 15) return 'stem too short'
  if (!QUESTION_PLAN.includes(q.type)) return `unknown type ${q.type}`
  if (!Array.isArray(q.options) || q.options.length !== 4) return 'not four options'
  if (q.options.some((o) => typeof o !== 'string' || !o.trim())) return 'blank option'
  if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) return 'bad correct index'
  if (typeof q.explanation !== 'string' || q.explanation.trim().length < 20) return 'no explanation'

  const lower = q.options.map((o) => o.trim().toLowerCase())
  if (new Set(lower).size !== 4) return 'duplicate options'
  if (lower.some((o) => /\b(all|none)\b.*\babove\b/.test(o))) return 'all/none of the above'

  // An option several times the length of its rivals is the answer, and a
  // child who has noticed that is no longer reading.
  const lengths = lower.map((o) => o.length)
  const longest = Math.max(...lengths)
  const others = lengths.filter((l) => l !== longest)
  if (others.length && longest > 2.5 * Math.max(...others)) return 'one option much longer'

  const stem = questionStem(q.question)
  if (seenStems && seenStems.has(stem)) return 'asked before'
  return null
}

/**
 * Whether a finished paper may be set.
 *
 * Returns a list of reasons, empty when it is fit. A list rather than the
 * first fault, because a paper is regenerated wholesale and it is worth
 * knowing everything wrong with the attempt.
 */
function paperStructurallyOk(paper) {
  const faults = []
  if (!paper || typeof paper !== 'object') return ['not an object']
  if (!GENRES.includes(paper.genre)) faults.push(`unknown genre ${paper.genre}`)
  if (!BANDS[paper.band]) faults.push(`unknown band ${paper.band}`)
  if (typeof paper.title !== 'string' || !paper.title.trim()) faults.push('no title')
  if (typeof paper.text !== 'string' || !paper.text.trim()) faults.push('no passage')

  // Attribution is not decoration. A passage we cannot say the provenance of
  // is a passage we cannot defend having copied, so it does not get set.
  if (typeof paper.attribution !== 'string' || !paper.attribution.trim()) faults.push('no attribution')
  if (!['public-domain', 'cc-by-nd', 'cc-by', 'cc-by-sa', 'original'].includes(paper.licence)) {
    faults.push(`unknown licence ${paper.licence}`)
  }
  if (paper.licence !== 'original' && !String(paper.sourceUrl || '').startsWith('http')) {
    faults.push('copied text with no source link')
  }

  if (BANDS[paper.band] && typeof paper.text === 'string') {
    const misfit = passageFitsBand(paper.text, paper.band)
    if (misfit) faults.push(misfit)
  }

  const qs = Array.isArray(paper.questions) ? paper.questions : []
  if (qs.length !== 6) faults.push(`${qs.length} questions, want 6`)
  const seen = new Set()
  qs.forEach((q, i) => {
    const bad = questionStructurallyOk(q, seen)
    if (bad) faults.push(`q${i + 1}: ${bad}`)
    else seen.add(questionStem(q.question))
  })
  for (const type of REQUIRED_TYPES) {
    if (!qs.some((q) => q && q.type === type)) faults.push(`no ${type} question`)
  }
  return faults
}

/**
 * The same question with the right answer moved to `target`.
 *
 * A rotation rather than a shuffle, so options written as a sequence - four
 * dates, four quantities - stay in the order they were written in.
 *
 * Every question is rotated to a position taken in turn as it is written.
 * Without that the bank drifts into whatever position the model favours: the
 * first hand-written trivia bank had the answer second in 44 of 60, where
 * pressing the second button every time scored 73%.
 */
function rotateAnswerTo(q, target) {
  const options = q.options.map((o) => String(o).trim())
  const shift = ((target - q.correct) % 4 + 4) % 4
  if (shift === 0) return { options, correct: q.correct }
  const moved = new Array(4)
  for (let i = 0; i < 4; i++) moved[(i + shift) % 4] = options[i]
  return { options: moved, correct: target }
}

/**
 * What makes two papers the same source.
 *
 * A book may be drawn from many times, so the chapter is part of the key; a
 * news story may not, so for news the title alone is the key and a second
 * report of the same event collides with the first.
 */
function sourceKey(paper) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (paper.genre === 'fiction') return `fiction:${norm(paper.workTitle || paper.title)}:${norm(paper.chapter)}`
  return `${paper.genre}:${norm(paper.title)}`
}

module.exports = {
  stripHtml,
  words,
  sentences,
  syllablesIn,
  fkGrade,
  wordCount,
  readingMinutes,
  BANDS,
  GENRES,
  QUESTION_PLAN,
  REQUIRED_TYPES,
  bandFromYearGroup,
  passageFitsBand,
  questionStem,
  questionStructurallyOk,
  paperStructurallyOk,
  rotateAnswerTo,
  sourceKey,
}
