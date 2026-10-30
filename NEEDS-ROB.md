# Waiting on Rob

Things I can't decide for you. Nothing here is blocking the rest of the work —
I'm carrying on with everything else — but each of these either changes live
data or reverses a choice I made on a reading of your words.

Last updated: 2026-10-30 (everything not listed here is built and committed)

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
but has never been pointed at the database:

```
node scripts/repair-balances.mjs                          # dry run, writes nothing
node scripts/repair-balances.mjs --apply
node scripts/repair-balances.mjs --apply --set-bonus 61864531=1710
```

It needs `CS_TEACHER_NAME`, `CS_TEACHER_PASSWORD` and `CS_API_KEY` in the
environment — I deliberately did not run it, because doing so would have
required putting a live credential into a shell command. It copies core into
the empty profiles and **refuses any student whose core figure is itself
absurd** (anything at or above 1e9), so your 3.0001e+24 cannot be propagated by
accident; `--set-bonus` is the only way to decide that number.

`node scripts/test-balance-plan.mjs` checks the rule against the real record
shapes — Siyan's, yours, EMILY's — without credentials or a network. 8 cases pass.

That leaves three decisions:

- [ ] Confirm `appData/core` holds the true balances and the zeroed profiles
      should be backfilled from it. (I think it does: core is where the
      plausible numbers are, and the profiles are uniformly zero, which is the
      signature of a migration that created the shape and never filled it.)
- [ ] Your own balance: what should it be? Earlier working put the honest
      figure near **1,710**, but you should pick. Your `bonusCoins` is
      currently `3.0001e+24` and I will not guess at what it was meant to be.
- [ ] Token drift is smaller but real — e.g. Siyan shows 320 in core and 0 in
      the profile. Same question: core wins?

---

## 2. General Ability arena — did you mean to lose it?

You said *"remove the comprehension arena for now, we'll only have maths arena
and arcade"*. I took the second clause as the end state and hid **both**
comprehension and general ability, leaving Maths + Arcade.

They are hidden, not deleted — `hidden: true` in `LIVE_ARENAS`
(`src/pages/Battlegrounds.jsx:23`). Either comes back by deleting that one flag.

- [ ] Keep General Ability hidden, or put it back?

---

## 3. Should dailies still pay tokens?

You said tokens are *"strictly for arcade input and output"*. Coins match your
description exactly — purely teacher-entered marks. Tokens almost do, except:

| Source | Pays | Where |
|---|---|---|
| Daily trivia | 1 token | `store.js:5486` |
| Daily Wordle | 10 tokens | `DailyWordle.jsx` |
| Other dailies | varies | `awardDailyGameTokens` |

- [ ] Leave the dailies paying tokens, or cut them to arcade only?

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

The generator is written and gated but **not run** — it spends API tokens:

```
node scripts/generate-trivia.mjs --dry --count 300    # shows what it would do
node scripts/generate-trivia.mjs --count 300          # needs ANTHROPIC_API_KEY
node scripts/balance-trivia.mjs                       # run after any batch
```

- [ ] Say the word and how many, and I'll run it to get you towards 2,000.

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

## 6. Weekly parent email — noted, not started

The daily revision score now shows on the results card, but it is only React
state and is thrown away when the session ends. Nothing persists a per-day
result yet, so that's step one. There is also no email provider configured
anywhere on the project, so sending needs a provider decision before any of it
can work.
