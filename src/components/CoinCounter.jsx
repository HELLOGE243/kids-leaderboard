import { useEffect, useRef, useState } from 'react'

function CoinCounter({ value }) {
  const [display, setDisplay] = useState(value)
  const [glowing, setGlowing] = useState(false)
  const prevValue = useRef(value)
  const frameRef = useRef(null)
  const glowTimer = useRef(null)

  useEffect(() => {
    const from = prevValue.current
    const to = value
    prevValue.current = value

    if (from === to) {
      setDisplay(to)
      return
    }

    setGlowing(false)
    clearTimeout(glowTimer.current)

    const diff = to - from
    const duration = Math.min(1200, Math.max(400, Math.abs(diff) * 15))
    const startTime = performance.now()

    function tick(now) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(from + diff * eased)
      setDisplay(current)

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick)
      } else {
        setGlowing(true)
        glowTimer.current = setTimeout(() => setGlowing(false), 2000)
      }
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frameRef.current)
      clearTimeout(glowTimer.current)
    }
  }, [value])

  const rolling = value !== display
  const className = `stat-value text-coin${rolling ? ' coin-rolling' : ''}${glowing ? ' coin-glow' : ''}`

  return <span className={className}>{display}</span>
}

export default CoinCounter
