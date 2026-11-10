/**
 * Builds the public site from site.config.json.
 *
 * Three static pages, no framework and no client-side rendering: a search
 * engine is handed finished HTML, and a parent on a phone is handed a page
 * that paints before they lose interest. The portal is a separate application
 * at its own address and is only ever linked to from here.
 *
 * Nothing marked TODO in the config reaches the output. A half-filled price or
 * an invented testimonial is worse than an absent one, so the build drops the
 * section and says so rather than printing a placeholder to a customer.
 *
 *   node site/build.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here,
  process.argv.includes('--edit') ? 'editing'
  : process.argv.includes('--preview') ? 'preview'
  : 'dist')
const cfg = JSON.parse(readFileSync(join(here, 'site.config.json'), 'utf8'))

// The stylesheet is cached for a day, which is right for visitors and wrong
// for the next edit: a change to it is invisible until the cache expires. The
// link carries a hash of the file, so a changed stylesheet is a new URL and
// an unchanged one stays cached.
const cssText = readFileSync(join(here, 'styles.css'), 'utf8')
const cssVersion = createHash('sha1').update(cssText).digest('hex').slice(0, 8)
const cartText = readFileSync(join(here, 'cart.js'), 'utf8')
const cartVersion = createHash('sha1').update(cartText).digest('hex').slice(0, 8)

// Anything in site/assets is published as-is under /assets. Dropping a file
// in is the whole publishing step - there is no manifest to keep in step with
// the folder, which is the thing that always drifts.
const assetPath = (name) => join(here, 'assets', name)

// The hero plays footage behind the words when there is footage to play.
// webm first because it is the smaller of the two for the same picture, mp4
// second because Safari wants it. No file and the hero is exactly what it is
// today - so the front page is never held up waiting on a shoot.
const heroSources = [['hero.webm', 'video/webm'], ['hero.mp4', 'video/mp4']]
  .filter(([f]) => existsSync(assetPath(f)))
const heroPoster = ['hero-poster.webp', 'hero-poster.jpg', 'hero-poster.png']
  .find((f) => existsSync(assetPath(f)))

// Photographs in site/assets/hero are shown behind the words, in filename
// order, until there is footage to replace them. Named rather than listed in
// the config on purpose: a list that has to be kept in step with a folder is
// a list that goes stale, and this one is meant to be temporary.
const heroShots = existsSync(assetPath('hero'))
  ? readdirSync(assetPath('hero'))
    .filter((f) => /\.(webp|jpe?g|png)$/i.test(f))
    .sort()
  : []

const isTodo = (v) => typeof v === 'string' && v.trim().toUpperCase().startsWith('TODO')

// Name, address and phone have to read the same everywhere they appear - on
// the page, in the schema, and in the Google listing - or the listing is
// trusted less. Built once here.
const live = (v) => v && !String(v).trim().toUpperCase().startsWith('TODO')
const postalLine = [
  live(cfg.business.street) ? `${cfg.business.street},` : '',
  cfg.business.suburb,
  cfg.business.region,
  cfg.business.postcode,
].filter(live).join(' ')
const warnings = []

// `node site/build.mjs --preview` fills the gaps with sample text so the
// layout can be looked at before the real words exist. It writes to
// site/preview, never to site/dist, and every sample is labelled as one, so
// there is no path by which a made-up review reaches a customer.
// `--edit` builds the same pages with every editable string tagged with the
// config key it came from, so the editor server can offer them up for direct
// editing and write the result back. It changes nothing a visitor would see;
// the real build emits no markers at all.
const editMode = process.argv.includes('--edit')
// A marker on the element holding a value, naming its path in the config.
// Dotted path, array index as a number: `courses.2.summary`.
const ed = (path) => (editMode ? ` data-edit="${path}"` : '')
// The mark at the end of a section heading belongs to the last word rather
// than to the heading, so it is wrapped: the two can then never be split by
// a line break, and the strokes can be struck off that word's own corner
// instead of floating at the end of the block.
const popped = (text) => {
  const t = String(text || '').trim()
  const at = t.lastIndexOf(' ')
  return at < 0
    ? `<span class="pop">${esc(t)}</span>`
    : `${esc(t.slice(0, at))} <span class="pop">${esc(t.slice(at + 1))}</span>`
}

// **bold** and nothing else. Escaped first, so the config cannot inject markup.
const rich = (v) => esc(v).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

const preview = process.argv.includes('--preview')
const SAMPLE = {
  email: 'sample@example.com',
  price: '$SAMPLE per term',
  reviews: [
    { quote: 'SAMPLE TEXT - this is where a real parent quote goes, two or three sentences about what changed for their child.', author: 'SAMPLE', context: 'Parent, Year 4 OC' },
    { quote: 'SAMPLE TEXT - a second quote. Keep them specific: what they were worried about, and what is different now.', author: 'SAMPLE', context: 'Parent, Year 6 Selective' },
    { quote: 'SAMPLE TEXT - a third. A line about the teaching or the weekly practice reads better than a line about results.', author: 'SAMPLE', context: 'Parent, Year 5' },
  ],
}

// ---------------------------------------------------------------- settings
const domain = isTodo(cfg.site.domain) ? cfg.site.fallbackDomain : cfg.site.domain
if (isTodo(cfg.site.domain)) {
  warnings.push(`no domain set, built for ${cfg.site.fallbackDomain}`)
}
const origin = `https://${domain}`
const email = isTodo(cfg.business.email) ? (preview ? SAMPLE.email : '') : cfg.business.email
if (!email) warnings.push('no enquiry email set, so the contact page has no address and no form')

// Points at the mock-test sign-up once that exists; the portal front door
// until then, so the button always lands somewhere real.
const mockTestUrl = isTodo(cfg.site.mockTestUrl) ? cfg.site.portalUrl : cfg.site.mockTestUrl

const bookshopItems = (cfg.bookshop?.items || []).filter(
  (b) => !isTodo(b.title) && !isTodo(b.price))
const showBookshop = preview || (cfg.bookshop?.show && bookshopItems.length > 0)
const liveBooks = preview && !bookshopItems.length
  ? (cfg.bookshop?.items || []).map((b, i) => ({
      title: `SAMPLE BOOK ${i + 1}`, years: 'Years 3 to 4', price: '$SAMPLE',
      summary: 'SAMPLE TEXT - two sentences on what is inside this book and who it is for.',
    }))
  : bookshopItems
if (cfg.bookshop?.show && !showBookshop) {
  warnings.push('the bookshop is switched on but every title is still TODO, so the tab is hidden')
}

const showPrices = preview || (cfg.pricing.show && cfg.courses.every((c) => !isTodo(c.price)))
if (cfg.pricing.show && !showPrices) {
  warnings.push('prices are switched on but some are still TODO, so none are shown')
}

const realReviews = (cfg.reviews.items || []).filter(
  (r) => !isTodo(r.quote) && !isTodo(r.author))
const liveReviews = preview && !realReviews.length ? SAMPLE.reviews : realReviews

// Google holds the reviews and will not let us republish them wholesale, so
// the honest arrangement is to send people to the source. Three states:
//   quotes written here        -> a page of them, with a link to Google for the rest
//   no quotes, Google link set -> Testimonies goes straight to Google
//   neither                    -> no Testimonies item at all
const googleReviewsUrl = isTodo(cfg.reviews.googleUrl) ? '' : (cfg.reviews.googleUrl || '')
const showReviews = preview || (cfg.reviews.show && realReviews.length > 0)
if (cfg.reviews.show && !showReviews) {
  warnings.push('reviews are switched on but none are filled in, so the page is left out')
}
if (!showReviews && !googleReviewsUrl) {
  warnings.push('no quotes and no Google reviews link, so there is no Testimonies item in the nav')
}
if (!showReviews && googleReviewsUrl) {
  warnings.push('no quotes written here, so Testimonies links straight out to Google')
}
const reviewsPath = cfg.reviews.path || '/reviews/'
const reviewsLabel = cfg.reviews.label || 'Reviews'
const reviewsDir = reviewsPath.replace(/^\/|\/$/g, '')

// ------------------------------------------------------------------ helpers
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

// Enquiry buttons go to the contact page rather than straight to a mailto:
// a parent on a phone without a mail client configured gets nothing from a
// mailto link, and the contact page also carries the address in plain text.
const enquire = (label = 'Enquire about a place', cls = 'btn btn-primary', q = '', path = '') =>
  `<a class="${cls}" href="/contact/${q ? `?about=${encodeURIComponent(q)}` : ''}"${path ? ed(path) : ''}>${esc(label)}</a>`

// -------------------------------------------------------------------- icons
// Drawn inline rather than loaded: a dozen icons as one external font or
// sprite is a second request on the critical path for a few hundred bytes of
// geometry. All one 24x24 grid, all stroked in currentColor, so they take the
// colour and weight of whatever they sit in.
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
  'book-open': '<path d="M12 6.5S10 4.5 3 4.5V18c7 0 9 2 9 2s2-2 9-2V4.5c-7 0-9 2-9 2Z"/><path d="M12 6.5V20"/>',
  lightbulb: '<path d="M8.6 16.2a6 6 0 1 1 6.8 0V18h-6.8Z"/><path d="M9.8 21h4.4"/>',
  calculator: '<rect x="4.5" y="3" width="15" height="18" rx="2"/><path d="M8 7h8"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01"/>',
  pen: '<path d="m15.5 3.5 5 5L8 21H3v-5Z"/><path d="m13 6 5 5"/>',
  'clipboard-check': '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V3.2A1.2 1.2 0 0 1 10.2 2h3.6A1.2 1.2 0 0 1 15 3.2v1.3Z"/><path d="m9 13 2.2 2.2L15.5 11"/>',
  award: '<circle cx="12" cy="9" r="5.5"/><path d="m8.5 13.8-1.3 7.2 4.8-2.6 4.8 2.6-1.3-7.2"/>',
  layers: '<path d="m12 3 8.5 4.5L12 12 3.5 7.5Z"/><path d="m3.5 12 8.5 4.5L20.5 12"/><path d="m3.5 16.5 8.5 4.5 8.5-4.5"/>',
  zap: '<path d="M13.5 2 4 13.5h7L10.5 22 20 10.5h-7Z"/>',
  trophy: '<path d="M7 3.5h10V9a5 5 0 0 1-10 0Z"/><path d="M7 5.5H4V7a3.5 3.5 0 0 0 3 3.4"/><path d="M17 5.5h3V7a3.5 3.5 0 0 1-3 3.4"/><path d="M12 14v3.5"/><path d="M8.5 20.5h7"/>',
  'message-square': '<path d="M20.5 4.5v11H8l-4.5 4v-15Z"/><path d="M8.5 9h7M8.5 12h4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 19.5a6.5 6.5 0 0 1 13 0"/><path d="M16 4.9a3.5 3.5 0 0 1 0 6.2"/><path d="M17.5 14.2a6.5 6.5 0 0 1 4 5.3"/>',
  book: '<path d="M5 3.5h12.5v17H5Z"/><path d="M5 17h12.5"/><path d="M8.5 3.5v13"/>',
}
const icon = (name, cls = 'icon') => ICONS[name]
  ? `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`
  : ''

/**
 * A meta description cut to what a search result will actually print.
 *
 * Google shows about 155 characters and drops the rest mid-word, so a longer
 * one is not more information, it is a sentence that ends in an ellipsis. Cut
 * at a sentence end where there is one within range, otherwise at a word.
 */
