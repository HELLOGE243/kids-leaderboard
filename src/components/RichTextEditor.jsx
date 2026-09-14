import { useRef, useEffect, useState, useCallback } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

function renderMathInHTML(html) {
  return html.replace(/<span[^>]*class="math-inline"[^>]*data-tex="([^"]*)"[^>]*>.*?<\/span>/g, (_, tex) => {
    try {
      const rendered = katex.renderToString(tex, { throwOnError: false })
      return `<span class="math-inline" data-tex="${tex}" contenteditable="false">${rendered}</span>`
    } catch { return tex }
  })
}

function ImageResizer({ img, wrapRef, editorRef, onDone }) {
  const [size, setSize] = useState({ w: img.offsetWidth, h: img.offsetHeight })
  const [crop, setCrop] = useState(null)
  const [mode, setMode] = useState('resize')
  const naturalW = img.naturalWidth || img.offsetWidth
  const naturalH = img.naturalHeight || img.offsetHeight
  const aspect = naturalW / naturalH

  const rect = img.getBoundingClientRect()
  const wrapRect = wrapRef.current.getBoundingClientRect()
  const top = rect.top - wrapRect.top
  const left = rect.left - wrapRect.left

  function startResize(e, corner) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startW = size.w
    const startH = size.h

    function onMove(ev) {
      let dx = ev.clientX - startX
      let dy = ev.clientY - startY
      if (corner === 'tl') { dx = -dx; dy = -dy }
      else if (corner === 'tr') { dy = -dy }
      else if (corner === 'bl') { dx = -dx }
      const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy
      const newW = Math.max(30, startW + delta)
      const newH = Math.round(newW / aspect)
      setSize({ w: newW, h: newH })
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function startCropDrag(e, edge) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startCrop = { ...(crop || { top: 0, right: 0, bottom: 0, left: 0 }) }

    function onMove(ev) {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      const next = { ...startCrop }
      if (edge === 'top') next.top = Math.max(0, Math.min(size.h - next.bottom - 20, startCrop.top + dy))
      if (edge === 'bottom') next.bottom = Math.max(0, Math.min(size.h - next.top - 20, startCrop.bottom - dy))
      if (edge === 'left') next.left = Math.max(0, Math.min(size.w - next.right - 20, startCrop.left + dx))
      if (edge === 'right') next.right = Math.max(0, Math.min(size.w - next.left - 20, startCrop.right - dx))
      setCrop(next)
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function applyResize() {
    img.style.width = size.w + 'px'
    img.style.height = size.h + 'px'
    img.setAttribute('width', size.w)
    img.setAttribute('height', size.h)
    onDone()
  }

  function applyCrop() {
    if (!crop) { onDone(); return }
    const c = crop
    const srcW = naturalW
    const srcH = naturalH
    const scaleX = srcW / size.w
    const scaleY = srcH / size.h
    const sx = Math.round(c.left * scaleX)
    const sy = Math.round(c.top * scaleY)
    const sw = Math.round((size.w - c.left - c.right) * scaleX)
    const sh = Math.round((size.h - c.top - c.bottom) * scaleY)
    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
    const dataUrl = canvas.toDataURL('image/png')
    img.src = dataUrl
    const displayW = size.w - c.left - c.right
    const displayH = size.h - c.top - c.bottom
    img.style.width = displayW + 'px'
    img.style.height = displayH + 'px'
    img.setAttribute('width', displayW)
    img.setAttribute('height', displayH)
    img.removeAttribute('data-crop')
    onDone()
  }

  const handleStyle = {
    position: 'absolute', width: 12, height: 12, background: '#fff',
    border: '2px solid #2196f3', borderRadius: 2, zIndex: 3,
  }

  const cropC = crop || { top: 0, right: 0, bottom: 0, left: 0 }

  return (
    <div
      className="rte-resizer-overlay"
      style={{ position: 'absolute', top, left, width: size.w, height: size.h, zIndex: 10 }}
      onClick={(e) => e.stopPropagation()}
    >
      {mode === 'resize' && (
        <>
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, border: '2px solid #2196f3', pointerEvents: 'none' }} />
          <div style={{ ...handleStyle, top: -6, left: -6, cursor: 'nwse-resize' }} onMouseDown={(e) => startResize(e, 'tl')} />
          <div style={{ ...handleStyle, top: -6, right: -6, cursor: 'nesw-resize' }} onMouseDown={(e) => startResize(e, 'tr')} />
          <div style={{ ...handleStyle, bottom: -6, left: -6, cursor: 'nesw-resize' }} onMouseDown={(e) => startResize(e, 'bl')} />
          <div style={{ ...handleStyle, bottom: -6, right: -6, cursor: 'nwse-resize' }} onMouseDown={(e) => startResize(e, 'br')} />
          <div className="rte-resizer-info">
            {size.w} x {size.h}
          </div>
          <div className="rte-resizer-actions">
            <button type="button" className="rte-resizer-btn" onMouseDown={(e) => e.preventDefault()} onClick={applyResize}>Apply</button>
            <button type="button" className="rte-resizer-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => { setMode('crop'); setCrop({ top: 0, right: 0, bottom: 0, left: 0 }) }}>Crop</button>
            <button type="button" className="rte-resizer-btn rte-resizer-btn-cancel" onMouseDown={(e) => e.preventDefault()} onClick={onDone}>Cancel</button>
          </div>
        </>
      )}
      {mode === 'crop' && (
        <>
          {/* Darkened edges */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: cropC.top, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: cropC.bottom, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', top: cropC.top, left: 0, width: cropC.left, bottom: cropC.bottom, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', top: cropC.top, right: 0, width: cropC.right, bottom: cropC.bottom, background: 'rgba(0,0,0,0.5)' }} />
          {/* Crop border */}
          <div style={{ position: 'absolute', top: cropC.top, left: cropC.left, right: cropC.right, bottom: cropC.bottom, border: '2px dashed #fff', boxSizing: 'border-box' }} />
          {/* Edge handles */}
          <div style={{ position: 'absolute', top: cropC.top - 4, left: cropC.left + 20, right: cropC.right + 20, height: 8, cursor: 'ns-resize' }} onMouseDown={(e) => startCropDrag(e, 'top')} />
          <div style={{ position: 'absolute', bottom: cropC.bottom - 4, left: cropC.left + 20, right: cropC.right + 20, height: 8, cursor: 'ns-resize' }} onMouseDown={(e) => startCropDrag(e, 'bottom')} />
          <div style={{ position: 'absolute', left: cropC.left - 4, top: cropC.top + 20, bottom: cropC.bottom + 20, width: 8, cursor: 'ew-resize' }} onMouseDown={(e) => startCropDrag(e, 'left')} />
          <div style={{ position: 'absolute', right: cropC.right - 4, top: cropC.top + 20, bottom: cropC.bottom + 20, width: 8, cursor: 'ew-resize' }} onMouseDown={(e) => startCropDrag(e, 'right')} />
          <div className="rte-resizer-info">
            Crop: {size.w - cropC.left - cropC.right} x {size.h - cropC.top - cropC.bottom}
          </div>
          <div className="rte-resizer-actions">
            <button type="button" className="rte-resizer-btn" onMouseDown={(e) => e.preventDefault()} onClick={applyCrop}>Apply Crop</button>
            <button type="button" className="rte-resizer-btn rte-resizer-btn-cancel" onMouseDown={(e) => e.preventDefault()} onClick={() => setMode('resize')}>Back</button>
          </div>
        </>
      )}
    </div>
  )
}

