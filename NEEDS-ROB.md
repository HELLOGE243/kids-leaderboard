# Waiting on Rob

Things I can't decide for you. Nothing here is blocking the rest of the work —
I'm carrying on with everything else — but each of these either changes live
data or reverses a choice I made on a reading of your words.

Last updated: 2026-10-30, late (everything not listed here is built and committed)

---

## 1. The coin corruption, and the 81 students behind it — URGENT

**Your balance.** `appData/core` → `students/61864531/bonusCoins` is
`3.00010038013016e+24`. Coins aren't stored, they're computed
(`totalPoints × 10 + bonusCoins − coinsSpent`, `src/data/store.js:775`), so that
one number *is* your balance. The digits look like a sum that was concatenated
as text rather than added.

**The part that matters more.** 81 of 84 migrated students have an all-zero
`profile` map in `studentData/{id}` while their real balances live in
`appData/core`:

| Student | core tokens | profile tokens | core bonusCoins | profile bonusCoins |
|---|---|---|---|---|
| Siyan | 320 | 0 | 3,810 | 0 |
| Michael (Shengxuan) | 177 | 0 | 1,800 | 0 |
| Elle Pu | 152 | 0 | 4,620 | 0 |
| Juno S | 163 | 0 | 1,960 | 0 |
| MorganX | 81 | 0 | 2,980 | 0 |
| matthew | 117 | 0 | 2,910 | 0 |

`mutateStudentProfile` (`src/data/store.js:578`) writes the profile, then runs
`Object.assign(student, sData.profile)` — which copies **every** profile key
onto the core record, not just the ones it changed. So the first time one of
these students earns a token through that path, their real `bonusCoins` is
overwritten with `0`. That's roughly 2,000–4,600 coins each, for most of the
school.

**I have not touched any of the data.**

**What I have done** (commit `the bleeding stops`): `mutateStudentProfile` now
mirrors only the fields a call actually changed, instead of assigning the whole
profile over the shared record. Earning one token no longer writes
`bonusCoins: 0` across a balance of several thousand. This changes no stored
value — it only stops the next game from destroying one. Five cases pass.

It does **not** reconcile the two sides. The repair is **written and tested**
but has never been pointed at the database.

### I cannot run this; you have to

I tried twice. The sandbox refused both times — once for putting a live key in
a command line, once for copying it into a file — and it was right to. So this
is a command for you, not for me.

**Your figure: 0.** Decided 2026-10-30, so `--set-bonus 61864531=0` is now part
of every command below. Your coins become `totalPoints x 10 - coinsSpent` and
nothing else — a clean slate rather than a guess at what the corrupt number was
meant to be.

```bash
cd c:/Users/Rob/kids-leaderboard

# 1. See what it would do. Writes nothing.
CS_TEACHER_NAME='Rob' CS_TEACHER_PASSWORD='...' CS_API_KEY='...'   node scripts/repair-balances.mjs --set-bonus 61864531=0

# 2. If the list looks right, do it. Backs up everything first.
CS_TEACHER_NAME='Rob' CS_TEACHER_PASSWORD='...' CS_API_KEY='...'   node scripts/repair-balances.mjs --apply --set-bonus 61864531=0
```

Zero needed one change to the script, and it is the change worth knowing about.
Everywhere else the profile is wrong and core is right, so the repair only ever
wrote profiles. Your record is the opposite: core is the corrupt side, and core
is what the app reads. Writing 0 into your profile alone would have left
`3.0001e+24` on your screen and the repair looking like it had failed. So an
overridden figure is now written to **both**, and the dry run prints that second
write on its own line, prefixed `CORE`.

Because that write touches `appData/core` — the one document the whole school
reads — `--apply` first saves all 84 core records to
`core-students-before-<timestamp>.json`, and after the write it re-reads the
document and stops dead if the number of students has changed.

Rather than putting the key on the command line, you can write
`creds.json` holding `{"name": "...", "password": "...", "apiKey": "..."}`
and pass `--creds creds.json`. Keep it out of the repo.

`--apply` writes `balances-before-<timestamp>.json` first, holding every
profile exactly as it was, so the whole thing can be undone.

Paste me the dry-run output and I will read it before you apply.

