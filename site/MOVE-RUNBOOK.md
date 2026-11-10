# Moving the public site to its own Firebase project

Why: one `firebase deploy` from the current repo redeploys the study app's
hosting, its 27 functions **and** its Firestore and Storage rules. The npm
scripts are a seatbelt. A separate project is a wall.

Doing it before the Stripe work, because webhook endpoints, restricted keys,
secrets and service accounts are all created against a project — build them
against `cleverspacev2` and they all get built twice.

Order matters in two places, both marked ⚠.

---

## Step 0 ⚠ — commit what's here first. **Blocking.**

17 files from the current session are uncommitted and there are no stashes.
Moving a repo with uncommitted work is how work gets lost. Nothing below starts
until this is committed.

*Say the word and I'll commit it — I don't commit without being asked.*

---

## Step 1 — create the project *(yours)*

[console.firebase.google.com](https://console.firebase.google.com) → **Add project**

- **Name:** AVANT Site
- **Project ID:** try `avant-school`. IDs are globally unique, so if it's taken
  the console will offer a suffix — take whatever it gives and tell me the
  exact string. Everything below calls it `PROJECT_ID`.
- **Google Analytics:** off. Nothing on the site uses it, and it can be added
  later.
- Then **Upgrade to Blaze** and link the *same billing account* as
  `cleverspacev2`. One billing account can carry several projects, and each
  project gets its own free tier — so this costs nothing extra and gives you
  headroom back.

**Stop there.** Don't add the custom domain yet; the order matters (step 5).

---

## Step 2 — the new repo *(mine)*

A sibling folder, its own git repo:

```
avant-site/
  site/              build.mjs, edit.mjs, cart.js, timetable.mjs, assets, config
  site/functions/    the payment functions - now the ONLY codebase
  scripts/           test-cart.mjs, test-timetable.mjs
  public/            the 5 brand files build.mjs reaches for:
                       avant-logo.png, avant-mark-{32,180,512}.png, logo.svg
  firebase.json      prepared already - see below
  .firebaserc        PROJECT_ID
  package.json       test + deploy scripts
```

`site/` needs nothing else: it is pure Node stdlib, zero npm dependencies, and
imports nothing from the app. The app references `site/` nowhere.

**History:** `git subtree split --prefix=site` carries the 12 commits that
touch it. The root-level files land as one commit on top. The old repo stays as
the archive either way.

### The new `firebase.json` is already built

Generated from the live one, so the **34 legacy redirects** come across
verbatim rather than retyped — those are old WordPress URLs still linked from
search results, and a subtly wrong one is a 404 for a parent who found you on
Google. Both header rules, `cleanUrls` and `trailingSlash` come too.

It is at
`C:\Users\Rob\AppData\Local\Temp\claude\9f3527de835d4522\a8fb8ef5-04f9-4fee-8a52-5bf126eaf53a\scratchpad\firebase.new.json`

Two simplifications fall out of the move:

- **One hosting site**, so no `"site"` key — it's the project default.
- **One functions codebase**, so no split, no `--only functions:marketing`
  discipline to remember, and §6 and §7 of `STRIPE-PLAN.md` stop existing.

---

## Step 3 — first deploy, to the Firebase domain *(mine, you approve)*

```bash
npm run build          # all three outputs
firebase deploy --only hosting --project PROJECT_ID
```

Lands on `https://PROJECT_ID.web.app`. **avant.school is untouched and still
live on the old project** while we check this one.

### What gets checked before the domain moves

- every page renders, nav and footer links resolve
- a sample of the 34 redirects actually redirect
- the basket: choose classes, cross to `/enrol/`, the email composes
- `/__timetable` is *not* reachable (it's the local editor, never deployed)
- no console errors, no mixed content

---

## Step 4 — functions region *(mine)*

The app's functions run in `australia-southeast1`. The new ones use the same:
closest to your parents, and consistent with what you already run.

---

## Step 5 ⚠ — move the domain *(yours)*

**The trap: Firebase will not let two projects claim the same domain.**
`avant.school` is currently attached to a Hosting site in `cleverspacev2`, so
it must be released there *first* or the new project cannot claim it.

1. **Old project** → Hosting → find the site holding `avant.school` → remove
   the custom domain. *(The site stays up on its `.web.app` address.)*
2. **New project** → Hosting → **Add custom domain** → `avant.school`
3. Firebase asks for a **TXT record** to prove ownership. Add it at your
   registrar, wait for it to verify.
4. Firebase then gives you **A records**. If they match what's there, nothing
   changes; if not, update them.
5. Add `www.avant.school` as a second domain, redirecting to the apex — this
   was already on the list.
6. The TLS certificate issues itself: usually minutes, occasionally up to 24
   hours. The site stays reachable on `PROJECT_ID.web.app` throughout.

**Smallest window:** do steps 1 and 2 back to back. Between them the apex
domain has no host, so keep it to minutes, and do it at a quiet hour.

---

## Step 6 — clean up the old repo *(mine, only after step 5 is verified live)*

Nothing is deleted until the new site is confirmed serving on `avant.school`:

- remove the `avant-oc-selective` hosting block from the old `firebase.json`
- put `functions` back to a single object — the codebase split becomes dead
  weight once the marketing functions live elsewhere
- delete `site/` and the two site test scripts
- leave the 5 brand images in `public/`; the app may use them, and they cost
  nothing

The study app's own config is untouched at every step.

---

## Step 7 — Stripe, in the new project

`STRIPE-PLAN.md` carries on from its §9 step 4, minus the codebase work:

- secrets created against `PROJECT_ID`
- `/api/checkout` via a hosting rewrite, so the browser call is same-origin and
  there is no CORS to configure
- the **webhook on the direct function URL**, not the hosting rewrite — one
  less hop, and no CDN between Stripe and the signature check

---

## What this does not change

The study app. It keeps its project, its functions, its rules and its data
exactly as they are. After step 6 nothing in the site's repo can address it.