function RichTextEditor({ value, onChange, placeholder, extended }) {
  const editorRef = useRef(null)
  const wrapRef = useRef(null)
  const fileInputRef = useRef(null)
  const onChangeRef = useRef(onChange)
  const [showMathInput, setShowMathInput] = useState(false)
  const [mathValue, setMathValue] = useState('')
  const [mathPreview, setMathPreview] = useState('')
  const [selectedImg, setSelectedImg] = useState(null)
  const isInternalChange = useRef(false)

  onChangeRef.current = onChange

  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      editorRef.current.innerHTML = value || ''
    }
    isInternalChange.current = false
  }, [value])

  const handleEditorClick = useCallback((e) => {
    if (e.target.tagName === 'IMG') {
      e.preventDefault()
      setSelectedImg(e.target)
    } else {
      setSelectedImg(null)
    }
  }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setSelectedImg(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!selectedImg || !editorRef.current) return
    const body = editorRef.current
    function onScroll() { setSelectedImg(null) }
    body.addEventListener('scroll', onScroll)
    return () => body.removeEventListener('scroll', onScroll)
  }, [selectedImg])

  function emitChange() {
    const html = editorRef.current.innerHTML
    isInternalChange.current = true
    onChangeRef.current(html)
  }

  function execCmd(cmd, val = null) {
    editorRef.current.focus()
    document.execCommand(cmd, false, val)
    emitChange()
  }

  function handleMathChange(tex) {
    setMathValue(tex)
    try {
      setMathPreview(katex.renderToString(tex, { throwOnError: false }))
    } catch {
      setMathPreview('')
    }
  }

  function insertMath() {
    if (!mathValue.trim()) return
    editorRef.current.focus()
    const rendered = katex.renderToString(mathValue.trim(), { throwOnError: false })
    const mathSpan = `<span class="math-inline" data-tex="${mathValue.trim().replace(/"/g, '&quot;')}" contenteditable="false">${rendered}</span>&nbsp;`
    document.execCommand('insertHTML', false, mathSpan)
    emitChange()
    setShowMathInput(false)
    setMathValue('')
    setMathPreview('')
  }

  function handleImageDone() {
    setSelectedImg(null)
    emitChange()
  }

  function handleImageInsert(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = () => {
      editorRef.current.focus()
      const dataUri = reader.result
      document.execCommand('insertHTML', false, `<img src="${dataUri}" style="max-width:100%" />`)
      emitChange()
    }
    reader.readAsDataURL(file)
  }

  function handlePaste(e) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        const reader = new FileReader()
        reader.onload = () => {
          editorRef.current.focus()
          document.execCommand('insertHTML', false, `<img src="${reader.result}" style="max-width:100%" />`)
          emitChange()
        }
        reader.readAsDataURL(file)
        return
      }
    }
  }

  return (
    <div className="rte-wrap" ref={wrapRef}>
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageInsert} />
      <div className="rte-toolbar">
        {extended && <>
          <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); document.execCommand('undo') }} title="Undo">&#8617;</button>
          <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); document.execCommand('redo') }} title="Redo">&#8618;</button>
          <span className="rte-sep" />
          <select className="rte-font-size" onMouseDown={(e) => e.stopPropagation()} onChange={(e) => { execCmd('fontSize', e.target.value); e.target.value = '' }} defaultValue="" title="Font Size">
            <option value="" disabled>Font Sizes</option>
            <option value="1">Small</option>
            <option value="3">Normal</option>
            <option value="4">Large</option>
            <option value="5">X-Large</option>
            <option value="6">Huge</option>
          </select>
          <span className="rte-sep" />
        </>}
        <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); execCmd('bold') }} title="Bold"><b>B</b></button>
        <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); execCmd('italic') }} title="Italic"><i>I</i></button>
        <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); execCmd('underline') }} title="Underline"><u>U</u></button>
        {extended && <>
          <span className="rte-sep" />
          <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); execCmd('justifyLeft') }} title="Align Left">
            <span style={{ fontSize: '0.55em', lineHeight: 1.1, display: 'flex', flexDirection: 'column', gap: 1 }}><span>&#9644;&#9644;</span><span>&#9644;&#9644;</span><span>&#9644;</span></span>
          </button>
          <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); execCmd('justifyCenter') }} title="Align Center">
            <span style={{ fontSize: '0.55em', lineHeight: 1.1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}><span>&#9644;&#9644;</span><span>&#9644;</span><span>&#9644;&#9644;</span></span>
          </button>
          <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); execCmd('justifyRight') }} title="Align Right">
            <span style={{ fontSize: '0.55em', lineHeight: 1.1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}><span>&#9644;&#9644;</span><span>&#9644;&#9644;</span><span>&#9644;</span></span>
          </button>
          <span className="rte-sep" />
          <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); execCmd('insertUnorderedList') }} title="Bullet List">
            <span style={{ fontSize: '0.75em' }}>&#8226; &#9644;</span>
          </button>
          <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); execCmd('insertOrderedList') }} title="Numbered List">
            <span style={{ fontSize: '0.65em' }}>1. &#9644;</span>
          </button>
        </>}
        <span className="rte-sep" />
        <button type="button" className="rte-btn" onMouseDown={(e) => { e.preventDefault(); fileInputRef.current?.click() }} title="Insert Image">
          <span style={{ fontSize: '0.8em' }}>&#128247;</span>
        </button>
        <button type="button" className="rte-btn rte-btn-math" onMouseDown={(e) => { e.preventDefault(); setShowMathInput(!showMathInput) }} title="Insert Math">
          <i>f</i><span style={{ fontSize: '0.5em', verticalAlign: 'sub' }}>x</span>
        </button>
      </div>
      {showMathInput && (
        <div className="rte-math-row">
          <input
            className="input flex-1"
            value={mathValue}
            onChange={(e) => handleMathChange(e.target.value)}
            placeholder="LaTeX: x^2 + y^2 = r^2"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insertMath() } }}
            autoFocus
          />
          <button type="button" className="btn btn-small" onClick={insertMath}>Insert</button>
          {mathPreview && <span className="rte-math-preview" dangerouslySetInnerHTML={{ __html: mathPreview }} />}
        </div>
      )}
      <div
        ref={editorRef}
        className="rte-body"
        contentEditable
        suppressContentEditableWarning
        onInput={emitChange}
        onBlur={emitChange}
        onPaste={handlePaste}
        onClick={handleEditorClick}
        data-placeholder={placeholder || ''}
        style={{ position: 'relative' }}
      >
      </div>
      {selectedImg && editorRef.current && editorRef.current.contains(selectedImg) && (
        <ImageResizer img={selectedImg} wrapRef={wrapRef} editorRef={editorRef} onDone={handleImageDone} />
      )}
    </div>
  )
}

function RichText({ html }) {
  if (!html) return null
  const processed = renderMathInHTML(html)
  return <span dangerouslySetInnerHTML={{ __html: processed }} />
}

export { RichTextEditor, RichText, renderMathInHTML }
export default RichTextEditor