function metaDesc(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (t.length <= 155) return t
  const stop = t.lastIndexOf('. ', 155)
  if (stop > 90) return t.slice(0, stop + 1)
  const space = t.lastIndexOf(' ', 152)
  return `${t.slice(0, space > 0 ? space : 152).replace(/[,;:]$/, '')}...`
}

function page({ title, description, path, body, jsonLd, pageName = '', scripts = [], noindex = false }) {
  description = metaDesc(description)
  const canonical = `${origin}${path}`
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
${noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(cfg.business.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="en_AU">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/icon-32.png" sizes="32x32">
<link rel="icon" href="/icon-512.png" sizes="512x512">
<link rel="apple-touch-icon" href="/icon-180.png">
<link rel="stylesheet" href="/styles.css?v=${cssVersion}">
${[].concat(jsonLd || []).filter(Boolean).map((d) => `<script type="application/ld+json">${JSON.stringify(d)}</script>`).join('')}
</head>
<body${pageName ? ` data-page="${pageName}"` : ''}>
<a class="skip" href="#main">Skip to content</a>
${preview ? '<p class="preview-flag">Preview &mdash; prices and reviews below are sample text, not real</p>' : ''}
<header class="site-head">
  <div class="wrap head-row">
    <a class="nav-home" href="/">${icon('home')}<span>Home</span></a>
    <nav class="nav" aria-label="Main">
      <a href="/courses/">Courses</a>
      ${showBookshop ? '<a href="/bookshop/">Bookshop</a>' : ''}
      ${showReviews
        ? `<a href="${esc(reviewsPath)}">${esc(reviewsLabel)}</a>`
        : googleReviewsUrl
          ? `<a href="${esc(googleReviewsUrl)}" rel="noopener">${esc(reviewsLabel)}</a>`
          : ''}
      <a class="btn btn-trial" href="/contact/?about=${encodeURIComponent('A trial class')}">${esc(cfg.site.trialLabel || 'Trial class')}</a>
      <a class="btn btn-portal" href="${esc(cfg.site.portalUrl)}">Portal</a>
    </nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-foot">
  <div class="wrap foot-row">
    <p>&copy; ${new Date().getFullYear()} ${esc(cfg.business.name)}${postalLine ? ` &middot; ${esc(postalLine)}` : ''}</p>
    <p class="foot-links">
      ${email ? `<a href="mailto:${esc(email)}">${esc(email)}</a>` : ''}
      ${cfg.business.phone ? `<a href="tel:${esc(cfg.business.phone.replace(/\s/g, ''))}">${esc(cfg.business.phone)}</a>` : ''}
      <a href="${esc(cfg.site.portalUrl)}">${esc(cfg.site.portalLabel)}</a>
    </p>
  </div>
</footer>
${scripts.map((src) => `<script src="${src}" defer></script>`).join('')}
</body>
</html>
`
}

// A strength whose card should send a parent to the contact form rather than
// to a page of prose says so with a subject; the form opens with it chosen.
const advLink = (a) => (a.ctaAbout && !isTodo(a.ctaAbout))
  ? `/contact/?about=${encodeURIComponent(a.ctaAbout)}`
  : `/why/${a.slug}/`
const advSubjects = (cfg.advantages.items || [])
  .map((a) => a.ctaAbout).filter((x) => x && !isTodo(x))

// --------------------------------------------------------------- structured
// EducationalOrganization alone does not qualify for the local results that
// "tutoring in Eastwood" actually returns; the LocalBusiness type with an
// address and an areaServed does. Both are declared, which is allowed.
const orgLd = {
  '@context': 'https://schema.org',
  '@type': ['EducationalOrganization', 'LocalBusiness'],
  '@id': `${origin}/#school`,
  name: cfg.business.name,
  description: cfg.business.description,
  url: origin,
  ...(email ? { email } : {}),
  ...(cfg.business.phone ? { telephone: cfg.business.phone } : {}),
  ...(cfg.business.suburb ? {
    address: {
      '@type': 'PostalAddress',
      // A LocalBusiness without a street and a postcode is not a place, and
      // the local pack that "tutoring in Eastwood" returns is made of places.
      ...(cfg.business.street ? { streetAddress: cfg.business.street } : {}),
      addressLocality: cfg.business.suburb,
      addressRegion: cfg.business.region,
      ...(cfg.business.postcode ? { postalCode: cfg.business.postcode } : {}),
      addressCountry: cfg.business.country,
    },
  } : {}),
  ...(cfg.business.openingHours?.length ? { openingHoursSpecification: cfg.business.openingHours } : {}),
  ...(cfg.business.areaServed?.length
    ? { areaServed: cfg.business.areaServed.map((a) => ({ '@type': 'Place', name: a })) }
    : {}),
  ...(googleReviewsUrl ? { sameAs: [googleReviewsUrl] } : {}),
  knowsAbout: [
    'Opportunity Class test preparation',
    'Selective High School test preparation',
    'Thinking Skills',
    'Mathematical Reasoning',
    'Reading comprehension',
    'Persuasive and narrative writing',
  ],
}

// A breadcrumb on every page below the root: it is what puts the readable
// trail under a result instead of a raw URL.
const crumbs = (trail) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [{ name: 'Home', url: '/' }, ...trail].map((c, i) => ({
    '@type': 'ListItem', position: i + 1, name: c.name, item: `${origin}${c.url}`,
  })),
})

