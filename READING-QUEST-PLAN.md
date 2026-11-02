# The Daily Quest — a plan

Three reading tasks a day, at two levels, each with six Cambridge-style
comprehension questions. Generated overnight, the same for every student, from
sources we are allowed to use.

This is a plan, not a built thing. Nothing here is coded yet. Read §1 first: it
is the part that changes what the rest can be.

---

## 1. The constraint that shapes everything: we cannot reproduce the text

The request is for AI to "discover a piece of journalism, or an extract from a
novel by chapter" and put the reading material in front of students. Done
literally, that copies a news article or a chapter of an in-copyright novel
onto a server and redistributes it to eighty-odd children. That is
infringement, and a tutoring business is exactly the kind of defendant a
publisher writes to.

Australia's education exceptions (Copyright Act ss 113F–113P, fair dealing for
research or study) are real but narrower than people assume, and they do not
cover "we stored the whole article and served it daily to our customers".

So the plan does not fight this. It **sources by licence** instead of by
search. Three genres, three licence stories:

| Genre | Source | Licence | What we store |
|---|---|---|---|
| **Fiction** | Project Gutenberg | Public domain | The extract, in full, legally |
| **Essay** | The Conversation | **CC BY-ND** — explicitly republishable with attribution | The article, in full |
| **News** | AI-written report from several cited sources | Our own text | Our text + links out |

- **Fiction is the easy one.** Gutenberg is 70,000+ public-domain books with
  chapter structure intact. Treasure Island, Jane Eyre, The Time Machine,
  Sherlock Holmes, Anne of Green Gables — this is most of a Y6–Y9 fiction
  syllabus already. Australian copyright is life + 70, so anyone who died
  before 1956 is clear: Orwell (1950) is public domain here, which gets you
  Animal Farm and the essays.
- **The Conversation is the find.** Academics writing for a general audience,
  published CC BY-ND, which permits verbatim republication with attribution.
  Reading level sits naturally around Y9, and it has a daily feed.
- **News is the one that needs a decision, and it is yours.** Two routes:
  - **(a) Our own report.** The model reads 3–4 sources via web search and
    writes a ~450-word report of its own. Fully ours, level-controllable, no
    licence question. **Risk: it can get facts wrong,** and a wrong fact in a
    comprehension paper is a question with no correct answer. Mitigated by
    citing every source under the piece and keeping it to events, not analysis.
  - **(b) Extract and link.** Two or three sentences quoted, questions about
    the quoted part, "read the full article" link out. Defensible as fair
    dealing, but a three-sentence extract will not carry six
    proficiency-level questions.

  **My recommendation: (a),** with every source linked beneath the piece so a
  teacher can check it, and a standing rule about what the news slot may cover
  (§5).

**What I need from you:** route (a) or (b) for news. Nothing else in this plan
depends on the answer.

---

## 2. What gets made each night

Six papers. Three genres × two levels.

```
news    / Y6      news    / Y9
essay   / Y6      essay   / Y9
fiction / Y6      fiction / Y9
```

Each paper:

```js
{
  id: 'rq-xxxxxx',
  day: '2026-11-03',                  // Sydney date it is set for
  genre: 'news' | 'essay' | 'fiction',
  band: 'y6' | 'y9',
  title: 'The Tell-Tale Heart, opening',
  source: 'Project Gutenberg',
  sourceUrl: 'https://...',           // link out, always
  attribution: 'Edgar Allan Poe, 1843. Public domain.',
  licence: 'public-domain' | 'cc-by-nd' | 'original',
  text: '<p>...</p>',                 // 400-900 words, HTML paragraphs
  wordCount: 712,
  readability: { fk: 6.8, band: 'y6' },  // measured, not claimed
  minutes: 4,                         // estimated at 180 wpm
  questions: [ /* 6, see §4 */ ],
  provenance: { sources: ['url', 'url'], generatedAt: '...', model: '...' },
}
```

Stored exactly the way trivia already is, because that pattern is built and
working:

- **`readingQuests/{id}`** — the long-term bank. Every paper ever made, never
  deleted. This is the asset: in a year it is ~2,000 papers and 12,000
  questions, at which point the nightly job can draw from the bank instead of
  generating, and the running cost falls to near zero.
- **`dailyQuest/{dayKey}`** — the six papers set for one day. Readable by any
  signed-in student, **writable by nobody** (rules, same as `dailyTrivia`). One
  document, so every student in the school reads the same three pieces and a
  school-wide percentage means something.

---

## 3. Choosing the text, and proving it is the right level

The model is asked to pick, but it does not get the last word on level. It
claims a level; we **measure** one.

**Flesch–Kincaid grade level**, computed server-side in about twenty lines. No
API call, no cost:

