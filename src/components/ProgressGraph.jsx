import { useRef, useEffect } from 'react'

// Draws a line graph of scores over time on a canvas
// dataPoints: [{ date: string (ISO), value: number, label: string }] sorted by date

function ProgressGraph({ dataPoints, width = 500, height = 250, color = '#6c5ce7' }) {
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

    // Data bounds
    const values = dataPoints.map((d) => d.value)
    const maxVal = Math.max(...values, 1)
    const minVal = 0

    // Clear
    ctx.clearRect(0, 0, width, height)

    // Background
    ctx.fillStyle = '#f8f9fa'
    ctx.fillRect(0, 0, width, height)

    // Grid lines
    ctx.strokeStyle = '#e0e0e0'
    ctx.lineWidth = 1
    const gridLines = 5
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (graphH / gridLines) * i
      ctx.beginPath()
      ctx.moveTo(pad.left, y)
      ctx.lineTo(pad.left + graphW, y)
      ctx.stroke()

      // Y-axis labels
      const val = Math.round(maxVal - (maxVal / gridLines) * i)
      ctx.fillStyle = '#636e72'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(val, pad.left - 8, y + 4)
    }

    // Plot points
    const points = dataPoints.map((d, i) => {
      const x = pad.left + (dataPoints.length === 1 ? graphW / 2 : (i / (dataPoints.length - 1)) * graphW)
      const y = pad.top + graphH - ((d.value - minVal) / (maxVal - minVal)) * graphH
      return { x, y, ...d }
    })

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

    // Dots
    points.forEach((p) => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()
    })

    // X-axis labels
    ctx.fillStyle = '#636e72'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    points.forEach((p) => {
      const dateStr = new Date(p.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      ctx.fillText(dateStr, p.x, height - pad.bottom + 16)
      if (p.label) {
        ctx.fillText(p.label, p.x, height - pad.bottom + 30)
      }
    })

    // Value labels on dots
    ctx.fillStyle = '#2d3436'
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    points.forEach((p) => {
      ctx.fillText(p.value, p.x, p.y - 12)
    })

  }, [dataPoints, width, height, color])

  if (dataPoints.length === 0) {
    return <p style={{ color: '#636e72', fontSize: '0.9rem' }}>No scores to graph yet.</p>
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', maxWidth: width, height, borderRadius: '10px' }}
    />
  )
}

export default ProgressGraph
