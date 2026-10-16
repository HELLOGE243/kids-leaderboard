import {
  publishLibraryWork, loadLibraryWorks, unpublishLibraryWork,
} from './firebase.js'

/**
 * The library: what the school is reading, and what it has written.
 *
 * Three shelves, with different owners. Peer works are published by the
 * teacher who marked them, one document each, because a piece of writing is
 * long and the shared documents are already close to the size Firestore
 * allows. The news and the book of the week are a handful of lines curated by
 * an admin, so they sit in the shared content with the courses.
 */

/** A marked piece, put on the shelf for the school to read. */
export async function putWorkInLibrary({ work, byline = 'first-name', note = '' }) {
  return publishLibraryWork({
    ...work,
    byline,
    teacherNote: String(note || '').slice(0, 600),
    publishedAt: new Date().toISOString(),
  })
}

/** Everything on the peer works shelf, newest first. */
export function getLibraryWorks() {
  return loadLibraryWorks()
}

/** Takes a piece back off the shelf. */
export function takeWorkOffShelf(id) {
  return unpublishLibraryWork(id)
}

/**
 * How a published piece is signed.
 *
 * A child's writing read by the whole school is a different thing from a
 * child's writing read by their teacher, so the name is a decision made at the
 * moment of publishing rather than a field that happens to be there.
 */
export function bylineFor(work) {
  if (!work) return ''
  if (work.byline === 'anonymous') return 'A student'
  const first = String(work.studentName || '').trim().split(/\s+/)[0] || 'A student'
  return work.yearGroup ? `${first}, ${work.yearGroup}` : first
}

/** Year 3-8 in two bands, so a Year 3 is not pointed at a Year 8 article. */
export const YEAR_BANDS = [
  { id: 'all', label: 'Everyone' },
  { id: 'lower', label: 'Years 3-5' },
  { id: 'upper', label: 'Years 6-8' },
]

/** Whether a shelf item is meant for this reader. */
export function suitsYear(item, yearGroup) {
  const band = item?.yearBand || 'all'
  if (band === 'all') return true
  const year = Number(String(yearGroup || '').replace(/[^0-9]/g, '')) || 0
  if (!year) return true
  return band === 'lower' ? year <= 5 : year >= 6
}
