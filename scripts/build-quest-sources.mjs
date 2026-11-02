/**
 * Builds the quest's list of public-domain works, by checking every one.
 *
 *   node scripts/build-quest-sources.mjs            # check, print, write nothing
 *   node scripts/build-quest-sources.mjs --write    # write functions/questSources.json
 *
 * The candidate list below is written from memory, and memory is exactly the
 * wrong source for a catalogue number. So nothing goes into the shipped file
 * until this has fetched the book, confirmed the title is the one expected,
 * and measured what extract each band would actually get from it. A work that
 * cannot offer a passage at either level is left out rather than shipped to
 * fail at two in the morning.
 *
 * ## Australian copyright, which is not Gutenberg's copyright
 *
 * Project Gutenberg clears works for the United States, where the test is
 * publication before 1929. Australia's test is the author's life plus seventy
 * years. The two disagree, and this school is in Sydney: Bertrand Russell's
 * 1912 work is public domain in America and will be under copyright here
 * until 2040.
 *
 * So every entry carries the year its author died, and anything later than
 * CLEAR_BEFORE is refused with the rest of the checks. That is why the list is
 * shorter than it could be, and the reason is written down here so nobody
 * widens it later by accident.
 */
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const T = require('../functions/questText.js')

const WRITE = process.argv.includes('--write')
const OUT = new URL('../functions/questSources.json', import.meta.url)

/** Life plus seventy, counted back from this year. */
const CLEAR_BEFORE = new Date().getFullYear() - 70

