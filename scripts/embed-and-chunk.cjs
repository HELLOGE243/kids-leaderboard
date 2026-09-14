const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')

const DOWNLOADS = path.join(require('os').homedir(), 'Downloads')
const FILE = process.argv[2]
if (!FILE) { console.log('Usage: node embed-and-chunk.cjs <filename>'); process.exit(1) }
const SRC = path.join(DOWNLOADS, FILE.endsWith('.json') ? FILE : FILE + '.json')
const OUT_DIR = path.join(DOWNLOADS, FILE.replace('.json', ''))
const CHUNKS = 5

function fetchUrl(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve)
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
  console.log(`Loaded ${questions.length} questions from ${path.basename(SRC)}`)

  let embedded = 0
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    if (!q.description) continue
    const imgRegex = /src="(https?:\/\/[^"]+)"/g
    let match
    const replacements = []
    while ((match = imgRegex.exec(q.description)) !== null) {
      replacements.push({ url: match[1] })
    }
    if (replacements.length === 0) continue
    for (const rep of replacements) {
      console.log(`  Item ${i} (${q.title}): fetching ${rep.url.substring(0, 60)}...`)
      const buf = await fetchUrl(rep.url)
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

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR)
  const chunkSize = Math.ceil(questions.length / CHUNKS)
  console.log(`Chunking ${questions.length} items into ${CHUNKS} chunks of ~${chunkSize}`)

  for (let c = 0; c < CHUNKS; c++) {
    const from = c * chunkSize
    const slice = questions.slice(from, from + chunkSize)
    if (slice.length === 0) break
    const name = `chunk-${c + 1}_items-${from + 1}-to-${from + slice.length}.json`
    fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(slice, null, 2))
    console.log(`  ${name} (${slice.length} items)`)
  }

  console.log(`\nDone: ${OUT_DIR}`)
})()
