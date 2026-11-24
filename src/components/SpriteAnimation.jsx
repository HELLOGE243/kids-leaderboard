import { useEffect, useRef, useState } from 'react'
import { frameOrder } from '../data/celebrations.js'

/**
 * Plays one sprite sheet, once.
 *
 * Driven by requestAnimationFrame rather than CSS `steps()`. A CSS stepped
 * animation can walk a grid - two animations, one per axis - but it can only
 * walk it in order, and these sheets have frames worth skipping. Stepping the
 * index here keeps any frame order possible, and is what lets one component
 * serve every sheet in the registry whatever shape it is.
 *
 * rAF also stops on its own when the tab is hidden, so a celebration a student
 * tabbed away from is not still running when they come back.
 *
 * @param {object} sheet an entry from CELEBRATIONS
 * @param {number} [size] the size to draw it at, in CSS pixels
 * @param {() => void} [onDone] called once, after the last frame has shown
 */
const prefersReducedMotion = () => typeof window !== 'undefined'
  && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function SpriteAnimation({ sheet, size = 220, onDone, className = '' }) {
  const order = frameOrder(sheet)
  // Asked not to animate: start on the last frame and never move. It is the
  // finished pose, which is the one frame that says what happened. Decided in
  // the initialiser rather than by an effect, so the first paint is already
  // right and nothing re-renders to correct it.
  const [reduced] = useState(prefersReducedMotion)
  const [index, setIndex] = useState(() => (prefersReducedMotion() ? Math.max(0, frameOrder(sheet).length - 1) : 0))
  const done = useRef(false)
  const doneCb = useRef(onDone)

  useEffect(() => { doneCb.current = onDone })

  useEffect(() => {
    if (!order.length) return undefined
    if (reduced) {
      const t = setTimeout(() => { if (!done.current) { done.current = true; doneCb.current?.() } }, 400)
      return () => clearTimeout(t)
    }
    const step = 1000 / (Number(sheet?.fps) || 12)
    let raf = 0
    let start = 0
    const tick = (now) => {
      if (!start) start = now
      const i = Math.floor((now - start) / step)
      if (i >= order.length) {
        setIndex(order.length - 1)
        if (!done.current) { done.current = true; doneCb.current?.() }
        return
      }
      setIndex(i)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // The sheet is the whole input; `order` is derived from it every render,
    // so depending on the array itself would restart the animation each time.
  }, [sheet, reduced, order.length])

  if (!sheet || !order.length) return null

  const frame = order[Math.min(index, order.length - 1)]
  const col = frame % sheet.cols
  const row = Math.floor(frame / sheet.cols)

  return (
    <div
      className={`sprite-anim ${className}`}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${sheet.src})`,
        // The sheet is scaled as a whole, then offset by whole frames, so the
        // maths stays in frame units at any display size.
        backgroundSize: `${sheet.cols * size}px ${sheet.rows * size}px`,
        backgroundPosition: `-${col * size}px -${row * size}px`,
        backgroundRepeat: 'no-repeat',
      }}
    />
  )
}

export default SpriteAnimation
