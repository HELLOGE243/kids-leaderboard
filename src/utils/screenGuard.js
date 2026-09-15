import { useEffect, useRef } from 'react'

// Leaving the quiz screen this many times in one attempt submits it.
export const MAX_SCREEN_LEAVES = 3
// Shorter absences (a stray click off the window) are ignored.
const MIN_AWAY_MS = 2000

// --- Notice bus: App renders the popup so it shows on whatever screen is up.
let listener = null
export function onScreenNotice(fn) { listener = fn; return () => { if (listener === fn) listener = null } }
function notify(notice) { listener?.(notice) }

/**
 * Counts how often a student leaves the quiz screen (tab hidden or window
 * unfocused for 2s+) while `active`. Warns on each leave; on the
 * MAX_SCREEN_LEAVES-th it calls onLockout(count) immediately - it does not
 * wait for the student to return.
 *
 * @param {object} opts
 * @param {boolean} opts.active - an attempt is in progress
 * @param {React.MutableRefObject<number>} opts.countRef - leave count, owned by
 *   the page so it can be saved with progress and recorded on the attempt
 * @param {(count: number) => void} opts.onLockout
 */
export function useScreenGuard({ active, countRef, onLockout }) {
  const lockoutRef = useRef(onLockout)
  lockoutRef.current = onLockout

  useEffect(() => {
    if (!active) return
    let awayTimer = null

    const leave = () => {
      if (awayTimer) return
      // Clicking into an embedded video moves focus to the iframe; not a leave.
      if (!document.hidden && document.activeElement?.tagName === 'IFRAME') return
      awayTimer = setTimeout(() => {
        countRef.current = (countRef.current || 0) + 1
        const n = countRef.current
        if (n >= MAX_SCREEN_LEAVES) {
          notify({ type: 'lockout', count: n })
          lockoutRef.current(n)
        } else {
          notify({ type: 'warning', count: n, remaining: MAX_SCREEN_LEAVES - n })
        }
      }, MIN_AWAY_MS)
    }
    const back = () => {
      if (document.hidden || !document.hasFocus()) return
      clearTimeout(awayTimer)
      awayTimer = null
    }
    const onVis = () => (document.hidden ? leave() : back())

    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('blur', leave)
    window.addEventListener('focus', back)
    return () => {
      clearTimeout(awayTimer)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('blur', leave)
      window.removeEventListener('focus', back)
    }
  }, [active, countRef])
}
