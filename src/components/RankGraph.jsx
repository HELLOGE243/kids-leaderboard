import { useRef, useEffect } from 'react'

// Draws a ranking graph — Y-axis is INVERTED (1st at top, last at bottom)
// dataPoints: [{ date, rank, totalStudents, eventName, score }] sorted by date

function RankGraph({ dataPoints, width = 500, height = 220 }) {
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

    const maxRank = Math.max(...dataPoints.map((d) => d.totalStudents), 1)

    // Dark background
    ctx.fillStyle = '#0f3460'
    ctx.fillRect(0, 0, width, height)

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    const gridLines = Math.min(maxRank, 5)
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (graphH / gridLines) * i
      ctx.beginPath()
      ctx.moveTo(pad.left, y)
      ctx.lineTo(pad.left + graphW, y)
      ctx.stroke()

      // Y-axis: rank labels (1st at top)
      const rankVal = Math.round(1 + ((maxRank - 1) / gridLines) * i)
      ctx.fillStyle = '#a0a0b0'
      ctx.font = '9px "Press Start 2P", monospace'
      ctx.textAlign = 'right'
      ctx.fillText(rankVal === 1 ? '1st' : rankVal + 'th', pad.left - 6, y + 4)
    }

    // Plot points — rank 1 at top, maxRank at bottom
    const points = dataPoints.map((d, i) => {
      const x = pad.left + (dataPoints.length === 1 ? graphW / 2 : (i / (dataPoints.length - 1)) * graphW)
      const y = pad.top + ((d.rank - 1) / (maxRank - 1 || 1)) * graphH
      return { x, y, ...d }
    })

    // Glow
    ctx.shadowColor = '#00fff5'
    ctx.shadowBlur = 8

    // Line
    ctx.strokeStyle = '#00fff5'
    ctx.lineWidth = 2.5
    ctx.lineJoin = 'round'
    ctx.beginPath()
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    })
    ctx.stroke()
    ctx.shadowBlur = 0

    // Dots (pixel squares)
    points.forEach((p) => {
      ctx.fillStyle = '#00fff5'
      ctx.fillRect(p.x - 4, p.y - 4, 8, 8)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.strokeRect(p.x - 4, p.y - 4, 8, 8)
    })

    // X-axis: event dates
    ctx.fillStyle = '#a0a0b0'
    ctx.font = '8px "Press Start 2P", monospace'
    ctx.textAlign = 'center'
    points.forEach((p) => {
      const dateStr = new Date(p.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      ctx.fillText(dateStr, p.x, height - pad.bottom + 16)
    })

    // Rank labels above dots
    ctx.font = '8px "Press Start 2P", monospace'
    ctx.textAlign = 'center'
    points.forEach((p) => {
      // Rank in gold
      ctx.fillStyle = '#ffd700'
      const suffix = p.rank === 1 ? 'st' : p.rank === 2 ? 'nd' : p.rank === 3 ? 'rd' : 'th'
      ctx.fillText(`${p.rank}${suffix}/${p.totalStudents}`, p.x, p.y - 14)
    })

  }, [dataPoints, width, height])

  if (dataPoints.length === 0) {
    return <p className="text-dim" style={{ fontSize: '0.85rem' }}>No ranking data yet.</p>
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', maxWidth: width, height, borderRadius: '4px', border: '2px solid rgba(0,255,245,0.3)' }}
    />
  )
}

export default RankGraph
