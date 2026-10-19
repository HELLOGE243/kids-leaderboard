import { useEffect } from 'react'

/**
 * Exam conditions, asked for by whichever screen needs them.
 *
 * The rule used to be "students get the guards, teachers do not", which is
 * right for most of what a teacher does: they have every reason to switch
 * windows and to copy text while building a paper. It is wrong for the one
 * screen where a teacher reads a live paper. The questions on it are the same
 * questions a child will sit, and a paper that can be copied out of the
 * browsing screen is as leaked as one copied out of the quiz.
 *
 * So the guards are no longer tied to the role. A screen holds the guard for
 * as long as it is open, and the app applies it to anybody - students hold it
 * for their whole session, browse-papers holds it while it is on screen.
 *
 * A count rather than a flag: two screens could hold it at once, and the last
 * one to close should be the one that lifts it.
 */

let holders = 0
const listeners = new Set()

function notify() {
  for (const fn of listeners) fn(holders > 0)
}

/** Takes the guard. Returns the function that gives it back. */
export function claimExamGuard() {
  holders += 1
  notify()
  let released = false
  return () => {
    if (released) return
    released = true
    holders -= 1
    notify()
  }
}

export function isExamGuarded() {
  return holders > 0
}

export function onExamGuardChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Holds the guard for as long as the component is mounted. */
export function useExamGuard(active = true) {
  useEffect(() => {
    if (!active) return undefined
    return claimExamGuard()
  }, [active])
}
