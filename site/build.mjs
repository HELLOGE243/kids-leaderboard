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
const out = join(here, 'dist')
const cfg = JSON.parse(readFileSync(join(here, 'site.config.json'), 'utf8'))

// The stylesheet is cached for a day, which is right for visitors and wrong
// for the next edit: a change to it is invisible until the cache expires. The
// link carries a hash of the file, so a changed stylesheet is a new URL and
// an unchanged one stays cached.
const cssText = readFileSync(join(here, 'styles.css'), 'utf8')
const cssVersion = createHash('sha1').update(cssText).digest('hex').slice(0, 8)

const isTodo = (v) => typeof v === 'string' && v.trim().toUpperCase().startsWith('TODO')
const warnings = []

// ---------------------------------------------------------------- settings
const domain = isTodo(cfg.site.domain) ? cfg.site.fallbackDomain : cfg.site.domain
if (isTodo(cfg.site.domain)) {
  warnings.push(`no domain set, built for ${cfg.site.fallbackDomain}`)
}
const origin = `https://${domain}`
const email = isTodo(cfg.business.email) ? '' : cfg.business.email
if (!email) warnings.push('no enquiry email set, the enquiry buttons are hidden')

const showPrices = cfg.pricing.show && cfg.courses.every((c) => !isTodo(c.price))
if (cfg.pricing.show && !showPrices) {
  warnings.push('prices are switched on but some are still TODO, so none are shown')
}

const liveReviews = (cfg.reviews.items || []).filter(
  (r) => !isTodo(r.quote) && !isTodo(r.author))
const showReviews = cfg.reviews.show && liveReviews.length > 0
if (cfg.reviews.show && !showReviews) {
  warnings.push('reviews are switched on but none are filled in, so the page is left out')
}
if (!cfg.reviews.show && (cfg.reviews.items || []).length) {
  warnings.push('reviews are off - the page is built but not linked or indexed')
}

// ------------------------------------------------------------------ helpers
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const enquire = (label = 'Enquire about a place', cls = 'btn btn-primary') => email
  ? `<a class="${cls}" href="mailto:${esc(email)}?subject=${encodeURIComponent('Enquiry - ' + cfg.business.name)}">${esc(label)}</a>`
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
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-head">
  <div class="wrap head-row">
    <a class="brand" href="/">
      <img src="/logo.png" alt="" width="40" height="40">
      <span class="brand-name">${esc(cfg.business.shortName)}<span class="brand-rest"> OC &amp; Selective</span></span>
    </a>
    <nav class="nav" aria-label="Main">
      <a href="/courses/">Courses</a>
      ${showReviews ? '<a href="/reviews/">Reviews</a>' : ''}
      <a class="btn btn-portal" href="${esc(cfg.site.portalUrl)}">${esc(cfg.site.portalLabel)}</a>
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

// --------------------------------------------------------------- structured
const orgLd = {
  '@context': 'https://schema.org',
  '@type': 'EducationalOrganization',
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
}

