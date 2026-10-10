import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { getQuizSetsWithWriting, getWritingSubmissions, saveWritingMark, getWritingExemplars, adjustWritingMark, WRITING_RUBRIC, onDataChange } from '../data/store.js'
import { generateWritingSuggestions, preAnalyseWriting, generateAiAnnotation, generateAiMark } from '../utils/aiChat.js'

const SCORE_LABELS = ['', 'Beginning', 'Developing', 'Competent', 'Proficient', 'Advanced']
const SCORE_COLORS = ['', '#ff1744', '#ff9100', '#ffab00', '#66bb6a', '#00e5ff']

const TOOLS = [
  { key: 'highlight', label: 'Highlight', icon: '🖍️' },
  { key: 'strikethrough', label: 'Strike', icon: '~~' },
  { key: 'comment', label: 'Comment', icon: '💬' },
  { key: 'insertion', label: 'Insert', icon: '➕' },
  { key: 'correction', label: 'Correct', icon: '🔤' },
]

// Chosen first, from the bar above the writing, and then used on the words -
// the way a word processor works. Marking is a repetitive job: a tool stays
// armed until it is turned off, so several strikes in a row are three clicks
// rather than nine.
const MARK_TOOLS = [
  { key: 'strikethrough', label: 'Strikethrough', icon: 'S', color: '#ff1744',
    hint: 'Select the words to strike out.' },
  { key: 'comment', label: 'Comment', icon: '\u{1F4AC}', color: '#42a5f5',
    hint: 'Select the words the comment is about, then write it.' },
  { key: 'correction', label: 'Suggestion', icon: '\u270E', color: '#ff9100',
    hint: 'Select the words, then write what they should say instead.' },
  { key: 'insertion', label: 'Insert', icon: '+', color: '#66bb6a',
    hint: 'Click where something is missing, then write what belongs there.' },
  { key: 'ai', label: 'AI suggestion', icon: '\u{1F916}', color: '#b464ff',
    hint: 'Select a sentence for the AI to look at.' },
]


const OLD_ANNOTATION_TYPES = [
  { key: 'spelling', label: 'Spelling', color: '#ff1744', icon: '🔤' },
  { key: 'grammar', label: 'Grammar', color: '#ff9100', icon: '📝' },
  { key: 'punctuation', label: 'Punctuation', color: '#ffab00', icon: '✏️' },
  { key: 'vocabulary', label: 'Vocabulary', color: '#b464ff', icon: '📖' },
  { key: 'structure', label: 'Structure', color: '#3b82f6', icon: '🏗️' },
]

let _annotId = 0
function nextAnnotId() { return `ann_${Date.now()}_${++_annotId}` }

