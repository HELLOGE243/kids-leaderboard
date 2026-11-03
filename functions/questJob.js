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

  /** The reply's first text block: on current models the first block is thinking. */
  async function ask(body) {
    const { status, body: raw } = await callClaude({ model: QUEST_MODEL, ...body })
    if (status !== 200) throw new Error(`Claude ${status}: ${String(raw).slice(0, 300)}`)
    const data = JSON.parse(raw)
    const text = (data.content || []).find((b) => b.type === 'text')
    return (text && text.text) || ''
  }

  /** A JSON value out of a reply, without a regex that can run away on it. */
  function firstJson(text, open, close) {
    const a = String(text).indexOf(open)
    const b = String(text).lastIndexOf(close)
    if (a === -1 || b <= a) return null
    try {
      return JSON.parse(String(text).slice(a, b + 1))
    } catch (e) {
      return null
    }
  }

  async function fetchBook(id) {
    const res = await fetch(`https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`, {
      headers: { 'user-agent': 'CleverSpace-EduPortal/1.0 (school reading tasks)' },
    })
    if (!res.ok) throw new Error(`Gutenberg ${id}: HTTP ${res.status}`)
    return res.text()
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

    const reply = await ask({
      max_tokens: 8000,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }],
      messages: [{ role: 'user', content: prompt }],
    })
    const parsed = firstJson(reply, '{', '}')
    if (!parsed || !Array.isArray(parsed.paragraphs) || !parsed.headline) {
      return { paper: null, tried: ['the news reply was not the JSON asked for'] }
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
  async function writeQuestions(paper) {
    const plan = QL.QUESTION_PLAN.map((t, i) => `${i + 1}. ${t}`).join('\n')
    const prompt = [
      'Here is a passage set for a school reading comprehension paper.',
      '',
      `Reader: ${paper.band === 'y6' ? 'Year 6, about 11 years old' : 'Year 9, about 14 years old'}.`,
      '',
      '--- passage ---',
      QL.stripHtml(paper.text),
      '--- end of passage ---',
      '',
      `Write ${QUESTIONS_ASKED} multiple-choice questions about it, in the style of a`,
      'Cambridge English proficiency reading paper. Cover these types, in about',
      'this proportion:',
      plan,
      `and two more of any of those types, to make ${QUESTIONS_ASKED}.`,
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
    const parsed = firstJson(reply, '[', ']')
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
      const parsed = firstJson(reply, '{', '}')
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
    for (const q of written) {
      if (kept.length >= QUESTIONS_WANTED) break
      const bad = QL.questionStructurallyOk(q, seen)
      if (bad) { why.push(`dropped a ${q && q.type} question: ${bad}`); continue }
      if (await answerableWithoutReading(q)) {
        why.push(`dropped a ${q.type} question: answerable without the passage`)
        continue
      }
      seen.add(QL.questionStem(q.question))
      // Rotated as it is written, so the bank cannot drift into a position.
      const rotated = QL.rotateAnswerTo(q, kept.length % 4)
      kept.push({
        type: q.type,
        question: q.question.trim(),
        options: rotated.options,
        correct: rotated.correct,
        explanation: q.explanation.trim(),
      })
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

  async function runNight(dayKey) {
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
          if (attempt === 2) return { slot, paper: null, why: got.why }
        } catch (e) {
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

    // Nothing at all leaves yesterday's quest standing, which is better than
    // an empty card that says there is no reading today.
    if (!papers.length) {
      console.error('questNightly: nothing could be set for', dayKey, report)
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
