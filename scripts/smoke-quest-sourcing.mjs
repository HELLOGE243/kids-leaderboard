/**
 * A real run of the quest's sourcing half.
 *
 *   node scripts/smoke-quest-sourcing.mjs
 *
 * Fetches real books from Project Gutenberg, picks a real extract for each of
 * the four book slots, measures the reading level, and checks the attribution
 * and the dedup key - everything the nightly job does before it spends a
 * single token on questions.
 *
 * Needs the network but no credentials, no deploy and no model, which makes it
 * the one check that can be run against the live archive at any time. If
 * Gutenberg changes a file's shape, or a work is withdrawn, this is what says
 * so - and it says it in daylight rather than at half past two.
 *
 * It does not touch Firestore: the store is a stub, in this file, so nothing
 * it does is written anywhere.
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const questJob = require('../functions/questJob.js')
const QL = require('../functions/questLogic.js')

// A stub store, inline: this script must not depend on a project and must
// not write anywhere.
function fakeDb() {
  const store = new Map()
  const docsIn = (n) => [...store.entries()].filter(([k]) => k.startsWith(n + '/')).map(([, v]) => v)
  const snapOf = (rows) => ({
    size: rows.length,
    docs: rows.map((r) => ({ data: () => r, id: r.id })),
    forEach: (fn) => rows.forEach((r) => fn({ data: () => r, id: r.id })),
  })
  const query = (n, f, o, l) => ({
    where: (field, op, value) => query(n, [...f, { field, value }], o, l),
    orderBy: (field, dir) => query(n, f, { field, dir }, l),
    limit: (x) => query(n, f, o, x),
    select: () => query(n, f, o, l),
    get: async () => {
      let rows = docsIn(n).filter((r) => f.every((x) => r[x.field] === x.value))
      if (o) rows = [...rows].sort((a, b) => String(a[o.field] || '').localeCompare(String(b[o.field] || '')))
      return snapOf(l ? rows.slice(0, l) : rows)
    },
  })
  return {
    store,
    collection: (n) => ({
      ...query(n, [], null, null),
      doc: (id) => ({
        set: async (v, opt) => {
          const k = n + '/' + id
          store.set(k, opt && opt.merge ? { ...(store.get(k) || {}), ...v } : v)
        },
        get: async () => ({ exists: store.has(n + '/' + id), data: () => store.get(n + '/' + id) }),
      }),
    }),
  }
}

const db = fakeDb()
const job = questJob.make({ db, callClaude: async () => { throw new Error('no model in this smoke test') } })

;(async () => {
  console.log('Fetching real books from Project Gutenberg and measuring what the night would set.\n')
  const index = await job.readIndex()
  let ok = 0
  for (const genre of ['fiction', 'essay']) {
    for (const band of ['y6', 'y9']) {
      const t0 = Date.now()
      const got = await job.passageFromBooks(genre, band, index)
      const ms = Date.now() - t0
      if (!got.paper) {
        console.log(`  ${genre}/${band}  FAILED after ${ms}ms`)
        for (const t of got.tried) console.log(`      tried: ${t}`)
        continue
      }
      const p = got.paper
      // Everything the job checks before it spends anything on questions.
      const misfit = QL.passageFitsBand(p.text, band)
      const key = QL.sourceKey({ ...p })
      index.keys.add(key)
      const chs = index.chaptersByWork[p.workId] || (index.chaptersByWork[p.workId] = new Set())
      chs.add(p.chapter)
      console.log(`  ${genre}/${band}  ${p.wordCount}w  grade ${p.readability.fk}  ${p.minutes}min  ${ms}ms`)
      console.log(`      ${p.title}`)
      console.log(`      ${p.attribution}  ${p.sourceUrl}`)
      console.log(`      band check: ${misfit || 'fits'}   licence: ${p.licence}`)
      console.log(`      dedup key: ${key}`)
      if (!misfit) ok++
    }
  }
  console.log(`\n${ok} of 4 book slots sourced and verified against the live archive.`)

  // And prove the dedup actually bites: ask for the same slot again.
  const again = await job.passageFromBooks('fiction', 'y9', index)
  console.log(`\nSecond draw for fiction/y9 (chapters above now marked used):`)
  console.log(again.paper
    ? `  a different extract: ${again.paper.title}`
    : `  nothing left: ${again.tried.join('; ')}`)
})()