// ------------------------------------------------- showing, not telling
// Each reason carries something as well as saying something: who teaches is
// settled by faces and records, what the material is like is settled by a
// question. Two of the six need no photography at all - a question and an
// explanation are stronger set as live text than as a screenshot of text,
// because they stay sharp, stay readable on a phone, and cannot drift out
// of step with the stylesheet.
//
// Anything still TODO is dropped from the real build and drawn as a
// labelled placeholder in `--preview`, so a parent never meets a half-built
// panel while the person filling it in can see the shape waiting for them.
const evFile = (name) => `/assets/${String(name).replace(/^\/+/, '')}`
const todoCount = { n: 0 }
// `counts` is false for a gap inside a reason that already shows something:
// the track record has its numbers, and the missing photograph should not
// make the build report it as a reason with no evidence at all.
const hole = (what, counts = true) => {
  if (counts) todoCount.n += 1
  return preview ? `<p class="hole"><span>TO COME</span>${esc(what)}</p>` : ''
}

function showPeople(ev) {
  // A portrait with no name yet still belongs here - the gallery is the
  // point, and the names can arrive later without the panel disappearing.
  const real = (ev.people || []).filter((x) => !isTodo(x.name) || !isTodo(x.photo))
  if (!real.length) return hole('Four teachers: a photograph, a name and one line of record each')
  return `<ul class="faces">${real.map((x) => `
    <li class="face">
      ${isTodo(x.photo)
        ? '<span class="face-blank" aria-hidden="true"></span>'
        : `<img src="${esc(evFile(x.photo))}" alt="${esc(x.name)}" loading="lazy" width="160" height="160">`}
      ${isTodo(x.name) ? '' : `<span class="face-name">${esc(x.name)}</span>`}
      ${isTodo(x.role) ? '' : `<span class="face-role">${esc(x.role)}</span>`}
      ${isTodo(x.note) ? '' : `<span class="face-note">${esc(x.note)}</span>`}
    </li>`).join('')}</ul>`
}

