// =============================================================
// CleverSpace Question Extractor v2 — All Fields
// =============================================================
// HOW TO USE:
// 1. Log into https://back.cleverspace.app/admin
// 2. Open DevTools (F12) → Console tab
// 3. Copy-paste this ENTIRE script and press Enter
// 4. Wait for it to finish (progress shown in console)
// 5. A JSON file will automatically download
//
// CONFIGURATION: Change START_PAGE and PAGE_COUNT below
// to control which pages to extract. Pages go backwards.
// =============================================================

(async function extractCleverSpaceQuestions() {
  // >>>>>> CHANGE THESE FOR EACH RUN <<<<<<
  const START_PAGE = 165   // highest page number (start here, go backwards)
  const PAGE_COUNT = 20    // how many pages to process per run
  // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

  const BASE = 'https://back.cleverspace.app/admin/quiz-question-model'
  const DELAY = 300
  const END_PAGE = Math.max(1, START_PAGE - PAGE_COUNT + 1)

  function log(msg) { console.log(`%c[Extractor] ${msg}`, 'color: #2a7ab5; font-weight: bold') }
  function warn(msg) { console.warn(`[Extractor] ${msg}`) }

  log(`=== Extracting pages ${START_PAGE} → ${END_PAGE} (${PAGE_COUNT} pages, back to front) ===`)

  // --- Step 1: Collect question edit URLs from pages (back to front) ---
  log('Step 1: Scanning question list pages...')
  const editUrls = new Set()

  for (let page = START_PAGE; page >= END_PAGE; page--) {
    let url = `${BASE}/list`
    if (page > 1) url += `?page=${page}`
    log(`  Fetching list page ${page}...`)

    try {
      const res = await fetch(url, { credentials: 'same-origin' })
      if (!res.ok) { log(`  Page ${page} returned ${res.status}, skipping.`); continue }
      const html = await res.text()
      const doc = new DOMParser().parseFromString(html, 'text/html')

      const links = doc.querySelectorAll('a[href*="/edit/"]')
      let foundOnPage = 0
      links.forEach(a => {
        const href = a.getAttribute('href')
        const match = href.match(/\/edit\/([a-f0-9-]+)/)
        if (match) {
          editUrls.add(match[1])
          foundOnPage++
        }
      })

      if (foundOnPage === 0) {
        const cells = doc.querySelectorAll('td')
        cells.forEach(td => {
          const text = td.textContent.trim()
          if (/^[0-9a-f]{7,8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(text)) {
            editUrls.add(text)
            foundOnPage++
          }
        })
      }

      log(`  Page ${page}: ${foundOnPage} questions`)
      if (foundOnPage === 0) log(`  Page ${page} was empty — may have passed the last page.`)

      await new Promise(r => setTimeout(r, DELAY))
    } catch (e) {
      warn(`Error fetching page ${page}: ${e.message}`)
    }
  }

  const uuids = [...editUrls]
  log(`Total unique questions found across pages ${START_PAGE}–${END_PAGE}: ${uuids.length}`)

  if (uuids.length === 0) {
    warn('No questions found! Make sure you are logged in and page numbers are correct.')
    return
  }

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
      warn(`  Could not fetch image: ${imgUrl} — ${e.message}`)
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
      if (dataUri) {
        result = result.replace(originalSrc, dataUri)
      }
    }
    return result
  }

  // --- Helper: get field value with multiple selector fallbacks ---
  function getFieldValue(doc, selectors) {
    for (const sel of selectors) {
      const el = doc.querySelector(sel)
      if (el) {
        if (el.tagName === 'SELECT') {
          const selected = el.querySelector('option[selected]')
          return selected ? selected.textContent.trim() : (el.value || '').trim()
        }
        return (el.value || el.textContent || '').trim()
      }
    }
    return ''
  }

  // --- Step 2: Fetch each question's edit page and extract data ---
  log('Step 2: Extracting question data...')
  const questions = []
  const errors = []

  for (let i = 0; i < uuids.length; i++) {
    const uuid = uuids[i]
    let title = ''
    log(`  [${i + 1}/${uuids.length}] Fetching ${uuid.substring(0, 12)}...`)

    try {
      let html, res
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(`${BASE}/edit/${uuid}`, { credentials: 'same-origin' })
        if (res.ok) break
        if (attempt < 2) {
          warn(`  HTTP ${res.status} for ${uuid}, retrying (${attempt + 1}/3)...`)
          await new Promise(r => setTimeout(r, 1000))
        }
      }
      if (!res.ok) {
        warn(`  HTTP ${res.status} for ${uuid} after 3 attempts`)
        errors.push({ uuid, error: `HTTP ${res.status} after 3 retries` })
        continue
      }
      html = await res.text()
      const doc = new DOMParser().parseFromString(html, 'text/html')

      // --- Title ---
      const titleEl = doc.querySelector('#title') ||
                      doc.querySelector('[name="title"]') ||
                      doc.querySelector('input[id*="title"]')
      title = titleEl ? (titleEl.value || titleEl.textContent || '').trim() : ''

      // --- Description (main, with image embedding) ---
      const descEl = doc.querySelector('#description') ||
                     doc.querySelector('[name="description"]') ||
                     doc.querySelector('textarea[id*="description"]')
      let description = descEl ? (descEl.textContent || '').trim() : ''
      const imgCount = (description.match(/<img\s/gi) || []).length
      if (imgCount > 0) {
        log(`    Found ${imgCount} image(s), embedding...`)
        description = await embedImages(description)
      }

      // --- Category ---
      const category = getFieldValue(doc, [
        '#category', '[name="category"]', 'select[id*="category"]'
      ])

      // --- Subcategory ---
      const subcategory = getFieldValue(doc, [
        '#subcategory', '[name="subcategory"]', 'select[id*="subcategory"]'
      ])

      // --- Points ---
      const points = getFieldValue(doc, [
        '#points', '[name="points"]', 'select[id*="points"]', 'input[id*="points"]'
      ])

      // --- Answers Type ---
      const answersType = getFieldValue(doc, [
        '#answers_type', '#answers-type', '#answersType',
        '[name="answers_type"]', '[name="answers-type"]', '[name="answersType"]',
        'select[id*="answers_type"]', 'select[id*="answers-type"]',
        'input[id*="answers_type"]', 'input[id*="answers-type"]'
      ])

      // --- Solution Text ---
      const solTextEl = doc.querySelector('#solution_text') ||
                        doc.querySelector('#solution-text') ||
                        doc.querySelector('#solutionText') ||
                        doc.querySelector('[name="solution_text"]') ||
                        doc.querySelector('[name="solution-text"]') ||
                        doc.querySelector('textarea[id*="solution"]')
      let solutionText = solTextEl ? (solTextEl.textContent || '').trim() : ''
      if (solutionText && (solutionText.match(/<img\s/gi) || []).length > 0) {
        solutionText = await embedImages(solutionText)
      }

      // --- Solution Video ---
      const solutionVideo = getFieldValue(doc, [
        '#solution_video', '#solution-video', '#solutionVideo',
        '[name="solution_video"]', '[name="solution-video"]', '[name="solutionVideo"]',
        'input[id*="solution_video"]', 'input[id*="solution-video"]'
      ])

      // --- Multi Descriptions ---
      const multiDescriptions = []
      const multiContainer = doc.querySelector('#multi_descriptions') ||
                              doc.querySelector('#multi-descriptions') ||
                              doc.querySelector('#multiDescriptions') ||
                              doc.querySelector('#rows-multi_descriptions') ||
                              doc.querySelector('#rows-multi-descriptions') ||
                              doc.querySelector('#rows-multiDescriptions')
      if (multiContainer) {
        const lastIdx = parseInt(multiContainer.getAttribute('last-index') || '10')
        for (let m = 0; m < lastIdx; m++) {
          const mTitleEl = doc.querySelector(`#multi_descriptions-${m}-title`) ||
                           doc.querySelector(`#multi-descriptions-${m}-title`) ||
                           doc.querySelector(`#multiDescriptions-${m}-title`) ||
                           doc.querySelector(`[name="multi_descriptions-${m}-title"]`) ||
                           doc.querySelector(`[name="multi-descriptions-${m}-title"]`)
          const mDescEl = doc.querySelector(`#multi_descriptions-${m}-description`) ||
                          doc.querySelector(`#multi-descriptions-${m}-description`) ||
                          doc.querySelector(`#multiDescriptions-${m}-description`) ||
                          doc.querySelector(`[name="multi_descriptions-${m}-description"]`) ||
                          doc.querySelector(`[name="multi-descriptions-${m}-description"]`)
          if (!mTitleEl && !mDescEl) continue
          const mTitle = mTitleEl ? (mTitleEl.value || mTitleEl.textContent || '').trim() : ''
          let mDesc = mDescEl ? (mDescEl.textContent || '').trim() : ''
          if (mDesc && (mDesc.match(/<img\s/gi) || []).length > 0) {
            mDesc = await embedImages(mDesc)
          }
          multiDescriptions.push({ title: mTitle, description: mDesc })
        }
        if (multiDescriptions.length > 0) {
          log(`    Found ${multiDescriptions.length} multi description(s)`)
        }
      }

      // --- Answers ---
      const answers = []
      const answersContainer = doc.querySelector('#answers') || doc.querySelector('#rows-answers')
      const lastIndex = answersContainer ? parseInt(answersContainer.getAttribute('last-index') || '4') : 4

      for (let j = 0; j < lastIndex; j++) {
        const ansTextEl = doc.querySelector(`#answers-${j}-title`) ||
                          doc.querySelector(`[name="answers-${j}-title"]`)
        if (!ansTextEl) continue
        const answerText = (ansTextEl.textContent || ansTextEl.value || '').trim()

        const orderEl = doc.querySelector(`#answers-${j}-order`) ||
                        doc.querySelector(`[name="answers-${j}-order"]`)
        const order = orderEl ? parseInt(orderEl.value || orderEl.textContent || j + 1) : j + 1

        let isCorrect = false
        const checkboxSelectors = [
          `#answers-${j}-is_correct`,
          `[name="answers-${j}-is_correct"]`,
          `#answers-${j}-is-correct`,
          `[name="answers-${j}-is-correct"]`,
          `#answers-${j}-isCorrect`,
          `[name="answers-${j}-isCorrect"]`,
          `#answers-${j}-correct`,
          `[name="answers-${j}-correct"]`,
        ]
        for (const sel of checkboxSelectors) {
          const el = doc.querySelector(sel)
          if (el) {
            isCorrect = el.hasAttribute('checked')
            break
          }
        }

        if (!isCorrect) {
          const table = doc.querySelector(`#answers-${j}`)
          if (table) {
            const checkboxes = table.querySelectorAll('input[type="checkbox"]')
            checkboxes.forEach(cb => {
              if (cb.hasAttribute('checked')) isCorrect = true
            })
          }
        }

        answers.push({ text: answerText, order, isCorrect })
      }

      answers.sort((a, b) => a.order - b.order)

      // --- Build question object ---
      const question = {
        uuid,
        title,
        description,
        category,
        subcategory,
        points: points || '1',
        answersType: answersType || 'SINGLE_SELECT',
        answers: answers.map(a => ({ text: a.text, isCorrect: a.isCorrect })),
      }

      if (multiDescriptions.length > 0) question.multiDescriptions = multiDescriptions
      if (solutionText) question.solutionText = solutionText
      if (solutionVideo) question.solutionVideo = solutionVideo

      questions.push(question)

    } catch (e) {
      warn(`  Error extracting ${uuid} [${title || 'no title yet'}]: ${e.message}`)
      errors.push({ uuid, error: e.message, title: title || '(no title parsed)' })
    }

    await new Promise(r => setTimeout(r, DELAY))
  }

  log(`Extracted ${questions.length} questions (${errors.length} errors)`)
  if (errors.length > 0) {
    console.group('%c[Extractor] ERROR DETAILS', 'color: red; font-weight: bold')
    errors.forEach((err, i) => {
      console.error(`  ${i + 1}. UUID: ${err.uuid}`)
      console.error(`     URL: ${BASE}/edit/${err.uuid}`)
      console.error(`     Error: ${err.error}`)
      if (err.title) console.error(`     Title: ${err.title}`)
    })
    console.groupEnd()
  }

  // --- Step 3: Output as flat array (ready for import) ---
  log('Step 3: Building output...')

  const json = JSON.stringify(questions, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `cleverspace-p${START_PAGE}-to-p${END_PAGE}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  log('=== DONE ===')
  log(`Downloaded: cleverspace-p${START_PAGE}-to-p${END_PAGE}.json`)
  log(`${questions.length} questions from pages ${START_PAGE} → ${END_PAGE}`)
  if (errors.length > 0) warn(`${errors.length} questions had errors`)

  const withMulti = questions.filter(q => q.multiDescriptions).length
  console.table(questions.map(q => ({
    Title: q.title,
    Type: q.answersType,
    Points: q.points,
    Answers: q.answers.length,
    Correct: q.answers.find(a => a.isCorrect)?.text?.substring(0, 30) || 'NONE',
    MultiDesc: q.multiDescriptions ? q.multiDescriptions.length : 0,
    Images: (q.description.match(/data:image/g) || []).length,
    Solution: q.solutionText ? 'Yes' : '-',
  })))
  if (withMulti > 0) log(`${withMulti} questions have multi descriptions`)

  return questions
})()