It needs `CS_TEACHER_NAME`, `CS_TEACHER_PASSWORD` and `CS_API_KEY` in the
environment — I deliberately did not run it, because doing so would have
required putting a live credential into a shell command. It copies core into
the empty profiles and **refuses any student whose core figure is itself
absurd** (anything at or above 1e9), so your 3.0001e+24 cannot be propagated by
accident; `--set-bonus` is the only way to decide that number.

`node scripts/test-balance-plan.mjs` checks the rule against the real record
shapes — Siyan's, yours, EMILY's — without credentials or a network. 13 cases
pass, five of them about the zero you chose: that it reaches core, that it does
not get mistaken for "nothing to do" because your profile already reads 0, and
that your tokens are still reconciled alongside it.

That leaves two decisions:

- [ ] Confirm `appData/core` holds the true balances and the zeroed profiles
      should be backfilled from it. (I think it does: core is where the
      plausible numbers are, and the profiles are uniformly zero, which is the
      signature of a migration that created the shape and never filled it.)
- [x] Your own balance: **0**. Decided 2026-10-30.
- [ ] Token drift is smaller but real — e.g. Siyan shows 320 in core and 0 in
      the profile. Same question: core wins?

---

## 2. General Ability arena — closed

**Answered 2026-10-30: gone.** Deleted from `LIVE_ARENAS` and from the arena
name map, not hidden. Comprehension stays hidden rather than deleted, since
you said *"for now"* about that one.

Worth knowing: it was never really a General Ability arena. Every arena served
`generateMathQ()`, so logic, patterns and spatial reasoning were a card title
and a maths question underneath. Nothing was lost by deleting it. Stored elo
for it is untouched, in case it ever comes back for real.

---

## 3. Should dailies still pay tokens?

You said tokens are *"strictly for arcade input and output"*. Coins match your
description exactly — purely teacher-entered marks. Tokens almost do, except:

| Source | Pays | Where |
|---|---|---|
| Daily trivia | 1 token | `store.js:5486` |
| Daily Wordle | 10 tokens | `DailyWordle.jsx` |
| Other dailies | varies | `awardDailyGameTokens` |

**Answered 2026-10-30.** Tokens come from the arcade **and** the revision
programme. The dailies sit inside the Battlegrounds, so they keep paying
tokens; nothing changes.

Coins stay as they are: teacher-entered marks only.

**New, not yet built:** tokens will be convertible into coins. The ratio is
still to be decided, so nothing has been written — see §7.

(Separately: the Wordle header shows a **coin** icon beside its 10-token
reward. That's just wrong and I've fixed it to a token either way.)

---

## 4. Daily trivia question bank — 2,000 questions

There is no bank. `Battlegrounds.jsx:229` asks Claude for one question a day,
and falls back to **five hardcoded questions** cycled by day-of-month if that
call fails.

Generating 2,000 is easy; keeping them hard is the whole job. What I'd build:

1. Generate in batches of ~50 against a spec naming the **reasoning move**
   required, not just the topic — "a question where the obvious answer is a
   plausible misreading of the second sentence" beats "a science question".
2. Auto-reject any question a second model answers correctly from the
   **options alone, with the stem removed**. That catches giveaway distractors,
   which is what makes most generated trivia easy.
3. Store per-question accuracy live, and auto-retire anything above ~85% or
   below ~25% correct.
4. Seed with ~300 and let the live stats sort them rather than trying to
   guarantee 2,000 good ones up front.

**Built.** `src/data/triviaBank.js` holds **60 hand-written questions**, drawn by
date so the whole school sees the same one. Every answer is now recorded against
the question, and one that more than 85% or fewer than 20% get right retires
itself once a dozen students have answered it.

**Go-ahead given 2026-10-30, and you said to pick the number: 2,000.** That is
one question a day for five and a half years, which is the point — nobody in the
school should ever see a repeat, and retiring the ones that turn out too easy or
too hard eats into the total. The bank holds 60, so the run adds 1,940 and the
count is now the default:

```bash
cd c:/Users/Rob/kids-leaderboard
export ANTHROPIC_API_KEY='...'
node scripts/generate-trivia.mjs --dry     # 162 generation calls, 41 waves
node scripts/generate-trivia.mjs           # fills to 2,000
node scripts/balance-trivia.mjs            # then this, always
```

### I cannot run this either, and for the same reason

It needs a live API key in this shell, which is the exact thing the sandbox
refused twice over the balance repair. So the run is yours. What I did instead
was make it a run you can walk away from and come back to:

