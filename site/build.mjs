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
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
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

const isTodo = (v) => typeof v === 'string' && v.trim().toUpperCase().startsWith('TODO')
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

function page({ title, description, path, body, jsonLd }) {
  const canonical = `${origin}${path}`
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(cfg.business.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="en_AU">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/logo.png">
<link rel="stylesheet" href="/styles.css?v=${cssVersion}">
${[].concat(jsonLd || []).filter(Boolean).map((d) => `<script type="application/ld+json">${JSON.stringify(d)}</script>`).join('')}
</head>
<body>
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
    <p>&copy; ${new Date().getFullYear()} ${esc(cfg.business.name)}${cfg.business.suburb ? ` &middot; ${esc(cfg.business.suburb)}, ${esc(cfg.business.region)}` : ''}</p>
    <p class="foot-links">
      ${email ? `<a href="mailto:${esc(email)}">${esc(email)}</a>` : ''}
      ${cfg.business.phone ? `<a href="tel:${esc(cfg.business.phone.replace(/\s/g, ''))}">${esc(cfg.business.phone)}</a>` : ''}
      <a href="${esc(cfg.site.portalUrl)}">${esc(cfg.site.portalLabel)}</a>
    </p>
  </div>
</footer>
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
      addressLocality: cfg.business.suburb,
      addressRegion: cfg.business.region,
      addressCountry: cfg.business.country,
    },
  } : {}),
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

// -------------------------------------------------------------------- home
const homeBody = `
<section class="hero">
  <div class="wrap">
    <img class="hero-logo" src="/logo-light.svg" alt="${esc(cfg.business.name)}" width="300" height="113">
    <h1${ed('business.tagline')}>${esc(cfg.business.tagline)}</h1>
    <p class="lede"${ed('business.heroLede')}>${esc(cfg.business.heroLede)}</p>
    <p class="hero-cta">
      ${enquire(cfg.home.heroCta, 'btn btn-primary', '', 'home.heroCta')}
      <a class="btn btn-ghost" href="/courses/"${ed('home.heroCtaAlt')}>${esc(cfg.home.heroCtaAlt)}</a>
    </p>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <h2${ed('home.tests.heading')}>${esc(cfg.home.tests.heading)}</h2>
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
    <h2${ed('home.teach.heading')}>${esc(cfg.home.teach.heading)}</h2>
    <div class="cards">
      ${cfg.courses.map((c, i) => `
      <article class="card card-link">
        ${icon(c.icon, 'icon icon-lg')}
        <h3><a href="/courses/#${esc(c.slug)}"${ed(`courses.${i}.name`)}>${esc(c.name)}</a></h3>
        <p class="card-years"${ed(`courses.${i}.years`)}>${esc(c.years)}</p>
        <p${ed(`courses.${i}.summary`)}>${esc(c.summary)}</p>
      </article>`).join('')}
    </div>
    <p class="band-actions">
      <a class="more" href="/courses/"><span${ed('home.teach.allCourses')}>${esc(cfg.home.teach.allCourses)}</span> &rarr;</a>
      <a class="btn btn-primary" href="${esc(mockTestUrl)}"${ed('home.teach.mockTest')}>${esc(cfg.home.teach.mockTest)}</a>
    </p>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <h2${ed('advantages.heading')}>${esc(cfg.advantages.heading)}</h2>
    <p class="lede"${ed('advantages.lede')}>${esc(cfg.advantages.lede)}</p>
    <div class="cards">
      ${(cfg.advantages.items || []).map((a, i) => `
      <article class="card card-link">
        ${icon(a.icon, 'icon icon-lg')}
        <h3><a href="/why/${esc(a.slug)}/"${ed(`advantages.items.${i}.title`)}>${esc(a.title)}</a></h3>
        <p${ed(`advantages.items.${i}.body`)}>${esc(a.body)}</p>
        <p class="card-more"><a href="${advLink(a)}"><span${ed(`advantages.items.${i}.cta`)}>${esc(a.cta || 'More on this')}</span> &rarr;</a></p>
      </article>`).join('')}
    </div>
  </div>
</section>

<section class="band cta-band">
  <div class="wrap">
    <h2${ed('home.cta.heading')}>${esc(cfg.home.cta.heading)}</h2>
    <p class="lede"${ed('home.cta.lede')}>${esc(cfg.home.cta.lede)}</p>
    ${enquire(cfg.home.cta.button, 'btn btn-primary', '', 'home.cta.button')}
  </div>
</section>
`

// ----------------------------------------------------------------- courses
const coursesBody = `
<section class="page-head">
  <div class="wrap">
    <h1${ed('coursesPage.heading')}>${esc(cfg.coursesPage.heading)}</h1>
    <p class="lede"${ed('business.description')}>${esc(cfg.business.description)}</p>
    ${showPrices && cfg.pricing.note ? `<p class="note">${esc(cfg.pricing.note)}</p>` : ''}
  </div>
</section>

<section class="band">
  <div class="wrap course-list">
    ${cfg.courses.map((c, i) => `
    <article class="course" id="${esc(c.slug)}">
      <div class="course-head">
        <h2${ed(`courses.${i}.name`)}>${esc(c.name)}</h2>
        <p class="card-years"${ed(`courses.${i}.years`)}>${esc(c.years)}</p>
        ${showPrices ? `<p class="price"${ed(`courses.${i}.price`)}>${esc(isTodo(c.price) ? SAMPLE.price : c.price)}</p>` : ''}
      </div>
      <p class="course-summary"${ed(`courses.${i}.summary`)}>${esc(c.summary)}</p>
      <h3 class="course-sub">What it covers</h3>
      <ul class="ticks">${(c.covers || []).map((x, j) => `<li${ed(`courses.${i}.covers.${j}`)}>${esc(x)}</li>`).join('')}</ul>
      <h3 class="course-sub">Class times</h3>
      <ul class="times">${(c.times || []).map((x, j) => `<li${ed(`courses.${i}.times.${j}`)}>${esc(x)}</li>`).join('')}</ul>
      ${enquire(`Enquire about ${c.name}`, 'btn btn-primary btn-sm', c.name)}
    </article>`).join('')}
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
    <h2${ed('advantages.otherHeading')}>${esc(cfg.advantages.otherHeading)}</h2>
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
mkdirSync(out, { recursive: true })
mkdirSync(join(out, 'courses'), { recursive: true })

writeFileSync(join(out, 'index.html'), page({
  title: `OC & Selective Tutoring in ${cfg.business.suburb || 'Sydney'} | ${cfg.business.name}`,
  description: cfg.business.description,
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
const logo = join(here, '..', 'public', 'avant-logo.png')
if (existsSync(logo)) copyFileSync(logo, join(out, 'logo.png'))
const logoSvg = join(here, '..', 'public', 'logo.svg')
if (existsSync(logoSvg)) copyFileSync(logoSvg, join(out, 'logo.svg'))
const logoLight = join(here, 'logo-light.svg')
if (existsSync(logoLight)) copyFileSync(logoLight, join(out, 'logo-light.svg'))

console.log(`built ${pages.length} page(s) for ${origin}`)
console.log(`  prices: ${showPrices ? 'shown' : 'hidden'}   reviews: ${showReviews ? `${liveReviews.length} shown` : 'not published'}`)
for (const w of warnings) console.warn(`  ! ${w}`)
