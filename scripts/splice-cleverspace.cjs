// Splice large CleverSpace JSON exports into smaller chunks
// Run with: node scripts/splice-cleverspace.js

const fs = require('fs')
const path = require('path')

const DOWNLOADS = path.join(require('os').homedir(), 'Downloads')
const CHUNK_SIZE = 100
const OUTPUT_DIR = path.join(DOWNLOADS, 'cleverspace-chunks')

const files = [
  'cleverspace-p165-to-p146.json',
  'cleverspace-p145-to-p126.json',
  'cleverspace-p125-to-p106.json',
  'cleverspace-p105-to-p86.json',
  'cleverspace-p85-to-p66.json',
  'cleverspace-p65-to-p46.json',
  'cleverspace-p45-to-p26.json',
  'cleverspace-p25-to-p6.json',
  'cleverspace-p5-to-p1.json',
]

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })

let globalIndex = 0
let chunkNum = 1

for (const file of files) {
  const filePath = path.join(DOWNLOADS, file)
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${file} (not found)`)
    continue
  }

  console.log(`Reading ${file}...`)
  const questions = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  console.log(`  ${questions.length} questions`)

  for (let i = 0; i < questions.length; i += CHUNK_SIZE) {
    const chunk = questions.slice(i, i + CHUNK_SIZE)
    const from = globalIndex + 1
    const to = globalIndex + chunk.length
    const outName = `chunk-${String(chunkNum).padStart(3, '0')}_items-${from}-to-${to}.json`
    const outPath = path.join(OUTPUT_DIR, outName)

    fs.writeFileSync(outPath, JSON.stringify(chunk, null, 2))
    console.log(`  -> ${outName} (${chunk.length} questions)`)

    globalIndex += chunk.length
    chunkNum++
  }
}

console.log(`\nDone! ${globalIndex} questions split into ${chunkNum - 1} chunks of ${CHUNK_SIZE}`)
console.log(`Output: ${OUTPUT_DIR}`)