function stripHtml(html) {
  let h = html.replace(/<br\s*\/?>/gi, '\n')
  h = h.replace(/<\/p>/gi, '\n\n')
  h = h.replace(/<\/div>/gi, '\n')
  const div = document.createElement('div')
  div.innerHTML = h
  return (div.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
}

function migrateAnnotations(annotations, plainText) {
  if (!annotations?.length) return []
  return annotations.map(ann => {
    if (ann.action) return ann
    const idx = plainText.indexOf(ann.text)
    return {
      id: nextAnnotId(),
      action: 'correction',
      startOffset: idx >= 0 ? idx : 0,
      endOffset: idx >= 0 ? idx + ann.text.length : ann.text.length,
      text: ann.text,
      color: OLD_ANNOTATION_TYPES.find(t => t.key === ann.type)?.color || '#ff9100',
      comment: '',
      insertionText: '',
      suggestion: ann.suggestion || '',
    }
  })
}

function WritingReview({ orgId, teacherId, onBack }) {
  const [refresh, setRefresh] = useState(0)
  const [selectedSet, setSelectedSet] = useState(null)
  const [activeSubmission, setActiveSubmission] = useState(null)
  const [categories, setCategories] = useState(() => WRITING_RUBRIC.map(c => ({ key: c.key, score: 0, comment: '' })))
  const [annotations, setAnnotations] = useState([])
  const [overallComment, setOverallComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [popup, setPopup] = useState(null)
  const [activeTool, setActiveTool] = useState(null)
  const [editingAnnot, setEditingAnnot] = useState(null)
  const [calibration, setCalibration] = useState(null)
  const [inconsistencies, setInconsistencies] = useState([])
  // Every change to the annotations goes through commit(), which keeps the
  // previous state here. Marking is fiddly and a mis-click used to cost the
  // annotation outright.
  const [past, setPast] = useState([])
  const [future, setFuture] = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPreload, setAiPreload] = useState(null)
  const [aiPreloadStatus, setAiPreloadStatus] = useState('idle')
  const [aiAnnotLoading, setAiAnnotLoading] = useState(false)
  const [aiAnnotResult, setAiAnnotResult] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [editedText, setEditedText] = useState('')
  const responseRef = useRef(null)
  const plainTextRef = useRef('')

  useEffect(() => {
    const unsub = onDataChange(() => setRefresh(r => r + 1))
    return unsub
  }, [])

  const quizSets = useMemo(() => getQuizSetsWithWriting(orgId), [orgId, refresh])
  const submissions = useMemo(() => selectedSet ? getWritingSubmissions(selectedSet, orgId) : [], [selectedSet, orgId, refresh])

  function openSubmission(sub) {
    setActiveSubmission(sub)
    setSaved(false)
    const pt = stripHtml(sub.answer)
    plainTextRef.current = pt
    if (sub.mark) {
      setCategories(WRITING_RUBRIC.map(c => {
        const existing = sub.mark.categories.find(mc => mc.key === c.key)
        return { key: c.key, score: existing?.score || 0, comment: existing?.comment || '' }
      }))
      setAnnotations(migrateAnnotations(sub.mark.annotations, pt))
      setOverallComment(sub.mark.overallComment || '')
    } else {
      setCategories(WRITING_RUBRIC.map(c => ({ key: c.key, score: 0, comment: '' })))
      setAnnotations([])
      setOverallComment('')
    }
    setPopup(null)
    setActiveTool(null)
    setEditingAnnot(null)
    setCalibration(null)
    setInconsistencies([])
    setPast([])
    setFuture([])
    setAiAnnotResult(null)
    setAiPreloadStatus('loading')
    setAiPreload(null)
    preAnalyseWriting(pt).then(result => {
      setAiPreload(result)
      setAiPreloadStatus(result ? 'ready' : 'error')
    })
  }

  /** Changes the annotations and remembers what they were. */
  function commit(nextOrFn) {
    const next = typeof nextOrFn === 'function' ? nextOrFn(annotations) : nextOrFn
    setPast(prev => [...prev.slice(-49), annotations])
    setFuture([])
    setAnnotations(next)
    setSaved(false)
  }

  function undo() {
    if (!past.length) return
    setFuture(f => [annotations, ...f].slice(0, 50))
    setAnnotations(past[past.length - 1])
    setPast(p => p.slice(0, -1))
    setPopup(null)
    setSaved(false)
  }

  function redo() {
    if (!future.length) return
    setPast(p => [...p.slice(-49), annotations])
    setAnnotations(future[0])
    setFuture(f => f.slice(1))
    setPopup(null)
    setSaved(false)
  }

  // Ctrl+Z over the writing undoes the last mark. Inside a comment box it is
  // left alone: there the teacher means the words they are typing, and the
  // browser already handles that.
  useEffect(() => {
    if (!activeSubmission) return
    function onKey(e) {
      if (e.key === 'Escape') { setActiveTool(null); setPopup(null); return }
      const el = e.target
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)) return
      if (!(e.ctrlKey || e.metaKey)) return
      const z = e.key === 'z' || e.key === 'Z'
      const y = e.key === 'y' || e.key === 'Y'
      if (z && !e.shiftKey) { e.preventDefault(); undo() }
      else if ((z && e.shiftKey) || y) { e.preventDefault(); redo() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  function setScore(key, score) {
    setCategories(prev => prev.map(c => c.key === key ? { ...c, score } : c))
    setSaved(false)
  }

  function setComment(key, comment) {
    setCategories(prev => prev.map(c => c.key === key ? { ...c, comment } : c))
    setSaved(false)
  }

  const getSelectionOffsets = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !responseRef.current) return null
    const container = responseRef.current
    if (!container.contains(sel.anchorNode) || !container.contains(sel.focusNode)) return null
    const range = sel.getRangeAt(0)
    const preRange = document.createRange()
    preRange.selectNodeContents(container)
    preRange.setEnd(range.startContainer, range.startOffset)
    const startOffset = preRange.toString().length
    const text = range.toString()
    if (!text.trim()) return null
    return { startOffset, endOffset: startOffset + text.length, text }
  }, [])

  useEffect(() => {
    if (!popup) return
    function onDown(e) {
      if (e.target.closest('.wr-sel-popup')) return
      setPopup(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [!!popup])

  function handleMouseUp(e) {
    if (e.target.closest('.wr-sel-popup')) return
    // Clicking a mark's own words means "reword this", not "use the tool here".
    if (e.target.closest('.wr-annot-editable')) return
    // No tool chosen means no menu: selecting words is just selecting words,
    // which is what a teacher reading the piece is usually doing.
    if (!activeTool) return
    const sel = window.getSelection()
    if (!sel || !responseRef.current) return
    if (!responseRef.current.contains(sel.anchorNode)) return

    const containerRect = responseRef.current.getBoundingClientRect()
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    // Insert marks a point rather than a span, so it wants the caret.
    if (activeTool === 'insertion') {
      const preRange = document.createRange()
      preRange.selectNodeContents(responseRef.current)
      preRange.setEnd(range.startContainer, range.startOffset)
      setPopup({
        type: 'insert', step: 'input', action: 'insertion',
        x: Math.max(0, rect.left - containerRect.left),
        y: rect.top - containerRect.top - 52,
        offset: preRange.toString().length, inputValue: '',
      })
      return
    }

    if (sel.isCollapsed) return
    const offsets = getSelectionOffsets()
    if (!offsets) return
    const centerX = rect.width > 2 ? rect.left + rect.width / 2 : rect.left + 4
    const topY = rect.height > 2 ? rect.top : rect.top - 10
    const x = Math.max(0, centerX - containerRect.left - 110)
    const y = topY - containerRect.top - 52

    // A strike needs nothing typed, so it lands as soon as the words are picked
    // and the tool stays armed for the next one.
    if (activeTool === 'strikethrough') {
      commit(prev => [...prev, {
        id: nextAnnotId(), action: 'strikethrough',
        startOffset: offsets.startOffset, endOffset: offsets.endOffset,
        text: offsets.text, color: '#ff1744',
        comment: '', insertionText: '', suggestion: '',
      }])
      window.getSelection()?.removeAllRanges()
      return
    }

    if (activeTool === 'ai') {
      if (aiPreloadStatus !== 'ready') return
      setPopup({ type: 'selection', step: 'ai-loading', ...offsets, x, y, action: null, inputValue: '' })
      runAiAnnotation(offsets)
      return
    }

    setPopup({ type: 'selection', step: 'input', action: activeTool, ...offsets, x, y, inputValue: '' })
  }

  function confirmPopup() {
    if (!popup || !popup.inputValue.trim()) return
    const { action } = popup
    if (action === 'comment') {
      commit(prev => [...prev, {
        id: nextAnnotId(), action: 'comment',
        startOffset: popup.startOffset, endOffset: popup.endOffset,
        text: popup.text || '', color: '#42a5f5',
        comment: popup.inputValue, insertionText: '', suggestion: '',
      }])
    } else if (action === 'correction') {
      commit(prev => [...prev, {
        id: nextAnnotId(), action: 'correction',
        startOffset: popup.startOffset, endOffset: popup.endOffset,
        text: popup.text || '', color: '#ff9100',
        comment: '', insertionText: '', suggestion: popup.inputValue,
      }])
    } else if (action === 'insertion') {
      commit(prev => [...prev, {
        id: nextAnnotId(), action: 'insertion',
        startOffset: popup.offset, endOffset: popup.offset,
        text: '', color: '#66bb6a',
        comment: '', insertionText: popup.inputValue, suggestion: '',
      }])
    }
    setSaved(false)
    setPopup(null)
    window.getSelection()?.removeAllRanges()
  }

  function removeAnnotation(id) {
    commit(prev => prev.filter(a => a.id !== id))
  }

  /** Which field of an annotation holds the teacher's words. */
  function wordsField(action) {
    if (action === 'comment') return 'comment'
    if (action === 'correction') return 'suggestion'
    if (action === 'insertion') return 'insertionText'
    return null
  }

  /** Opens an annotation for rewording. A strike has no words to change. */
  function startEditAnnotation(ann) {
    if (!ann) return
    const field = wordsField(ann.action)
    if (!field) return
    setEditingAnnot({ id: ann.id, field, value: ann[field] || '' })
  }

  function saveEditAnnotation() {
    if (!editingAnnot) return
    const { id, field, value } = editingAnnot
    const text = value.trim()
    if (!text) return
    commit(prev => prev.map(a => (a.id === id ? { ...a, [field]: text } : a)))
    setEditingAnnot(null)
  }

  async function runAiAnnotation(sel) {
    if (aiAnnotLoading || !sel?.text) return
    setAiAnnotLoading(true)
    setAiAnnotResult(null)
    try {
      const result = await generateAiAnnotation(plainTextRef.current, sel.text, aiPreload)
      setAiAnnotResult(result)
      setPopup(p => p ? ({ ...p, step: 'ai-result' }) : null)
    } catch {
      setPopup(null)
    }
    setAiAnnotLoading(false)
  }

  function acceptAiComment() {
    if (!popup || !aiAnnotResult?.comment) return
    commit(prev => [...prev, {
      id: nextAnnotId(), action: 'comment',
      startOffset: popup.startOffset, endOffset: popup.endOffset,
      text: popup.text || '', color: '#42a5f5',
      comment: aiAnnotResult.comment, insertionText: '', suggestion: '',
    }])
  }

  function acceptAiRephrase() {
    if (!popup || !aiAnnotResult?.rephrase) return
    commit(prev => [...prev, {
      id: nextAnnotId(), action: 'correction',
      startOffset: popup.startOffset, endOffset: popup.endOffset,
      text: popup.text || '', color: '#ff9100',
      comment: '', insertionText: '', suggestion: aiAnnotResult.rephrase,
    }])
  }

  function acceptAiBoth() {
    if (!popup || !aiAnnotResult) return
    const added = []
    if (aiAnnotResult.comment) {
      added.push({
        id: nextAnnotId(), action: 'comment',
        startOffset: popup.startOffset, endOffset: popup.endOffset,
        text: popup.text || '', color: '#42a5f5',
        comment: aiAnnotResult.comment, insertionText: '', suggestion: '',
      })
    }
    if (aiAnnotResult.rephrase) {
      added.push({
        id: nextAnnotId(), action: 'correction',
        startOffset: popup.startOffset, endOffset: popup.endOffset,
        text: popup.text || '', color: '#ff9100',
        comment: '', insertionText: '', suggestion: aiAnnotResult.rephrase,
      })
    }
    // One step, so one Ctrl+Z takes both back.
    commit(prev => [...prev, ...added])
    setPopup(null)
    setAiAnnotResult(null)
    window.getSelection()?.removeAllRanges()
  }

  async function handleAiMark() {
    if (!activeSubmission || aiLoading) return
    setAiLoading(true)
    const text = stripHtml(activeSubmission.answer)
    // Marked answers to this same question are the standard this one is judged
    // against, so a 4 means the same thing in January and in June.
    const exemplars = getWritingExemplars(selectedSet, activeSubmission.questionIndex, {
      excludeAttemptId: activeSubmission.attemptId,
    })
    const result = await generateAiMark(text, WRITING_RUBRIC, aiPreload, exemplars)
    if (result) {
      setCalibration(exemplars.length
        ? { note: result.calibration || '', against: exemplars.length }
        : { note: '', against: 0 })
      setInconsistencies(result.inconsistencies || [])
      if (result.categories) {
        setCategories(prev => prev.map(c => {
          const ai = result.categories.find(ac => ac.key === c.key)
          if (!ai) return c
          return { ...c, score: ai.score || c.score, comment: ai.comment || c.comment }
        }))
      }
      if (result.overallComment) {
        setOverallComment(result.overallComment)
      }
      setSaved(false)
    }
    setAiLoading(false)
  }

  /**
   * Rescores an earlier piece the AI reckons is out of line. The teacher's own
   * comments on it are untouched - only the numbers move, and the change is
   * recorded on the mark.
   */
  function applyAdjustment(item) {
    const done = adjustWritingMark(
      item.attemptId, activeSubmission.questionIndex, item.categories, item.reason, teacherId)
    setInconsistencies(prev => prev.filter(i => i.attemptId !== item.attemptId))
    if (done) setRefresh(r => r + 1)
  }

  function handleSave() {
    if (!activeSubmission) return
    setSaving(true)
    saveWritingMark({
      attemptId: activeSubmission.attemptId,
      questionIndex: activeSubmission.questionIndex,
      studentId: activeSubmission.studentId,
      quizSetId: selectedSet,
      teacherId,
      orgId,
      categories,
      annotations,
      overallComment,
    })
    setSaving(false)
    setSaved(true)
  }

  const totalScore = categories.reduce((sum, c) => sum + c.score, 0)
  const allScored = categories.every(c => c.score > 0)

  function renderAnnotatedText(html) {
    const plain = stripHtml(html)
    // While a tool is open the chosen words stay marked, whatever the browser
    // does with the live selection.
    const pending = popup && popup.type === 'selection' && popup.endOffset > popup.startOffset
      ? { id: '__pending', action: 'pending', startOffset: popup.startOffset, endOffset: popup.endOffset }
      : null
    const all = pending ? [...annotations, pending] : annotations
    if (!all.length) return <div className="wr-annotated-text">{plain}</div>

    // An insert marks a point between two words, so it has no width. At the
    // same offset it must come before a mark that does have width, or the
    // widthless one is stepped over and silently disappears - which is what
    // used to shunt every mark after it out of place.
    const width = (a) => a.endOffset - a.startOffset
    const sorted = [...all].sort((a, b) =>
      (a.startOffset - b.startOffset) || (width(a) - width(b)))
    const parts = []
    let cursor = 0

    for (const ann of sorted) {
      // An insert whose point has already been passed - it sat inside another
      // mark's words - is placed here rather than dropped.
      if (ann.startOffset < cursor && width(ann) > 0) continue
      if (ann.startOffset > cursor) {
        parts.push({ type: 'text', content: plain.slice(cursor, ann.startOffset) })
      }

      if (ann.action === 'pending') {
        parts.push({ type: 'pending', content: plain.slice(ann.startOffset, ann.endOffset), id: ann.id })
      } else if (ann.action === 'highlight') {
        parts.push({ type: 'highlight', content: plain.slice(ann.startOffset, ann.endOffset), color: ann.color, id: ann.id })
      } else if (ann.action === 'strikethrough') {
        parts.push({ type: 'strikethrough', content: plain.slice(ann.startOffset, ann.endOffset), id: ann.id })
      } else if (ann.action === 'comment') {
        parts.push({ type: 'comment', content: plain.slice(ann.startOffset, ann.endOffset), comment: ann.comment, id: ann.id })
      } else if (ann.action === 'insertion') {
        parts.push({ type: 'insertion', content: plain.slice(ann.startOffset, ann.endOffset), insertionText: ann.insertionText, id: ann.id })
      } else if (ann.action === 'correction') {
        parts.push({ type: 'correction', content: plain.slice(ann.startOffset, ann.endOffset), suggestion: ann.suggestion, color: ann.color || '#ff9100', id: ann.id })
      }
      cursor = Math.max(cursor, ann.endOffset)
    }
    if (cursor < plain.length) {
      parts.push({ type: 'text', content: plain.slice(cursor) })
    }

    const commentAnnots = annotations.filter(a => a.action === 'comment')

    return (
      <div className="wr-annotated-wrap">
        <div className="wr-annotated-text">
          {parts.map((p, i) => {
            if (p.type === 'text') return <span key={i}>{p.content}</span>
            if (p.type === 'pending') return <span key={i} className="wr-mark-pending">{p.content}</span>
            if (p.type === 'highlight') return <mark key={i} className="wr-mark-highlight" style={{ backgroundColor: p.color + '33', borderBottomColor: p.color }}>{p.content}</mark>
            if (p.type === 'strikethrough') return <span key={i} className="wr-mark-strike">{p.content}</span>
            if (p.type === 'comment') {
              const cIdx = commentAnnots.findIndex(a => a.id === p.id)
              return <span key={i} className="wr-mark-comment" data-comment-idx={cIdx + 1}>{p.content}</span>
            }
            // A caret, then the words, so the surrounding text keeps its spacing.
            if (p.type === 'insertion') return <span key={i} className="wr-mark-insertion-wrap">{p.content}<span className="wr-mark-insertion-caret">⌃</span><span className="wr-mark-insertion-bubble wr-annot-editable" title="Click to reword" onClick={() => startEditAnnotation(annotations.find(a => a.id === p.id))}>{p.insertionText}</span></span>
            if (p.type === 'correction') return <span key={i} className="wr-mark-correction"><span className="wr-mark-correction-original">{p.content}</span>{p.suggestion && <span className="wr-mark-correction-suggestion wr-annot-editable" title="Click to reword" onClick={() => startEditAnnotation(annotations.find(a => a.id === p.id))}><span className="wr-mark-suggestion-label">Suggestion:</span> {p.suggestion}</span>}</span>
            return null
          })}
        </div>
        {commentAnnots.length > 0 && (
          <div className="wr-margin-comments">
            {commentAnnots.map((ann, i) => (
              <div key={ann.id} className="wr-margin-comment">
                <span className="wr-margin-comment-num">{i + 1}</span>
                {editingAnnot?.id === ann.id ? (
                  <textarea
                    className="wr-annot-edit-box"
                    value={editingAnnot.value}
                    autoFocus
                    rows={2}
                    onChange={e => setEditingAnnot(c => ({ ...c, value: e.target.value }))}
                    onBlur={saveEditAnnotation}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEditAnnotation() }
                      if (e.key === 'Escape') { e.preventDefault(); setEditingAnnot(null) }
                    }}
                  />
                ) : (
                  <span
                    className="wr-margin-comment-text wr-annot-editable"
                    title="Click to reword"
                    onClick={() => startEditAnnotation(ann)}
                  >{ann.comment}</span>
                )}
                <button className="wr-margin-comment-del" onClick={() => removeAnnotation(ann.id)}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // List view
  if (!selectedSet) {
    return (
      <div className="wr-page">
        <div className="wr-header">
          <button className="btn btn-outline" onClick={onBack}>← Back</button>
          <h2 className="wr-title">✍️ Writing Review</h2>
        </div>
        {quizSets.length === 0 ? (
          <div className="wr-empty">
            <span className="wr-empty-icon">📝</span>
            <p>No quiz sets with writing questions found.</p>
            <p style={{ fontSize: '0.85rem', opacity: 0.6 }}>Create a quiz with a "Free Write" question in the Quiz Builder.</p>
          </div>
        ) : (
          <div className="wr-set-list">
            {quizSets.map(s => (
              <div key={s.id} className="wr-set-card" onClick={() => setSelectedSet(s.id)}>
                <div className="wr-set-info">
                  <span className="wr-set-name">{s.title}</span>
                  <span className="wr-set-meta">
                    {[s.courseName, s.moduleName].filter(Boolean).join(' · ')}
                    {(s.courseName || s.moduleName) ? ' — ' : ''}
                    {s.writingCount} writing question{s.writingCount !== 1 ? 's' : ''}
                    {s.lastSubmittedAt && ` · last response ${new Date(s.lastSubmittedAt).toLocaleDateString()}`}
                  </span>
                </div>
                <div className="wr-set-stats">
                  <div className="wr-set-stat">
                    <span className="wr-set-stat-num">{s.submissionCount}</span>
                    <span className="wr-set-stat-label">Submitted</span>
                  </div>
                  <div className="wr-set-stat">
                    <span className="wr-set-stat-num" style={{ color: s.markedCount === s.submissionCount && s.submissionCount > 0 ? '#66bb6a' : undefined }}>{s.markedCount}</span>
                    <span className="wr-set-stat-label">Marked</span>
                  </div>
                </div>
                <span className="wr-set-arrow">›</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Submissions list
  if (!activeSubmission) {
    const setInfo = quizSets.find(s => s.id === selectedSet)
    const markedCount = submissions.filter(s => s.mark).length
    const formatTime = d => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    return (
      <div className="wr-page">
        <div className="wr-header">
          <button className="btn btn-outline" onClick={() => setSelectedSet(null)}>← Back</button>
          <h2 className="wr-title">
            {setInfo?.title || 'Writing Submissions'}
            {setInfo?.courseName && <span className="wr-title-course">{setInfo.courseName}</span>}
          </h2>
          <span className="wr-queue-count">{markedCount}/{submissions.length} marked</span>
        </div>
        {submissions.length === 0 ? (
          <div className="wr-empty">
            <span className="wr-empty-icon">📭</span>
            <p>No writing submissions yet.</p>
          </div>
        ) : (
          <div className="wr-sub-list">
            {submissions.map((sub, i) => (
              <div key={`${sub.attemptId}-${sub.questionIndex}`} className={`wr-sub-card ${sub.mark ? 'wr-sub-marked' : ''}`} onClick={() => openSubmission(sub)}>
                <div className="wr-sub-avatar">
                  {sub.studentAvatar ? <img src={sub.studentAvatar} alt="" /> : '👤'}
                </div>
                <div className="wr-sub-info">
                  <span className="wr-sub-name">{sub.studentName}</span>
                  <span className="wr-sub-quiz-name">{setInfo?.title}</span>
                  <span className="wr-sub-date">{formatTime(sub.date)}</span>
                </div>
                {sub.mark ? (
                  <div className="wr-sub-marked-badge">
                    <span className="wr-sub-marked-check">✓</span>
                    <span className="wr-sub-marked-label">Marked</span>
                    <span className="wr-sub-score-num">{sub.mark.totalScore}/25</span>
                  </div>
                ) : (
                  <span className="wr-sub-unmark">Mark →</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Marking view
  const promptHtml = activeSubmission.question?.prompt || activeSubmission.question?.text || ''
  return (
    <div className="wr-page wr-marking-mode">
      <div className="wr-top-bar">
        <button className="wr-back-btn" onClick={() => setActiveSubmission(null)}>← Back</button>
        <div className="wr-top-bar-center">
          <span className="wr-student-name">{activeSubmission.studentName}</span>
          <span className="wr-top-bar-sep">·</span>
          <span className="wr-top-bar-date">{new Date(activeSubmission.date).toLocaleDateString()}</span>
        </div>
        <span className={`wr-ai-status wr-ai-status-${aiPreloadStatus}`}>
          {aiPreloadStatus === 'loading' && '🤖 Analysing...'}
          {aiPreloadStatus === 'ready' && '🤖 AI Ready'}
          {aiPreloadStatus === 'error' && '🤖 AI Unavailable'}
        </span>
      </div>

      <div className="wr-marking-layout">
        {/* Left: Student response + annotations */}
        <div className="wr-response-col">
          {promptHtml && (
            <div className="wr-prompt-box">
              <div className="wr-prompt-label">Writing Prompt</div>
              <div className="wr-prompt-text" dangerouslySetInnerHTML={{ __html: promptHtml }} />
            </div>
          )}

          <div className="wr-toolbar">
            <div className="wr-toolbar-tools">
              {MARK_TOOLS.map(t => {
                const disabled = t.key === 'ai' && aiPreloadStatus !== 'ready'
                return (
                  <button
                    key={t.key}
                    className={`wr-tool-btn ${activeTool === t.key ? 'wr-tool-btn-on' : ''}`}
                    style={{ '--tool-color': t.color }}
                    disabled={disabled || editMode}
                    title={disabled ? 'The AI is still reading this piece' : t.hint}
                    onClick={() => setActiveTool(cur => (cur === t.key ? null : t.key))}
                  >
                    <span className="wr-tool-icon">{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                )
              })}
            </div>
            <div className="wr-toolbar-history">
              <button className="wr-tool-hist" onClick={undo} disabled={!past.length} title="Undo (Ctrl+Z)">↶ Undo</button>
              <button className="wr-tool-hist" onClick={redo} disabled={!future.length} title="Redo (Ctrl+Shift+Z)">↷ Redo</button>
            </div>
          </div>
          <div className="wr-toolbar-hint">
            {editMode
              ? 'Finish editing the text to go back to marking.'
              : activeTool
                ? MARK_TOOLS.find(t => t.key === activeTool)?.hint
                : 'Pick a tool, then mark the words it applies to. Ctrl+Z undoes.'}
          </div>

          <div className="wr-response-box">
            <div className="wr-response-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{editMode ? 'Editing Student Response' : 'Student Response — select text to annotate, click to insert'}</span>
              <button className="wr-edit-toggle" onClick={() => {
                if (!editMode) {
                  setEditedText(plainTextRef.current)
                  setEditMode(true)
                } else {
                  activeSubmission.answer = editedText
                  plainTextRef.current = editedText
                  // The marks pointed at the words that were there. Through
                  // commit(), so Ctrl+Z brings them back if that was a mistake.
                  commit([])
                  setEditMode(false)
                }
              }}>
                {editMode ? 'Done Editing' : 'Edit Text'}
              </button>
            </div>
            {editMode ? (
              <div
                className="wr-response-text wr-response-editable"
                contentEditable
                suppressContentEditableWarning
                onInput={e => setEditedText(e.currentTarget.textContent)}
                style={{ userSelect: 'text', cursor: 'text', whiteSpace: 'pre-wrap' }}
              >{editedText}</div>
            ) : (
              <div
                className={`wr-response-text ${activeTool ? 'wr-response-armed' : ''}`}
                ref={responseRef}
                onMouseUp={handleMouseUp}
                style={{ userSelect: 'text', cursor: activeTool ? 'crosshair' : 'text' }}
              >
                {renderAnnotatedText(activeSubmission.answer)}
              </div>
            )}

            {popup && popup.step === 'ai-loading' && (
              <div className="wr-sel-popup wr-sel-popup-ai" style={{ left: Math.max(0, popup.x - 60), top: popup.y }} onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}>
                <div className="wr-ai-annot-loading">
                  <span className="wr-ai-annot-spinner" />
                  <span>AI is thinking...</span>
                </div>
              </div>
            )}

            {popup && popup.step === 'ai-result' && aiAnnotResult && (
              <div className="wr-sel-popup wr-sel-popup-ai" style={{ left: Math.max(0, popup.x - 100), top: popup.y }} onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}>
                {aiAnnotResult.comment && (
                  <div className="wr-ai-annot-row">
                    <span className="wr-ai-annot-label">Comment</span>
                    <p className="wr-ai-annot-text">{aiAnnotResult.comment}</p>
                    <button className="wr-ai-annot-accept" onClick={() => { acceptAiComment(); setPopup(null); setAiAnnotResult(null); window.getSelection()?.removeAllRanges() }}>Apply Comment</button>
                  </div>
                )}
                {aiAnnotResult.rephrase && (
                  <div className="wr-ai-annot-row">
                    <span className="wr-ai-annot-label">Rephrase</span>
                    <p className="wr-ai-annot-text">{aiAnnotResult.rephrase}</p>
                    <button className="wr-ai-annot-accept" onClick={() => { acceptAiRephrase(); setPopup(null); setAiAnnotResult(null); window.getSelection()?.removeAllRanges() }}>Apply Correction</button>
                  </div>
                )}
                {aiAnnotResult.comment && aiAnnotResult.rephrase && (
                  <button className="wr-ai-annot-both" onClick={acceptAiBoth}>Apply Both</button>
                )}
                <button className="wr-sel-cancel" onClick={() => { setPopup(null); setAiAnnotResult(null) }}>Dismiss</button>
              </div>
            )}

            {popup && popup.step === 'input' && (
              <div className="wr-sel-popup wr-sel-popup-wide" style={{ left: Math.max(0, popup.x - 60), top: popup.y }} onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}>
                <span className="wr-sel-input-label">{popup.action === 'comment' ? 'Comment' : popup.action === 'insertion' ? 'Insert' : 'Suggestion'}</span>
                <textarea className="wr-sel-input" value={popup.inputValue} onChange={e => { setPopup(p => ({ ...p, inputValue: e.target.value })); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
                  placeholder={popup.action === 'comment' ? 'Add comment...' : popup.action === 'insertion' ? 'Insert text here...' : 'Correct to...'}
                  autoFocus rows={1} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && popup.inputValue.trim()) { e.preventDefault(); confirmPopup() } if (e.key === 'Escape') setPopup(null) }} />
                <div className="wr-sel-input-actions">
                  <button className="wr-sel-confirm" onClick={confirmPopup} disabled={!popup.inputValue.trim()}>Add</button>
                  <button className="wr-sel-cancel" onClick={() => setPopup(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Annotations list */}
          {annotations.length > 0 && (
            <div className="wr-annot-list">
              <div className="wr-annot-list-title">Annotations ({annotations.length})</div>
              {annotations.map(ann => {
                const tool = TOOLS.find(t => t.key === ann.action)
                return (
                  <div key={ann.id} className="wr-annot-item" style={{ '--annot-color': ann.color }}>
                    <span className="wr-annot-item-type">{tool?.icon || '🔤'}</span>
                    <div className="wr-annot-item-body">
                      {ann.text && <span className="wr-annot-item-text">"{ann.text}"</span>}
                      {editingAnnot?.id === ann.id ? (
                        <textarea
                          className="wr-annot-edit-box"
                          value={editingAnnot.value}
                          autoFocus
                          rows={2}
                          onChange={e => setEditingAnnot(c => ({ ...c, value: e.target.value }))}
                          onBlur={saveEditAnnotation}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEditAnnotation() }
                            if (e.key === 'Escape') { e.preventDefault(); setEditingAnnot(null) }
                          }}
                        />
                      ) : (
                        <>
                          {ann.suggestion && <span className="wr-annot-item-suggestion wr-annot-editable" title="Click to reword" onClick={() => startEditAnnotation(ann)}>→ {ann.suggestion}</span>}
                          {ann.comment && <span className="wr-annot-item-suggestion wr-annot-editable" title="Click to reword" onClick={() => startEditAnnotation(ann)}>💬 {ann.comment}</span>}
                          {ann.insertionText && <span className="wr-annot-item-suggestion wr-annot-editable" title="Click to reword" onClick={() => startEditAnnotation(ann)}>➕ {ann.insertionText}</span>}
                        </>
                      )}
                    </div>
                    {wordsField(ann.action) && editingAnnot?.id !== ann.id && (
                      <button className="wr-annot-edit" title="Reword" onClick={() => startEditAnnotation(ann)}>✎</button>
                    )}
                    <button className="wr-annot-remove" onClick={() => removeAnnotation(ann.id)}>✕</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: Rubric */}
        <div className="wr-rubric-col">
          <div className="wr-rubric-heading">Marking Rubric</div>
          {WRITING_RUBRIC.map((cat, ci) => {
            const catState = categories[ci]
            return (
              <div key={cat.key} className="wr-rubric-cat">
                <div className="wr-rubric-cat-header">
                  <span className="wr-rubric-cat-name">{cat.name}</span>
                  {catState.score > 0 && <span className="wr-rubric-cat-badge" style={{ background: SCORE_COLORS[catState.score] }}>{catState.score}/5 — {SCORE_LABELS[catState.score]}</span>}
                </div>
                <div className="wr-rubric-criteria">
                  {cat.criteria.map((cr, j) => <div key={j} className="wr-rubric-criterion">• {cr}</div>)}
                </div>
                <div className="wr-rubric-scores">
                  {[1, 2, 3, 4, 5].map(s => (
                    <button key={s} className={`wr-rubric-score-btn ${catState.score === s ? 'wr-rubric-score-active' : ''}`} style={{ '--score-color': SCORE_COLORS[s] }} onClick={() => setScore(cat.key, s)}>
                      {s}
                    </button>
                  ))}
                </div>
                <textarea className="wr-rubric-comment" value={catState.comment} onChange={e => { setComment(cat.key, e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }} placeholder={`Feedback for ${cat.name.toLowerCase()}...`} rows={2} />
              </div>
            )
          })}

          <div className="wr-overall-section">
            <div className="wr-rubric-cat-name">Overall Comment</div>
            <textarea className="wr-rubric-comment wr-overall-comment" value={overallComment} onChange={e => { setOverallComment(e.target.value); setSaved(false); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }} placeholder="General feedback for the student..." rows={3} />
          </div>

          <button className="wr-ai-btn" onClick={handleAiMark} disabled={aiLoading}>
            {aiLoading ? 'AI is marking...' : 'AI Mark'}
          </button>

          {calibration && (
            <div className="wr-calib">
              <div className="wr-calib-head">
                {calibration.against > 0
                  ? `Marked against ${calibration.against} piece${calibration.against === 1 ? '' : 's'} already marked for this question`
                  : 'Nothing else is marked for this question yet, so there was no standard to compare against'}
              </div>
              {calibration.note && <p className="wr-calib-note">{calibration.note}</p>}
            </div>
          )}

          {inconsistencies.length > 0 && (
            <div className="wr-calib wr-calib-warn">
              <div className="wr-calib-head">
                Marking this one suggests {inconsistencies.length} earlier mark
                {inconsistencies.length === 1 ? '' : 's'} may be out of line
              </div>
              {inconsistencies.map(item => {
                const sub = submissions.find(x => x.attemptId === item.attemptId)
                return (
                  <div key={item.attemptId} className="wr-calib-item">
                    <div className="wr-calib-item-head">
                      <span className="wr-calib-who">{sub?.studentName || 'Another student'}</span>
                      <span className="wr-calib-move">{item.was}/25 → {item.suggestedTotal}/25</span>
                    </div>
                    <p className="wr-calib-reason">{item.reason}</p>
                    <div className="wr-calib-actions">
                      <button className="wr-calib-apply" onClick={() => applyAdjustment(item)}>Rescore</button>
                      <button className="wr-calib-skip" onClick={() => setInconsistencies(prev => prev.filter(i => i.attemptId !== item.attemptId))}>Leave it</button>
                    </div>
                  </div>
                )
              })}
              <p className="wr-calib-foot">Rescoring changes the numbers only. Your comments on that piece stay as written.</p>
            </div>
          )}

          {!saved ? (
            <button className="wr-save-btn" onClick={handleSave} disabled={saving || !allScored}>
              {saving ? 'Saving...' : allScored ? 'Save Marks' : 'Score all 5 categories to save'}
            </button>
          ) : (
            <div className="wr-saved-confirm">
              <div className="wr-saved-banner">✓ Marks Saved</div>
              <button className="wr-done-btn" onClick={() => { setActiveSubmission(null); setRefresh(r => r + 1) }}>Done — Back to Queue</button>
              <button className="wr-continue-btn" onClick={() => setSaved(false)}>Continue Editing</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default WritingReview
