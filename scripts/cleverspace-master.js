// =============================================================
// CleverSpace Master Extractor
// =============================================================
// Replaces the manual extract -> splice -> embed -> chunk workflow.
//
// HOW TO USE
//   1. Set FIRST_PAGE and LAST_PAGE below
//   2. Log into https://back.cleverspace.app/admin (Chrome)
//   3. Open DevTools (F12) -> Console
//   4. Paste this whole script and press Enter
//   5. Click "Choose folder & start" in the panel (bottom right) and pick a
//      folder - every part file is saved straight into it, no download prompts
//   6. Leave the tab open until the panel says Done (it can be in the background)
//
// IT WORKS IN BLOCKS. The range is cut into blocks of BLOCK_PAGES pages, and
// each block is scanned, extracted and written before the next one starts:
//
//     cleverspace-p50-69-part-001.json, -002.json, ...
//     cleverspace-p70-89-part-001.json, ...
//
// So a block's files are complete and importable while the rest is still
// running, and a run that dies halfway costs you one block, not the lot.
// In CleverSpace EduPortal: Quiz Builder -> Import JSON -> select the files.
//
// RESUMABLE: progress is saved in this browser. If the tab crashes, is closed
// or you get logged out, log back in and paste the script again - it offers to
// continue from the question it stopped at, in the block it stopped in.
//
// WHERE THE LIST ENDS: a block that turns up no questions it has not already
// seen is past the end, and the run stops there and says so. So you can set
// LAST_PAGE higher than the list goes without wasting a night on empty pages.
//
// Controls (in the console while it runs, or afterwards):
//   csMaster.stop()    finish the current question, save a part, then pause
//   csMaster.status()  show progress
//   csMaster.reset()   forget saved progress and start again from scratch
// =============================================================