// id, the expected title (checked against the file), author, year of death,
// and whether it reads as story or as argument.
const CANDIDATES = [
  // --- fiction ---
  { id: 120, title: 'Treasure Island', author: 'Robert Louis Stevenson', died: 1894, genre: 'fiction' },
  { id: 1661, title: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle', died: 1930, genre: 'fiction' },
  { id: 35, title: 'The Time Machine', author: 'H. G. Wells', died: 1946, genre: 'fiction' },
  { id: 36, title: 'The War of the Worlds', author: 'H. G. Wells', died: 1946, genre: 'fiction' },
  { id: 43, title: 'The Strange Case of Dr. Jekyll and Mr. Hyde', author: 'Robert Louis Stevenson', died: 1894, genre: 'fiction' },
  { id: 1342, title: 'Pride and Prejudice', author: 'Jane Austen', died: 1817, genre: 'fiction' },
  { id: 161, title: 'Sense and Sensibility', author: 'Jane Austen', died: 1817, genre: 'fiction' },
  { id: 1260, title: 'Jane Eyre', author: 'Charlotte Bronte', died: 1855, genre: 'fiction' },
  { id: 768, title: 'Wuthering Heights', author: 'Emily Bronte', died: 1848, genre: 'fiction' },
  { id: 11, title: "Alice's Adventures in Wonderland", author: 'Lewis Carroll', died: 1898, genre: 'fiction' },
  { id: 12, title: 'Through the Looking-Glass', author: 'Lewis Carroll', died: 1898, genre: 'fiction' },
  { id: 16, title: 'Peter Pan', author: 'J. M. Barrie', died: 1937, genre: 'fiction' },
  { id: 74, title: 'The Adventures of Tom Sawyer', author: 'Mark Twain', died: 1910, genre: 'fiction' },
  { id: 76, title: 'Adventures of Huckleberry Finn', author: 'Mark Twain', died: 1910, genre: 'fiction' },
  { id: 84, title: 'Frankenstein', author: 'Mary Shelley', died: 1851, genre: 'fiction' },
  { id: 345, title: 'Dracula', author: 'Bram Stoker', died: 1912, genre: 'fiction' },
  { id: 46, title: 'A Christmas Carol', author: 'Charles Dickens', died: 1870, genre: 'fiction' },
  { id: 98, title: 'A Tale of Two Cities', author: 'Charles Dickens', died: 1870, genre: 'fiction' },
  { id: 1400, title: 'Great Expectations', author: 'Charles Dickens', died: 1870, genre: 'fiction' },
  { id: 730, title: 'Oliver Twist', author: 'Charles Dickens', died: 1870, genre: 'fiction' },
  { id: 215, title: 'The Call of the Wild', author: 'Jack London', died: 1916, genre: 'fiction' },
  { id: 910, title: 'White Fang', author: 'Jack London', died: 1916, genre: 'fiction' },
  { id: 236, title: 'The Jungle Book', author: 'Rudyard Kipling', died: 1936, genre: 'fiction' },
  { id: 55, title: 'The Wonderful Wizard of Oz', author: 'L. Frank Baum', died: 1919, genre: 'fiction' },
  { id: 113, title: 'The Secret Garden', author: 'Frances Hodgson Burnett', died: 1924, genre: 'fiction' },
  { id: 271, title: 'Black Beauty', author: 'Anna Sewell', died: 1878, genre: 'fiction' },
  { id: 289, title: 'The Wind in the Willows', author: 'Kenneth Grahame', died: 1932, genre: 'fiction' },
  { id: 514, title: 'Little Women', author: 'Louisa May Alcott', died: 1888, genre: 'fiction' },
  { id: 45, title: 'Anne of Green Gables', author: 'L. M. Montgomery', died: 1942, genre: 'fiction' },
  { id: 174, title: 'The Picture of Dorian Gray', author: 'Oscar Wilde', died: 1900, genre: 'fiction' },
  { id: 2814, title: 'Dubliners', author: 'James Joyce', died: 1941, genre: 'fiction' },
  { id: 1184, title: 'The Count of Monte Cristo', author: 'Alexandre Dumas', died: 1870, genre: 'fiction' },
  { id: 2591, title: "Grimms' Fairy Tales", author: 'Jacob and Wilhelm Grimm', died: 1863, genre: 'fiction' },
  { id: 219, title: 'Heart of Darkness', author: 'Joseph Conrad', died: 1924, genre: 'fiction' },
  { id: 1952, title: 'The Yellow Wallpaper', author: 'Charlotte Perkins Gilman', died: 1935, genre: 'fiction' },
  { id: 2500, title: 'Siddhartha', author: 'Hermann Hesse', died: 1962, genre: 'fiction' },

  // --- essays and argument ---
  { id: 575, title: 'Essays', author: 'Francis Bacon', died: 1626, genre: 'essay' },
  { id: 205, title: 'Walden', author: 'Henry David Thoreau', died: 1862, genre: 'essay' },
  { id: 71, title: 'On the Duty of Civil Disobedience', author: 'Henry David Thoreau', died: 1862, genre: 'essay' },
  { id: 132, title: 'The Art of War', author: 'Sun Tzu', died: -496, genre: 'essay' },
  { id: 1232, title: 'The Prince', author: 'Niccolo Machiavelli', died: 1527, genre: 'essay' },
  { id: 2130, title: 'The Enchiridion', author: 'Epictetus', died: 135, genre: 'essay' },
  { id: 2680, title: 'Meditations', author: 'Marcus Aurelius', died: 180, genre: 'essay' },
  { id: 1080, title: 'A Modest Proposal', author: 'Jonathan Swift', died: 1745, genre: 'essay' },
  { id: 5827, title: 'The Problems of Philosophy', author: 'Bertrand Russell', died: 1970, genre: 'essay' },
  { id: 2300, title: 'Virginibus Puerisque', author: 'Robert Louis Stevenson', died: 1894, genre: 'essay' },
  { id: 1228, title: 'On the Origin of Species', author: 'Charles Darwin', died: 1882, genre: 'essay' },
  { id: 944, title: 'The Voyage of the Beagle', author: 'Charles Darwin', died: 1882, genre: 'essay' },
  { id: 23, title: 'Narrative of the Life of Frederick Douglass', author: 'Frederick Douglass', died: 1895, genre: 'essay' },
  { id: 3600, title: 'Essays of Michel de Montaigne', author: 'Michel de Montaigne', died: 1592, genre: 'essay' },
  { id: 1497, title: 'The Republic', author: 'Plato', died: -348, genre: 'essay' },
  { id: 5000, title: 'The Notebooks of Leonardo Da Vinci', author: 'Leonardo da Vinci', died: 1519, genre: 'essay' },
  { id: 3300, title: 'An Inquiry into the Nature and Causes of the Wealth of Nations', author: 'Adam Smith', died: 1790, genre: 'essay' },
  { id: 2852, title: 'The Hound of the Baskervilles', author: 'Arthur Conan Doyle', died: 1930, genre: 'fiction' },
  { id: 1727, title: 'The Odyssey', author: 'Homer', died: -701, genre: 'fiction' },
  { id: 996, title: 'Don Quixote', author: 'Miguel de Cervantes', died: 1616, genre: 'fiction' },
  { id: 203, title: "Uncle Tom's Cabin", author: 'Harriet Beecher Stowe', died: 1896, genre: 'fiction' },
  { id: 1322, title: 'Leaves of Grass', author: 'Walt Whitman', died: 1892, genre: 'essay' },
  { id: 8800, title: 'The Divine Comedy', author: 'Dante Alighieri', died: 1321, genre: 'fiction' },
  { id: 2199, title: 'The Iliad', author: 'Homer', died: -701, genre: 'fiction' },
]

const url = (id) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`

async function fetchBook(id) {
  const res = await fetch(url(id), { headers: { 'user-agent': 'CleverSpace-EduPortal/1.0 (school reading tasks)' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

async function check(entry) {
  // Copyright first: a book that cannot be used here is not worth fetching.
  if (entry.died > CLEAR_BEFORE) {
    return { ...entry, ok: false, why: `author died ${entry.died}; clear only before ${CLEAR_BEFORE} under life+70` }
  }
  let raw
  try {
    raw = await fetchBook(entry.id)
  } catch (e) {
    return { ...entry, ok: false, why: `could not fetch: ${e.message}` }
  }

  // The title the file claims, against the title expected. A wrong catalogue
  // number usually fetches a real book - just not this one.
  const head = raw.slice(0, 2000)
  const claimed = (/The Project Gutenberg eBook of ([^\n\r]+)/i.exec(head) || [])[1] || ''
  const titleMatches = norm(claimed).includes(norm(entry.title)) || norm(entry.title).includes(norm(claimed))

  const bands = {}
  for (const band of ['y6', 'y9']) {
    const got = T.pickExtract(raw, band)
    bands[band] = got.extract
      ? { words: got.extract.words, fk: got.extract.fk, chapter: got.extract.chapter }
      : null
  }
  const sections = T.splitIntoChapters(T.stripGutenbergBoilerplate(raw)).length

  if (!titleMatches) {
    return { ...entry, ok: false, why: `file says "${claimed.trim().slice(0, 60)}"`, claimed: claimed.trim() }
  }
  if (!bands.y6 && !bands.y9) {
    return { ...entry, ok: false, why: 'no extract fits either band', sections }
  }
  return { ...entry, ok: true, claimed: claimed.trim(), sections, bands }
}

// Four at a time: enough to finish in a minute, few enough to be a polite
// guest on a free archive that asks people not to hammer it.
async function pool(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }))
  return out
}

const results = await pool(CANDIDATES, 4, check)

const kept = results.filter((r) => r.ok)
const dropped = results.filter((r) => !r.ok)

console.log(`checked ${results.length} works: ${kept.length} usable, ${dropped.length} dropped\n`)
for (const r of kept) {
  const y6 = r.bands.y6 ? `y6 ${r.bands.y6.words}w g${r.bands.y6.fk}` : 'y6 --'
  const y9 = r.bands.y9 ? `y9 ${r.bands.y9.words}w g${r.bands.y9.fk}` : 'y9 --'
  console.log(`  ${String(r.id).padStart(5)}  ${r.title.slice(0, 34).padEnd(36)} ${String(r.sections).padStart(3)} sec  ${y6.padEnd(16)} ${y9}`)
}
if (dropped.length) {
  console.log('\ndropped:')
  for (const r of dropped) console.log(`  ${String(r.id).padStart(5)}  ${r.title.slice(0, 34).padEnd(36)} ${r.why}`)
}

const byBand = (band) => kept.filter((r) => r.bands[band]).length
console.log(`\nworks offering a y6 extract: ${byBand('y6')}`)
console.log(`works offering a y9 extract: ${byBand('y9')}`)
for (const genre of ['fiction', 'essay']) {
  const g = kept.filter((r) => r.genre === genre)
  console.log(`  ${genre}: ${g.length} (y6 ${g.filter((r) => r.bands.y6).length}, y9 ${g.filter((r) => r.bands.y9).length})`)
}

if (!WRITE) {
  console.log('\nRun again with --write to save functions/questSources.json.')
  process.exit(dropped.length && !kept.length ? 1 : 0)
}

// Only what was verified, and only the fields the nightly job needs. The
// measured figures are kept as a note of what was seen on the day the list
// was built, not as something the job trusts - it measures again every time.
const shipped = kept.map((r) => ({
  id: r.id,
  title: r.title,
  author: r.author,
  died: r.died,
  genre: r.genre,
  sections: r.sections,
  fits: { y6: !!r.bands.y6, y9: !!r.bands.y9 },
  seen: {
    y6: r.bands.y6 ? { words: r.bands.y6.words, fk: r.bands.y6.fk } : null,
    y9: r.bands.y9 ? { words: r.bands.y9.words, fk: r.bands.y9.fk } : null,
  },
}))

writeFileSync(OUT, `${JSON.stringify(shipped, null, 2)}\n`)
console.log(`\nwrote ${shipped.length} works to functions/questSources.json`)