function showSample(ev) {
  const pages = (ev.pages || []).filter((f) => !isTodo(f))
  const lines = (ev.lines || []).filter((x) => !isTodo(x))
  const hasQ = !isTodo(ev.stem)
  if (!hasQ && !pages.length) return hole('A real question, set exactly as a student meets it')

  // Set as a page, not a card: the margin, the rule under the heading and the
  // stacked clues are what a classbook looks like, and a parent recognises
  // the thing their child brings home before they have read a word of it.
  //
  // The options are gone on purpose. Five lettered choices turn a question
  // into something you can guess; without them the reader has to feel the
  // problem, which is the point of showing it. The answer is not printed
  // either - a page that prints the answer beside the question has given the
  // question away.
  const paper = !hasQ ? '' : `<figure class="paper">
    ${isTodo(ev.label) ? '' : `<figcaption class="paper-tag">${esc(ev.label)}</figcaption>`}
    <p class="paper-stem">${esc(ev.stem)}</p>
    ${isTodo(ev.figure) ? '' : `<img class="paper-fig" src="${esc(evFile(ev.figure))}" alt="" loading="lazy">`}
    ${lines.length ? `<ul class="paper-lines">${lines.map((x) => `
      <li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${isTodo(ev.ask) ? '' : `<p class="paper-ask">${esc(ev.ask)}</p>`}
    ${isTodo(ev.note) ? '' : `<p class="paper-note">${esc(ev.note)}</p>`}
  </figure>`

  // The pages themselves, as they are handed out. A rendered question proves
  // the questions are ours; a photograph of the book proves the book is.
  const sheets = !pages.length ? '' : `<div class="sheets">
    ${pages.map((f, i) => `<figure class="sheet">
      <img src="${esc(evFile(f))}" alt="Page ${i + 1} of the classbook" loading="lazy" width="900">
    </figure>`).join('')}
    ${isTodo(ev.pagesNote) ? '' : `<p class="sheets-note">${esc(ev.pagesNote)}</p>`}
  </div>`

  return paper + sheets
}

function showScreens(ev) {
  const real = (ev.shots || []).filter((x) => !isTodo(x.file))
  if (!real.length) return hole('Two screens from the platform itself')
  return `<div class="screens">${real.map((x) => `
    <figure class="screen">
      <img src="${esc(evFile(x.file))}" alt="${isTodo(x.caption) ? '' : esc(x.caption)}" loading="lazy">
      ${isTodo(x.caption) ? '' : `<figcaption>${esc(x.caption)}</figcaption>`}
    </figure>`).join('')}</div>`
}

function showFigures(ev) {
  const figs = (ev.figures || []).filter((f) => !isTodo(f.value))
  const pics = (ev.photos || []).filter((f) => !isTodo(f))
  if (!figs.length && !pics.length) return hole('The numbers, and a photograph of the year they happened')
  return `<div class="tally">
    ${figs.length ? `<dl class="figures">${figs.map((f) => `
      <div><dt>${esc(f.value)}</dt><dd>${esc(f.label)}</dd></div>`).join('')}</dl>` : ''}
    ${pics.length ? `<div class="tally-pics">${pics.map((f) => `
      <img src="${esc(evFile(f))}" alt="" loading="lazy">`).join('')}</div>`
      : hole('A photograph from a results day', false)}
    ${showGoogle(ev.google)}
  </div>`
}


// The rating out of five, as five stars with the last one part-filled, so a
// 4.6 is not quietly rounded up to a 5.
function starBar(rating) {
  const r = Math.max(0, Math.min(5, Number(rating) || 0))
  return `<span class="stars" role="img" aria-label="${r} out of 5">
    <span class="stars-on" style="width:${((r / 5) * 100).toFixed(1)}%"></span></span>`
}

// Google licences the words in a review and its Places policy restricts
// storing them, so this shows the two things that are plain fact - the score
// and how many families left one - and sends the reader to Google for the
// words themselves. Nothing is fetched at page load: no key to leak, no bill
// to run, and no request telling Google who is reading this page.
function showGoogle(g) {
  if (!g || isTodo(g.rating) || isTodo(g.count) || isTodo(g.url)) {
    return hole('The Google rating and how many families left one', false)
  }
  return `<a class="grev" href="${esc(g.url)}" rel="noopener">
    <svg class="grev-mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/>
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/>
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/>
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/>
    </svg>
    <span class="grev-score">${esc(g.rating)}</span>
    ${starBar(g.rating)}
    <span class="grev-count">${esc(g.count)} Google reviews</span>
    <span class="grev-go">Read them on Google &rarr;</span>
  </a>`
}

function showPhoto(ev) {
  if (isTodo(ev.file)) return hole('One photograph of a class in progress')
  return `<figure class="shot">
    <img src="${esc(evFile(ev.file))}" alt="${isTodo(ev.caption) ? '' : esc(ev.caption)}" loading="lazy">
    ${isTodo(ev.caption) ? '' : `<figcaption>${esc(ev.caption)}</figcaption>`}
  </figure>`
}

// An invitation to go and use the thing beats a photograph of the thing.
function showActions(ev) {
  const real = (ev.actions || []).filter((a) => !isTodo(a.label) && !isTodo(a.href))
  if (!real.length) return hole('Two ways into the platform')
  return `<div class="tryit">
    ${isTodo(ev.lead) || !ev.lead ? '' : `<p class="tryit-lead">${esc(ev.lead)}</p>`}
    <p class="tryit-acts">${real.map((a) => `
      <a class="btn btn-primary" href="${esc(a.href)}">${esc(a.label)}</a>`).join('')}</p>
  </div>`
}

// A still and a play button, not an iframe. YouTube's embed loads a few
// hundred kilobytes and sets cookies on everyone who scrolls past; this
// loads neither until somebody actually asks for the video. The thumbnail
// is served from here rather than from YouTube for the same reason.
function showVideo(ev) {
  if (isTodo(ev.id)) return hole('A teacher walking through one question')
  return `<div class="vid">
    <button type="button" class="vid-play" data-video="${esc(ev.id)}"
            aria-label="Play: ${esc(isTodo(ev.title) ? 'explanation video' : ev.title)}">
      ${isTodo(ev.poster) ? '' : `<img src="${esc(evFile(ev.poster))}" alt="" loading="lazy" width="960" height="540">`}
      <span class="vid-mark" aria-hidden="true"></span>
    </button>
    ${isTodo(ev.title) ? '' : `<p class="vid-cap">${esc(ev.title)}</p>`}
  </div>`
}

const SHOW = {
  people: showPeople, sample: showSample, screens: showScreens,
  figures: showFigures, photo: showPhoto, actions: showActions, video: showVideo,
}
const evidenceOf = (a) =>
  (a.evidence && SHOW[a.evidence.kind]) ? SHOW[a.evidence.kind](a.evidence) : ''

// The only script the front page carries for the reasons: swap the still
// for the real player when, and only when, somebody presses it.
const videoScript = `<script>
(function () {
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.vid-play')
    if (!b) return
    var f = document.createElement('iframe')
    f.src = 'https://www.youtube-nocookie.com/embed/' + b.dataset.video
      + '?autoplay=1&rel=0'
    f.title = b.getAttribute('aria-label') || 'Video'
    f.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture'
    f.allowFullscreen = true
    f.className = 'vid-frame'
    b.replaceWith(f)
  })
})()
</script>`

// -------------------------------------------------------------------- home
const homeBody = `
<section class="hero${heroSources.length || heroShots.length ? ' hero-filmed' : ''}">
  ${heroSources.length ? `
  <video class="hero-video" muted loop playsinline preload="none"
         ${heroPoster ? `poster="/assets/${heroPoster}"` : ''} aria-hidden="true" tabindex="-1">
    ${heroSources.map(([f, type]) => `<source src="/assets/${f}" type="${type}">`).join('')}
  </video>` : heroShots.length ? `
  <div class="hero-shots" aria-hidden="true">
    ${heroShots.map((f, i) => `<img class="hero-shot${i === 0 ? ' is-on' : ''}"
      ${i === 0 ? `src="/assets/hero/${f}"` : `data-src="/assets/hero/${f}"`}
      alt="" width="1600" height="900" decoding="async">`).join('')}
  </div>` : ''}
  ${heroSources.length || heroShots.length ? '<div class="hero-veil" aria-hidden="true"></div>' : ''}
  <div class="wrap">
    <img class="hero-logo" src="/logo.svg" alt="${esc(cfg.business.name)}" width="300" height="113">
    <h1${ed('business.tagline')}>${esc(cfg.business.tagline)}</h1>
    <p class="lede"${ed('business.heroLede')}>${esc(cfg.business.heroLede)}</p>
    <p class="hero-cta">
      <a class="btn btn-go" href="/courses/"${ed('home.heroCtaAlt')}>${esc(cfg.home.heroCtaAlt)}</a>
      ${enquire(cfg.home.heroCta, 'btn btn-primary', '', 'home.heroCta')}
    </p>
  </div>
</section>

<section class="band band-journey">
  <div class="wrap">
    <h2${ed('home.tests.heading')}>${popped(cfg.home.tests.heading)}</h2>
    <div class="cards">
      <article class="card">
        <h3${ed('home.tests.ocTitle')}>${esc(cfg.home.tests.ocTitle)}</h3>
        <p${ed('home.tests.ocBody')}>${rich(cfg.home.tests.ocBody)}</p>
        <p class="card-cta"><a class="btn btn-primary btn-sm" href="${esc(mockTestUrl)}"${ed('home.tests.ocCta')}>${esc(cfg.home.tests.ocCta)}</a></p>
      </article>
      <article class="card">
        <h3${ed('home.tests.selectiveTitle')}>${esc(cfg.home.tests.selectiveTitle)}</h3>
        <p${ed('home.tests.selectiveBody')}>${rich(cfg.home.tests.selectiveBody)}</p>
        <p class="card-cta"><a class="btn btn-primary btn-sm" href="${esc(mockTestUrl)}"${ed('home.tests.selectiveCta')}>${esc(cfg.home.tests.selectiveCta)}</a></p>
      </article>
    </div>
  </div>
</section>

<section class="band band-alt">
  <div class="wrap">
    <h2${ed('advantages.heading')}>${popped(cfg.advantages.heading)}</h2>
    <ol class="chapters">
      ${(cfg.advantages.items || []).map((a, i) => {
        const show = evidenceOf(a)
        return `
      <li class="chapter${show ? '' : ' is-bare'}" id="${esc(a.slug)}">
        <p class="chapter-no" aria-hidden="true">${String(i + 1).padStart(2, '0')}</p>
        <div class="chapter-say">
          ${icon(a.icon, 'icon icon-lg')}
          <h3><a href="/why/${esc(a.slug)}/"${ed(`advantages.items.${i}.title`)}>${esc(a.title)}</a></h3>
          <p${ed(`advantages.items.${i}.body`)}>${esc(a.body)}</p>
          ${isTodo(a.cta) || !a.cta ? '' : `<p class="chapter-cta"><a href="${advLink(a)}"><span${ed(`advantages.items.${i}.cta`)}>${esc(a.cta)}</span> &rarr;</a></p>`}
        </div>
        ${show ? `<div class="chapter-show">${show}</div>` : ''}
      </li>`
      }).join('')}
    </ol>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <h2${ed('home.teach.heading')}>${popped(cfg.home.teach.heading)}</h2>
    <div class="cards">
      ${cfg.courses.map((c, i) => `
      <article class="card card-link">
        ${icon(c.icon, 'icon icon-lg')}
        <h3><a href="/courses/#${esc(c.slug)}"${ed(`courses.${i}.name`)}>${esc(c.name)}</a></h3>
        <p class="card-years"${ed(`courses.${i}.years`)}>${esc(c.years)}</p>
        <p${ed(`courses.${i}.summary`)}>${esc(c.summary)}</p>
      </article>`).join('')}
      <a class="card card-tile" href="/courses/">
        <span${ed('home.teach.allCourses')}>${esc(cfg.home.teach.allCourses)}</span>
        <span class="card-tile-arrow" aria-hidden="true">&rarr;</span>
      </a>
    </div>
  </div>
</section>

<section class="band cta-band">
  <div class="wrap">
    <h2${ed('home.cta.heading')}>${popped(cfg.home.cta.heading)}</h2>
    <p class="lede"${ed('home.cta.lede')}>${esc(cfg.home.cta.lede)}</p>
    ${enquire(cfg.home.cta.button, 'btn btn-primary', '', 'home.cta.button')}
  </div>
</section>

${cfg.advantages.items.some((a) => a.evidence && a.evidence.kind === 'video' && !isTodo(a.evidence.id)) ? videoScript : ''}
${heroSources.length || heroShots.length ? `<script>
(function () {
  var conn = navigator.connection || {}
  // Moving pictures are not worth a metered connection, a data-saver
  // setting, or someone who has asked for less movement. The gradient and
  // the first photograph are the design rather than a fallback, so stopping
  // here costs the page nothing - which is why nothing further is fetched
  // until this has decided to run.
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    || conn.saveData || /(^|[^4])2g/.test(conn.effectiveType || '')

  var v = document.querySelector('.hero-video')
  if (v) {
    if (still || window.innerWidth < 700) return
    v.preload = 'auto'
    v.load()
    var go = v.play()
    // Autoplay refused is an ordinary outcome, not an error worth a console.
    if (go && go.catch) go.catch(function () {})
    return
  }

  var shots = document.querySelectorAll('.hero-shot')
  if (shots.length < 2 || still) return
  // The first photograph is already in the markup and already painted. The
  // rest are fetched only once the page has finished loading, so a gallery
  // nobody has scrolled past yet never competes with the page itself.
  function begin() {
    for (var i = 1; i < shots.length; i++) {
      if (shots[i].dataset.src) shots[i].src = shots[i].dataset.src
    }
    var at = 0
    setInterval(function () {
      shots[at].classList.remove('is-on')
      at = (at + 1) % shots.length
      shots[at].classList.add('is-on')
    }, 5000)
  }
  if (document.readyState === 'complete') begin()
  else window.addEventListener('load', begin)
})()
</script>` : ''}
`

// ------------------------------------------------------------- class times
// A class time is structured data now - a day number, a start and an end -
// rather than the string "Tuesday 7:00pm - 9:00pm". All the ordering,
// grouping and clash-checking below depends on that, and none of it was
// possible while the time was prose.
const DAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_LONG = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// 24-hour in the config because that is what sorts; 12-hour on the page
// because that is what a parent reads.
function clock(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`
}
const atMinute = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}
const spanOf = (s) => `${clock(s.start)} – ${clock(s.end)}`

// Monday first, the weekend last, then earliest start. Deliberately not the
// order they happen to be typed in: a parent scanning for "a weeknight that
// works" should not have to read the list twice to be sure.
const byDayThenTime = (a, b) => (a.day - b.day) || (atMinute(a.start) - atMinute(b.start))

const courseYears = (c) => [...new Set((c.sessions || []).flatMap((s) => s.years || []))]
  .map(Number).sort((a, b) => a - b)
const yearsLabel = (ys) => {
  if (!ys.length) return ''
  if (ys.length === 1) return `Year ${ys[0]}`
  const run = ys[ys.length - 1] - ys[0] === ys.length - 1
  return run ? `Years ${ys[0]}–${ys[ys.length - 1]}` : `Years ${ys.join(', ')}`
}

// Every class in the school, flattened out of the subjects and grouped by the
// day it runs on. The page used to be a list of subjects, each carrying its
// own times; a parent is not choosing a subject, they are choosing what fits
// around Saturday sport and a Tuesday evening, and they could not see two
// subjects at once to compare. Grouped by day, the whole week a child could
// have is one screen - and two subjects sharing a slot, which used to be
// invisible between two cards, now sit side by side.
function weekByDay() {
  const days = new Map()
  for (const c of cfg.courses) {
    for (const session of c.sessions || []) {
      if (!days.has(session.day)) days.set(session.day, [])
      days.get(session.day).push({ session, course: c })
    }
  }
  return [...days.keys()].sort((a, b) => a - b).map((day) => ({
    day,
    slots: days.get(day).sort((p, q) =>
      (atMinute(p.session.start) - atMinute(q.session.start))
      || p.course.name.localeCompare(q.course.name)),
  }))
}

// Every year the school teaches, for the filter at the top of the page.
// Deliberately not just the years the timetable happens to mention: a year
// with no class on yet is still a year a parent can ask about, and a chip
// that answers "not yet, ask us" is worth more than a chip that is missing.
const ALL_YEARS = [...new Set([
  ...(cfg.yearsOffered || []).map(Number),
  ...cfg.courses.flatMap(courseYears),
])].filter((y) => Number.isFinite(y)).sort((a, b) => a - b)

// One colour per subject. A parent scanning a day should be able to tell
// Reading from Maths before reading either word; the colour is a second,
// faster channel for the thing the label already says, never the only one.
const SUBJECT_COLOURS = new Set(['red', 'blue', 'purple', 'orange', 'cream'])
const colourOf = (c) =>
  SUBJECT_COLOURS.has(c && c.colour) ? c.colour : 'cream'

// "$750 per term" -> 750. A course priced in words rather than numbers is
// still bookable; it just contributes nothing to the total, which is honest.
const priceOf = (c) => {
  const n = Number(String(c.price || '').replace(/[^\d.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : 0
}

// What the browser is handed. The same timetable that is already printed into
// the HTML, in the shape the basket needs - so the page renders and indexes
// without JavaScript, and the basket needs no second request to name a class.
/* Whether any class on the timetable can be paid for on the site.
   The enrolment page promises in so many words that nothing is paid there,
   and that promise has to stop being made the moment a Pay button can
   appear on it - a page that says "nothing is paid here" above a payment
   button is worse than one that never said it. */
const anyPay = cfg.courses.some((c) => (c.sessions || [])
  .some((s) => /^https:\/\/buy\.stripe\.com\//.test(String(s.pay || ''))))

const catalogue = {
  email,
  courses: cfg.courses.map((c) => ({
    slug: c.slug,
    name: c.name,
    price: showPrices ? priceOf(c) : 0,
    sessions: (c.sessions || []).map((s) => ({
      id: s.id,
      years: (s.years || []).map(Number),
      day: s.day,
      start: s.start,
      end: s.end,
      capacity: s.capacity || null,
      // A class may set its own price; a blank one is the subject's.
      price: showPrices ? (s.price == null ? priceOf(c) : s.price) : 0,
      // Checked again on the way out, not just on the way in: the config
      // file can be hand-edited, and a payment button is the one control here
      // where the wrong address costs a parent money.
      pay: /^https:\/\/buy\.stripe\.com\//.test(String(s.pay || '')) ? s.pay : '',
      label: `${DAY_LONG[s.day]} ${spanOf(s)}`,
      short: `${DAY_SHORT[s.day]} ${spanOf(s)}`,
    })),
  })),
}

// ----------------------------------------------------------------- courses
const coursesBody = `
<section class="page-head">
  <div class="wrap">
    <h1${ed('coursesPage.heading')}>${esc(cfg.coursesPage.heading)}</h1>
    ${showPrices && !isTodo(cfg.pricing.note) && cfg.pricing.note
      ? `<p class="note">${esc(cfg.pricing.note)}</p>` : ''}
    ${ALL_YEARS.length ? `
    <div class="year-filter">
      <p class="year-filter-ask">
        <span class="year-filter-label" id="yf-label">Choose your year</span>
      </p>
      <div class="year-chips" role="group" aria-labelledby="yf-label">
        <button type="button" class="year-chip" data-year-filter="all" aria-pressed="true">All years</button>
        ${ALL_YEARS.map((y) => `<button type="button" class="year-chip" data-year-filter="${y}" aria-pressed="false">Year ${y}</button>`).join('')}
      </div>
    </div>` : ''}
  </div>
</section>

<div class="year-note" hidden>
  <div class="wrap year-note-row">
    <p class="year-note-text">
      <strong class="year-note-year"></strong>
      <span class="year-note-rest"></span>
    </p>
    <button type="button" class="year-note-clear">Show all years</button>
  </div>
</div>

<section class="band band-week">
  <div class="wrap">
    <div class="week show-years">
      ${weekByDay().map(({ day, slots }) => `
      <section class="day" data-day="${day}">
        <h2 class="day-head">${DAY_LONG[day]}</h2>
        <ul class="sessions">${slots.map(({ session, course }) => `
          <li class="session sub-${colourOf(course)}" data-session="${esc(session.id)}"
              data-subject="${esc(course.slug)}" data-years="${(session.years || []).join(',')}">
            <button type="button" class="session-pick" aria-pressed="false">
              <span class="session-subject">${esc(course.name)}</span>
              <span class="session-when">${spanOf(session)}</span>
              <span class="session-meta">
                <span class="session-years-at">${yearsLabel((session.years || []).map(Number))}</span>
                ${session.enrolled == null ? '' : `<span class="session-roll">${
                  session.enrolled} ${session.enrolled === 1 ? 'student' : 'students'} enrolled</span>`}
              </span>
              <span class="session-state"></span>
            </button>
            <div class="session-years" hidden></div>
            <p class="session-warn" hidden></p>
          </li>`).join('')}
        </ul>
      </section>`).join('')}
    </div>
    <p class="week-none" hidden><span class="week-none-text"></span>
      <a class="week-none-ask" href="/contact/">Make an enquiry</a></p>
  </div>
</section>

<section class="band band-soft">
  <div class="wrap">
    <h2 class="subjects-head">${popped('About each subject')}</h2>
    <div class="subject-list">
      ${cfg.courses.map((c, i) => `
      <details class="subject sub-${colourOf(c)}" id="${esc(c.slug)}" data-subject="${esc(c.slug)}">
        <summary>
          <span class="subject-name"${ed(`courses.${i}.name`)}>${esc(c.name)}</span>
          <span class="subject-years"${ed(`courses.${i}.years`)}>${esc(c.years)}</span>
          ${showPrices ? `<span class="subject-price"${ed(`courses.${i}.price`)}>${esc(isTodo(c.price) ? SAMPLE.price : c.price)}</span>` : ''}
        </summary>
        <div class="subject-body">
          <p class="subject-summary"${ed(`courses.${i}.summary`)}>${esc(c.summary)}</p>
          <ul class="ticks">${(c.covers || []).map((x, j) => `<li${ed(`courses.${i}.covers.${j}`)}>${esc(x)}</li>`).join('')}</ul>
          ${c.timesNote ? `<p class="times-note"${ed(`courses.${i}.timesNote`)}>${esc(c.timesNote)}</p>` : ''}
        </div>
      </details>`).join('')}
    </div>
  </div>
</section>

<aside class="cart-bar" hidden aria-labelledby="cart-h">
  <div class="cart-bar-row">
    <h2 class="cart-h" id="cart-h">Your classes</h2>
    <button type="button" class="cart-toggle" aria-expanded="false" aria-controls="cart-items">
      <span class="cart-bar-text" aria-live="polite"></span>
      <span class="cart-toggle-mark" aria-hidden="true"></span>
    </button>
    <div class="cart-items" id="cart-items">
      <ul class="cart-list"></ul>
      <p class="cart-total"><span>Total</span><strong class="cart-total-n"></strong></p>
    </div>
    <a class="btn btn-primary cart-go" href="/enrol/">Review and enrol</a>
  </div>
</aside>
`

// ------------------------------------------------------------------ enrol
// The basket, reviewed. Grouped by school year because that is how a family
// thinks about it, and because the year the parent already pressed on the
// courses page tells us which child a class is for without stopping them
// mid-browse to ask for a name.
//
// It ends in an email rather than a payment: no seat is held and nothing is
// charged, which is how the school already works. Saying so here is cheaper
// than explaining it later.
const enrolBody = `
<section class="page-head">
  <div class="wrap">
    <h1>The classes you have chosen</h1>
    <p class="lede">Add a name for each child, tell us how to reach you, and send it over.
      ${anyPay
        ? 'We reply to confirm the place and the start date. Where a class can be paid for now, there is a Pay button beside it.'
        : 'Nothing is paid here &mdash; we reply to confirm the place and the start date.'}</p>
  </div>
</section>
<section class="band">
  <div class="wrap enrol-wrap">
    <div class="enrol-app" id="enrol-app">
      <noscript><p class="note">Choosing classes needs JavaScript.
        You can <a href="/contact/">send an enquiry</a> instead${cfg.business.phone ? ` or ring ${esc(cfg.business.phone)}` : ''}.</p></noscript>
    </div>

    ${email ? `
    <form class="enquiry enrol-form" id="enrol-form" hidden>
      <h2>How we reach you</h2>
      <div class="field">
        <label for="enrol-parent">Your name</label>
        <input id="enrol-parent" type="text" autocomplete="name" required>
      </div>
      <div class="field">
        <label for="enrol-email">Your email</label>
        <input id="enrol-email" type="email" autocomplete="email" required>
      </div>
      <div class="field">
        <label for="enrol-phone">Phone <span class="opt">(optional)</span></label>
        <input id="enrol-phone" type="tel" autocomplete="tel">
      </div>
      <div class="field">
        <label for="enrol-start">Preferred start <span class="opt">(optional)</span></label>
        <input id="enrol-start" type="text" placeholder="Next term, or as soon as there is a place">
      </div>
      <div class="field">
        <label for="enrol-message">Anything you would like us to know <span class="opt">(optional)</span></label>
        <textarea id="enrol-message" rows="4"></textarea>
      </div>
      <button class="btn btn-primary" type="submit">Send enrolment enquiry</button>
      <p class="note form-note">This opens your own email app with everything filled in. Nothing is stored on this website.${
        anyPay ? ' Payments are taken by Stripe on their own page, not here.' : ''}</p>
      <p class="note enrol-sent" hidden>Your email app should have opened with the details ready to send.
        If nothing happened, email <a href="mailto:${esc(email)}">${esc(email)}</a> instead.</p>
    </form>` : ''}
  </div>
</section>
`

// ----------------------------------------------------------------- reviews
const reviewsBody = `
<section class="page-head">
  <div class="wrap">
    <h1>What families say</h1>
  </div>
</section>
<section class="band">
  <div class="wrap">
    <div class="quotes">
      ${liveReviews.map((r) => `
      <figure class="quote">
        <blockquote><p>${esc(r.quote)}</p></blockquote>
        <figcaption>${esc(r.author)}${r.context && !isTodo(r.context) ? ` <span class="quote-ctx">&mdash; ${esc(r.context)}</span>` : ''}</figcaption>
      </figure>`).join('')}
    </div>
    <p class="review-actions">
      ${enquire('Enquire about a place')}
      ${googleReviewsUrl ? `<a class="btn btn-ghost" href="${esc(googleReviewsUrl)}" rel="noopener">Read all our reviews on Google</a>` : ''}
    </p>
  </div>
</section>
`

// ----------------------------------------------------------------- contact
// There is no server behind this site, so the form cannot post anywhere. It
// composes the message and hands it to the parent's own mail client, with the
// address printed in full underneath for anyone whose device has no mail
// client set up. Nothing is collected here, which is also the honest answer
// to give a parent about what happens to their child's details.
const contactBody = `
<section class="page-head">
  <div class="wrap">
    <h1${ed('contact.heading')}>${esc(cfg.contact.heading)}</h1>
    <p class="lede"${ed('contact.lede')}>${esc(cfg.contact.lede)}</p>
  </div>
</section>
<section class="band">
  <div class="wrap form-wrap">
    ${email ? `
    <form class="enquiry" id="enquiry">
      <div class="field">
        <label for="f-name">Your name</label>
        <input id="f-name" name="name" type="text" autocomplete="name" required>
      </div>
      <div class="field">
        <label for="f-email">Your email</label>
        <input id="f-email" name="email" type="email" autocomplete="email" required>
      </div>
      <div class="field">
        <label for="f-phone">Phone <span class="opt">(optional)</span></label>
        <input id="f-phone" name="phone" type="tel" autocomplete="tel">
      </div>
      <div class="field">
        <label for="f-year">Your child's year in ${new Date().getFullYear() + 1}</label>
        <select id="f-year" name="year">
          <option value="">Please choose</option>
          ${[2, 3, 4, 5, 6].map((y) => `<option>Year ${y}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="f-about">What you are asking about</label>
        <select id="f-about" name="about">
          <option value="">Please choose</option>
          <option>A place in a class</option>
          <option>A trial class</option>
          <option>A free mock test</option>
          ${advSubjects.map((x) => `<option>${esc(x)}</option>`).join('')}
          ${cfg.courses.map((c) => `<option>${esc(c.name)}</option>`).join('')}
          <option>Something else</option>
        </select>
      </div>
      <div class="field">
        <label for="f-msg">Anything you would like us to know</label>
        <textarea id="f-msg" name="message" rows="5"></textarea>
      </div>
      <button class="btn btn-primary" type="submit">Send enquiry</button>
      <p class="note form-note">This opens your own email app with the message ready to send. Nothing is stored on this website.</p>
    </form>
    <script>
    (function () {
      var form = document.getElementById('enquiry')
      if (!form) return
      var about = new URLSearchParams(location.search).get('about')
      if (about) {
        var sel = form.elements.about
        for (var i = 0; i < sel.options.length; i++) {
          if (sel.options[i].text === about) { sel.selectedIndex = i; break }
        }
      }
      form.addEventListener('submit', function (ev) {
        ev.preventDefault()
        var v = function (n) { return (form.elements[n].value || '').trim() }
        var lines = [
          'Name: ' + v('name'),
          'Email: ' + v('email'),
          'Phone: ' + (v('phone') || '-'),
          "Child's year: " + (v('year') || '-'),
          'About: ' + (v('about') || '-'),
          '',
          v('message'),
        ]
        var subject = 'Enquiry' + (v('about') ? ' - ' + v('about') : '')
        location.href = 'mailto:${esc(email)}'
          + '?subject=' + encodeURIComponent(subject)
          + '&body=' + encodeURIComponent(lines.join(String.fromCharCode(10)))
      })
    })()
    <\/script>` : ''}
    <div class="contact-direct">
      <h2>Or reach us directly</h2>
      ${email ? `<p><a href="mailto:${esc(email)}">${esc(email)}</a></p>` : '<p class="note">An enquiry address has not been set yet.</p>'}
      ${cfg.business.phone ? `<p><a href="tel:${esc(cfg.business.phone.replace(/\s/g, ''))}">${esc(cfg.business.phone)}</a></p>` : ''}
      ${cfg.business.phoneAlt ? `<p><a href="tel:${esc(cfg.business.phoneAlt.replace(/\s/g, ''))}">${esc(cfg.business.phoneAlt)}</a></p>` : ''}
      ${cfg.business.hoursText ? `<p class="note">${esc(cfg.business.hoursText)}</p>` : ''}
      ${postalLine ? `<p>${esc(postalLine)}</p>` : ''}
      ${cfg.business.wechat ? `<p class="note">WeChat: ${esc(cfg.business.wechat)}</p>` : ''}
    </div>
  </div>
</section>
`

// ---------------------------------------------------------------- bookshop
const bookshopBody = `
<section class="page-head">
  <div class="wrap">
    <h1${ed('bookshop.heading')}>${esc(cfg.bookshop.heading)}</h1>
    <p class="lede"${ed('bookshop.lede')}>${esc(cfg.bookshop.lede)}</p>
    ${cfg.bookshop.note ? `<p class="note"${ed('bookshop.note')}>${esc(cfg.bookshop.note)}</p>` : ''}
  </div>
</section>
<section class="band">
  <div class="wrap">
    <div class="cards">
      ${liveBooks.map((b) => `
      <article class="card">
        ${icon('book', 'icon icon-lg')}
        <h3>${esc(b.title)}</h3>
        ${b.years && !isTodo(b.years) ? `<p class="card-years">${esc(b.years)}</p>` : ''}
        ${b.price && !isTodo(b.price) ? `<p class="price price-inline">${esc(b.price)}</p>` : ''}
        ${b.summary && !isTodo(b.summary) ? `<p>${esc(b.summary)}</p>` : ''}
        <p class="card-cta">${enquire(`Order ${b.title}`, 'btn btn-primary btn-sm', b.title)}</p>
      </article>`).join('')}
    </div>
  </div>
</section>
`

// ------------------------------------------------------- one page per reason
// Six short pages rather than six anchors on one. They each answer a different
// question a parent arrives with, which is how somebody searching for "small
// class tutoring Eastwood" finds us at all, and they give the home page six
// internal links worth following.
const advIndex = (a) => (cfg.advantages.items || []).findIndex((o) => o.slug === a.slug)
const whyPage = (a) => `
<section class="page-head">
  <div class="wrap">
    <p class="crumb"><a href="/">Home</a> <span aria-hidden="true">&rsaquo;</span> ${esc(cfg.advantages.heading)}</p>
    ${icon(a.icon, 'icon icon-xl')}
    <h1${ed(`advantages.items.${advIndex(a)}.title`)}>${esc(a.title)}</h1>
  </div>
</section>
<section class="band">
  <div class="wrap">
    <div class="prose">
      ${(a.page || [a.body]).map((para, j) => `<p${ed(`advantages.items.${advIndex(a)}.page.${j}`)}>${esc(para)}</p>`).join('')}
      <p class="review-actions">
        ${enquire('Contact us')}
        <a class="btn btn-ghost" href="/courses/">See the courses</a>
      </p>
    </div>
  </div>
</section>
<section class="band band-alt">
  <div class="wrap">
    <h2${ed('advantages.otherHeading')}>${popped(cfg.advantages.otherHeading)}</h2>
    <div class="cards">
      ${(cfg.advantages.items || []).filter((o) => o.slug !== a.slug).map((o) => `
      <article class="card card-link">
        ${icon(o.icon, 'icon icon-lg')}
        <h3><a href="/why/${esc(o.slug)}/">${esc(o.title)}</a></h3>
      </article>`).join('')}
    </div>
  </div>
</section>
`

// ------------------------------------------------------------------- write
const cartScripts = [`/catalogue.js?v=${cartVersion}`, `/cart.js?v=${cartVersion}`]
mkdirSync(out, { recursive: true })
mkdirSync(join(out, 'courses'), { recursive: true })

writeFileSync(join(out, 'index.html'), page({
  title: `OC & Selective Tutoring in ${cfg.business.suburb || 'Sydney'} | ${cfg.business.name}`,
  description: cfg.business.metaDescription || cfg.business.description,
  path: '/',
  body: homeBody,
  jsonLd: orgLd,
}))

writeFileSync(join(out, 'courses', 'index.html'), page({
  title: `OC & Selective Courses and Class Times | ${cfg.business.name}`,
  description: `OC and Selective preparation courses in ${cfg.business.suburb || 'Sydney'}: `
    + `${cfg.courses.map((c) => c.name).join(', ')}. Class times and fees.`,
  path: '/courses/',
  body: coursesBody,
  pageName: 'courses',
  scripts: cartScripts,
  jsonLd: [crumbs([{ name: 'Courses', url: '/courses/' }]), {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: cfg.courses.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Course',
        name: c.name,
        description: c.summary,
        url: `${origin}/courses/#${c.slug}`,
        provider: { '@type': 'EducationalOrganization', name: cfg.business.name, url: origin },
        ...(showPrices && /\d/.test(String(c.price))
          ? { offers: { '@type': 'Offer', price: String(c.price).replace(/[^\d.]/g, ''), priceCurrency: 'AUD' } }
          : {}),
      },
    })),
  }],
}))

