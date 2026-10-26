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
const out = join(here, process.argv.includes('--preview') ? 'preview' : 'dist')
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

const showPrices = preview || (cfg.pricing.show && cfg.courses.every((c) => !isTodo(c.price)))
if (cfg.pricing.show && !showPrices) {
  warnings.push('prices are switched on but some are still TODO, so none are shown')
}

const realReviews = (cfg.reviews.items || []).filter(
  (r) => !isTodo(r.quote) && !isTodo(r.author))
const liveReviews = preview && !realReviews.length ? SAMPLE.reviews : realReviews
const showReviews = preview || (cfg.reviews.show && realReviews.length > 0)
if (cfg.reviews.show && !showReviews) {
  warnings.push('reviews are switched on but none are filled in, so the page is left out')
}
if (!cfg.reviews.show && (cfg.reviews.items || []).length) {
  warnings.push('reviews are off - the page is built but not linked or indexed')
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
const enquire = (label = 'Enquire about a place', cls = 'btn btn-primary', q = '') =>
  `<a class="${cls}" href="/contact/${q ? `?about=${encodeURIComponent(q)}` : ''}">${esc(label)}</a>`

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
${preview ? '<p class="preview-flag">Preview &mdash; prices and reviews below are sample text, not real</p>' : ''}
<header class="site-head">
  <div class="wrap head-row">
    <a class="brand" href="/" aria-label="${esc(cfg.business.name)} home">
      <img src="/logo.png" alt="${esc(cfg.business.name)}" width="52" height="52">
    </a>
    <nav class="nav" aria-label="Main">
      <a href="/courses/">Courses</a>
      ${showReviews ? `<a href="${esc(reviewsPath)}">${esc(reviewsLabel)}</a>` : ''}
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
    <h2>Two tests, four years, one preparation</h2>
    <div class="cards">
      <article class="card">
        <h3>Opportunity Class</h3>
        <p>Sat in <strong>Year 4</strong> for entry to an OC class in Year 5. Reading, mathematical reasoning and thinking skills, all under time.</p>
        <p class="card-cta"><a class="btn btn-primary btn-sm" href="${esc(mockTestUrl)}">Sit a free OC mock test</a></p>
      </article>
      <article class="card">
        <h3>Selective High School</h3>
        <p>Sat in <strong>Year 6</strong> for entry in Year 7. The same three papers plus writing, and a far larger field.</p>
        <p class="card-cta"><a class="btn btn-primary btn-sm" href="${esc(mockTestUrl)}">Sit a free Selective mock test</a></p>
      </article>
    </div>
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
    <h2>${esc(cfg.advantages.heading)}</h2>
    <p class="lede">${esc(cfg.advantages.lede)}</p>
    <div class="cards">
      ${(cfg.advantages.items || []).map((a) => `
      <article class="card">
        <h3>${esc(a.title)}</h3>
        <p>${esc(a.body)}</p>
      </article>`).join('')}
    </div>
  </div>
</section>

<section class="band cta-band">
  <div class="wrap">
    <h2>Come and see a class</h2>
    <p class="lede">Tell us your child's year and what you are preparing for, and we will tell you honestly whether we can help.</p>
    ${enquire('Contact us')}
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
        ${showPrices ? `<p class="price">${esc(isTodo(c.price) ? SAMPLE.price : c.price)}</p>` : ''}
      </div>
      <p class="course-summary">${esc(c.summary)}</p>
      <h3 class="course-sub">What it covers</h3>
      <ul class="ticks">${(c.covers || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      <h3 class="course-sub">Class times</h3>
      <ul class="times">${(c.times || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
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
    ${enquire('Enquire about a place')}
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
    <h1>${esc(cfg.contact.heading)}</h1>
    <p class="lede">${esc(cfg.contact.lede)}</p>
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
          <option>A free mock test</option>
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

mkdirSync(join(out, 'contact'), { recursive: true })
writeFileSync(join(out, 'contact', 'index.html'), page({
  title: `Contact | ${cfg.business.name}`,
  description: cfg.contact.lede,
  path: '/contact/',
  body: contactBody,
  jsonLd: orgLd,
}))

const pages = ['/', '/courses/', '/contact/']
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

console.log(`built ${pages.length} page(s) for ${origin}`)
console.log(`  prices: ${showPrices ? 'shown' : 'hidden'}   reviews: ${showReviews ? `${liveReviews.length} shown` : 'not published'}`)
for (const w of warnings) console.warn(`  ! ${w}`)
