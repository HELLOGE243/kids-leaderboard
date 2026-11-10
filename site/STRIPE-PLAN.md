# Taking payment on the public site

Basket checkout for **avant.school**, in a second Firebase Functions codebase
so the student and teacher app is never in the blast radius.

Written 2026-11-10. Every open decision is now settled; §2 records them.

---

## 1. What is already true

Facts from the repo, not assumptions:

| Thing | Where | Note |
|---|---|---|
| Firebase project | `cleverspacev2` | **One project for both sites** |
| Student/teacher app | hosting site `cleverspacev2` | `src/`, Vite |
| Public site | hosting site `avant-oc-selective` | `site/`, own generator |
| App functions | `functions/` | ~27 exports, **all the app's** |
| Runtime | Node 22, `firebase-functions` ^5 | 1st-gen style (`functions.https.onRequest`) |
| Firebase CLI | 15.28.1 | codebases need ≥ 10.7.1, so fine |
| `gcloud` | **not installed** | needed for Secret Manager |

### Already built, not yet deployed

- Every class carries its own `price`, editable in `/__timetable`, falling back
  to the subject's price when blank.
- A per-class Stripe **Payment Link** field, validated on the way in *and* out
  against `https://buy.stripe.com/` — protocol and host both. Seven near-misses
  refused by name in `scripts/test-timetable.mjs`.
- Pay buttons on the enrolment page, and copy that stops saying "nothing is
  paid here" the moment a link exists.

This is a working, serverless way to take money today. Its limit is that one
Payment Link is one fixed price, so three classes is three payments. **This
plan replaces it with one payment per basket.**

### Scaffolding in place (this session)

- `.firebaserc` pinning the project — it did not exist, so the project was
  remembered only in the CLI's own configstore.
- `firebase.json` `functions` split into codebases `app` and `marketing`.
  Verified: every other block is byte-identical.
- `site/functions/` with one `marketingPing` function and no Stripe code, for
  the isolation proof in §9 step 2.
- `npm run deploy:site` / `npm run deploy:payments`.

---

## 2. Decisions — all settled

- ✅ **Basket, not per class.** One Checkout Session for everything chosen.
- ✅ **Full term**, one charge at the class price.
- ❌ **No seat locking.** *Parked, not rejected* — see §8. Two parents can buy
  the last place in the same minute; you sort it out by phone. This is the
  decision that keeps this a few days rather than a week, and it is why there
  is no database below.
- ❌ **No refund flow.** Refunds, when you choose to give one, are issued by
  hand in the Stripe dashboard.
- ⚠️ **But the page must not say "no refunds".** Under the Australian Consumer
  Law the consumer guarantees cover services and cannot be excluded by a
  policy; the ACCC treats a flat "no refunds" claim as misleading in itself and
  swept 2,000+ retail sites for it in February 2025. Lawful wording says what
  you *do* offer and leaves the guarantees intact:

  > Term fees are paid in full and are not refundable for a change of mind.
  > This does not limit your rights under the Australian Consumer Law.

  **Outstanding:** have a lawyer or your accountant approve the final sentence.
  It goes on the enrolment page before the first payment.

---

## 3. Architecture

```
  browser (site/cart.js, /enrol/)
        │  POST /api/checkout   { items: [{ priceId, qty }], names, years }
        ▼
  hosting rewrite on avant-oc-selective
        │
        ▼
  function  marketing:createCheckout
        │  every priceId checked against a generated allowlist
        │  stripe.checkout.sessions.create({ line_items, mode: 'payment' })
        ▼
  checkout.stripe.com   (Stripe prices the line items, not us)
        │
        ├─ success_url → /enrol/thanks/?session_id={CHECKOUT_SESSION_ID}
        │
        └─ webhook: checkout.session.completed
                 ▼
           function  marketing:stripeWebhook
                 └─ emails the school, and the parent a confirmation
```

**Two functions. No database.** Stripe is the ledger: the dashboard is where
enrolments and refunds are reconciled, which is where you would look anyway.
Nothing on the public site touches the app's Firestore, so the separation is
structural rather than a rule someone has to remember.

### Why no price table on the server

The browser sends **price IDs only, never amounts**, and Stripe prices the line
items itself — so there is nothing a tampered request can inflate. The
allowlist exists only to stop a checkout against a price of yours that isn't a
class. It is generated from `site.config.json` at build time into
`site/functions/prices.json`: no network call, no second source of truth, and
it can only go stale at the moment the timetable changes, which is also when it
is rewritten.

---

## 4. The changes, file by file

### 4.1 `firebase.json` — one hosting rewrite ✱ not yet done

The `avant-oc-selective` block has no rewrites today. Add exactly these two and
nothing broader — a `**` rewrite here would stop the static files serving.
Add them **only once the functions exist**, or the deploy fails.

```jsonc
"rewrites": [
  { "source": "/api/checkout",       "function": "createCheckout" },
  { "source": "/api/stripe-webhook", "function": "stripeWebhook" }
]
```

### 4.2 `site/functions/`

```
site/functions/
  package.json   deps: stripe, firebase-functions
  index.js       marketingPing, createCheckout, stripeWebhook
  basket.js      basket → line_items, and the allowlist check.
                 Pure: no Stripe, no network, so it is unit-testable.
  prices.json    generated — the allowlist of sellable price IDs
```