// -------------------------------------------------------------------- home
const homeBody = `
<section class="hero">
  <div class="wrap">
    <h1>${esc(cfg.business.tagline)}</h1>
    <p class="lede">Small groups, real papers, and a practice platform your child uses between lessons &mdash; so the week between classes counts for something.</p>
    <p class="hero-cta">
      ${enquire('Enquire about a place')}
      <a class="btn btn-ghost" href="/courses/">See the courses</a>
    </p>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <h2>Two tests, two years, one preparation</h2>
    <div class="cards">
      <article class="card">
        <h3>Opportunity Class</h3>
        <p>Sat in <strong>Year 4</strong> for entry to an OC class in Year 5. Reading, mathematical reasoning and thinking skills, all under time.</p>
      </article>
      <article class="card">
        <h3>Selective High School</h3>
        <p>Sat in <strong>Year 6</strong> for entry in Year 7. The same three papers plus writing, and a far larger field.</p>
      </article>
    </div>
    <p class="note">We start students in Year 3 and Year 5 respectively, because the reasoning paper rewards a year of practice rather than a term of cramming.</p>
  </div>
</section>

<section class="band band-alt">
  <div class="wrap">
    <h2>What we teach</h2>
    <div class="cards">
      ${cfg.courses.slice(0, 4).map((c) => `
      <article class="card">
        <h3>${esc(c.name)}</h3>
        <p class="card-years">${esc(c.years)}</p>
        <p>${esc(c.summary)}</p>
      </article>`).join('')}
    </div>
    <p><a class="more" href="/courses/">All courses and class times &rarr;</a></p>
  </div>
</section>

<section class="band">
  <div class="wrap">
    <h2>The week between lessons</h2>
    <p class="lede">A lesson a week is not enough on its own, so every student has a portal of their own.</p>
    <div class="cards cards-3">
      <article class="card">
        <h3>Homework that marks itself</h3>
        <p>Papers set by the teacher, marked the moment they are handed in, with the answer explained question by question.</p>
      </article>
      <article class="card">
        <h3>A revision hall</h3>
        <p>Every question a student gets wrong becomes a card that comes back days later, and again after that, until they get it right three times.</p>
      </article>
      <article class="card">
        <h3>A writing coach</h3>
        <p>Guided writing that asks for a plan, reads what has been written, and says what is working and what is missing &mdash; without writing it for them.</p>
      </article>
      <article class="card">
        <h3>Ask the teacher</h3>
        <p>A student stuck on a question sends it to their own teacher, who answers it, and the question comes back to be tried again.</p>
      </article>
      <article class="card">
        <h3>Daily reading</h3>
        <p>One piece a day, set by us, because the reading paper is won by children who read and lost by children who do not.</p>
      </article>
      <article class="card">
        <h3>Reports you can read</h3>
        <p>Where your child sits against the cohort, which topics are weak, and what was handed in late &mdash; sent to you, not buried in a login.</p>
      </article>
    </div>
  </div>
</section>

<section class="band band-alt">
  <div class="wrap">
    <h2>Trial testing</h2>
    <p class="lede">Full papers to the real format and timing, sat under test conditions, marked and returned with a rank and a percentile against everyone who sat the same paper. The point is not the mark; it is finding out what breaks under pressure while there is still time to fix it.</p>
    ${enquire('Ask about the next sitting', 'btn btn-primary')}
  </div>
</section>

<section class="band cta-band">
  <div class="wrap">
    <h2>Come and see a class</h2>
    <p class="lede">Tell us your child's year and what you are preparing for, and we will tell you honestly whether we can help.</p>
    ${enquire('Enquire about a place')}
  </div>
</section>
`

// ----------------------------------------------------------------- courses
const coursesBody = `
<section class="page-head">
  <div class="wrap">
    <h1>Courses</h1>
    <p class="lede">${esc(cfg.business.description)}</p>
    ${showPrices && cfg.pricing.note ? `<p class="note">${esc(cfg.pricing.note)}</p>` : ''}
  </div>
</section>

<section class="band">
  <div class="wrap course-list">
    ${cfg.courses.map((c) => `
    <article class="course" id="${esc(c.slug)}">
      <div class="course-head">
        <h2>${esc(c.name)}</h2>
        <p class="card-years">${esc(c.years)}</p>
        ${showPrices ? `<p class="price">${esc(c.price)}</p>` : ''}
      </div>
      <p class="course-summary">${esc(c.summary)}</p>
      <h3 class="course-sub">What it covers</h3>
      <ul class="ticks">${(c.covers || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <h3 class="course-sub">Class times</h3>
      <ul class="times">${(c.times || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${enquire(`Enquire about ${c.name}`, 'btn btn-primary btn-sm')}
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
    ${enquire('Enquire about a place')}
  </div>
</section>
`

// ------------------------------------------------------------------- write
mkdirSync(out, { recursive: true })
mkdirSync(join(out, 'courses'), { recursive: true })

writeFileSync(join(out, 'index.html'), page({
  title: `${cfg.business.name} | ${cfg.business.tagline}`,
  description: cfg.business.description,
  path: '/',
  body: homeBody,
  jsonLd: orgLd,
}))

writeFileSync(join(out, 'courses', 'index.html'), page({
  title: `Courses | ${cfg.business.name}`,
  description: `OC and Selective preparation courses: ${cfg.courses.map((c) => c.name).join(', ')}.`,
  path: '/courses/',
  body: coursesBody,
  jsonLd: {
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
        ...(showPrices ? { offers: { '@type': 'Offer', price: c.price, priceCurrency: 'AUD' } } : {}),
      },
    })),
  },
}))

const pages = ['/', '/courses/']
if (showReviews) {
  pages.push('/reviews/')
  mkdirSync(join(out, 'reviews'), { recursive: true })
  writeFileSync(join(out, 'reviews', 'index.html'), page({
    title: `Reviews | ${cfg.business.name}`,
    description: `What families say about ${cfg.business.name}.`,
    path: '/reviews/',
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

console.log(`built ${pages.length} page(s) for ${origin}`)
console.log(`  prices: ${showPrices ? 'shown' : 'hidden'}   reviews: ${showReviews ? `${liveReviews.length} shown` : 'not published'}`)
for (const w of warnings) console.warn(`  ! ${w}`)
