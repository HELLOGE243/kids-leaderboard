const fs = require('fs')
const path = require('path')

const DOWNLOADS = path.join(require('os').homedir(), 'Downloads')
const CHUNKS = 5
const OUTPUT_DIR = path.join(DOWNLOADS, 'cleverspace-chunks')

const files = [
  'cleverspace-p145-to-p126 (2).json',
  'cleverspace-p125-to-p106 (2).json',
]

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR)

let globalChunk = 0
for (const file of files) {
  const src = path.join(DOWNLOADS, file)
  const questions = JSON.parse(fs.readFileSync(src, 'utf-8'))
  const chunkSize = Math.ceil(questions.length / CHUNKS)
  const tag = file.replace('.json', '').replace(/ /g, '')
  console.log(`\n${file}: ${questions.length} items, ${chunkSize} per chunk`)

  for (let c = 0; c < CHUNKS; c++) {
    globalChunk++
    const from = c * chunkSize
    const slice = questions.slice(from, from + chunkSize)
    if (slice.length === 0) break
    const pad = String(c + 1).padStart(1, '0')
    const name = `${tag}_chunk-${pad}_items-${from + 1}-to-${from + slice.length}.json`
    fs.writeFileSync(path.join(OUTPUT_DIR, name), JSON.stringify(slice, null, 2))
    console.log(`  ${name} (${slice.length} items)`)
  }
}

console.log(`\nDone: ${globalChunk} chunks total in ${OUTPUT_DIR}`)
