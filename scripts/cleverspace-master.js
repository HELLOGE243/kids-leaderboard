// =============================================================
// CleverSpace Master Extractor
// =============================================================
// Replaces the manual extract -> splice -> embed -> chunk workflow.
//
// HOW TO USE
//   1. Log into https://back.cleverspace.app/admin (Chrome)
//   2. Open DevTools (F12) -> Console
//   3. Paste this whole script and press Enter
//   4. Click "Choose folder & start" in the panel (bottom right) and pick a
//      folder - every part file is saved straight into it, no download prompts
//   5. Leave the tab open until the panel says Done (it can be in the background)
//
// It scans the list pages, extracts every question (including the solution
// video field), embeds images, and keeps going part after part until the whole
// range is done: cleverspace-p<first>-<last>-part-001.json, -002.json, ...
// In CleverSpace EduPortal: Quiz Builder -> Import JSON -> select ALL the part
// files at once.
//
// RESUMABLE: progress is saved in this browser. If the tab crashes, is closed
// or you get logged out, log back in and paste the script again - it offers
// to continue from where it stopped, without re-downloading finished parts.
//
// Controls (in the console while it runs, or afterwards):
//   csMaster.stop()    finish the current question, save a part, then pause
//   csMaster.status()  show progress
//   csMaster.reset()   forget saved progress and start again from scratch
// =============================================================

