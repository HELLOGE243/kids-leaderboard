// =============================================================
// TEST RUN — extracts only from the current list page
// 1. Navigate to the list page you want to test
// 2. Open Console (F12) and paste this script
// =============================================================

(async function testExtract() {
  const BASE = 'https://back.cleverspace.app/admin/quiz-question-model'
  const DELAY = 300

  function log(msg) { console.log(`%c[Test] ${msg}`, 'color: #2a7ab5; font-weight: bold') }
  function warn(msg) { console.warn(`[Test] ${msg}`) }

  // --- Helper: download image and convert to base64 data URI ---
  async function imageToDataUri(imgUrl) {
    try {
      const fullUrl = imgUrl.startsWith('http') ? imgUrl : `https://back.cleverspace.app${imgUrl}`
      const res = await fetch(fullUrl, { credentials: 'same-origin' })
      if (!res.ok) return null
      const blob = await res.blob()
      return await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
    } catch (e) {
      warn(`  Could not fetch image: ${imgUrl}`)
      return null
    }
  }

  async function embedImages(html) {
    if (!html) return html
    const imgRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi
    const matches = [...html.matchAll(imgRegex)]
    if (matches.length === 0) return html
    let result = html
    for (const match of matches) {
      const originalSrc = match[1]
      if (originalSrc.startsWith('data:')) continue
      const dataUri = await imageToDataUri(originalSrc)
      if (dataUri) result = result.replace(originalSrc, dataUri)
    }
    return result
  }

  // --- Step 1: Get edit URLs from THIS page only ---
  log('Scanning current page for question links...')
  const editUrls = new Set()

  // Try finding edit links
  document.querySelectorAll('a[href*="/edit/"]').forEach(a => {
    const match = a.href.match(/\/edit\/([a-f0-9-]+)/)
    if (match) editUrls.add(match[1])
  })

  // Fallback: find UUIDs in table cells
  if (editUrls.size === 0) {
    document.querySelectorAll('td').forEach(td => {
      const text = td.textContent.trim()
      if (/^[0-9a-f]{7,8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(text)) {
        editUrls.add(text)
      }
    })
  }

  const uuids = [...editUrls]
  log(`Found ${uuids.length} questions on this page`)

  if (uuids.length === 0) {
    warn('No questions found! Are you on the question list page?')
    return
  }

  // --- Step 2: Fetch each question ---
  const questions = []

  for (let i = 0; i < uuids.length; i++) {
    const uuid = uuids[i]
    log(`[${i + 1}/${uuids.length}] Fetching ${uuid.substring(0, 12)}...`)

    try {
      const res = await fetch(`${BASE}/edit/${uuid}`, { credentials: 'same-origin' })
      if (!res.ok) { warn(`HTTP ${res.status} for ${uuid}`); continue }
      const html = await res.text()
      const doc = new DOMParser().parseFromString(html, 'text/html')

      // Title
      const titleEl = doc.querySelector('#title') || doc.querySelector('[name="title"]')
      const title = titleEl ? (titleEl.value || titleEl.textContent || '').trim() : ''

      // Description
      const descEl = doc.querySelector('#description') || doc.querySelector('[name="description"]')
      let description = descEl ? (descEl.textContent || '').trim() : ''
      const imgCount = (description.match(/<img\s/gi) || []).length
      if (imgCount > 0) {
        log(`  Found ${imgCount} image(s), embedding...`)
        description = await embedImages(description)
      }

      // Category / Subcategory
      const catEl = doc.querySelector('#category') || doc.querySelector('[name="category"]')
      const subcatEl = doc.querySelector('#subcategory') || doc.querySelector('[name="subcategory"]')
      const category = catEl ? (catEl.value || catEl.querySelector?.('option[selected]')?.textContent || '').trim() : ''
      const subcategory = subcatEl ? (subcatEl.value || subcatEl.querySelector?.('option[selected]')?.textContent || '').trim() : ''

      // Answers
      const answers = []
      for (let j = 0; j < 10; j++) {
        const ansTextEl = doc.querySelector(`#answers-${j}-title`) || doc.querySelector(`[name="answers-${j}-title"]`)
        if (!ansTextEl) break
        const answerText = (ansTextEl.textContent || ansTextEl.value || '').trim()

        let isCorrect = false
        const selectors = [
          `#answers-${j}-is_correct`, `[name="answers-${j}-is_correct"]`,
          `#answers-${j}-is-correct`, `[name="answers-${j}-is-correct"]`,
          `#answers-${j}-isCorrect`, `[name="answers-${j}-isCorrect"]`,
        ]
        for (const sel of selectors) {
          const el = doc.querySelector(sel)
          if (el) { isCorrect = el.hasAttribute('checked'); break }
        }
        if (!isCorrect) {
          const table = doc.querySelector(`#answers-${j}`)
          if (table) table.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            if (cb.hasAttribute('checked')) isCorrect = true
          })
        }

        answers.push({ text: answerText, isCorrect })
      }

      questions.push({ uuid, title, description, category, subcategory, answers })
      log(`  ✓ "${title}" — ${answers.length} answers, correct: ${answers.find(a => a.isCorrect)?.text || '???'}`)

    } catch (e) {
      warn(`Error on ${uuid}: ${e.message}`)
    }

    await new Promise(r => setTimeout(r, DELAY))
  }

  // --- Step 3: Show results ---
  log('=== RESULTS ===')
  console.table(questions.map(q => ({
    Title: q.title,
    Description: q.description.substring(0, 80) + '...',
    Answers: q.answers.map(a => a.text).join(' | '),
    Correct: q.answers.find(a => a.isCorrect)?.text || 'NONE FOUND',
    Images: (q.description.match(/data:image/g) || []).length
  })))

  // Download
  const json = JSON.stringify(questions, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'cleverspace-test-export.json'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  log(`Done! ${questions.length} questions exported to cleverspace-test-export.json`)
  return questions
})()