```
FK = 0.39 × (words/sentences) + 11.8 × (syllables/words) − 15.59
```

Accept bands, deliberately generous at the edges:

| Band | Accept FK | Target words |
|---|---|---|
| Y6 | 5.0 – 7.9 | 400–650 |
| Y9 | 8.0 – 11.5 | 600–900 |

Outside the band, the paper is **rejected and re-rolled**, up to twice, then
the slot is skipped and yesterday's stands. Same generate → gate → bank shape
as the trivia job, and that gate is the reason the trivia bank does not fill
with rubbish.

FK is crude — it cannot tell that a short sentence about mitosis is harder than
a long one about a dog — so it is a **floor, not a judgement**: it catches the
Y9 paper that is really Y12 and lets a teacher's eye do the rest.

**Dedup.** Every paper's `(source, title, chapter)` goes into an index, checked
before generating, so no book gets the same chapter twice and no news story is
covered twice in a week. Same mechanism as the trivia stem index.

---

## 4. The six questions

This is the part that decides whether it feels like a real paper or a quiz.
Left to itself a model writes six detail-retrieval questions. Cambridge papers
do not. So the **mix is specified, not requested**:

| # | Type | What it tests |
|---|---|---|
| 1 | Main idea / gist | The whole piece, not a line of it |
| 2 | Specific detail | Located reading |
| 3 | Specific detail | Located reading |
| 4 | **Inference** | What is implied, never stated |
| 5 | **Vocabulary in context** | A word whose meaning shifts in this passage |
| 6 | **Author's purpose or tone** | Why it was written this way |

Four options each, one correct, each with an explanation keyed to the paragraph
it came from so that review has something to say.

**The gate that matters.** For comprehension the fatal flaw is a question
answerable *without reading the passage* — general knowledge or common sense
dressed up as reading. So every question is tested by a second, cheap call that
tries to answer it **with the passage withheld.** If it gets it right, the
question is thrown away.

This is the trivia giveaway check pointed at a better target. I expect it to
reject 20–30% of generated questions, which is the point — so generate **eight
questions per paper to keep six**.

**Answer position** is rotated to a position taken in turn as each question is
written, reusing `rotateAnswerTo` in `functions/index.js` — already built and
tested across all sixteen cases. Without it the bank drifts into exactly the
bias the static trivia bank had (answer B in 44 of 60), where a child who
presses the second button every time scores 73%.

---

## 5. Suitability, which is not optional

A model told to find today's news will find war, a murder trial, or a child's
death, because that is what news is. On a platform for ten-year-olds that
cannot be left to chance.

Two layers, then a human one:

1. **An exclusion list in the prompt**, concrete rather than vague: no deaths
   of named individuals, no violent crime, no sexual content, no war
   casualties, no suicide or self-harm, no graphic medical detail, no partisan
   political advocacy, nothing about a named child. Fine: science, discovery,
   space, animals, technology, sport, archaeology, environment, the arts,
   infrastructure, weather.
2. **A separate suitability call** on the finished piece — one cheap request,
   "is this suitable for a 10-year-old in a school setting, and why not" —
   which can veto. A veto drops the slot to yesterday's piece rather than
   publishing.
3. **A teacher moderation queue.** In the admin panel, a Quest tab showing
   today's six as cards, each with a **Pull** button that removes it and
   promotes a bank paper in its place.

I recommend **publish-then-pull, not approve-then-publish.** An approval queue
means the one morning nobody opens the panel, eighty students have no reading.
A daily thing must not depend on a daily human act.

---

## 6. What the student sees

In the existing Reading Room ([ReadingRoom.jsx](src/pages/ReadingRoom.jsx)),
which already has tabs for Daily Readings and Library. The quest becomes a
third tab — or better, **replaces the Daily Readings tab**, with three cards
instead of one:

```
  TODAY'S QUEST                                    0 of 3 done

  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
  │  NEWS            │  │  ESSAY           │  │  FICTION         │
  │  Why the reef is │  │  What makes a    │  │  Treasure Island │
  │  growing again   │  │  language die    │  │  ch. 1           │
  │  4 min · 6 q     │  │  6 min · 6 q     │  │  5 min · 6 q     │
  │  [ Start ]       │  │  [ Start ]       │  │  [ Start ]       │
  └──────────────────┘  └──────────────────┘  └──────────────────┘
```

The band comes from the student's own year group, not from asking:

| Year group | Band |
|---|---|
| 3–7 | y6 |
| 8–12 | y9 |

With a quiet "read the harder one instead" link, because a strong Y6 should be
allowed to reach.

