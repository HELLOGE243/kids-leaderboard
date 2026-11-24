/**
 * The celebration animations, and how one is chosen.
 *
 * Adding a sheet is one entry in CELEBRATIONS. Nothing else in the app needs
 * to know it exists: the dojo asks for a celebration of a kind and plays
 * whatever comes back, so a new sheet starts appearing the moment it is listed.
 *
 * `use` says when a sheet is allowed to play:
 *   'complete' - the end of a whole suite, once
 *   'pass'     - a single question answered correctly, over and over
 * They are kept apart because the second one plays dozens of times a week. A
 * two-second sheet that is a treat at the end of a suite is an obstacle when
 * it sits between a student and the next question.
 */

/**
 * @typedef {object} Celebration
 * @property {string} id
 * @property {'complete'|'pass'} use
 * @property {string} src        the sheet, served from /public
 * @property {number} cols       frames across
 * @property {number} rows       frames down
 * @property {number} frames     how many cells actually hold art
 * @property {number[]} [skip]   cells to pass over, by index
 * @property {number} fps
 * @property {number} size       one frame, in source pixels
 */

/** @type {Celebration[]} */
export const CELEBRATIONS = [
  {
    id: 'ninja-smoke',
    use: 'complete',
    src: '/sprites/ninja-dojo.png',
    cols: 5,
    rows: 5,
    frames: 25,
    // Frame 5 is all but empty - the moment the smoke has cleared and before
    // the ninja is drawn. Played in sequence it reads as a dropped frame
    // rather than as a beat, so the smoke hands straight over to him.
    skip: [5],
    fps: 14,
    size: 256,
  },
]

/** The frames of a sheet, in the order they play. */
export function frameOrder(sheet) {
  const skip = new Set(sheet?.skip || [])
  const out = []
  for (let i = 0; i < (sheet?.frames || 0); i++) if (!skip.has(i)) out.push(i)
  return out
}

/** How long one playthrough takes, in milliseconds. */
export function runLength(sheet) {
  const fps = Number(sheet?.fps) || 12
  return Math.round((frameOrder(sheet).length / fps) * 1000)
}

/**
 * Picks a celebration to play.
 *
 * It will not hand back the one that played last while there is another to
 * choose, which is the whole point of having several: the same animation
 * twice running stops being a surprise and starts being a wait.
 *
 * @param {'complete'|'pass'} use
 * @param {string|null} lastId what played last time
 * @param {() => number} random injected, so the choice is testable
 * @param {Celebration[]} list
 * @returns {Celebration|null} null when nothing is registered for that use
 */
export function pickCelebration(use, lastId = null, random = Math.random, list = CELEBRATIONS) {
  const all = (list || []).filter((c) => c.use === use)
  if (!all.length) return null
  const fresh = all.filter((c) => c.id !== lastId)
  const from = fresh.length ? fresh : all
  return from[Math.floor(random() * from.length) % from.length]
}

/**
 * What the band says when a question is got right.
 *
 * Several, chosen the same way the sheets are, for the same reason. "PASS"
 * stays the most common because it is the word the dojo uses for the thing
 * that has actually happened.
 */
export const PASS_WORDS = ['PASS', 'PASS', 'PASS', 'NAILED IT', 'CLEAN PASS', 'SHARP']

export function pickPassWord(lastWord = null, random = Math.random, list = PASS_WORDS) {
  const fresh = (list || []).filter((w) => w !== lastWord)
  const from = fresh.length ? fresh : list
  return from[Math.floor(random() * from.length) % from.length]
}