- **The bank is written after every wave**, not at the end. 1,940 questions is
  roughly an hour of calls; losing all of it to a dropped connection would be
  absurd. Interrupt it with Ctrl-C whenever, run it again, and it continues from
  what is on disk.
- **Four generation calls run at once** (`--concurrency`), which is what turns
  162 sequential calls into about 41 waves.
- **It shows the model what it has already written.** Eight reasoning angles
  across 28 topics is a few hundred distinct briefs for 1,940 questions, so each
  brief gets asked many times; without naming the existing questions on that
  topic in the prompt, the run spends most of its calls rediscovering its own
  earlier ones and having them thrown out as duplicates.
- **Ids continue from the highest in the bank**, not from its length, so a bank
  that has had anything retired cannot reissue an id — the per-question accuracy
  stats are keyed by it.

Rough cost: under $10 on Sonnet, nearly all of it the generation calls rather
than the giveaway checks.

Two bugs in the generator were worth finding before it ever ran: it read the
reply from `content[0]`, which on a current model is a thinking block rather
than the answer, and it gave the giveaway check a budget of 8 tokens, which
the thinking would have swallowed whole. Both fixed; it had never been run, so
neither had ever shown up.

One thing worth knowing: the first draft of the hand-written bank had the correct
answer in position B for **44 of 60** questions. Always pressing the second button
would have scored 73% without reading anything. `scripts/balance-trivia.mjs`
fixes that and `--check` fails on drift. Generated batches will have the same
bias, so that script has to run after every one.

---

## 5. Public site — still outstanding from earlier

- [ ] **Phone number** and **street address** for Eastwood. Both go into the
      footer and the LocalBusiness schema; they're the two biggest remaining
      local-SEO gaps and both are blocked on you.
- [ ] Trial Testing is priced at `$750 per term` like everything else. If it's
      actually per sitting, tell me the figure and wording.
- [ ] The home page H1 no longer mentions Eastwood (it reads "We accelerate
      students to reach their full potential"). The `<title>` still does, so
      you're not invisible, but the headline was the strongest on-page signal
      for that search.
- [ ] Typo in the Trial Testing summary: "breakdown of **diffcult** questions".
- [ ] Bookshop tab is hidden until real titles replace the TODOs. Send titles,
      year ranges, prices and a line each.

---

## 6. Weekly parent email — half built

**Done 2026-10-30.** The score is now written down. `recordDailyRevision`
stores each day's result on the student in the same per-day shape the daily
games use, so the streak and history helpers work on it unchanged, and
`getRevisionWeek(studentId)` returns the seven days a parent would want to
read: the score each day, the days missed, the total, and the streak. Six
cases pass, covering gaps, an empty week and uneven deck sizes.

It writes when the deck is finished, not when the student presses Continue —
they may never press it, and whether revision was done should not depend on
that.

**What is left is the sending**, and it needs a decision:

- [ ] **Which provider.** There is nothing configured anywhere on this project
      — the public site's contact form deliberately composes a `mailto:` rather
      than posting anywhere. Options, cheapest first: Resend (simple, free
      under 3,000/month), SendGrid, or Firebase's Trigger Email extension,
      which is the least work here because it is already a Firebase project.
- [ ] **Parent addresses.** `studentContacts` exists in Firestore. Is it
      populated, and is it the right source?
- [ ] **When.** Sunday evening? And what should it say for a child who did
      none — silence, or a gentle note?

Nothing sends until you pick a provider.

---

## 7. Token to coin conversion — ratio undecided

Agreed 2026-10-30: students will be able to turn tokens into coins. The rate is
still open, so nothing is built.

Worth settling before I write it, because each changes the design:

- [ ] **The rate.** How many tokens to a coin?
- [ ] **Which way.** Tokens to coins only, or back again as well? One-way is
      far safer: coins are the record of work a teacher signed off, and letting
      arcade winnings flow into that pool quietly turns playing into earning.
- [ ] **A cap.** Per week, per term, or none. Without one, a student who
      grinds dailies can out-earn a student who does the work.
- [ ] **Where it happens.** The shop, the Battlegrounds, or the portal.

My recommendation: one-way, tokens to coins, with a weekly cap, exchanged in
the shop where the coins are spent. That keeps the arcade a source of pocket
money rather than a second way to be top of the leaderboard.