(async function cleverSpaceMaster() {
  // >>>>>> SETTINGS <<<<<<
  // Exact range: set both, e.g. FIRST_PAGE = 49, LAST_PAGE = 60 extracts pages
  // 49 to 60 and nothing else (either order works).
  // Whole list: leave LAST_PAGE = null and it scans FIRST_PAGE to the last page.
  const FIRST_PAGE = 1
  const LAST_PAGE = 45
  const MAX_QUESTIONS_PER_FILE = 150
  const MAX_FILE_MB = 20        // images are embedded, so cap by size too
  const DELAY_MS = 300          // pause between requests (be gentle on the server)
  // >>>>>>>>>>>>>>>>>>>>>>

  const BASE = 'https://back.cleverspace.app/admin/quiz-question-model'
  const STATE_KEY = 'cs-master-state-v1'

  // Chrome throttles page timers in background tabs (down to one wake-up a
  // minute after ~5 minutes), which made long runs look frozen. Timers inside
  // a Web Worker are not throttled that way.
  let timerWorker = null
  try {
    timerWorker = new Worker(URL.createObjectURL(new Blob([
      'onmessage = (e) => setTimeout(() => postMessage(e.data.id), e.data.ms)',
    ], { type: 'text/javascript' })))
  } catch {
    timerWorker = null // blocked by the site's security policy: plain timers (keep the tab in front)
  }
  const timerWaiters = new Map()
  let timerSeq = 0
  if (timerWorker) timerWorker.onmessage = (e) => { const fn = timerWaiters.get(e.data); timerWaiters.delete(e.data); if (fn) fn() }
  const sleep = (ms) => new Promise((resolve) => {
    if (!timerWorker) return setTimeout(resolve, ms)
    const id = ++timerSeq
    timerWaiters.set(id, resolve)
    timerWorker.postMessage({ id, ms })
  })
  const log = (m) => console.log(`%c[Master] ${m}`, 'color:#2a7ab5;font-weight:bold')
  const warn = (m) => console.warn(`[Master] ${m}`)

  if (!location.hostname.includes('cleverspace.app')) {
    warn('Run this on back.cleverspace.app while logged in to the admin.')
    return
  }

  // ---------- state ----------
  const loadState = () => { try { return JSON.parse(localStorage.getItem(STATE_KEY)) } catch { return null } }
  const saveState = (s) => localStorage.setItem(STATE_KEY, JSON.stringify(s))

  let stopRequested = false
  let state = loadState()

  window.csMaster = {
    stop() { stopRequested = true; log('Stopping after the current question...') },
    status() {
      const s = loadState()
      if (!s) return log('No saved progress.')
      log(`Pages ${s.firstPage}-${s.lastPage} | questions found ${s.uuids.length} | saved to files ${s.done.length} | parts downloaded ${s.partNo - 1} | failed ${s.failed.length}`)
    },
    reset() { localStorage.removeItem(STATE_KEY); log('Saved progress cleared. Paste the script again to start fresh.') },
  }

  if (state && (!Array.isArray(state.uuids) || state.uuids.length === 0)) {
    // Left behind by a scan that found nothing - not real progress.
    localStorage.removeItem(STATE_KEY)
    state = null
  }

  if (state && LAST_PAGE) {
    // Saved progress for a different page range would silently extract the
    // wrong pages; only resume when the range matches the settings.
    const wantFirst = Math.max(1, Math.min(FIRST_PAGE, LAST_PAGE))
    const wantLast = Math.max(FIRST_PAGE, LAST_PAGE)
    if (state.firstPage !== wantFirst || state.lastPage !== wantLast) {
      log(`Saved progress is for pages ${state.firstPage}-${state.lastPage}; starting pages ${wantFirst}-${wantLast} fresh.`)
      localStorage.removeItem(STATE_KEY)
      state = null
    }
  }

  if (state && state.uuids && state.done.length < state.uuids.length) {
    const cont = confirm(`CleverSpace Master Extractor\n\nSaved progress found: ${state.done.length} of ${state.uuids.length} questions already saved to ${state.partNo - 1} file(s).\n\nOK = continue where it stopped\nCancel = start again from scratch`)
    if (!cont) { localStorage.removeItem(STATE_KEY); state = null }
  } else if (state && state.uuids && state.done.length >= state.uuids.length) {
    const again = confirm(`A previous run already finished (${state.uuids.length} questions in ${state.partNo - 1} files).\n\nOK = start a new full extraction\nCancel = do nothing`)
    if (!again) return
    localStorage.removeItem(STATE_KEY)
    state = null
  }

  // ---------- output folder + start panel ----------
  // Part files are written straight into a folder you pick. Triggering one
  // browser download per part relied on Chrome's "allow multiple downloads"
  // permission; without it every part after the first was silently dropped.
  // Picking a folder needs a real click, hence the on-page Start panel.
  let outputDir = null

  document.getElementById('csm-panel')?.remove() // re-pasting replaces the old panel
  const panel = document.createElement('div')
  panel.id = 'csm-panel'
  panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#0f172a;color:#e2e8f0;font:13px/1.45 system-ui,sans-serif;padding:14px 16px;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.4);width:320px'
  panel.innerHTML = `
    <div style="font-weight:700;margin-bottom:6px">CleverSpace Master Extractor</div>
    <div id="csm-msg" style="margin-bottom:10px;color:#cbd5e1">Choose a folder to save the part files into.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button id="csm-start" style="background:#2563eb;color:#fff;border:0;border-radius:6px;padding:7px 12px;cursor:pointer;font-weight:600">Choose folder &amp; start</button>
      <button id="csm-stop" style="display:none;background:#334155;color:#fff;border:0;border-radius:6px;padding:7px 12px;cursor:pointer">Stop</button>
    </div>`
  document.body.appendChild(panel)
  const panelMsg = (m) => { const el = panel.querySelector('#csm-msg'); if (el) el.textContent = m }
  panel.querySelector('#csm-stop').onclick = () => window.csMaster.stop()

  const canPickFolder = typeof window.showDirectoryPicker === 'function'
  if (!canPickFolder) {
    panel.querySelector('#csm-start').textContent = 'Start (downloads)'
    panelMsg('This browser cannot save to a folder. Files will download instead - allow multiple downloads when Chrome asks.')
  }

  await new Promise((resolve) => {
    panel.querySelector('#csm-start').onclick = async () => {
      if (canPickFolder) {
        try {
          outputDir = await window.showDirectoryPicker({ id: 'cleverspace-parts', mode: 'readwrite' })
        } catch {
          panelMsg('No folder chosen. Click again to pick one.')
          return
        }
      }
      panel.querySelector('#csm-start').style.display = 'none'
      panel.querySelector('#csm-stop').style.display = ''
      panelMsg(outputDir ? `Saving into "${outputDir.name}". Keep this tab open.` : 'Downloading parts. Keep this tab open.')
      resolve()
    }
  })

  // ---------- list pages ----------
  async function fetchDoc(url) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(url, { credentials: 'same-origin' })
      if (res.ok) {
        const html = await res.text()
        if (/name=["']password["']/i.test(html) && /login/i.test(res.url)) {
          throw new Error('Logged out - log back in, then paste the script again to resume.')
        }
        return new DOMParser().parseFromString(html, 'text/html')
      }
      if (res.status === 401 || res.status === 403) throw new Error('Logged out - log back in, then paste the script again to resume.')
      await sleep(1000 * (attempt + 1))
    }
    throw new Error(`Failed to load ${url}`)
  }

  function uuidsOnListPage(doc) {
    const found = new Set()
    doc.querySelectorAll('a[href*="/edit/"]').forEach((a) => {
      const m = (a.getAttribute('href') || '').match(/\/edit\/([a-f0-9-]+)/)
      if (m) found.add(m[1])
    })
    if (found.size === 0) {
      doc.querySelectorAll('td').forEach((td) => {
        const t = td.textContent.trim()
        if (/^[0-9a-f]{7,8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(t)) found.add(t)
      })
    }
    return [...found]
  }

  const listUrl = (page) => `${BASE}/list${page > 1 ? `?page=${page}` : ''}`

  // Whether a list page has questions. An error counts as "unknown" and is
  // retried rather than read as "past the end".
  const pageCache = new Map()
  async function pageHasQuestions(page) {
    if (pageCache.has(page)) return pageCache.get(page)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const n = uuidsOnListPage(await fetchDoc(listUrl(page))).length
        pageCache.set(page, n > 0)
        await sleep(DELAY_MS)
        return n > 0
      } catch (e) {
        if (/Logged out/.test(e.message)) throw e
        await sleep(1000)
      }
    }
    pageCache.set(page, false)
    return false
  }

  async function detectLastPage() {
    // Pagination links on the list only show nearby pages (e.g. 1-5), so they
    // cannot be trusted for the total. Double until an empty page is found,
    // then binary-search the boundary - about 2*log2(pages) requests.
    if (!(await pageHasQuestions(1))) return 0
    let good = 1
    let bad = 2
    while (await pageHasQuestions(bad)) {
      good = bad
      bad *= 2
      if (bad > 20000) break
    }
    while (bad - good > 1) {
      const mid = Math.floor((good + bad) / 2)
      if (await pageHasQuestions(mid)) good = mid
      else bad = mid
    }
    // Guard against a single empty/failed page just past the boundary.
    for (let extra = good + 1; extra <= good + 2; extra++) {
      if (await pageHasQuestions(extra)) return detectFrom(extra)
    }
    return good
  }

  async function detectFrom(start) {
    let p = start
    while (await pageHasQuestions(p + 1)) p++
    return p
  }

  function diagnose(doc) {
    const hrefs = [...doc.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter(Boolean)
    console.group('[Master] DIAGNOSTICS - please send this to support')
    console.log('URL:', location.href)
    console.log('Edit links on page 1:', hrefs.filter((h) => /edit/i.test(h)).slice(0, 5))
    console.log('Paging links on page 1:', hrefs.filter((h) => /page/i.test(h)).slice(0, 10))
    console.log('Sample links:', hrefs.slice(0, 15))
    console.log('Table rows:', doc.querySelectorAll('tr').length)
    console.groupEnd()
  }

  if (!state) {
    let firstPage
    let lastPage
    if (LAST_PAGE) {
      // Exact range: exactly the pages asked for, no detection, no fallback.
      firstPage = Math.max(1, Math.min(FIRST_PAGE, LAST_PAGE))
      lastPage = Math.max(FIRST_PAGE, LAST_PAGE)
      log(`Exact range: pages ${firstPage} to ${lastPage} (${lastPage - firstPage + 1} pages).`)
    } else {
      log('Finding how many list pages there are...')
      const detected = await detectLastPage()
      if (!detected) {
        warn('No questions found on the first list page. Are you logged in to the admin?')
        diagnose(await fetchDoc(listUrl(1)))
        return
      }
      firstPage = Math.max(1, FIRST_PAGE)
      lastPage = detected
      if (firstPage > lastPage) {
        warn(`FIRST_PAGE is ${FIRST_PAGE} but the list only has ${lastPage} page(s). Set LAST_PAGE for an exact range.`)
        return
      }
      log(`The list has ${detected} page(s). Scanning pages ${firstPage} to ${lastPage}...`)
    }
    const all = []
    const seen = new Set()
    for (let page = firstPage; page <= lastPage; page++) {
      try {
        const ids = uuidsOnListPage(await fetchDoc(listUrl(page)))
        for (const id of ids) if (!seen.has(id)) { seen.add(id); all.push(id) }
        if (page % 10 === 0 || page === lastPage) log(`  page ${page}/${lastPage} - ${all.length} questions so far`)
      } catch (e) {
        warn(e.message)
        if (/Logged out/.test(e.message)) return
      }
      await sleep(DELAY_MS)
    }
    if (all.length === 0) {
      // Never record an empty scan as a finished run.
      warn(`Scanned pages ${firstPage}-${lastPage} but found no questions.`)
      diagnose(await fetchDoc(listUrl(firstPage)))
      return
    }
    state = { firstPage, lastPage, uuids: all, done: [], failed: [], partNo: 1, startedAt: Date.now() }
    saveState(state)
    log(`Found ${all.length} questions. Extracting...`)
  } else {
    log(`Resuming: ${state.uuids.length - state.done.length} questions left.`)
  }

  // ---------- extraction ----------
  async function imageToDataUri(src) {
    try {
      const url = src.startsWith('http') ? src : `https://back.cleverspace.app${src}`
      const res = await fetch(url, { credentials: 'same-origin' })
      if (!res.ok) return null
      const blob = await res.blob()
      return await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
    } catch {
      return null
    }
  }

  async function embedImages(html, missing) {
    if (!html) return html
    let out = html
    for (const m of [...html.matchAll(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi)]) {
      const src = m[1]
      if (src.startsWith('data:')) continue
      const dataUri = await imageToDataUri(src)
      if (dataUri) out = out.split(src).join(dataUri)
      else missing.push(src)
    }
    return out
  }

  const text = (el) => (el ? (el.value || el.textContent || '').trim() : '')
  const q1 = (doc, sels) => { for (const s of sels) { const el = doc.querySelector(s); if (el) return el } return null }
  function fieldValue(doc, sels) {
    const el = q1(doc, sels)
    if (!el) return ''
    if (el.tagName === 'SELECT') {
      const opt = el.querySelector('option[selected]')
      return opt ? opt.textContent.trim() : (el.value || '').trim()
    }
    return text(el)
  }
  const variants = (base) => [base, base.replace(/_/g, '-'), base.replace(/_([a-z])/g, (_, c) => c.toUpperCase())]

  async function extractQuestion(uuid) {
    const doc = await fetchDoc(`${BASE}/edit/${uuid}`)
    const missingImages = []

    const title = text(q1(doc, ['#title', '[name="title"]', 'input[id*="title"]']))
    let description = (q1(doc, ['#description', '[name="description"]', 'textarea[id*="description"]'])?.textContent || '').trim()
    description = await embedImages(description, missingImages)

    const category = fieldValue(doc, ['#category', '[name="category"]', 'select[id*="category"]'])
    const subcategory = fieldValue(doc, ['#subcategory', '[name="subcategory"]', 'select[id*="subcategory"]'])
    const points = fieldValue(doc, ['#points', '[name="points"]', 'select[id*="points"]', 'input[id*="points"]'])
    const answersType = fieldValue(doc, variants('answers_type').flatMap((v) => [`#${v}`, `[name="${v}"]`]))

    let solutionText = (q1(doc, [...variants('solution_text').flatMap((v) => [`#${v}`, `[name="${v}"]`]), 'textarea[id*="solution"]'])?.textContent || '').trim()
    solutionText = await embedImages(solutionText, missingImages)

    const solutionVideo = fieldValue(doc, variants('solution_video').flatMap((v) => [`#${v}`, `[name="${v}"]`, `input[id*="${v}"]`]))

    const multiDescriptions = []
    const multi = q1(doc, variants('multi_descriptions').flatMap((v) => [`#${v}`, `#rows-${v}`]))
    if (multi) {
      const last = parseInt(multi.getAttribute('last-index') || '10', 10)
      for (let m = 0; m < last; m++) {
        const tEl = q1(doc, variants('multi_descriptions').flatMap((v) => [`#${v}-${m}-title`, `[name="${v}-${m}-title"]`]))
        const dEl = q1(doc, variants('multi_descriptions').flatMap((v) => [`#${v}-${m}-description`, `[name="${v}-${m}-description"]`]))
        if (!tEl && !dEl) continue
        multiDescriptions.push({ title: text(tEl), description: await embedImages((dEl?.textContent || '').trim(), missingImages) })
      }
    }

    const answers = []
    const container = q1(doc, ['#answers', '#rows-answers'])
    const lastIdx = container ? parseInt(container.getAttribute('last-index') || '4', 10) : 4
    for (let j = 0; j < lastIdx; j++) {
      const aEl = q1(doc, [`#answers-${j}-title`, `[name="answers-${j}-title"]`])
      if (!aEl) continue
      const orderEl = q1(doc, [`#answers-${j}-order`, `[name="answers-${j}-order"]`])
      const order = orderEl ? parseInt(orderEl.value || orderEl.textContent || j + 1, 10) : j + 1
      let isCorrect = false
      const cb = q1(doc, ['is_correct', 'is-correct', 'isCorrect', 'correct'].flatMap((k) => [`#answers-${j}-${k}`, `[name="answers-${j}-${k}"]`]))
      if (cb) isCorrect = cb.hasAttribute('checked')
      if (!isCorrect) doc.querySelectorAll(`#answers-${j} input[type="checkbox"]`).forEach((c) => { if (c.hasAttribute('checked')) isCorrect = true })
      answers.push({ text: text(aEl), order, isCorrect })
    }
    answers.sort((a, b) => a.order - b.order)

    const q = {
      uuid,
      title,
      description,
      category,
      subcategory,
      points: points || '1',
      answersType: answersType || 'SINGLE_SELECT',
      answers: answers.map((a) => ({ text: a.text, isCorrect: a.isCorrect })),
    }
    if (multiDescriptions.length) q.multiDescriptions = multiDescriptions
    if (solutionText) q.solutionText = solutionText
    if (solutionVideo) q.solutionVideo = solutionVideo
    if (missingImages.length) q.missingImages = missingImages
    return q
  }

  // ---------- output ----------
  let buffer = []
  let bufferBytes = 0
  // Range in the name so files from separate runs never collide.
  const filePrefix = () => `cleverspace-p${state.firstPage}-${state.lastPage}`

  function download(name, data) {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 60000)
  }

  async function writePart(name, data) {
    if (outputDir) {
      const handle = await outputDir.getFileHandle(name, { create: true })
      const writable = await handle.createWritable()
      await writable.write(JSON.stringify(data))
      await writable.close()
      return 'Saved'
    }
    download(name, data)
    await sleep(800) // give Chrome time to register each download
    return 'Downloaded'
  }

  async function flush() {
    if (buffer.length === 0) return
    const name = `${filePrefix()}-part-${String(state.partNo).padStart(3, '0')}.json`
    let how
    try {
      how = await writePart(name, buffer)
    } catch (e) {
      // Do not mark these questions done - they were not saved. Stop so a
      // resume re-extracts them instead of leaving a hole in the export.
      warn(`Could not save ${name}: ${e.message}. Paste the script again to resume.`)
      panelMsg(`Could not save ${name}. Paste the script again to resume.`)
      stopRequested = true
      e.saveFailure = true
      throw e
    }
    log(`${how} ${name} (${buffer.length} questions, ${(bufferBytes / 1048576).toFixed(1)} MB)`)
    panelMsg(`${how} ${name}. ${state.done.length + buffer.length}/${state.uuids.length} questions so far.`)
    state.done.push(...buffer.map((q) => q.uuid))
    state.partNo += 1
    saveState(state)
    buffer = []
    bufferBytes = 0
  }

  const doneSet = new Set(state.done)
  const failedSet = new Set(state.failed.map((f) => f.uuid))
  const todo = state.uuids.filter((id) => !doneSet.has(id))
  const started = Date.now()
  let processed = 0
  let imagesMissing = 0

  for (const uuid of todo) {
    if (stopRequested) break
    try {
      const q = await extractQuestion(uuid)
      if (q.missingImages) imagesMissing += q.missingImages.length
      const size = JSON.stringify(q).length
      if (buffer.length && (buffer.length >= MAX_QUESTIONS_PER_FILE || bufferBytes + size > MAX_FILE_MB * 1048576)) {
        await flush()
      }
      buffer.push(q)
      bufferBytes += size
      if (failedSet.has(uuid)) {
        state.failed = state.failed.filter((f) => f.uuid !== uuid)
      }
    } catch (e) {
      if (e.saveFailure) return
      if (/Logged out/.test(e.message)) {
        warn(e.message)
        panelMsg('Logged out. Log back in, then paste the script again to resume.')
        try { await flush() } catch { /* already reported */ }
        return
      }
      warn(`Skipped ${uuid}: ${e.message}`)
      if (!failedSet.has(uuid)) { state.failed.push({ uuid, error: e.message }); failedSet.add(uuid) }
      // Count it as handled so a single broken question cannot block completion.
      state.done.push(uuid)
      saveState(state)
    }

    processed++
    if (processed % 25 === 0) {
      const perQ = (Date.now() - started) / processed
      const left = todo.length - processed
      log(`${state.done.length + buffer.length}/${state.uuids.length} questions - about ${Math.ceil((left * perQ) / 60000)} min left`)
    }
    await sleep(DELAY_MS)
  }

  try { await flush() } catch { return }

  if (stopRequested) {
    panelMsg('Paused. Paste the script again to continue.')
    log('Paused. Paste the script again to continue.')
    return
  }

  log('=== DONE ===')
  panelMsg(`Done: ${state.uuids.length} questions in ${state.partNo - 1} file(s).`)
  panel.querySelector('#csm-stop').style.display = 'none'
  log(`${state.uuids.length} questions in ${state.partNo - 1} file(s): ${filePrefix()}-part-001.json ... -part-${String(state.partNo - 1).padStart(3, '0')}.json`)
  if (imagesMissing) warn(`${imagesMissing} image(s) could not be downloaded; those questions list them under "missingImages".`)
  if (state.failed.length) {
    warn(`${state.failed.length} question(s) could not be extracted:`)
    console.table(state.failed.map((f) => ({ url: `${BASE}/edit/${f.uuid}`, error: f.error })))
  }
  log('Next: EduPortal -> Quiz Builder -> Import JSON -> select all the part files together.')
})()
