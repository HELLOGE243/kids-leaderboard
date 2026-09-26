import { useRef, useEffect, useLayoutEffect, useState } from 'react'

function ProgressGraph({ dataPoints, height = 220, color = '#e94560' }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [canvasWidth, setCanvasWidth] = useState(0)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (el) setCanvasWidth(Math.floor(el.getBoundingClientRect().width))
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      setCanvasWidth(Math.floor(entry.contentRect.width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || dataPoints.length === 0 || canvasWidth === 0) return

    const width = canvasWidth
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    const pad = { top: 30, right: 20, bottom: 50, left: 50 }
    const graphW = width - pad.left - pad.right
    const graphH = height - pad.top - pad.bottom

    const maxVal = 100

    ctx.fillStyle = '#0f3460'
    ctx.fillRect(0, 0, width, height)

    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    const gridLines = 4
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (graphH / gridLines) * i
      ctx.beginPath()
      ctx.moveTo(pad.left, y)
      ctx.lineTo(pad.left + graphW, y)
      ctx.stroke()

      const val = Math.round(maxVal - (maxVal / gridLines) * i)
      ctx.fillStyle = '#a0a0b0'
      ctx.font = '600 12px Inter, "Segoe UI", sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(val + '%', pad.left - 8, y + 4)
    }

    const usableW = dataPoints.length === 1 ? Math.min(graphW, 120) : graphW
    const offsetX = dataPoints.length === 1 ? pad.left + (graphW - usableW) / 2 : pad.left
    const points = dataPoints.map((d, i) => {
      const x = offsetX + (dataPoints.length === 1 ? usableW / 2 : (i / (dataPoints.length - 1)) * usableW)
      const y = pad.top + graphH - (d.value / maxVal) * graphH
      return { x, y, ...d }
    })

    ctx.shadowColor = color
    ctx.shadowBlur = 8

    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.lineJoin = 'round'
    ctx.beginPath()
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    })
    ctx.stroke()

    ctx.shadowBlur = 0

    points.forEach((p) => {
      ctx.fillStyle = color
      ctx.fillRect(p.x - 4, p.y - 4, 8, 8)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.strokeRect(p.x - 4, p.y - 4, 8, 8)
    })

    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1
    points.forEach((p) => {
      ctx.beginPath()
      ctx.moveTo(p.x, pad.top + graphH)
      ctx.lineTo(p.x, pad.top + graphH + 5)
      ctx.stroke()
    })

    ctx.fillStyle = '#a0a0b0'
    ctx.font = '500 11px Inter, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    points.forEach((p) => {
      const dateStr = new Date(p.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      ctx.fillText(dateStr, p.x, height - pad.bottom + 16)
    })

    ctx.font = '700 12px Inter, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    points.forEach((p) => {
      const label = p.rankLabel ? p.value + '%, ' + p.rankLabel : p.value + '%'
      ctx.fillStyle = '#ffd700'
      ctx.fillText(label, p.x, p.y - 14)
    })

  }, [dataPoints, canvasWidth, height, color])

  if (dataPoints.length === 0) {
    return <p className="text-dim" style={{ fontSize: '0.85rem' }}>No scores to graph yet.</p>
  }

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height, borderRadius: '4px', border: '2px solid rgba(233,69,96,0.3)' }}
      />
    </div>
  )
}

export default ProgressGraph