// The timetable the browser is handed, written out beside the pages. It is
// the same data the HTML above already prints, so the basket can name a class
// without a second request - and when the timetable moves to a database, only
// this file changes.
writeFileSync(join(out, 'catalogue.js'),
  `window.AVANT_CATALOGUE=${JSON.stringify(catalogue)};
`)
copyFileSync(join(here, 'cart.js'), join(out, 'cart.js'))

mkdirSync(join(out, 'enrol'), { recursive: true })
writeFileSync(join(out, 'enrol', 'index.html'), page({
  title: `Your classes | ${cfg.business.name}`,
  description: 'Review the classes you have chosen and send us an enrolment enquiry.',
  path: '/enrol/',
  body: enrolBody,
  pageName: 'enrol',
  scripts: cartScripts,
  // A page that renders one visitor's basket has nothing to offer a search
  // result, and an indexed empty basket is worse than no result at all.
  noindex: true,
}))

mkdirSync(join(out, 'contact'), { recursive: true })
writeFileSync(join(out, 'contact', 'index.html'), page({
  title: `Contact and Trial Class | ${cfg.business.name}`,
  description: `Enquire about a place or a trial class at ${cfg.business.name}`
    + `${cfg.business.suburb ? ` in ${cfg.business.suburb}` : ''}. ${cfg.contact.lede}`,
  path: '/contact/',
  body: contactBody,
  jsonLd: [orgLd, crumbs([{ name: 'Contact', url: '/contact/' }])],
}))