Inside a task: passage on the left, one question at a time on the right — **the
layout the imported-paper reader already draws.** `importQuizSetsFromPDF` in
[store.js](src/data/store.js) already treats "one passage, several questions
about it" as a first-class shape (`text` = passage, `prompt` = the question),
and `HomeworkDashboard` already renders it with review, explanations and
per-question timing. **This is the biggest reuse in the plan**, and it is why I
would build the quest as a reading-flavoured quiz set rather than a new reader.

**Rewards.** `READING_TOKENS = 5` currently pays for marking a reading done. I
would keep that for finishing the reading and pay the questions separately —
2 coins a correct answer, 15 for all six — so reading is rewarded even when the
comprehension is weak. The rate is yours; the mechanism (`addTokens`, the coin
path) is already there.

**Streaks.** `getReadingStreak` counts from the log, so it keeps working.
Whether a streak needs all three tasks or any one is a real choice: **any one**,
I think. Three a day is a lot, and a streak that breaks constantly stops
motivating anybody.

---

## 7. What it costs to run

Per night, six papers:

| Call | Count | Rough tokens |
|---|---|---|
| Source and write the piece (web search for news) | 6 | ~12k in, 2k out |
| Write eight questions from the piece | 6 | ~3k in, 2.5k out |
| Giveaway check, per question | 48 | ~400 in, 100 out |
| Suitability check | 6 | ~1.5k in, 100 out |

At Sonnet 5.5 rates that lands around **$0.30–0.50 a night, so $10–15 a
month**, plus web search charges on the news slot only. **I have not confirmed
current web-search tool pricing** — that needs checking before you commit, and
it is the one line I can see being a surprise.

**The cost falls over time.** Once the bank holds a few hundred papers, most
nights can draw from it rather than generate — fiction especially, since a
public-domain chapter is as good in a year as it is tonight. Generation becomes
top-up, not supply.

It runs on what is already there: `functions/index.js` reaches Claude through
workload identity federation, so **no API key is needed** and no credential has
to be handed to anyone. Same route as the nightly trivia job.

---

## 8. Build order

Each phase is useful and testable on its own. Phases 0 and 1 need no
credentials and no deploy, so they can be proven before anything costs money.

**Phase 0 — the pure parts, with tests.** No API, no network.
- `readability.mjs`: FK grade, syllable counting, word and sentence splitting
- `quest-shape.mjs`: validates a paper — six questions, four options, one
  correct, the type mix present, word count in band
- the dedup index, and the band-from-year-group rule
- a test harness in the style of `scripts/test-balance-plan.mjs`, which is how
  the balance repair got proven before it ever touched the database

**Phase 1 — sourcing, one genre at a time, run by hand.** Fiction first: public
domain, so no licence question and no suitability worry. A script that fetches
a Gutenberg text, picks a chapter, measures it, and prints what it *would*
store. Then The Conversation. News last, because it waits on your §1 decision.

**Phase 2 — the nightly job.** `exports.questNightly`, 2am Sydney, after the
trivia job. Generate, gate, bank, publish `dailyQuest/{dayKey}`. An admin-only
`questNightlyRun` so the first run need not wait for 2am, exactly as
`triviaTopUpRun` is set up. Plus firestore rules for the two new collections,
read-only to students.

**Phase 3 — the student screen.** Three cards in the Reading Room, the
passage-and-questions reader reusing the imported-paper path, scoring, rewards.

**Phase 4 — the teacher panel.** Today's six as cards, a Pull button, a view of
the bank.

**Phase 5 — the parent email.** The weekly revision email is already recorded
but unsent, waiting on a provider. Three reading tasks a day with scores is far
better material for that email than revision alone — "read 14 of 21 pieces this
week, 71% comprehension" is a sentence a parent can act on.

---

## 9. Where I think this gets into trouble

Written down now so it is not a surprise later.

- **News facts.** Route (a) means we publish our own reporting. A model that
  misremembers a number publishes a comprehension question with a false
  premise. Links to every source are a mitigation, not a fix.
- **"Cambridge-style" is a standard, and we would be asserting it.** The
  six-type mix gets the shape right. Whether the questions are as
  discriminating as a real proficiency paper is something only you can judge,
  by reading a week of them. Plan for that week.
- **Fiction extracts lose their context.** Chapter 14 assumes thirteen
  chapters. Either stay near openings, or have the model write two sentences of
  set-up — our own text, so no licence problem.
- **Three a day may be too much.** Eighteen questions and ~1,800 words daily,
  on top of revision, trivia, Wordle and homework. It may be better as three
  offered and one required. Watch the completion rate in week one and be
  willing to cut it to one.
- **The Conversation's ND clause** forbids derivative works: republishing whole
  and attributed is fine, editing the text to simplify it is not. For the Y6
  essay slot that bites — their writing is pitched at adults, so expect most of
  their articles to fail the Y6 FK gate. The Y6 essay may have to come from
  elsewhere, or be our own.
