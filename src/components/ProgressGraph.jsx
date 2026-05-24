import { useRef, useEffect } from 'react'

function ProgressGraph({ dataPoints, width = 500, height = 220, color = '#e94560' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || dataPoints.length === 0) return

    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    const pad = { top: 30, right: 20, bottom: 50, left: 50 }
    const graphW = width - pad.left - pad.right
    const graphH = height - pad.top - pad.bottom

    const values = dataPoints.map((d) => d.value)
    const maxVal = Math.max(...values, 1)

    // Clear — dark background
    ctx.fillStyle = '#0f3460'
    ctx.fillRect(0, 0, width, height)

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    const gridLines = 4
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (graphH / gridLines) * i
      ctx.beginPath()
      ctx.moveTo(pad.left, y)
      ctx.lineTo(pad.left + graphW, y)
      ctx.stroke()

      // Y-axis labels
      const val = Math.round(maxVal - (maxVal / gridLines) * i)
      ctx.fillStyle = '#a0a0b0'
      ctx.font = '10px "Press Start 2P", monospace'
      ctx.textAlign = 'right'
      ctx.fillText(val, pad.left - 8, y + 4)
    }

    // Plot points
    const points = dataPoints.map((d, i) => {
      const x = pad.left + (dataPoints.length === 1 ? graphW / 2 : (i / (dataPoints.length - 1)) * graphW)
      const y = pad.top + graphH - (d.value / maxVal) * graphH
      return { x, y, ...d }
    })

    // Glow effect
    ctx.shadowColor = color
    ctx.shadowBlur = 8

    // Line
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.lineJoin = 'round'
    ctx.beginPath()
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    })
    ctx.stroke()

    // Reset shadow for dots
    ctx.shadowBlur = 0

    // Dots (pixel squares)
    points.forEach((p) => {
      ctx.fillStyle = color
      ctx.fillRect(p.x - 4, p.y - 4, 8, 8)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.strokeRect(p.x - 4, p.y - 4, 8, 8)
    })

    // X-axis labels
    ctx.fillStyle = '#a0a0b0'
    ctx.font = '8px "Press Start 2P", monospace'
    ctx.textAlign = 'center'
    points.forEach((p) => {
      const dateStr = new Date(p.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      ctx.fillText(dateStr, p.x, height - pad.bottom + 16)
    })

    // Value labels above dots
    ctx.fillStyle = '#ffd700'
    ctx.font = '9px "Press Start 2P", monospace'
    ctx.textAlign = 'center'
    points.forEach((p) => {
      ctx.fillText(p.value, p.x, p.y - 14)
    })

  }, [dataPoints, width, height, color])

  if (dataPoints.length === 0) {
    return <p className="text-dim" style={{ fontSize: '0.85rem' }}>No scores to graph yet.</p>
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', maxWidth: width, height, borderRadius: '4px', border: '2px solid rgba(233,69,96,0.3)' }}
    />
  )
}

export default ProgressGraph
