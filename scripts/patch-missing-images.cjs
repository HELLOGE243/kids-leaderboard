const fs = require('fs')
const path = require('path')

const DOWNLOADS = path.join(require('os').homedir(), 'Downloads')

const patches = [
  {
    chunk: 'cleverspace-chunk-1.json',
    index: 248,
    expectedTitle: 'Y5TS_T4W2_ClassTestQ17',
    images: ['fix-249.png'],
  },
  {
    chunk: 'cleverspace-chunk-1.json',
    index: 255,
    expectedTitle: 'Y5TS_T4W2_ClassTestQ11',
    images: ['fix-256.png'],
  },
  {
    chunk: 'cleverspace-chunk-1.json',
    index: 257,
    expectedTitle: 'Y5TS_T4W2_ClassTestQ9',
    images: ['fix-258a.png', 'fix-258b.png'],
  },
  {
    chunk: 'cleverspace-chunk-2.json',
    index: 495,
    expectedTitle: 'Y4TS_T4W8_D4Q5',
    images: ['fix-996a.png', 'fix-996b.png'],
  },
  {
    chunk: 'cleverspace-chunk-3.json',
    index: 257,
    expectedTitle: 'Y4TS_T4W10_TeamQ12',
    images: ['fix-1258.jpg'],
  },
]

function fileToDataUri(filePath) {
  const data = fs.readFileSync(filePath)
  const ext = path.extname(filePath).toLowerCase().replace('.', '')
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`
  return `data:${mime};base64,${data.toString('base64')}`
}

function replaceImgSources(html, dataUris) {
  let i = 0
  return html.replace(/<img\s+[^>]*?src=["']([^"']+)["']/gi, (fullMatch, oldSrc) => {
    if (i < dataUris.length) {
      const newSrc = dataUris[i++]
      return fullMatch.replace(oldSrc, newSrc)
    }
    return fullMatch
  })
}

const chunkCache = {}

function getChunk(name) {
  if (!chunkCache[name]) {
    const filePath = path.join(DOWNLOADS, name)
    chunkCache[name] = JSON.parse(fs.readFileSync(filePath, 'utf-8').replace(/^﻿/, ''))
  }
  return chunkCache[name]
}

let missing = false
for (const p of patches) {
  for (const img of p.images) {
    const fp = path.join(DOWNLOADS, img)
    if (!fs.existsSync(fp)) {
      console.error(`MISSING: ${img}`)
      missing = true
    }
  }
}
if (missing) {
  console.error('\nSave the missing image files to Downloads and re-run.')
  process.exit(1)
}

for (const p of patches) {
  const chunk = getChunk(p.chunk)
  const item = chunk[p.index]

  if (item.title !== p.expectedTitle) {
    console.error(`Title mismatch at ${p.chunk}[${p.index}]: expected "${p.expectedTitle}", got "${item.title}"`)
    process.exit(1)
  }

  const dataUris = p.images.map((img) => fileToDataUri(path.join(DOWNLOADS, img)))
  const oldLen = item.description.length
  item.description = replaceImgSources(item.description, dataUris)
  const newLen = item.description.length

  console.log(`Patched ${item.title}: ${p.images.length} image(s), ${oldLen} → ${newLen} chars`)
}

for (const [name, data] of Object.entries(chunkCache)) {
  const outPath = path.join(DOWNLOADS, name)
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8')
  const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2)
  console.log(`Wrote ${name} (${sizeMB} MB)`)
}

console.log('\nDone! All chunks patched.')
