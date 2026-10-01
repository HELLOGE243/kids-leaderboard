import { useSyncExternalStore } from 'react'

/**
 * Whether a student is in the middle of a paper.
 *
 * The daily revision cards are decided at the top of the app, so they could take
 * the screen while a paper was open — a student mid-question, their quiz gone.
 * The quiz screens say when a sitting is under way, and the cards wait.
 */
let sitting = 0
const listeners = new Set()

function emit() {
  for (const fn of listeners) fn()
}

/** Called by a quiz screen when a paper opens and when it closes. */
export function setSittingActive(active) {
  const next = active ? sitting + 1 : Math.max(0, sitting - 1)
  if (next === sitting) return
  sitting = next
  emit()
}

export function isSittingActive() {
  return sitting > 0
}

export function useSittingActive() {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    () => sitting > 0,
    () => false,
  )
}
