const fs = require('fs')
const path = require('path')
const https = require('https')

const DOWNLOADS = path.join(require('os').homedir(), 'Downloads')
const SRC = path.join(DOWNLOADS, 'cleverspace-p165-to-p146.json')
const OUT_DIR = path.join(DOWNLOADS, 'cleverspace-p165-to-p146')
const CHUNKS = 5

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) { resolve(null); return }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    }).on('error', () => resolve(null))
  })
}

;(async () => {
  const questions = JSON.parse(fs.readFileSync(SRC, 'utf-8'))
  console.log(`Loaded ${questions.length} questions`)

  // Find and embed all external images
  let embedded = 0
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    if (!q.description) continue
    const imgRegex = /src="(https?:\/\/[^"]+)"/g
    let match
    const replacements = []
    while ((match = imgRegex.exec(q.description)) !== null) {
      replacements.push({ full: match[0], url: match[1] })
    }
    if (replacements.length === 0) continue

    for (const rep of replacements) {
      console.log(`  Item ${i} (${q.title}): fetching ${rep.url.substring(0, 60)}...`)
      const buf = await fetch(rep.url)
      if (buf) {
        const ext = rep.url.match(/\.(png|jpg|jpeg|gif|webp|svg)/i)
        const mime = ext ? `image/${ext[1].toLowerCase().replace('jpg', 'jpeg')}` : 'image/png'
        const dataUri = `data:${mime};base64,${buf.toString('base64')}`
        q.description = q.description.replace(rep.url, dataUri)
        console.log(`    Embedded (${buf.length} bytes)`)
        embedded++
      } else {
        console.log(`    FAILED - keeping external URL`)
      }
    }
  }
  console.log(`\nEmbedded ${embedded} images total`)

  // Chunk into 5
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR)
  const chunkSize = Math.ceil(questions.length / CHUNKS)
  console.log(`\nChunking ${questions.length} items into ${CHUNKS} chunks of ~${chunkSize}`)

  for (let c = 0; c < CHUNKS; c++) {
    const from = c * chunkSize
    const slice = questions.slice(from, from + chunkSize)
    if (slice.length === 0) break
    const name = `chunk-${c + 1}_items-${from + 1}-to-${from + slice.length}.json`
    fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(slice, null, 2))
    console.log(`  ${name} (${slice.length} items)`)
  }

  console.log(`\nDone: ${CHUNKS} chunks in ${OUT_DIR}`)
})()
