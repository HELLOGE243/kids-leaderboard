/**
 * The night's work for the daily reading quest.
 *
 * Six papers: news, essay and fiction, each at a Y6 and a Y9 level. Fiction
 * and essays are extracted from public-domain books; the news piece is written
 * here from sources the model reads at the time, because we may not reproduce
 * somebody's article.
 *
 * Built as a factory rather than a module of globals so that `db` and
 * `callClaude` arrive from index.js and the whole thing can be exercised with
 * fakes instead of a project.
 *
 *   const quest = require('./questJob').make({ db, callClaude })
 *   await quest.runNight(quest.sydneyDayKey(0))
 */

const QL = require('./questLogic')
const QT = require('./questText')
const SOURCES = require('./questSources.json')

const QQ = require('./questQuiz')

const QUEST_BANK = 'readingQuests'
const QUIZ_SETS = 'quizSets'
const DAILY_QUEST = 'dailyQuest'
const QUEST_MODEL = 'claude-sonnet-5-5'

/** Australian copyright is life plus seventy, and this school is in Sydney. */
const CLEAR_BEFORE = () => new Date().getFullYear() - 70

/** Generate eight to keep six: the gates throw away a fifth of them. */
const QUESTIONS_WANTED = 6
const QUESTIONS_ASKED = 8

/** How many different books to try before giving a slot up. */
const SOURCE_ATTEMPTS = 4

/**
 * How many giveaway checks run at once within one paper.
 *
 * Six slots are already running in parallel, so this is multiplied by six
 * before it reaches the API. Four is twenty-four in flight, which is quick
 * without being a burst worth throttling.
 */
const GIVEAWAY_AT_ONCE = 4

/**
 * What the news slot may not be about.
 *
 * A model told to find today's news will find a murder trial, because that is
 * what news is. This list is concrete rather than tasteful on purpose: "age
 * appropriate" means nothing to a generator, while "no deaths of named
 * individuals" is a rule it can follow.
 */
const NEWS_EXCLUSIONS = [
  'the death or injury of any named person',
  'violent crime, courts, policing or prisons',
  'war, armed conflict or casualty figures',
  'terrorism or mass violence of any kind',
  'sexual content or sexual offences',
  'suicide, self-harm or eating disorders',
  'graphic medical or surgical detail',
  'partisan political argument, elections or party politics',
  'anything about a named child',
  'drugs, alcohol or gambling',
  'natural disasters where people died',
]

const NEWS_TOPICS = [
  'science and discovery', 'space and astronomy', 'animals and wildlife',
  'technology and engineering', 'archaeology and history', 'the environment and conservation',
  'sport', 'the arts, music and film', 'medicine and health research',
  'oceans and marine life', 'weather and climate science', 'food and farming',
  'transport and infrastructure', 'mathematics and computing',
]