### 4.3 `site/timetable.mjs` — the admin field changes

Replace the Payment Link field with a **Stripe price ID** (`price_…`). One
field, one source of truth, and the Stripe dashboard then groups takings by
class. Validation becomes `^price_[A-Za-z0-9_]+$`, with the same
refuse-by-name tests the link validation already has.

The no-JavaScript argument for keeping the link does not hold: the enrolment
page already tells a visitor without JavaScript to use the enquiry form.

`enrolled` keeps its current meaning — a number you type — because without seat
locking nothing counts itself.

### 4.4 `site/build.mjs`

- emit `priceId` into `catalogue.js` instead of `pay`
- write `site/functions/prices.json` in the same pass
- a `/enrol/thanks/` page
- the enrolment page's promise copy keys off "any class has a price ID", as it
  now keys off "any class has a link", plus the §2 refund sentence

### 4.5 `site/cart.js`

One **Pay for all N classes** button replacing the per-class ones: POST the
basket, then `window.location.href = session.url`. The email enquiry stays
beside it — not every parent will want to pay on the spot.

---

## 5. Secrets

Two, both in Secret Manager via `defineSecret`, never in the repo and never
pasted into a chat window:

```bash
gcloud secrets create STRIPE_SECRET_KEY    --project=cleverspacev2 --data-file=-
gcloud secrets create STRIPE_WEBHOOK_SECRET --project=cleverspacev2 --data-file=-
```

- `STRIPE_SECRET_KEY` — a **restricted** key, scoped to write Checkout Sessions
  and read Prices. Not the account's live secret key.
- `STRIPE_WEBHOOK_SECRET` — from the webhook endpoint, for signature checks.

Test mode first, with its own pair, end to end, before either live key exists.

### Dedicated service account

Still worth doing even without a database. By default both codebases run as the
same project service account; give the marketing functions their own identity
with no roles beyond reading these two secrets, so a compromised payment
function has nothing else to reach.

```bash
gcloud iam service-accounts create avant-marketing \
  --project=cleverspacev2 --display-name="AVANT marketing site functions"
```

---

## 6. Deploy discipline — the point of all this

| Do | Don't |
|---|---|
| `npm run deploy:payments` → `--only functions:marketing` | `firebase deploy --only functions` ← **deploys both codebases** |
| `npm run deploy:site` → `--only hosting:avant-oc-selective` | `firebase deploy` ← everything, including the app |

Two codebases stop the CLI *prompting to delete* the other's functions. They do
**not** stop a bare `--only functions` from redeploying the app's 27 functions.
The guard is the command you type, which is why both safe forms are now npm
scripts.

---

## 7. What stays shared, and what that means

Separate codebases are not separate systems. Still shared: the project, the
billing account, Firestore, `firestore.rules`, `storage.rules`, and the
functions quota. A runaway marketing function can exhaust quota the app needs.
Accept it, or move the public site to its own Firebase project later — that is
the only real isolation, and a bigger job than this one.

---

## 8. Parked: seat locking

Not built, and nothing here forecloses it. If overselling turns out to be a
real problem, it is additive: a Firestore database named `marketing`, an IAM
Condition scoping the marketing service account to it, a 30-minute hold at
checkout (`expires_at`; Stripe's minimum is 30 min, max 24 h), release on
`checkout.session.expired`, a scheduled sweep for holds whose webhook never
arrived, and a cached `/api/seats` for the tiles. Stripe documents the pattern
under *managing limited inventory*. Roughly a week on top.

---

## 9. Sequence

| # | Step | Who | Done when |
|---|---|---|---|
| 1 | Install `gcloud`, sign in | You | `gcloud auth login` succeeds |
| 2 | Deploy `site/functions/` with **only `marketingPing` in it** | Me | `marketingPing` answers, and the app's 27 functions show an unchanged deploy time. **If this touches the app, stop.** |
| 3 | Verify the two unknowns in §10 | Me | One test request each |
| 4 | Stripe **test mode**: a Product + Price per class, restricted key, webhook endpoint; put both secrets in Secret Manager | You | Price IDs ready to paste; secrets created |
| 5 | `basket.js` + tests, then the admin field change | Me | Allowlist refuses anything that is not a class |
| 6 | `createCheckout` + the Pay button + the rewrite | Me | A basket becomes one Stripe page at the right total |
| 7 | `stripeWebhook` + idempotency + emails + `/enrol/thanks/` | Me | A twice-delivered event sends one email |
| 8 | Test mode end to end: pay, abandon, refund by hand | Both | All three behave |
| 9 | Refund wording approved; live keys; one real class, one real parent | You + me | Money arrives |

Step 1 is yours and unblocks step 2. Step 4 is yours and can run in parallel
with 5. Step 2 proves the premise, so it goes first and alone.

**Rough effort:** step 2 an afternoon, steps 5–8 two to three days.

---

## 10. Two things to verify before writing the webhook

Both cheap, both reported inconsistently in public sources:

1. **`req.rawBody` on 2nd-gen functions.** Stripe's signature check needs the
   unparsed body. Documented on 1st-gen; there are 2024 reports of it missing
   on 2nd-gen. One deployed test request settles it. If it is missing, the
   webhook stays 1st-gen.
2. **The exact `defineSecret` shape in `firebase-functions` v5.** The pattern is
   stable; read the v5 signature from the installed package, not a blog.