for (const a of cfg.advantages.items || []) {
  mkdirSync(join(out, 'why', a.slug), { recursive: true })
  writeFileSync(join(out, 'why', a.slug, 'index.html'), page({
    title: `${a.title} | ${cfg.business.name}`,
    description: (a.page?.[0] || a.body).slice(0, 155),
    path: `/why/${a.slug}/`,
    body: whyPage(a),
    jsonLd: crumbs([{ name: a.title, url: `/why/${a.slug}/` }]),
  }))
}

if (showBookshop) {
  mkdirSync(join(out, 'bookshop'), { recursive: true })
  writeFileSync(join(out, 'bookshop', 'index.html'), page({
    title: `${cfg.bookshop.heading} | ${cfg.business.name}`,
    description: cfg.bookshop.lede,
    path: '/bookshop/',
    body: bookshopBody,
    jsonLd: crumbs([{ name: cfg.bookshop.heading, url: '/bookshop/' }]),
  }))
}

const pages = ['/', '/courses/', '/contact/',
  ...(cfg.advantages.items || []).map((a) => `/why/${a.slug}/`),
  ...(showBookshop ? ['/bookshop/'] : [])]
if (showReviews) {
  pages.push(reviewsPath)
  mkdirSync(join(out, reviewsDir), { recursive: true })
  writeFileSync(join(out, reviewsDir, 'index.html'), page({
    title: `${reviewsLabel} | ${cfg.business.name}`,
    description: `What families say about ${cfg.business.name}.`,
    path: reviewsPath,
    body: reviewsBody,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'EducationalOrganization',
      name: cfg.business.name,
      url: origin,
      review: liveReviews.map((r) => ({
        '@type': 'Review',
        reviewBody: r.quote,
        author: { '@type': 'Person', name: r.author },
      })),
    },
  }))
}

