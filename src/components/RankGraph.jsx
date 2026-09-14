import { useRef, useEffect, useState } from 'react'

function RankGraph({ dataPoints, height = 220 }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [canvasWidth, setCanvasWidth] = useState(500)

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
    if (!canvas || dataPoints.length === 0) return

    const width = canvasWidth
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    const pad = { top: 30, right: 20, bottom: 50, left: 50 }
    const graphW = width - pad.left - pad.right
    const graphH = height - pad.top - pad.bottom

    const maxRank = Math.max(...dataPoints.map((d) => d.totalStudents), 1)

    ctx.fillStyle = '#0f3460'
    ctx.fillRect(0, 0, width, height)

    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    const gridLines = Math.min(maxRank, 5)
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (graphH / gridLines) * i
      ctx.beginPath()
      ctx.moveTo(pad.left, y)
      ctx.lineTo(pad.left + graphW, y)
      ctx.stroke()

      const rankVal = Math.round(1 + ((maxRank - 1) / gridLines) * i)
      ctx.fillStyle = '#a0a0b0'
      ctx.font = '600 12px "Google Sans Flex", sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(rankVal.toString(), pad.left - 6, y + 4)
    }

    const barWidth = Math.max(6, Math.min(20, graphW / dataPoints.length * 0.4))

    dataPoints.forEach((d, i) => {
      const x = pad.left + (dataPoints.length === 1 ? graphW / 2 : (i / (dataPoints.length - 1)) * graphW)
      const rankY = pad.top + ((d.rank - 1) / (maxRank - 1 || 1)) * graphH
      const totalY = pad.top + ((d.totalStudents - 1) / (maxRank - 1 || 1)) * graphH

      ctx.strokeStyle = 'rgba(0,255,245,0.35)'
      ctx.lineWidth = 2
      ctx.lineCap = 'butt'
      ctx.beginPath()
      ctx.moveTo(x, totalY)
      ctx.lineTo(x, rankY)
      ctx.stroke()

      const ds = 5
      ctx.fillStyle = '#ffd700'
      ctx.beginPath()
      ctx.moveTo(x, rankY - ds)
      ctx.lineTo(x + ds, rankY)
      ctx.lineTo(x, rankY + ds)
      ctx.lineTo(x - ds, rankY)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
    })

    ctx.fillStyle = '#a0a0b0'
    ctx.font = '500 11px "Google Sans Flex", sans-serif'
    ctx.textAlign = 'center'
    dataPoints.forEach((d, i) => {
      const x = pad.left + (dataPoints.length === 1 ? graphW / 2 : (i / (dataPoints.length - 1)) * graphW)
      const dateStr = new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      ctx.fillText(dateStr, x, height - pad.bottom + 16)
    })

    ctx.font = '700 11px "Google Sans Flex", sans-serif'
    ctx.textAlign = 'center'
    dataPoints.forEach((d, i) => {
      const x = pad.left + (dataPoints.length === 1 ? graphW / 2 : (i / (dataPoints.length - 1)) * graphW)
      const rankY = pad.top + ((d.rank - 1) / (maxRank - 1 || 1)) * graphH
      ctx.fillStyle = '#ffd700'
      ctx.fillText(`#${d.rank}/${d.totalStudents}`, x, rankY - 14)
    })

  }, [dataPoints, canvasWidth, height])

  if (dataPoints.length === 0) {
    return <p className="text-dim" style={{ fontSize: '0.85rem' }}>No ranking data yet.</p>
  }

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height, borderRadius: '4px', border: '2px solid rgba(0,255,245,0.3)' }}
      />
    </div>
  )
}

export default RankGraph
