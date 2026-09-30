/**
 * Builds the offline dictionary the vocabulary bank looks words up in.
 *
 * Source: Princeton WordNet, whose glosses are what a dictionary entry should
 * be — one clause, no preamble ("showing great attention to detail" rather than
 * "This word means that someone is showing..."). WordNet's senses are ordered by
 * how common they are, so the first is the one a student meets.
 *
 * Written as one file per first letter, so a lookup fetches a few hundred
 * kilobytes rather than the whole language.
 *
 *   node scripts/build-dictionary.mjs
 *
 * WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved.
 * Used under the WordNet licence, which permits use and redistribution with
 * this notice; see public/dict/LICENCE.txt.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import wordnet from 'wordnet-db'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'dict')
const PARTS = { noun: 'n', verb: 'v', adj: 'adj', adv: 'adv' }
const LONG_GLOSS = 110

/** The readable part of a WordNet gloss: the definition, without its examples. */
function cleanGloss(raw) {
  let gloss = raw.split('|')[1] || ''
  // Examples follow the definition in quotes; they are not the definition.
  gloss = gloss.split(';').filter((piece) => !piece.includes('"')).join(';')
  gloss = gloss.replace(/\s+/g, ' ').trim().replace(/[;,]$/, '')
  if (gloss.length > LONG_GLOSS) {
    // Keep the first clause rather than cutting a sentence in half.
    const cut = gloss.slice(0, LONG_GLOSS)
    const stop = Math.max(cut.lastIndexOf(';'), cut.lastIndexOf(','))
    gloss = (stop > 40 ? cut.slice(0, stop) : cut).trim()
  }
  return gloss
}

// Every sense's gloss, by part of speech and offset.
const glosses = { n: new Map(), v: new Map(), adj: new Map(), adv: new Map() }
for (const [part, tag] of Object.entries(PARTS)) {
  const lines = readFileSync(join(wordnet.path, `data.${part}`), 'latin1').split(String.fromCharCode(10))
  for (const line of lines) {
    if (!line || line.startsWith('  ')) continue      // licence header
    const offset = line.slice(0, 8)
    const gloss = cleanGloss(line)
    if (gloss) glosses[tag].set(offset, gloss)
  }
}

// index.sense carries how often each sense was actually used in the tagged
// corpus. Without it a word that is both noun and adjective takes whichever file
// was read first, which is how "myriad" ends up meaning ten thousand instead of
// a great number.
const SS_TYPE = { 1: 'n', 2: 'v', 3: 'adj', 4: 'adv', 5: 'adj' }
const bySense = new Map()
for (const line of readFileSync(join(wordnet.path, 'index.sense'), 'latin1').split(String.fromCharCode(10))) {
  if (!line.trim()) continue
  const [senseKey, offset, senseNumber, tagCount] = line.trim().split(/\s+/)
  const [lemma, rest] = senseKey.split('%')
  if (!lemma || !rest || lemma.includes('_')) continue
  const word = lemma.toLowerCase()
  if (!/^[a-z][a-z'-]*$/.test(word)) continue
  const pos = SS_TYPE[rest[0]]
  if (!pos) continue
  const used = Number(tagCount) || 0
  const order = Number(senseNumber) || 99
  if (!bySense.has(word)) bySense.set(word, [])
  bySense.get(word).push({ pos, offset, used, order })
}

// Up to three senses per word, best first. WordNet's own ordering is not always
// the one a student needs — it has "tenacious" meaning "good at remembering"
// before "stubbornly unyielding" — so the alternatives are kept and something
// that knows the context can choose between them.
const MAX_SENSES = 3
const entries = new Map()
for (const [word, senses] of bySense) {
  const ranked = senses
    .sort((a, b) => (b.used - a.used) || (a.order - b.order))
    .slice(0, MAX_SENSES)
    .map((s) => ({ d: glosses[s.pos]?.get(s.offset), p: s.pos }))
    .filter((s) => s.d)
  if (!ranked.length) continue
  // One shape: the first sense inline, the rest as alternatives.
  const entry = { d: ranked[0].d, p: ranked[0].p }
  if (ranked.length > 1) entry.alt = ranked.slice(1).map((s) => ({ d: s.d, p: s.p }))
  entries.set(word, entry)
}

mkdirSync(OUT, { recursive: true })
const shards = new Map()
for (const [word, entry] of entries) {
  const letter = word[0]
  if (!shards.has(letter)) shards.set(letter, {})
  shards.get(letter)[word] = entry
}

let total = 0
for (const [letter, words] of [...shards].sort()) {
  const path = join(OUT, `${letter}.json`)
  writeFileSync(path, JSON.stringify(words))
  total += Object.keys(words).length
}

writeFileSync(join(OUT, 'LICENCE.txt'),
  'WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved.\n\n'
  + 'THIS SOFTWARE AND DATABASE IS PROVIDED "AS IS" AND PRINCETON UNIVERSITY MAKES\n'
  + 'NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR IMPLIED. Permission to use, copy,\n'
  + 'modify and distribute this database for any purpose and without fee is hereby\n'
  + 'granted, provided that this notice appears in all copies.\n')

const sizes = readdirSync(OUT).map((f) => statSync(join(OUT, f)).size)
console.log(`${total} words across ${shards.size} files`)
console.log(`largest file ${(Math.max(...sizes) / 1024).toFixed(0)} KB, total ${(sizes.reduce((a, b) => a + b, 0) / 1024 / 1024).toFixed(1)} MB`)