writeFileSync(join(out, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`)

writeFileSync(join(out, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
  + pages.map((p) => `  <url><loc>${origin}${p}</loc></url>\n`).join('')
  + `</urlset>\n`)

copyFileSync(join(here, 'styles.css'), join(out, 'styles.css'))

const assetsDir = join(here, 'assets')
if (existsSync(assetsDir)) {
  // Emptied first, so the published folder is a mirror of the source rather
  // than everything that has ever been in it. Without this, taking the hero
  // film out of site/assets would leave it on the live site, still being
  // served and still being paid for.
  rmSync(join(out, 'assets'), { recursive: true, force: true })
  mkdirSync(join(out, 'assets'), { recursive: true })
  // Recursive, because the hero gallery is a folder of its own. Notes to
  // whoever adds the next file are not for the public site.
  const publish = (from, to) => {
    mkdirSync(to, { recursive: true })
    for (const name of readdirSync(from, { withFileTypes: true })) {
      if (name.name.startsWith('.') || name.name.toLowerCase().endsWith('.md')) continue
      if (name.isDirectory()) publish(join(from, name.name), join(to, name.name))
      else copyFileSync(join(from, name.name), join(to, name.name))
    }
  }
  publish(assetsDir, join(out, 'assets'))
}
const logo = join(here, '..', 'public', 'avant-logo.png')
if (existsSync(logo)) copyFileSync(logo, join(out, 'logo.png'))
// The tab icon is the mark on its own square, not the wordmark. The wordmark
// is 366x151; a browser asked for a 16x16 icon either squashes it to a smear
// or letterboxes it, and either way nobody can tell whose tab it is.
for (const px of [32, 180, 512]) {
  const mark = join(here, '..', 'public', `avant-mark-${px}.png`)
  if (existsSync(mark)) copyFileSync(mark, join(out, `icon-${px}.png`))
}
const logoSvg = join(here, '..', 'public', 'logo.svg')
if (existsSync(logoSvg)) copyFileSync(logoSvg, join(out, 'logo.svg'))

console.log(`built ${pages.length} page(s) for ${origin}`)
console.log(`  prices: ${showPrices ? 'shown' : 'hidden'}   reviews: ${showReviews ? `${liveReviews.length} shown` : 'not published'}`)
console.log(`  hero: ${heroSources.length ? heroSources.map(([f]) => f).join(' + ')
  : heroShots.length ? `${heroShots.length} photo(s) from site/assets/hero`
  : 'no footage or photos in site/assets, gradient only'}`)
if (todoCount.n) {
  warnings.push(`${todoCount.n} of the six reasons has no evidence yet`
    + ' - run with --preview to see the gaps')
}
for (const w of warnings) console.warn(`  ! ${w}`)