(async function cleverSpaceMaster() {
  // >>>>>> SETTINGS <<<<<<
  const FIRST_PAGE = 50
  const LAST_PAGE = 165
  const BLOCK_PAGES = 20        // pages per block; each block writes its own files
  const MAX_QUESTIONS_PER_FILE = 150
  const MAX_FILE_MB = 20        // images are embedded, so cap by size too
  const DELAY_MS = 300          // pause between requests (be gentle on the server)
  // >>>>>>>>>>>>>>>>>>>>>>

  const BASE = 'https://back.cleverspace.app/admin/quiz-question-model'
  const STATE_KEY = 'cs-master-state-v2'

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

  // ---------- the blocks ----------
  const rangeFirst = Math.max(1, Math.min(FIRST_PAGE, LAST_PAGE))
  const rangeLast = Math.max(FIRST_PAGE, LAST_PAGE)
  const blockSize = Math.max(1, BLOCK_PAGES)

  function blocksFor(first, last, size) {
    const out = []
    for (let start = first; start <= last; start += size) {
      out.push({ first: start, last: Math.min(start + size - 1, last) })
    }
    return out
  }
  const blocks = blocksFor(rangeFirst, rangeLast, blockSize)

  // ---------- state ----------
  const loadState = () => { try { return JSON.parse(localStorage.getItem(STATE_KEY)) } catch { return null } }
  const saveState = (s) => localStorage.setItem(STATE_KEY, JSON.stringify(s))

  let stopRequested = false
  let state = loadState()

  const blockLabel = (b) => `pages ${b.first}-${b.last}`

  window.csMaster = {
    stop() { stopRequested = true; log('Stopping after the current question...') },
    status() {
      const s = loadState()
      if (!s) return log('No saved progress.')
      const b = s.blocks[s.blockIndex]
      log(`Range ${s.rangeFirst}-${s.rangeLast} in blocks of ${s.blockSize}`)
      log(`Block ${s.blockIndex + 1} of ${s.blocks.length} (${b ? blockLabel(b) : 'done'})`)
      if (b && b.uuids) log(`  this block: ${b.done.length}/${b.uuids.length} questions, ${b.partNo - 1} file(s) written`)
      log(`Overall: ${s.totalQuestions} questions in ${s.totalFiles} file(s); ${s.failed.length} failed`)
    },
    reset() { localStorage.removeItem(STATE_KEY); log('Saved progress cleared. Paste the script again to start fresh.') },
  }

  // Saved progress for a different range or block size would quietly extract
  // the wrong pages, so only ever resume a run that matches these settings.
  if (state && (state.rangeFirst !== rangeFirst || state.rangeLast !== rangeLast || state.blockSize !== blockSize)) {
    log(`Saved progress is for pages ${state.rangeFirst}-${state.rangeLast} in blocks of ${state.blockSize}; starting pages ${rangeFirst}-${rangeLast} fresh.`)
    localStorage.removeItem(STATE_KEY)
    state = null
  }

  if (state) {
    const b = state.blocks[state.blockIndex]
    const left = b && b.uuids ? b.uuids.length - b.done.length : 0
    const finished = state.blockIndex >= state.blocks.length
    if (finished) {
      const again = confirm(`A previous run of pages ${rangeFirst}-${rangeLast} already finished (${state.totalQuestions} questions in ${state.totalFiles} files).\n\nOK = start it again from scratch\nCancel = do nothing`)
      if (!again) return
      localStorage.removeItem(STATE_KEY)
      state = null
    } else {
      const cont = confirm(`CleverSpace Master Extractor\n\nSaved progress found for pages ${rangeFirst}-${rangeLast}:\nblock ${state.blockIndex + 1} of ${state.blocks.length} (${blockLabel(state.blocks[state.blockIndex])}), ${left} question(s) left in it.\n${state.totalQuestions} questions saved so far.\n\nOK = continue where it stopped\nCancel = start again from scratch`)
      if (!cont) { localStorage.removeItem(STATE_KEY); state = null }
    }
  }

  if (!state) {
    state = {
      rangeFirst,
      rangeLast,
      blockSize,
      blocks: blocks.map((b) => ({ ...b, uuids: null, done: [], partNo: 1 })),
      blockIndex: 0,
      seen: [],            // uuids seen anywhere in this run, so a repeated page is not re-extracted
      failed: [],
      totalQuestions: 0,
      totalFiles: 0,
      startedAt: Date.now(),
    }
    saveState(state)
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
  panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#0f172a;color:#e2e8f0;font:13px/1.45 system-ui,sans-serif;padding:14px 16px;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.4);width:330px'
  panel.innerHTML = `
    <div style="font-weight:700;margin-bottom:6px">CleverSpace Master Extractor</div>
    <div id="csm-sub" style="margin-bottom:6px;color:#94a3b8;font-size:12px">Pages ${rangeFirst}-${rangeLast} in ${blocks.length} block(s) of ${blockSize}</div>
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

  function diagnose(doc) {
    const hrefs = [...doc.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter(Boolean)
    console.group('[Master] DIAGNOSTICS - please send this to support')
    console.log('URL:', location.href)
    console.log('Edit links on the page:', hrefs.filter((h) => /edit/i.test(h)).slice(0, 5))
    console.log('Paging links on the page:', hrefs.filter((h) => /page/i.test(h)).slice(0, 10))
    console.log('Sample links:', hrefs.slice(0, 15))
    console.log('Table rows:', doc.querySelectorAll('tr').length)
    console.groupEnd()
  }

  /**
   * The questions on one block's pages, minus any already seen in this run.
   *
   * Asked for a page past the last one, this list may hand back the first or
   * the last page rather than nothing, so "no questions" is not what the end
   * looks like - "nothing we have not already got" is.
   */
  /**
   * What page 1 holds, for recognising a page that is past the end.
   *
   * A list that answers an out-of-range page with the LAST page gives itself
   * away: we have scanned that page, so its questions repeat. One that answers
   * with the FIRST page does not, if the run started further in - page 1's
   * questions would look new and be extracted as though they belonged to page
   * 170. So page 1 is read once, up front, purely to be recognised later.
   */
  async function pageOneSignature() {
    if (typeof state.pageOneSig === 'string') return state.pageOneSig
    if (rangeFirst <= 1) { state.pageOneSig = ''; saveState(state); return '' }
    try {
      state.pageOneSig = uuidsOnListPage(await fetchDoc(listUrl(1))).sort().join(',')
    } catch (e) {
      if (/Logged out/.test(e.message)) throw e
      state.pageOneSig = ''
    }
    saveState(state)
    await sleep(DELAY_MS)
    return state.pageOneSig
  }

  async function scanBlock(block) {
    const clamp = await pageOneSignature()
    const seen = new Set(state.seen)
    const fresh = []
    let repeats = 0
    let pastEnd = false
    for (let page = block.first; page <= block.last; page++) {
      if (stopRequested) break
      let ids
      try {
        ids = uuidsOnListPage(await fetchDoc(listUrl(page)))
      } catch (e) {
        warn(`page ${page}: ${e.message}`)
        if (/Logged out/.test(e.message)) throw e
        continue
      }
      if (clamp && page > 1 && ids.slice().sort().join(',') === clamp) {
        log(`page ${page} came back as page 1 - the list ends before it.`)
        pastEnd = true
        break
      }
      for (const id of ids) {
        if (seen.has(id)) { repeats++; continue }
        seen.add(id)
        fresh.push(id)
      }
      await sleep(DELAY_MS)
    }
    state.seen = [...seen]
    return { fresh, repeats, pastEnd }
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
  // The block's own pages in the name, so every block's files stand on their
  // own and files from separate runs never collide.
  const filePrefix = (block) => `cleverspace-p${block.first}-${block.last}`

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

  // ---------- the run ----------
  let imagesMissing = 0
  const runStarted = Date.now()
  let questionsThisRun = 0

  async function runBlock(block, index) {
    if (!block.uuids) {
      log(`--- Block ${index + 1} of ${state.blocks.length}: ${blockLabel(block)} ---`)
      panelMsg(`Block ${index + 1}/${state.blocks.length}: scanning ${blockLabel(block)}...`)
      const { fresh, repeats, pastEnd } = await scanBlock(block)
      if (stopRequested) return 'paused'
      block.pastEnd = pastEnd
      if (fresh.length === 0) {
        // Nothing here that we have not already got: either the pages are
        // empty, or this list hands back a page we have already read when
        // asked for one past the end. Either way, this is the end.
        if (repeats > 0) log(`${blockLabel(block)} only repeated questions already extracted - that is the end of the list.`)
        else warn(`${blockLabel(block)} had no questions at all - that is the end of the list.`)
        if (index === 0 && repeats === 0) {
          try { diagnose(await fetchDoc(listUrl(block.first))) } catch { /* reported above */ }
        }
        return 'end'
      }
      block.uuids = fresh
      saveState(state)
      log(`${fresh.length} questions on ${blockLabel(block)}${repeats ? ` (${repeats} already had)` : ''}. Extracting...`)
    } else {
      log(`--- Block ${index + 1} of ${state.blocks.length}: ${blockLabel(block)} (resuming, ${block.uuids.length - block.done.length} left) ---`)
    }

    let buffer = []
    let bufferBytes = 0

    async function flush() {
      if (buffer.length === 0) return
      const name = `${filePrefix(block)}-part-${String(block.partNo).padStart(3, '0')}.json`
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
      block.done.push(...buffer.map((q) => q.uuid))
      block.partNo += 1
      state.totalQuestions += buffer.length
      state.totalFiles += 1
      saveState(state)
      panelMsg(`Block ${index + 1}/${state.blocks.length} (${blockLabel(block)}): ${block.done.length}/${block.uuids.length} questions, ${state.totalFiles} file(s) so far.`)
      buffer = []
      bufferBytes = 0
    }

    const doneSet = new Set(block.done)
    const failedSet = new Set(state.failed.map((f) => f.uuid))
    const todo = block.uuids.filter((id) => !doneSet.has(id))

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
        if (failedSet.has(uuid)) state.failed = state.failed.filter((f) => f.uuid !== uuid)
      } catch (e) {
        if (e.saveFailure) return 'stopped'
        if (/Logged out/.test(e.message)) {
          warn(e.message)
          panelMsg('Logged out. Log back in, then paste the script again to resume.')
          try { await flush() } catch { /* already reported */ }
          return 'stopped'
        }
        warn(`Skipped ${uuid}: ${e.message}`)
        if (!failedSet.has(uuid)) { state.failed.push({ uuid, error: e.message }); failedSet.add(uuid) }
        // Count it as handled so a single broken question cannot block the run.
        block.done.push(uuid)
        saveState(state)
      }

      questionsThisRun++
      if (questionsThisRun % 25 === 0) {
        const perQ = (Date.now() - runStarted) / questionsThisRun
        const leftHere = todo.length - (questionsThisRun % todo.length || 0)
        log(`${block.done.length + buffer.length}/${block.uuids.length} in this block - about ${Math.ceil((leftHere * perQ) / 60000)} min left in it`)
      }
      await sleep(DELAY_MS)
    }

    try { await flush() } catch { return 'stopped' }
    if (stopRequested) return 'paused'

    log(`Block ${index + 1} done: ${blockLabel(block)} -> ${block.partNo - 1} file(s). These are ready to import.`)
    return block.pastEnd ? 'end' : 'done'
  }

  log(`Pages ${rangeFirst}-${rangeLast} in ${state.blocks.length} block(s) of ${blockSize}.`)

  while (state.blockIndex < state.blocks.length) {
    const block = state.blocks[state.blockIndex]
    let outcome
    try {
      outcome = await runBlock(block, state.blockIndex)
    } catch (e) {
      warn(e.message)
      panelMsg('Stopped. Paste the script again to resume.')
      return
    }
    if (outcome === 'stopped') return
    if (outcome === 'paused') {
      panelMsg('Paused. Paste the script again to continue.')
      log('Paused. Paste the script again to continue.')
      return
    }
    if (outcome === 'end') {
      log('Reached the end of the list.')
      state.blockIndex = state.blocks.length
      saveState(state)
      break
    }
    state.blockIndex += 1
    saveState(state)
  }

  log('=== DONE ===')
  panelMsg(`Done: ${state.totalQuestions} questions in ${state.totalFiles} file(s).`)
  panel.querySelector('#csm-stop').style.display = 'none'
  log(`${state.totalQuestions} questions in ${state.totalFiles} file(s) across ${Math.min(state.blockIndex, state.blocks.length)} block(s).`)
  if (imagesMissing) warn(`${imagesMissing} image(s) could not be downloaded; those questions list them under "missingImages".`)
  if (state.failed.length) {
    warn(`${state.failed.length} question(s) could not be extracted:`)
    console.table(state.failed.map((f) => ({ url: `${BASE}/edit/${f.uuid}`, error: f.error })))
  }
  log('Next: EduPortal -> Quiz Builder -> Import JSON -> select the part files.')
})()
