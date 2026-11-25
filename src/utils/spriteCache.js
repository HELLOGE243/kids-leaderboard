/**
 * Sprite sheets that have been fetched and decoded, by src.
 *
 * The reason this exists: the frames of a celebration were being counted off
 * from the moment the component mounted, while the browser was still fetching
 * a 600KB sheet. The whole animation ran against an empty box, and the first
 * thing a student actually saw was whichever frame happened to be up when the
 * image landed - the ninja appearing from nowhere near the end, with the
 * smoke he comes out of already over.
 *
 * Module level, so a sheet is fetched once per page load however many times
 * it plays, and a second showing starts on the first frame immediately.
 *
 * Its own file rather than sitting beside the component, because a module
 * that exports both a component and a helper cannot be hot-reloaded.
 */
const decoded = new Set()

/** True if this sheet can be painted right now. */
export function isDecoded(src) {
  return !!src && decoded.has(src)
}

/**
 * Fetch and decode a sheet, resolving when it can be painted.
 *
 * Never rejects. A celebration that cannot load must not become a
 * celebration that never ends, so a failure resolves and the player carries
 * on and draws nothing.
 */
export function loadSheet(src) {
  if (!src || decoded.has(src)) return Promise.resolve()
  if (typeof Image === 'undefined') return Promise.resolve()
  const img = new Image()
  img.src = src
  const settle = () => { decoded.add(src) }
  // decode() promises the pixels are ready to paint; onload only promises the
  // bytes arrived, which is not the same thing and is why onload alone still
  // left the first frames blank.
  return (img.decode ? img.decode() : new Promise((r) => { img.onload = r; img.onerror = r }))
    .then(settle, settle)
}

/**
 * Fetch a sheet now for something that will play later.
 *
 * The completion sheet plays the instant the last question is passed, which
 * is the worst possible moment to begin downloading it. Called when the dojo
 * opens, it has the length of a whole training suite to arrive.
 */
export function preloadSheet(sheet) {
  return loadSheet(sheet?.src)
}
