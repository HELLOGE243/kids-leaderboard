// =============================================================
// CleverSpace — how many list pages are there, really?
// =============================================================
// Paste into the console at back.cleverspace.app/admin while logged in.
//
// Two requests. It asks for page 1 and for a page number far past the end,
// and compares what comes back:
//
//   nothing back          the server answers honestly, and the master
//                         extractor's own detection will work
//   the same as page 1    the server clamps out-of-range pages to the first
//   something else        the server clamps them to the last page
//
// Either clamp is why detection hangs: it doubles the page number looking for
// an empty page, and an empty page never comes.
//
// When the server clamps, this finds the real last page by binary search on
// the clamped signature, and prints it - put that number in LAST_PAGE.
// =============================================================

(async function cleverSpacePageCheck() {
  const BASE = 'https://back.cleverspace.app/admin/quiz-question-model'
  const listUrl = (p) => `${BASE}/list${p > 1 ? `?page=${p}` : ''}`
  const log = (m) => console.log(`%c[PageCheck] ${m}`, 'color:#2a7ab5;font-weight:bold')

  async function signature(page) {
    const res = await fetch(listUrl(page), { credentials: 'same-origin' })
    if (!res.ok) throw new Error(`page ${page}: HTTP ${res.status}`)
    const html = await res.text()
    if (/name=["']password["']/i.test(html) && /login/i.test(res.url)) throw new Error('Logged out')
    const ids = [...html.matchAll(/\/edit\/([a-f0-9-]+)/g)].map((m) => m[1])
    return [...new Set(ids)].sort().join(',')
  }

  const count = (s) => (s ? s.split(',').length : 0)

  const first = await signature(1)
  log(`page 1: ${count(first)} questions`)
  if (!first) { log('No questions on page 1 - are you logged in to the admin?'); return }

  const FAR = 999999
  const far = await signature(FAR)
  log(`page ${FAR}: ${count(far)} questions`)

  if (!far) {
    log('The server returns nothing past the end. Detection works; leave LAST_PAGE = null.')
    return
  }

  const clampsToFirst = far === first
  log(clampsToFirst
    ? 'The server clamps out-of-range pages to page 1 - that is why detection hangs.'
    : 'The server clamps out-of-range pages to the LAST page - that is why detection hangs.')

  // Past the end every page comes back identical to the clamp, so that is the
  // boundary to search for.
  log('Finding the real last page...')
  const cache = new Map()
  const real = async (p) => {
    if (!cache.has(p)) cache.set(p, await signature(p))
    const sig = cache.get(p)
    return sig !== '' && sig !== far
  }

  let good = 1
  let bad = 2
  while (await real(bad)) {
    good = bad
    bad *= 2
    if (bad > 20000) break
  }
  while (bad - good > 1) {
    const mid = Math.floor((good + bad) / 2)
    if (await real(mid)) good = mid
    else bad = mid
  }

  // Clamping to the last page makes that page look like the clamp, so the
  // search stops one short of it.
  const last = clampsToFirst ? good : good + 1
  log(`=== The list has ${last} page(s). ===`)
  log(`Set FIRST_PAGE = 50 and LAST_PAGE = ${last} in the master extractor.`)
})()