function make(deps) {
  const db = deps.db
  const callClaude = deps.callClaude

  /** The Sydney date, offset by whole days. Schools run on local dates. */
  function sydneyDayKey(offsetDays) {
    const now = new Date(Date.now() + (offsetDays || 0) * 86400000)
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now)
  }

  /**
   * Maps over a list with at most `limit` promises in flight.
   *
   * The giveaway check is one model call per question and the questions do
   * not depend on each other, so running them in turn was costing about
   * half a minute a paper for nothing. Six slots run at once, though, so
   * letting every question go at once would put forty-eight requests in
   * flight and earn a rate limit instead of a speed-up.
   */
  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length)
    let next = 0
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++
        if (i >= items.length) return
        out[i] = await fn(items[i], i)
      }
    })
    await Promise.all(workers)
    return out
  }

  /**
   * A model call, with the reason it stopped kept alongside what it said.
   *
   * "The reply was not the JSON asked for" is a true sentence about a reply
   * that ran out of room, and a useless one: the model wrote exactly what it
   * was asked for and was cut off mid-object. One is a prompt to fix, the
   * other is a budget to raise, and the stop reason is the only thing that
   * tells them apart. Six slots run at once, so it cannot be stashed in a
   * variable in this closure - it travels with the text or not at all.
   */
  async function askFull(body) {
    const { status, body: raw } = await callClaude({ model: QUEST_MODEL, ...body })
    if (status !== 200) throw new Error(`Claude ${status}: ${String(raw).slice(0, 300)}`)
    const data = JSON.parse(raw)
    // Every text block, not the first one.
    //
    // A reply with no tools in it holds exactly one, so for most callers here
    // this changes nothing. The news piece is the exception, and it was the
    // only caller that passes tools: it searches the web, so its reply runs
    // text, tool call, tool result, text, tool call, ... with a sentence of
    // "I'll look that up" in the FIRST block and the JSON we asked for in the
    // last. Taking the first block handed the parser the preamble, so every
    // news slot died as "the news reply was not the JSON asked for" while the
    // finished report sat further down the same reply, never read.
    return {
      text: (data.content || [])
        .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n'),
      stopReason: String(data.stop_reason || ''),
    }
  }

  /** The reply's words, for the callers that have no use for the rest. */
  const ask = async (body) => (await askFull(body)).text

  /** A JSON value out of a reply, without a regex that can run away on it. */
  /**
   * The first JSON value in a reply, however the model dressed it up.
   *
   * "Reply with JSON only" is a request, not a guarantee. A fenced block, a
   * sentence of preamble, or a closing remark are all common, and a preamble
   * that happens to contain a bracket used to move the start of the slice and
   * fail the parse - which reads downstream as "no questions came back", with
   * nothing to say that the questions were there and perfectly good.
   *
   * So the fences come off, and then every candidate opening bracket is tried
   * in turn against every closing one, nearest first.
   */
  function firstJson(text, open, close, wanted) {
    const raw = String(text)
      // ```json ... ``` and plain ``` ... ```
      .replace(/```[a-zA-Z]*\n?/g, '')
      .replace(/```/g, '')

    // Every caller wants either an object or a list of objects, and saying so
    // is what stops "See [1] and [2]." being read as a list of questions:
    // [1] parses perfectly well, and a parse that succeeds is not the same
    // thing as an answer.
    //
    // `wanted` goes one further, and the news slot is why. A model that has
    // been searching will think out loud on the way - "I considered
    // {"topic": "volcanoes"} first" - and that aside parses, and is an object,
    // so it satisfied everything asked here and was returned in place of the
    // report further down the reply. The caller is the only one that knows
    // which keys make a reply an answer, so the caller says.
    const useful = (v) => {
      if (!v || typeof v !== 'object') return false
      if (Array.isArray(v)) {
        if (!(v.length > 0 && !!v[0] && typeof v[0] === 'object')) return false
      }
      return wanted ? !!wanted(v) : true
    }

    for (let a = raw.indexOf(open); a !== -1; a = raw.indexOf(open, a + 1)) {
      for (let b = raw.lastIndexOf(close); b > a; b = raw.lastIndexOf(close, b - 1)) {
        try {
          const parsed = JSON.parse(raw.slice(a, b + 1))
          if (useful(parsed)) return parsed
        } catch (e) { /* try a shorter slice */ }
      }
    }
    return null
  }

  /**
   * The hosts a book is looked for on, in order.
   *
   * Project Gutenberg goes down for maintenance, and when it does it takes
   * four of the six slots with it - both essays and both fiction pieces come
   * from there. A whole week of nights was lost to one 503, with the job
   * working perfectly and nothing to read.
   *
   * pglaf is one of Gutenberg's own mirrors and lays its files out at exactly
   * the same paths, so the fallback is a different host and not a different
   * format. Same books, same licence, same text.
   */
  const BOOK_HOSTS = [
    'https://www.gutenberg.org',
    'https://gutenberg.pglaf.org',
  ]

  async function fetchBook(id) {
    const tried = []
    for (const host of BOOK_HOSTS) {
      try {
        const res = await fetch(`${host}/cache/epub/${id}/pg${id}.txt`, {
          headers: { 'user-agent': 'CleverSpace-EduPortal/1.0 (school reading tasks)' },
        })
        if (res.ok) return res.text()
        tried.push(`${host}: HTTP ${res.status}`)
      } catch (e) {
        tried.push(`${host}: ${e.message || e}`)
      }
    }
    throw new Error(`Gutenberg ${id}: ${tried.join('; ')}`)
  }

  /**
   * What the bank already holds, so the night does not set it again.
   *
   * Only the keys are read, not the papers: the bank is meant to grow to
   * thousands and reading all of it every night to avoid repeating one
   * chapter would be the most expensive part of the job.
   */
  async function readIndex() {
    const snap = await db.collection(QUEST_BANK).select('sourceKey', 'genre', 'band', 'chapter', 'workId').get()
    const keys = new Set()
    const chaptersByWork = {}
    snap.forEach((docSnap) => {
      const d = docSnap.data() || {}
      if (d.sourceKey) keys.add(d.sourceKey)
      if (d.workId && d.chapter) {
        const list = chaptersByWork[d.workId] || (chaptersByWork[d.workId] = new Set())
        list.add(d.chapter)
      }
    })
    return { keys, chaptersByWork, count: snap.size }
  }

  /** The works that can serve this genre and band, least-used first. */
  function candidateWorks(genre, band, index) {
    return SOURCES
      .filter((w) => w.genre === genre && w.fits[band])
      // The copyright test is applied again here rather than trusted from the
      // file: the list is data, and data can be edited by somebody who does
      // not know what the field is for.
      .filter((w) => w.died <= CLEAR_BEFORE())
      .map((w) => ({ work: w, used: (index.chaptersByWork[w.id] || new Set()).size }))
      .sort((a, b) => (a.used - b.used) || (Math.random() - 0.5))
      .map((x) => x.work)
  }

  /**
   * A passage from a public-domain book, with everything needed to attribute it.
   *
   * Walks the candidate works in order of how much of each has been used
   * already, so the whole shelf gets read rather than one novel being mined
   * until it runs out.
   */
  async function passageFromBooks(genre, band, index) {
    const tried = []
    for (const work of candidateWorks(genre, band, index).slice(0, SOURCE_ATTEMPTS)) {
      let raw
      try {
        raw = await fetchBook(work.id)
      } catch (e) {
        tried.push(`${work.title}: ${e.message}`)
        continue
      }
      const used = index.chaptersByWork[work.id] || new Set()
      const got = QT.pickExtract(raw, band, { usedChapters: used })
      if (!got.extract) { tried.push(`${work.title}: ${got.reason}`); continue }
      return {
        paper: {
          genre,
          band,
          title: `${work.title}, ${got.extract.chapter}`,
          workTitle: work.title,
          workId: work.id,
          chapter: got.extract.chapter,
          source: 'Project Gutenberg',
          sourceUrl: `https://www.gutenberg.org/ebooks/${work.id}`,
          attribution: `${work.author}. Public domain.`,
          licence: 'public-domain',
          text: got.extract.html,
          wordCount: got.extract.words,
          readability: { fk: got.extract.fk, band },
          minutes: QL.readingMinutes(got.extract.words),
        },
        tried,
      }
    }
    return { paper: null, tried }
  }

  /**
   * A news report written here, from sources read at the time.
   *
   * This is the route the plan calls (a). We may not store and serve somebody
   * else's article, and a two-sentence quotation will not carry six
   * proficiency-level questions, so the piece is ours - which means the facts
   * are ours to get wrong. Every source is linked under it so a teacher can
   * check, and the brief keeps it to events rather than analysis.
   */
  async function newsPiece(band, index) {
    const spec = QL.BANDS[band]
    const topic = NEWS_TOPICS[Math.floor(Math.random() * NEWS_TOPICS.length)]
    const recent = [...index.keys].filter((k) => k.startsWith('news:')).slice(-40)

    const prompt = [
      `Write a short news report for a school reading task, on ${topic}.`,
      '',
      'Search for something that actually happened in the last fortnight. Read',
      'at least three independent sources before writing. Then write the report',
      'in your own words - do not reproduce sentences from any source.',
      '',
      `Length: ${spec.minWords}-${spec.maxWords} words.`,
      `Reading level: a ${band === 'y6' ? 'Year 6 (about 11 years old)' : 'Year 9 (about 14 years old)'} reader.`,
      `Aim for a Flesch-Kincaid grade of about ${((spec.fkMin + spec.fkMax) / 2).toFixed(1)}.`,
      '',
      'It must not be about any of the following:',
      ...NEWS_EXCLUSIONS.map((x) => `- ${x}`),
      '',
      'Report what happened, who found it out and why it matters. No opinion,',
      'no advice to the reader, no direct address. Past tense. Name the people',
      'and places involved. Every number must come from a source you read.',
      '',
      recent.length ? `Already covered, pick something else:\n${recent.join('\n')}` : '',
      '',
      'Reply with JSON only:',
      '{"headline": "...", "paragraphs": ["...", "..."], "sources": ["url", "url", "url"]}',
      '',
      'Five to eight paragraphs. No markdown, no HTML.',
    ].filter((l) => l !== null).join('\n')

    // Six searches' worth of reading, then eight paragraphs of writing. The
    // budget covers the writing; it has to be generous enough that the report
    // is never the thing that gets cut.
    const { text: reply, stopReason } = await askFull({
      max_tokens: 16000,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }],
      messages: [{ role: 'user', content: prompt }],
    })
    const parsed = firstJson(reply, '{', '}',
      (v) => Array.isArray(v.paragraphs) && v.headline)
    if (!parsed || !Array.isArray(parsed.paragraphs) || !parsed.headline) {
      // Why, in enough detail to act on. Both news slots failed here for
      // eleven nights and the log said only that the JSON was missing, which
      // was a description of the symptom standing in for a diagnosis.
      return {
        paper: null,
        tried: [`the news reply was not the JSON asked for`
          + ` (stopped: ${stopReason || 'unsaid'}, ${reply.length} chars)`
          + `: ${reply.slice(-240).replace(/\s+/g, ' ')}`],
      }
    }
    const paragraphs = parsed.paragraphs.map((p) => String(p).trim()).filter(Boolean)
    if (!paragraphs.length) return { paper: null, tried: ['the news reply had no paragraphs'] }

    const sources = (Array.isArray(parsed.sources) ? parsed.sources : [])
      .map((u) => String(u).trim())
      .filter((u) => u.startsWith('http'))
    // A report we cannot point at anything for is a report nobody can check.
    if (!sources.length) return { paper: null, tried: ['the news piece cited no sources'] }

    const html = QT.asHtml(paragraphs)
    return {
      paper: {
        genre: 'news',
        band,
        title: String(parsed.headline).trim().slice(0, 160),
        source: 'Written for CleverSpace from the sources listed',
        sourceUrl: sources[0],
        attribution: 'Written for CleverSpace. Sources listed below.',
        licence: 'original',
        text: html,
        wordCount: QL.wordCount(html),
        readability: { fk: QL.fkGrade(html), band },
        minutes: QL.readingMinutes(QL.wordCount(html)),
        sources,
      },
      tried: [],
    }
  }

  /** Six questions in the Cambridge mix, written from the passage. */
  /**
   * Questions for a passage, or replacements for the ones a gate threw out.
   *
   * @param {object} paper
   * @param {string[]} [onlyTypes] when given, ask for these types and nothing
   *   else: a top-up round after the giveaway gate has emptied a required slot
   * @param {number} [atLeast] the smallest useful number to come back with.
   *   Two of each missing type is the floor, not the answer: a paper may be
   *   three questions short and missing only one type, and asking for two
   *   then leaves it one short and discards the passage anyway.
   */
  async function writeQuestions(paper, onlyTypes, atLeast) {
    const topUp = !!(onlyTypes && onlyTypes.length)
    const wanted = topUp
      ? Math.max(onlyTypes.length * 2, Number(atLeast) || 0)
      : QUESTIONS_ASKED
    const plan = topUp
      ? onlyTypes.map((t) => `- two ${t} questions`).join('\n')
      : QL.QUESTION_PLAN.map((t, i) => `${i + 1}. ${t}`).join('\n')
    const prompt = [
      'Here is a passage set for a school reading comprehension paper.',
      '',
      `Reader: ${paper.band === 'y6' ? 'Year 6, about 11 years old' : 'Year 9, about 14 years old'}.`,
      '',
      '--- passage ---',
      QL.stripHtml(paper.text),
      '--- end of passage ---',
      '',
      `Write ${wanted} multiple-choice questions about it, in the style of a`,
      'Cambridge English proficiency reading paper. Cover these types, in about',
      'this proportion:',
      plan,
      topUp
        // A top-up round is asked because the first questions of these
        // types were answerable without the passage. Saying so is the only
        // thing that makes the second attempt differ from the first.
        ? 'The earlier attempts at these types could be answered without reading'
          + ' the passage. Anchor each of these in a specific sentence.'
          + (wanted > onlyTypes.length * 2
            ? ` Write more of any of those types beyond the first two of each, to make ${wanted} in all.`
            : '')
        : `and two more of any of those types, to make ${wanted}.`,
      '',
      'Rules, all of which matter:',
      '- Every question must be answerable ONLY by reading this passage. If a',
      '  reader could get it right from general knowledge, it is a bad question.',
      '- Four options. Exactly one correct. The three wrong ones must be',
      '  plausible to somebody who read carelessly, not obviously silly.',
      '- Keep all four options about the same length.',
      '- No "all of the above" or "none of the above".',
      '- A vocabulary question must ask about a word whose meaning in THIS',
      '  passage is not its most common meaning.',
      '- The explanation must say which part of the passage settles it.',
      '',
      'Reply with JSON only, an array:',
      '[{"type": "gist", "question": "...", "options": ["a","b","c","d"],',
      '  "correct": 0, "explanation": "..."}]',
    ].join('\n')

    const reply = await ask({ max_tokens: 12000, messages: [{ role: 'user', content: prompt }] })
    const parsed = firstJson(reply, '[', ']',
      (v) => v.every((q) => q && q.question && Array.isArray(q.options)))
    return Array.isArray(parsed) ? parsed : []
  }

  /**
   * Whether a question can be answered without the passage.
   *
   * The fatal flaw in a comprehension question is that it tests general
   * knowledge wearing a passage as a disguise. So each one is put to a model
   * with the passage withheld: if it comes back right, the question was never
   * about the reading. This is the trivia giveaway check pointed at a better
   * target, and it is expected to reject a fifth of what is generated.
   */
  async function answerableWithoutReading(q) {
    const prompt = [
      'A reading comprehension question, without the passage it belongs to.',
      'Guess the answer from general knowledge and common sense.',
      '',
      q.question,
      ...q.options.map((o, i) => `${'ABCD'[i]}. ${o}`),
      '',
      'Reply with one letter and nothing else.',
    ].join('\n')
    try {
      const reply = await ask({
        max_tokens: 512,
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: prompt }],
      })
      const letter = (/\b([ABCD])\b/.exec(String(reply).toUpperCase()) || [])[1]
      if (!letter) return false
      return 'ABCD'.indexOf(letter) === q.correct
    } catch (e) {
      // A failed check must not become a free pass: better to keep the
      // question than to lose a night, but say so in the log.
      console.warn('quest: giveaway check failed, keeping the question:', e.message)
      return false
    }
  }

  /** Whether a finished piece belongs in front of a ten-year-old. */
  async function suitableForSchool(paper) {
    const prompt = [
      'A passage proposed for a reading task at a tutoring school. The readers',
      'are children between 9 and 15, and a parent may read over their shoulder.',
      '',
      '--- passage ---',
      QL.stripHtml(paper.text).slice(0, 6000),
      '--- end of passage ---',
      '',
      'Is it suitable? Unsuitable means: graphic violence or injury, sexual',
      'content, suicide or self-harm, cruelty described in detail, racial or',
      'other slurs, or distress a child would need an adult to help with.',
      '',
      'Older books are expected to contain some period attitudes and mild peril;',
      'that alone is not unsuitable. Judge what a careful teacher would allow.',
      '',
      'Reply with JSON only: {"suitable": true} or {"suitable": false, "why": "..."}',
    ].join('\n')
    try {
      const reply = await ask({
        max_tokens: 1024,
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: prompt }],
      })
      const parsed = firstJson(reply, '{', '}', (v) => typeof v.suitable === 'boolean')
      if (!parsed || typeof parsed.suitable !== 'boolean') return { suitable: true, why: 'check gave no answer' }
      return { suitable: parsed.suitable, why: parsed.why || '' }
    } catch (e) {
      // A passage that could not be checked is not published. The quest can
      // miss a slot; it cannot put an unchecked passage in front of a child.
      console.warn('quest: suitability check failed:', e.message)
      return { suitable: false, why: `the suitability check failed: ${e.message}` }
    }
  }

  /** One finished paper for one slot, or null with the reasons it failed. */
  async function buildPaper(genre, band, index) {
    const sourced = genre === 'news'
      ? await newsPiece(band, index)
      : await passageFromBooks(genre, band, index)
    if (!sourced.paper) return { paper: null, why: sourced.tried }

    const paper = sourced.paper
    const why = []

    // Our own news text is written to a level and may miss; a book extract was
    // already measured on the way out of questText.
    const misfit = QL.passageFitsBand(paper.text, band)
    if (misfit) return { paper: null, why: [`${genre}: ${misfit}`] }

    const fit = await suitableForSchool(paper)
    if (!fit.suitable) return { paper: null, why: [`${genre}: unsuitable - ${fit.why}`] }

    const written = await writeQuestions(paper)
    if (!written.length) return { paper: null, why: [`${genre}: no questions came back`] }

    const seen = new Set()
    const kept = []
    // Which position the next question's answer is moved to. Counted over the
    // whole paper rather than per batch, so the top-up round carries on the
    // rotation instead of restarting it at A.
    let rotations = 0

    // One verdict per question, so the top-up's second look at a batch does
    // not pay for the same checks again.
    //
    // Keyed by the position as well as the stem: the verdict is "did the model
    // pick the right letter", so the same question rotated differently is a
    // different question to this gate, and a cached answer from the other
    // rotation would be read off the wrong one.
    const verdicts = new Map()
    const giveaway = async (q) => {
      const key = `${QL.questionStem(q.question)}|${q.correct}`
      if (!verdicts.has(key)) verdicts.set(key, await answerableWithoutReading(q))
      return verdicts.get(key)
    }

    /**
     * Puts a batch of questions past both gates, keeping what survives.
     *
     * Two passes rather than one. The structural check is free and has to run
     * in order, because it is what decides that two questions ask the same
     * thing. The giveaway check is a model call each and the questions are
     * independent, so those go together.
     */
    const sift = async (batch) => {
      const candidates = []
      // Within this batch only: a near-duplicate is dropped before it costs a
      // call, but a question the giveaway gate later refuses must not have
      // taken a stem with it, so `seen` is only added to on the way in.
      const local = new Set(seen)
      for (const q of batch) {
        const bad = QL.questionStructurallyOk(q, local)
        if (bad) { why.push(`dropped a ${q && q.type} question: ${bad}`); continue }
        local.add(QL.questionStem(q.question))
        // Rotated BEFORE the gate sees it, rather than on the way into `kept`.
        //
        // The example in the generator's own prompt shows "correct": 0, and a
        // model follows the example it is given - so questions arrived with
        // the answer bunched in A. The checking model has its own lean towards
        // the first option, and the two together made it land on the right
        // letter far more often than guessing would, which this gate can only
        // read as "answerable without the passage". It was throwing away about
        // three quarters of what was written where a fifth was expected, and
        // the position was doing a good deal of that work.
        //
        // Rotating first means the gate judges the question rather than where
        // the answer happened to sit. The spread across the bank is unchanged
        // - that is what the rotation was always for - it just happens one
        // step earlier.
        candidates.push({ ...q, ...QL.rotateAnswerTo(q, rotations++ % 4) })
      }

      const given = await mapLimit(candidates, GIVEAWAY_AT_ONCE, giveaway)

      for (let i = 0; i < candidates.length; i++) {
        if (kept.length >= QUESTIONS_WANTED) break
        const q = candidates[i]
        const stem = QL.questionStem(q.question)
        if (seen.has(stem)) continue
        if (given[i]) {
          why.push(`dropped a ${q.type} question: answerable without the passage`)
          continue
        }
        seen.add(stem)
        // Already rotated on the way in, so what the gate judged is exactly
        // what the student sits.
        kept.push({
          type: q.type,
          question: q.question.trim(),
          options: q.options,
          correct: q.correct,
          explanation: q.explanation.trim(),
        })
      }
    }

    await sift(written)

    // A passage that has been downloaded, measured and passed as suitable is
    // too expensive to throw away because the giveaway gate happened to take
    // the only inference question. Eight asked to keep six leaves room for
    // two refusals and no more, and the paper check demands one of each of
    // four types - so one unlucky drop used to cost the whole passage.
    //
    // So the types actually missing are asked for again, once. A second round
    // that fails costs one call; a discarded passage costs a book download,
    // a suitability check and eight questions.
    const missingTypes = () => QL.REQUIRED_TYPES.filter((t) => !kept.some((q) => q.type === t))
    const missing = missingTypes()
    if (missing.length || kept.length < QUESTIONS_WANTED) {
      why.push(`topping up: ${kept.length} kept, missing ${missing.join(', ') || 'nothing but short'}`)
      try {
        // Enough to finish the paper, not merely enough to fill the gaps in
        // the type list. Twice the shortfall, because the giveaway gate is
        // about to take some of these too.
        const more = await writeQuestions(
          paper,
          missing.length ? missing : QL.REQUIRED_TYPES,
          (QUESTIONS_WANTED - kept.length) * 2,
        )
        const batch = Array.isArray(more) ? more : []

        // One of each missing type before any second helping. Sifting the
        // batch straight through filled the six places with two inference
        // questions and two vocabulary ones and left purpose empty, which
        // fails the paper check for the same reason it was short to begin
        // with.
        for (const type of missing) {
          for (const q of batch.filter((c) => c && c.type === type)) {
            if (kept.some((k) => k.type === type)) break
            if (kept.length >= QUESTIONS_WANTED) {
              // Full, and still missing a type the paper must have. What makes
              // way is a question of a type the paper does not require - a
              // gist, vocabulary or purpose one - because dropping a detail or
              // an inference question to make room for a detail or an
              // inference question would be a swap for its own sake.
              const spare = kept.findIndex((k) => !QL.REQUIRED_TYPES.includes(k.type))
              if (spare < 0) break
              why.push(`made room for a ${type} question by dropping a ${kept[spare].type} one`)
              kept.splice(spare, 1)
            }
            await sift([q])
          }
        }

        // Then anything still unused fills whatever space is left.
        await sift(batch)
      } catch (e) {
        why.push(`the top-up round failed: ${e.message || e}`)
      }
    }

    paper.questions = kept
    const faults = QL.paperStructurallyOk(paper)
    if (faults.length) return { paper: null, why: [...why, ...faults] }

    paper.id = `rq-${Math.random().toString(36).slice(2, 10)}`
    paper.sourceKey = QL.sourceKey(paper)
    if (index.keys.has(paper.sourceKey)) return { paper: null, why: [...why, 'already in the bank'] }
    return { paper, why }
  }

  /**
   * A paper the bank already holds, for a slot tonight could not fill.
   *
   * A reading day with two tasks is a bad day; a reading day with none is a
   * broken feature, and a chapter of Treasure Island nobody has read since
   * March is a perfectly good task.
   */
  async function fromBank(genre, band, exclude) {
    const snap = await db.collection(QUEST_BANK)
      .where('genre', '==', genre)
      .where('band', '==', band)
      .orderBy('lastSetOn', 'asc')
      .limit(20)
      .get()
    for (const docSnap of snap.docs) {
      const paper = docSnap.data()
      if (!paper || !paper.id) continue
      if (exclude.has(paper.id)) continue
      // A paper a teacher took down does not come back, here or anywhere.
      if (paper.pulled) continue
      return paper
    }
    return null
  }

  /** Tonight's six, banked, and set for the day. */
  /**
   * Writes a paper out as a quiz set, which is what a student actually sits.
   *
   * Written once and then left alone. A paper reused from the bank in March
   * may by then have had a wrong answer corrected or a clumsy question
   * reworded by a teacher, and re-deriving the set from the generator's
   * original would silently undo that work. So an existing set keeps its
   * questions and is only told which day it is set for.
   *
   * @returns {Promise<string>} the quiz set id
   */
  async function publishQuizSet(paper, dayKey) {
    const id = QQ.quizSetIdFor(paper.id)
    const ref = db.collection(QUIZ_SETS).doc(id)
    const existing = await ref.get()
    if (existing.exists) {
      await ref.set({ questDay: String(dayKey) }, { merge: true })
      return id
    }
    await ref.set(QQ.quizSetFromPaper(paper, dayKey))
    return id
  }

  /**
   * One tiny call, to find out whether there is any point in the rest.
   *
   * The suitability check is the first model call every slot makes, and a
   * failed check refuses the passage rather than publishing it unchecked - so
   * an unreachable model does not look like an unreachable model. It looks
   * like all six papers being unsuitable, after four and a half minutes and
   * sixty-odd calls. This asks once, costs about nothing, and says the status
   * and the body it got back.
   */
  async function modelReachable() {
    try {
      const reply = await ask({
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with one word: ready' }],
      })
      if (!/ready/i.test(String(reply))) {
        return { ok: false, why: `it replied "${String(reply).slice(0, 120)}" rather than "ready"` }
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, why: String(e.message || e) }
    }
  }

  async function runNight(dayKey) {
    const reach = await modelReachable()
    if (!reach.ok) {
      const error = `the model could not be reached: ${reach.why}`
      console.error(`questNightly: ${dayKey} ${error}`)
      // Returned as an error rather than six missed slots, because they are
      // not the same thing and the teacher's panel should not say they are.
      return { day: dayKey, made: [], reused: [], missed: [], set: 0, error }
    }

    const index = await readIndex()
    const slots = []
    for (const genre of QL.GENRES) {
      for (const band of ['y6', 'y9']) slots.push({ genre, band })
    }

    const report = { day: dayKey, made: [], reused: [], missed: [], bankBefore: index.count }

    // Six slots at once: each is several model calls and a book download, and
    // the function has nine minutes.
    const built = await Promise.all(slots.map(async (slot) => {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const got = await buildPaper(slot.genre, slot.band, index)
          if (got.paper) return { slot, paper: got.paper, why: got.why }
          console.warn(`quest: ${slot.genre}/${slot.band} attempt ${attempt} refused: ${JSON.stringify(got.why)}`)
          if (attempt === 2) return { slot, paper: null, why: got.why }
        } catch (e) {
          // Written out per slot as well as in the report: a nine-minute
          // function that runs out of time never reaches the report at all,
          // and then the only trace of what went wrong is this line.
          console.warn(`quest: ${slot.genre}/${slot.band} attempt ${attempt} threw: ${e.message || e}`)
          if (attempt === 2) return { slot, paper: null, why: [String(e.message || e)] }
        }
      }
      return { slot, paper: null, why: ['gave up'] }
    }))

    const papers = []
    const usedIds = new Set()

    for (const out of built) {
      const label = `${out.slot.genre}/${out.slot.band}`
      if (out.paper) {
        const paper = out.paper
        // The six slots run at once, so two of them can arrive at the same
        // source before either has been banked. The index check inside
        // buildPaper reads a snapshot taken before any of them ran.
        if (index.keys.has(paper.sourceKey)) {
          report.missed.push({ slot: label, why: [...out.why, 'another slot took the same source tonight'] })
          continue
        }
        await db.collection(QUEST_BANK).doc(paper.id).set({
          ...paper,
          createdAt: Date.now(),
          lastSetOn: dayKey,
          timesSet: 1,
        })
        index.keys.add(paper.sourceKey)
        if (paper.workId && paper.chapter) {
          const list = index.chaptersByWork[paper.workId] || (index.chaptersByWork[paper.workId] = new Set())
          list.add(paper.chapter)
        }
        papers.push(paper)
        usedIds.add(paper.id)
        report.made.push({ slot: label, title: paper.title, fk: paper.readability.fk, dropped: out.why })
        continue
      }

      const spare = await fromBank(out.slot.genre, out.slot.band, usedIds)
      if (spare) {
        await db.collection(QUEST_BANK).doc(spare.id).set(
          { lastSetOn: dayKey, timesSet: (Number(spare.timesSet) || 1) + 1 },
          { merge: true },
        )
        papers.push(spare)
        usedIds.add(spare.id)
        report.reused.push({ slot: label, title: spare.title, why: out.why })
      } else {
        report.missed.push({ slot: label, why: out.why })
      }
    }

    // Logged as JSON rather than handed to console.error as an object.
    // Node's inspector stops at two levels deep and prints the rest as
    // "[Array]" - and the reasons are three deep, one list per slot. The
    // first night this failed, every slot came back as { slot, why: [Array] }
    // and the only record of why was the reply to the browser.
    console.log(`questNightly: ${dayKey} ${JSON.stringify(report)}`)

    // Nothing at all leaves yesterday's quest standing, which is better than
    // an empty card that says there is no reading today.
    if (!papers.length) {
      console.error(`questNightly: nothing could be set for ${dayKey}`)
      return { ...report, set: 0 }
    }

    // Each paper becomes a quiz set before the day's index names it, so a
    // card can never point at a paper a student cannot open.
    for (const p of papers) await publishQuizSet(p, dayKey)

    await db.collection(DAILY_QUEST).doc(dayKey).set({
      day: dayKey,
      setAt: Date.now(),
      papers: papers.map((p) => QQ.dayEntryFromPaper(p, dayKey)),
    })

    return { ...report, set: papers.length }
  }

  /**
   * A teacher taking one of today's papers down.
   *
   * The gates are automatic and the suitability check is a model's opinion, so
   * there has to be a way for a person who disagrees to remove a paper from
   * the day in one press. The paper is marked pulled rather than deleted - the
   * bank is the record of what was made, and a paper removed without a trace
   * cannot be learned from - and the slot is refilled from the bank where
   * anything is available.
   *
   * Students cannot do this: the rules forbid writing dailyQuest from a
   * browser at all, which is the point of it being here.
   */
  async function pullPaper(dayKey, paperId) {
    const ref = db.collection(DAILY_QUEST).doc(String(dayKey))
    const snap = await ref.get()
    if (!snap.exists) return { pulled: false, why: 'no quest is set for that day' }

    const doc = snap.data() || {}
    const papers = Array.isArray(doc.papers) ? doc.papers : []
    const gone = papers.find((p) => p && p.id === paperId)
    if (!gone) return { pulled: false, why: 'that paper is not set for that day' }

    const kept = papers.filter((p) => p && p.id !== paperId)

    // Marked, not deleted. A pulled paper must never come back on its own.
    await db.collection(QUEST_BANK).doc(String(paperId)).set(
      { pulled: true, pulledOn: dayKey, pulledAt: Date.now() },
      { merge: true },
    )

    const inUse = new Set(kept.map((p) => p.id))
    inUse.add(paperId)
    // fromBank skips pulled papers, so the one just taken down cannot come
    // back as its own replacement.
    const replacement = await fromBank(gone.genre, gone.band, inUse)

    if (replacement) {
      await db.collection(QUEST_BANK).doc(replacement.id).set(
        { lastSetOn: dayKey, timesSet: (Number(replacement.timesSet) || 1) + 1 },
        { merge: true },
      )
      await publishQuizSet(replacement, dayKey)
      kept.push(QQ.dayEntryFromPaper(replacement, dayKey))
    }

    await ref.set({ ...doc, papers: kept, pulledAt: Date.now() })
    return {
      pulled: true,
      slot: `${gone.genre}/${gone.band}`,
      replacedWith: replacement ? replacement.title : null,
      papersLeft: kept.length,
    }
  }

  return {
    sydneyDayKey,
    runNight,
    pullPaper,
    publishQuizSet,
    firstJson,
    modelReachable,
    buildPaper,
    readIndex,
    candidateWorks,
    passageFromBooks,
    newsPiece,
    writeQuestions,
    answerableWithoutReading,
    suitableForSchool,
    QUEST_BANK,
    DAILY_QUEST,
    QUIZ_SETS,
  }
}

module.exports = { make, NEWS_EXCLUSIONS, NEWS_TOPICS, QUEST_BANK, DAILY_QUEST }
