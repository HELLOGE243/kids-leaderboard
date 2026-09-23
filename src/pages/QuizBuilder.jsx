import QuestionTagBar from '../components/QuestionTagBar.jsx'
import BulkTagPanel from '../components/BulkTagPanel.jsx'
import { extractTabLabel } from '../utils/extractLabel.js'
import { useState, useRef, useEffect } from 'react'
import {
  getClassesForOrg,
  getTopicsForClass,
  createTopic,
  updateTopic,
  deleteTopic,
  getQuizzesForTopic,
  createQuiz,
  deleteQuiz,
  updateQuiz,
  getAttemptsForQuiz,
  deleteQuizAttempt,
  getStudentById,
  reorderTopics,
  getTestEventsForClass,
  importQuizzesFromJSON,
  importQuizSetsFromPDF,
  getImportedQuizSets,
  getAssignedQuizSetIds,
  getImportedQuizSet,
  updateImportedQuizSet,
  newQuestionId,
  deleteImportedQuizSet,
  mergeImportedQuizSets,
  getLastImportBatch,
  undoLastImport,
  getQuizFolders,
  createQuizFolder,
  renameQuizFolder,
  deleteQuizFolder,
  getFolderPath,
  getUnassignedQuestions,
  deleteUnassignedQuestion,
  clearUnassignedQuestions,
  createQuizFromUnassigned,
  getQuestionReports,
  resolveQuestionReport,
  getExplanationReports,
  resolveExplanationReport,
  onDataChange,
  fullName,
  changedAnswerKeys,
  previewRemark,
  applyRemark,
  preloadAllStudents,
} from '../data/store.js'
import { extractTextFromPDF, processWithAI, parseBookletMeta, getPDFPageCount } from '../utils/pdfImport.js'
import { RichTextEditor, RichText } from '../components/RichTextEditor.jsx'
import { generateExplanation, parseExplanation, serializeExplanation } from '../utils/aiChat.js'
import { resolveImages, extractAndStoreImages } from '../data/imageStore.js'
import { getLastWriteErrors, getChunkSizes } from '../data/firebase.js'

const QUESTION_TYPES = [
  { value: 'multiple-choice', label: 'MC' },
  { value: 'multi-description', label: 'Multi Desc' },
  { value: 'dropdown-cloze', label: 'Cloze' },
  { value: 'drag-sentence', label: 'Drag Sentences' },
  { value: 'drag-summary', label: 'Drag Summaries' },
  { value: 'multi-matching', label: 'Matching' },
  { value: 'free-writing', label: 'Free Write' },
]

function emptyQuestion(type = 'multiple-choice') {
  const q = { type, text: '', prompt: '', options: ['', '', '', '', '', '', '', ''], correctIndex: 0, expGeneral: '', expOptions: {}, videoUrl: '' }
  if (type === 'multi-description') q.descriptions = [{ title: 'Tab A', content: '' }, { title: 'Tab B', content: '' }]
  if (type === 'dropdown-cloze') q.blanks = [{ options: ['', '', '', ''], correctIndex: 0 }]
  if (type === 'drag-sentence' || type === 'drag-summary') { q.summaryOptions = ['', '', '', '', '', '', '']; q.correctOrder = [0, 1, 2, 3, 4, 5] }
  if (type === 'multi-matching') { q.descriptions = [{ title: 'Tab A', content: '' }, { title: 'Tab B', content: '' }, { title: 'Tab C', content: '' }, { title: 'Tab D', content: '' }]; q.matchQuestions = [{ question: '', correctExtract: 0 }] }
  return q
}

function emptyQuestions() {
  return Array.from({ length: 15 }, emptyQuestion)
}

function QuizBuilder({ orgId, onBack, initialEditQuizId, onSave }) {
  const [refresh, setRefresh] = useState(0)
  const forceRefresh = () => setRefresh((r) => r + 1)

  const classes = getClassesForOrg(orgId)
  const [activeClass, setActiveClass] = useState(null)
  const [activeTerm, setActiveTerm] = useState(null)
  const [activeTopic, setActiveTopic] = useState(null)
  const [newTopicName, setNewTopicName] = useState('')
  const [newTopicTerm, setNewTopicTerm] = useState('')
  const [editingQuiz, setEditingQuiz] = useState(null)
  const [editingImported, setEditingImported] = useState(null)
  const [quizQuestions, setQuizQuestions] = useState(emptyQuestions())
  const [quizNumber, setQuizNumber] = useState(1)
  const [optionCount, setOptionCount] = useState(4)
  const [timeLimit, setTimeLimit] = useState(10)
  const [unlockEventId, setUnlockEventId] = useState('')
  const [lockSearch, setLockSearch] = useState('')
  const [lockDropOpen, setLockDropOpen] = useState(false)
  const [currentEditQ, setCurrentEditQ] = useState(0)
  const [showBulkTag, setShowBulkTag] = useState(false)
  // Re-marking offer after an answer key changed.
  const [remark, setRemark] = useState(null)
  const [remarkDone, setRemarkDone] = useState(null)
  // Set ids offered for tagging straight after an import.
  const [tagAfterImport, setTagAfterImport] = useState(null)
  const [showEditSettings, setShowEditSettings] = useState(false)
  const [activeDescTab, setActiveDescTab] = useState(0)
  const [confirmAction, setConfirmAction] = useState(null)
  const [viewScoresQuiz, setViewScoresQuiz] = useState(null)
  const [scoreSort, setScoreSort] = useState({ col: 'name', asc: true })
  const [isSaving, setIsSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateProgress, setGenerateProgress] = useState({ done: 0, total: 0 })
  const [importSearch, setImportSearch] = useState('')
  const [importSort, setImportSort] = useState({ col: 'name', asc: true })
  const [currentFolderId, setCurrentFolderId] = useState(null)
  const [renamingFolder, setRenamingFolder] = useState(null)
  const [renamingText, setRenamingText] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [dragOverFolder, setDragOverFolder] = useState(null)
  const [mergeTarget, setMergeTarget] = useState(null)
  const [importProgress, setImportProgress] = useState(null)
  const [selectedHomework, setSelectedHomework] = useState(new Set())
  const [pendingTypeChange, setPendingTypeChange] = useState(null)
  const [pdfProgress, setPdfProgress] = useState('')
  const [pdfReviewFlags, setPdfReviewFlags] = useState(null)
  const [pdfPagePrompt, setPdfPagePrompt] = useState(null)
  const [importReport, setImportReport] = useState(null)
  const [showUnassigned, setShowUnassigned] = useState(false)
  const [selectedUnassigned, setSelectedUnassigned] = useState(new Set())
  const [unassignedQuizName, setUnassignedQuizName] = useState('')
  const [showReports, setShowReports] = useState(false)
  const dragItem = useRef(null)
  const dragOver = useRef(null)
  const fileInputRef = useRef(null)
  const pdfInputRef = useRef(null)
  const lockDropRef = useRef(null)

  useEffect(() => {
    if (!lockDropOpen) return
    const handler = (e) => { if (lockDropRef.current && !lockDropRef.current.contains(e.target)) setLockDropOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [lockDropOpen])

  useEffect(() => {
    if (initialEditQuizId) {
      const set = getImportedQuizSet(initialEditQuizId)
      if (set) startEditImported(set)
    }
  }, [])

  const activeClassData = classes.find((c) => c.id === activeClass)
  const allTopics = activeClass ? getTopicsForClass(activeClass) : []
  const topics = activeTerm ? allTopics.filter((t) => t.term === activeTerm) : allTopics
  const activeTopicData = topics.find((t) => t.id === activeTopic)
  const quizzes = activeTopic ? getQuizzesForTopic(activeTopic) : []
  const assignedIds = getAssignedQuizSetIds()
  const allImported = getImportedQuizSets()
  const importedSets = getImportedQuizSets(activeTerm)
  const quizFolders = getQuizFolders(orgId)
  const unassignedQs = getUnassignedQuestions()
  const classEvents = activeClass ? getTestEventsForClass(activeClass) : []

  function handleDragStartQuiz(e, setId, selected) {
    const ids = selected && selected.has(setId) ? [...selected] : [setId]
    e.dataTransfer.setData('quizSetIds', JSON.stringify(ids))
    e.dataTransfer.effectAllowed = 'move'
    if (ids.length > 1) e.dataTransfer.setData('text/plain', `Moving ${ids.length} quizzes`)
  }

  function handleDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }

  function toggleSelect(set, selected, setSelected) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(set.id)) next.delete(set.id)
      else next.add(set.id)
      return next
    })
  }

  function toggleSelectAll(ids, selected, setSelected) {
    const allSelected = ids.every(id => selected.has(id))
    setSelected(allSelected ? new Set() : new Set(ids))
  }

  function batchDelete(selected, setSelected) {
    requestConfirm(`Delete ${selected.size} selected quiz set(s)?`, () => {
      for (const id of selected) deleteImportedQuizSet(id)
      setSelected(new Set())
      forceRefresh()
    })
  }

  const termGroups = (() => {
    if (activeTerm) return [{ term: activeTerm, topics: topics }]
    const groups = []
    for (const t of ['T1', 'T2', 'T3', 'T4']) {
      const matched = topics.filter((tp) => tp.term === t)
      if (matched.length > 0) groups.push({ term: t, topics: matched })
    }
    const unassigned = topics.filter((tp) => !tp.term)
    if (unassigned.length > 0) groups.push({ term: '', topics: unassigned })
    return groups
  })()

  function handleAddTopic(e) {
    e.preventDefault()
    if (!newTopicName.trim() || !activeClass) return
    createTopic(newTopicName.trim(), activeClass, newTopicTerm)
    setNewTopicName('')
    forceRefresh()
  }

  function startNewQuiz() {
    const usedNumbers = quizzes.map((q) => q.number)
    let next = 1
    for (let i = 1; i <= 8; i++) {
      if (!usedNumbers.includes(i)) { next = i; break }
    }
    setQuizNumber(next)
    setQuizQuestions(emptyQuestions())
    setOptionCount(4)
    setTimeLimit(10)
    setUnlockEventId('')
    setCurrentEditQ(0)
    setShowEditSettings(false)
    setEditingQuiz('new')
  }

  async function startEditQuiz(quiz) {
    setIsSaving(true)
    const resolved = await Promise.all(
      quiz.questions.map(async (q) => ({ ...q, text: await resolveImages(q.text) }))
    )
    setEditingQuiz(quiz.id)
    setQuizNumber(quiz.number)
    setTimeLimit(quiz.timeLimit || 10)
    setUnlockEventId(quiz.unlockEventId || '')
    const maxOpts = Math.max(...resolved.map((q) => q.options.length))
    setOptionCount(maxOpts)
    setQuizQuestions(resolved.map((q) => {
      const opts = [...(q.options || [])]
      const realCount = opts.filter(o => o).length || 4
      while (opts.length < 8) opts.push('')
      const exp = parseExplanation(q.explanation)
      return { ...q, type: q.type || 'multiple-choice', options: opts, optionCount: Math.max(realCount, 1), expGeneral: exp.general, expOptions: exp.options }
    }))
    setCurrentEditQ(0)
    setShowEditSettings(false)
    setActiveDescTab(0)
    setIsSaving(false)
  }

  async function startEditImported(set) {
    setIsSaving(true)
    const resolved = await Promise.all(
      set.questions.map(async (q) => {
        const result = { ...q, text: await resolveImages(q.text) }
        if (q.descriptions) {
          result.descriptions = await Promise.all(q.descriptions.map(async (d) => ({
            ...d, content: await resolveImages(d.content)
          })))
        }
        return result
      })
    )
    setEditingImported(set.id)
    setQuizQuestions(resolved.map((q) => {
      const opts = [...(q.options || [])]
      const realCount = opts.filter(o => o).length || 4
      while (opts.length < 8) opts.push('')
      const exp = parseExplanation(q.explanation)
      return { ...q, type: q.type || 'multiple-choice', options: opts, optionCount: Math.max(realCount, 1), expGeneral: exp.general, expOptions: exp.options }
    }))
    setCurrentEditQ(0)
    setShowEditSettings(false)
    setIsSaving(false)
  }

  function updateQuestion(idx, field, value) {
    setQuizQuestions((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  function updateOption(qIdx, oIdx, value) {
    setQuizQuestions((prev) => {
      const next = [...prev]
      const opts = [...next[qIdx].options]
      opts[oIdx] = value
      next[qIdx] = { ...next[qIdx], options: opts }
      return next
    })
  }

  function stripHtml(html) {
    return (html || '').replace(/<[^>]*>/g, '').trim()
  }

  async function handleSaveQuiz() {
    setIsSaving(true)
    try {
      const trimmed = await Promise.all(quizQuestions.map(async (q) => {
        const type = q.type || 'multiple-choice'
        const base = {
          // Permanent id: dojo cards, reports and reviews find the question by it.
          id: q.id || newQuestionId(),
          ...(typeof q.number === 'number' ? { number: q.number } : {}),
          ...(q.sourceItems?.length ? { sourceItems: q.sourceItems } : {}),
          ...(q.tags?.length ? { tags: q.tags } : {}),
          type,
          text: await extractAndStoreImages((q.text || '').trim()),
          prompt: (q.prompt || '').trim(),
          explanation: serializeExplanation({ general: q.expGeneral || '', options: q.expOptions || {} }),
          // Without this, saving a quiz set wiped every question's solution video.
          videoUrl: (q.videoUrl || '').trim(),
        }
        if (type === 'multiple-choice' || type === 'multi-description') {
          const qOptCount = q.optionCount || optionCount
          base.options = (q.options || []).slice(0, qOptCount).map((o) => o.trim())
          base.correctIndex = q.correctIndex >= qOptCount ? 0 : q.correctIndex
        }
        if (type === 'multi-description' || type === 'multi-matching') {
          base.descriptions = await Promise.all((q.descriptions || []).map(async (d) => ({
            title: d.title,
            content: await extractAndStoreImages((d.content || '').trim()),
          })))
        }
        if (type === 'dropdown-cloze') base.blanks = q.blanks || []
        if (type === 'drag-sentence' || type === 'drag-summary') {
          base.summaryOptions = q.summaryOptions || []
          base.correctOrder = q.correctOrder || []
          // Imported CleverSpace gap numbers (e.g. 23-28) label the gaps; keep them.
          if (q.gapNumbers) base.gapNumbers = q.gapNumbers
          if (q.dragType) base.dragType = q.dragType
        }
        if (type === 'multi-matching') base.matchQuestions = q.matchQuestions || []
        return base
      }))
      // Blank questions are dropped only if newly added. Removing an existing
      // one would shift every later question and misalign past answers.
      const valid = trimmed.filter((q, i) => {
        if (quizQuestions[i]?.id) return true
        const t = q.type || 'multiple-choice'
        if (t === 'multiple-choice') return stripHtml(q.text) && q.options.some((o) => o)
        if (t === 'multi-description') return q.descriptions?.some((d) => stripHtml(d.content)) && q.options.some((o) => o)
        if (t === 'dropdown-cloze') return stripHtml(q.text) && q.blanks?.length > 0
        if (t === 'drag-sentence' || t === 'drag-summary') return stripHtml(q.text) && q.summaryOptions?.some((o) => o.trim())
        if (t === 'multi-matching') return q.descriptions?.some((d) => stripHtml(d.content)) && q.matchQuestions?.some((m) => m.question.trim())
        if (t === 'free-writing') return stripHtml(q.text) || stripHtml(q.prompt)
        return stripHtml(q.text)
      })

      if (editingImported) {
        // Work already submitted was marked against the old answers; offer to
        // mark it again when a correct answer actually changed.
        const before = getImportedQuizSet(editingImported)?.questions || []
        const keyChanges = changedAnswerKeys(before, valid)
        updateImportedQuizSet(editingImported, { questions: valid })
        const setId = editingImported
        setEditingImported(null)
        setPdfReviewFlags(null)
        forceRefresh()
        if (keyChanges.length) {
          await preloadAllStudents()
          const preview = previewRemark(setId)
          const affected = preview?.rows.filter((r) => r.delta !== 0) || []
          if (affected.length) setRemark({ setId, keyChanges: keyChanges.length, ...preview, affected })
        }
        if (onSave) onSave()
        return
      }

      if (valid.length === 0) return
      if (editingQuiz === 'new') {
        createQuiz(activeTopic, activeClass, quizNumber, valid, timeLimit, unlockEventId || null)
      } else {
        updateQuiz(editingQuiz, { number: quizNumber, questions: trimmed.filter((q) => stripHtml(q.text)), timeLimit, unlockEventId: unlockEventId || null })
      }
      setEditingQuiz(null)
      forceRefresh()
      if (onSave) onSave()
    } finally {
      setIsSaving(false)
    }
  }

  async function handlePopulateExplanations() {
    const validQuestions = quizQuestions
      .map((q, i) => ({ q, i }))
      .filter(({ q }) => {
        const t = q.type || 'multiple-choice'
        if (t !== 'multiple-choice' && t !== 'multi-description') return false
        const oc = q.optionCount || optionCount
        return stripHtml(q.text) && q.options.slice(0, oc).some((o) => o.trim())
      })
    if (validQuestions.length === 0) return

    setQuizQuestions((prev) => prev.map((q, i) =>
      validQuestions.some((v) => v.i === i) ? { ...q, expGeneral: '', expOptions: {} } : q
    ))

    setIsGenerating(true)
    setGenerateProgress({ done: 0, total: validQuestions.length })

    for (let n = 0; n < validQuestions.length; n++) {
      const { q, i } = validQuestions[n]
      const oc = q.optionCount || optionCount
      const result = await generateExplanation({
        questionText: stripHtml(q.text),
        options: q.options.slice(0, oc).map((o) => o.trim()),
        correctIndex: q.correctIndex >= oc ? 0 : q.correctIndex,
      })
      setGenerateProgress({ done: n + 1, total: validQuestions.length })
      setQuizQuestions((prev) => {
        const next = [...prev]
        next[i] = { ...next[i], expGeneral: result.general, expOptions: result.options }
        return next
      })
    }

    setIsGenerating(false)
  }

  function requestConfirm(message, onConfirm) {
    setConfirmAction({ message, onConfirm })
  }

  function handleResetAttempt(quizId, studentId, studentName) {
    requestConfirm(`Reset quiz attempt for "${studentName}"? They will be able to retake this quiz.`, () => {
      deleteQuizAttempt(quizId, studentId)
      forceRefresh()
    })
  }

  // Accepts several files at once (e.g. every cleverspace-part-NNN.json from the
  // master extractor) and imports them one after another, in name order.
  async function handleImportJSON(e) {
    const files = [...(e.target.files || [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    e.target.value = ''
    for (const file of files) {
      await importOneJSONFile(file)
    }
  }

  async function importOneJSONFile(file) {
    if (!file) return
    try {
      setImportProgress({ done: 0, total: 0, file: file.name })
      const text = await file.text()
      const json = JSON.parse(text)
      const arr = Array.isArray(json) ? json : json.quizzes ? json.quizzes.flatMap((q) => q.questions.map((qu) => ({ ...qu, title: qu.title, description: qu.description, answers: qu.answers }))) : []
      const totalQuestions = arr.length
      const result = await importQuizzesFromJSON(arr, (done, total) => {
        setImportProgress({ done, total, file: file.name })
      })
      setImportProgress(null)
      forceRefresh()
      const assignedCount = result.added.reduce((sum, s) => sum + s.questions.length, 0)
      const writeErrors = getLastWriteErrors()
      const chunkSizes = getChunkSizes()
      const saveErrors = writeErrors.map((e) => `Save failed: ${e.chunk} chunk (${(e.size / 1024).toFixed(0)} KB) — ${e.error}`)
      // Functional update: several files import in one handler, so a captured
      // `importReport` would be stale and only the last file would be counted.
      setImportReport((current) => {
        const prev = current || { files: [], totalAssigned: 0, totalUnassigned: 0, totalQuestions: 0, errors: [], unmatchedTitles: [], duplicates: [] }
        return {
          files: [...prev.files, file.name],
          totalAssigned: prev.totalAssigned + assignedCount,
          totalUnassigned: prev.totalUnassigned + result.unassignedCount,
          totalQuestions: prev.totalQuestions + totalQuestions,
          totalSets: (prev.totalSets || 0) + result.added.length,
          errors: [...prev.errors, ...saveErrors],
          unmatchedTitles: [...(prev.unmatchedTitles || []), ...result.unmatchedTitles],
          duplicates: [...(prev.duplicates || []), ...result.duplicates],
          setIds: [...new Set([...(prev.setIds || []), ...result.added.map((x) => x.id)])],
          typeCounts: Object.entries(result.typeCounts || {}).reduce((acc, [k, v]) => ({ ...acc, [k]: (acc[k] || 0) + v }), { ...(prev.typeCounts || {}) }),
          flagged: [...(prev.flagged || []), ...(result.flagged || [])],
          chunkSizes,
        }
      })
    } catch (err) {
      setImportProgress(null)
      forceRefresh()
      setImportReport((current) => {
        const prev = current || { files: [], totalAssigned: 0, totalUnassigned: 0, totalQuestions: 0, errors: [] }
        return { ...prev, files: [...prev.files, file.name], errors: [...prev.errors, `${file.name}: ${err.message}`] }
      })
    }
  }

  async function handleImportPDF(e) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    try {
      setPdfProgress('Counting pages...')
      const totalPages = await getPDFPageCount(file)
      setPdfProgress('')
      setPdfPagePrompt({ file, totalPages, from: 1, to: totalPages })
    } catch (err) {
      setPdfProgress('')
      alert('Could not read PDF: ' + err.message)
    }
  }

  async function runPDFImport(file, pageRange) {
    const meta = parseBookletMeta(file.name)
    setPdfProgress('Reading PDF...')
    try {
      const pages = await extractTextFromPDF(file, setPdfProgress, pageRange)
      if (pages.every(p => !p.text.trim())) {
        setPdfProgress('')
        alert('Could not extract text from this PDF. It may be image-only.')
        return
      }
      const sections = await processWithAI(pages, setPdfProgress)
      setPdfProgress('')
      if (!Array.isArray(sections) || sections.length === 0) {
        alert('AI could not find any questions in this PDF.')
        return
      }
      const added = importQuizSetsFromPDF(sections, meta)
      forceRefresh()
      if (added.length === 0) {
        alert('No questions found to import.')
        return
      }
      const firstSet = added[0]
      const flaggedIndices = firstSet.questions
        .map((q, i) => q.needsReview ? i : -1)
        .filter(i => i >= 0)
      if (flaggedIndices.length > 0) {
        setPdfReviewFlags({ count: flaggedIndices.length, indices: flaggedIndices, total: added.reduce((s, a) => s + a.questions.length, 0), sets: added.length })
      }
      startEditImported(firstSet)
    } catch (err) {
      setPdfProgress('')
      alert('PDF import error: ' + err.message)
    }
  }

  // ===== SCORES VIEW =====
  if (viewScoresQuiz) {
    const attempts = getAttemptsForQuiz(viewScoresQuiz.id)
    return (
      <div className="page" style={{ maxWidth: 800, margin: '0 auto' }}>
        <div className="header">
          <h1 className="pixel-title">Quiz {viewScoresQuiz.number} — Scores</h1>
          <button className="btn-logout" onClick={() => { setViewScoresQuiz(null); forceRefresh() }}>Back</button>
        </div>

        {attempts.length === 0 ? (
          <div className="card mt-16">
            <p className="text-dim">No students have completed this quiz yet.</p>
          </div>
        ) : (() => {
          const rows = attempts.map((att) => {
            const student = getStudentById(att.studentId)
            return { ...att, studentName: student ? fullName(student) : 'Unknown', pct: Math.round((att.score / att.total) * 100) }
          })
          const dir = scoreSort.asc ? 1 : -1
          rows.sort((a, b) => {
            if (scoreSort.col === 'name') return dir * a.studentName.localeCompare(b.studentName)
            if (scoreSort.col === 'score') return dir * (a.score - b.score)
            if (scoreSort.col === 'pct') return dir * (a.pct - b.pct)
            if (scoreSort.col === 'date') return dir * (new Date(a.date) - new Date(b.date))
            return 0
          })
          function toggleSort(col) {
            setScoreSort((prev) => prev.col === col ? { col, asc: !prev.asc } : { col, asc: true })
          }
          const arrow = (col) => scoreSort.col === col ? (scoreSort.asc ? ' ▲' : ' ▼') : ''
          return (
          <div className="card mt-16">
            <table className="table w-full">
              <thead>
                <tr>
                  <th className="sortable-th" style={{ textAlign: 'left' }} onClick={() => toggleSort('name')}>Student{arrow('name')}</th>
                  <th className="sortable-th" style={{ textAlign: 'center', width: 90 }} onClick={() => toggleSort('score')}>Score{arrow('score')}</th>
                  <th className="sortable-th" style={{ textAlign: 'center', width: 70 }} onClick={() => toggleSort('pct')}>%{arrow('pct')}</th>
                  <th className="sortable-th" style={{ textAlign: 'center', width: 120 }} onClick={() => toggleSort('date')}>Date{arrow('date')}</th>
                  <th style={{ textAlign: 'center', width: 80 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((att) => (
                  <tr key={att.id}>
                    <td>{att.studentName}</td>
                    <td style={{ textAlign: 'center', color: att.pct >= 70 ? 'var(--success)' : att.pct >= 40 ? 'var(--warning)' : 'var(--danger)' }}>
                      {att.score}/{att.total}
                    </td>
                    <td style={{ textAlign: 'center' }}>{att.pct}%</td>
                    <td style={{ textAlign: 'center', fontSize: '0.75rem' }}>{new Date(att.date).toLocaleDateString()}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn btn-danger btn-small"
                        style={{ padding: '3px 8px', fontSize: '0.4rem' }}
                        onClick={() => handleResetAttempt(viewScoresQuiz.id, att.studentId, att.studentName)}
                      >
                        Reset
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )
        })()}

        {confirmAction && (
          <div className="neon-overlay">
            <div className="neon-popup" style={{ maxWidth: 400 }}>
              <p className="neon-popup-text" style={{ fontSize: '0.7rem' }}>{confirmAction.message}</p>
              <div className="neon-popup-actions" style={{ marginTop: 16 }}>
                <button className="btn btn-danger" onClick={() => { confirmAction.onConfirm(); setConfirmAction(null) }}>Yes, Reset</button>
                <button className="btn btn-outline" onClick={() => setConfirmAction(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ===== QUIZ-TAKING STYLE EDITOR =====
  if (editingQuiz || editingImported) {
    const total = quizQuestions.length
    const q = quizQuestions[currentEditQ] || emptyQuestion()
    const hasContent = q.text && stripHtml(q.text)
    const isImported = !!editingImported
    const qType = q.type || 'multiple-choice'
    function changeQuestionType(newType) {
      if (newType === qType) return
      const hasOptions = q.options?.some(o => o.trim())
      const hasDesc = q.descriptions?.some(d => stripHtml(d.content))
      const hasBlanks = q.blanks?.some(b => b.options.some(o => o.trim()))
      const hasSummary = q.summaryOptions?.some(o => o.trim())
      const hasMatch = q.matchQuestions?.some(m => m.question.trim())
      if (hasOptions || hasDesc || hasBlanks || hasSummary || hasMatch) {
        setPendingTypeChange(newType)
        return
      }
      applyTypeChange(newType)
    }
    function applyTypeChange(newType) {
      setQuizQuestions(prev => {
        const next = [...prev]
        const old = next[currentEditQ]
        const fresh = emptyQuestion(newType)
        fresh.text = old.text || ''
        fresh.prompt = old.prompt || ''
        fresh.expGeneral = old.expGeneral || ''
        fresh.expOptions = old.expOptions || {}
        fresh.videoUrl = old.videoUrl || ''
        if (old.options) fresh.options = [...old.options]
        if (old.optionCount) fresh.optionCount = old.optionCount
        fresh.correctIndex = old.correctIndex || 0
        if (old.descriptions && fresh.descriptions) {
          fresh.descriptions = old.descriptions.map(d => ({ ...d }))
        } else if (old.descriptions) {
          fresh.descriptions = old.descriptions.map(d => ({ ...d }))
        }
        if (old.blanks && fresh.blanks) fresh.blanks = old.blanks.map(b => ({ ...b, options: [...b.options] }))
        if (old.summaryOptions && fresh.summaryOptions) fresh.summaryOptions = [...old.summaryOptions]
        if (old.correctOrder && fresh.correctOrder) fresh.correctOrder = [...old.correctOrder]
        if (old.dragType) fresh.dragType = old.dragType
        if (old.matchQuestions && fresh.matchQuestions) fresh.matchQuestions = old.matchQuestions.map(m => ({ ...m }))
        next[currentEditQ] = fresh
        return next
      })
      setActiveDescTab(0)
      setPendingTypeChange(null)
    }
    const topicLabel = activeTopicData ? activeTopicData.name : ''
    const editorTitle = isImported
      ? (getImportedQuizSet(editingImported)?.friendlyTitle || 'Edit Quiz')
      : `${topicLabel} — Quiz ${quizNumber} of ${Math.max(quizzes.length, quizNumber)}`

    return (
      <div className="qt-backdrop" onClick={(e) => e.stopPropagation()}>
        <div className="qt-panel" style={{ userSelect: 'auto' }}>
          {pdfReviewFlags && (
            <div className="pdf-editor-banner">
              <span>PDF Import: {pdfReviewFlags.total} questions across {pdfReviewFlags.sets} quiz set(s). </span>
              <strong>{pdfReviewFlags.count} flagged for review</strong>
              <span style={{ marginLeft: 8, fontSize: '0.55rem' }}>
                (Q {pdfReviewFlags.indices.map(i => i + 1).join(', ')})
              </span>
              <button className="btn btn-small btn-outline" style={{ marginLeft: 'auto', fontSize: '0.4rem', padding: '2px 8px' }} onClick={() => {
                if (pdfReviewFlags.indices.length > 0) setCurrentEditQ(pdfReviewFlags.indices[0])
              }}>Jump to first</button>
              <button className="btn btn-small btn-outline" style={{ fontSize: '0.4rem', padding: '2px 8px', opacity: 0.6 }} onClick={() => setPdfReviewFlags(null)}>Dismiss</button>
            </div>
          )}
          {/* Top bar */}
          <div className="qt-topbar">
            <div className="qt-timer-area" style={{ minWidth: 'auto' }}>
              <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>{editorTitle}</span>
            </div>
            <div className="qt-center-group">
              <div className="qt-question-indicator">
                Question <strong>{currentEditQ + 1}</strong> of <strong>{total}</strong>
              </div>
              <div className="qt-grid-trigger-wrap">
                <button className="qt-grid-trigger" onClick={(e) => { e.stopPropagation(); setShowEditSettings(!showEditSettings) }} title="Jump to question">
                  {[...Array(6)].map((_, i) => <span key={i} className="qt-grid-sq" />)}
                </button>
                {showEditSettings && (
                  <div className="qt-grid-dropdown" onClick={(e) => e.stopPropagation()}>
                    {quizQuestions.map((qq, i) => (
                      <button
                        key={i}
                        className={`qt-grid-btn ${i === currentEditQ ? 'qt-grid-btn-current' : ''} ${stripHtml(qq.text) ? 'qt-grid-btn-answered' : ''} ${qq.needsReview ? 'qt-grid-btn-flagged' : ''}`}
                        onClick={() => { setCurrentEditQ(i); setShowEditSettings(false) }}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={qType} onChange={(e) => changeQuestionType(e.target.value)} className="select" style={{ width: 100, fontSize: '0.65rem', padding: '4px' }} title="Question type">
                {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {!isImported && (
                <>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={timeLimit}
                    onChange={(e) => setTimeLimit(Math.max(1, Math.min(180, parseInt(e.target.value, 10) || 1)))}
                    className="input"
                    style={{ width: 52, fontSize: '0.65rem', padding: '4px', textAlign: 'center' }}
                    title="Time limit (minutes)"
                  />
                  <span style={{ fontSize: '0.55rem', color: 'var(--text-dim)', marginLeft: -4 }}>min</span>
                  <div ref={lockDropRef} style={{ position: 'relative', minWidth: 260 }}>
                    <div
                      className="input"
                      style={{ fontSize: '0.65rem', padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden' }}
                      onClick={() => { setLockDropOpen(!lockDropOpen); setLockSearch('') }}
                      title="Unlock after event"
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                        {unlockEventId ? (classEvents.find(ev => ev.id === unlockEventId)?.name || 'Unknown event') : '🔓 No lock'}
                      </span>
                      <span style={{ fontSize: '0.5rem', opacity: 0.5 }}>▼</span>
                    </div>
                    {lockDropOpen && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, marginTop: 2, maxHeight: 200, display: 'flex', flexDirection: 'column' }}>
                        <input
                          autoFocus
                          value={lockSearch}
                          onChange={(e) => setLockSearch(e.target.value)}
                          placeholder="Search events..."
                          className="input"
                          style={{ fontSize: '0.6rem', padding: '4px 8px', margin: 4, borderRadius: 4 }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                          <div
                            style={{ padding: '6px 8px', fontSize: '0.6rem', cursor: 'pointer', color: 'var(--success)' }}
                            className="lock-drop-item"
                            onClick={() => { setUnlockEventId(''); setLockDropOpen(false) }}
                          >🔓 No lock</div>
                          {classEvents
                            .filter(ev => !lockSearch.trim() || ev.name.toLowerCase().includes(lockSearch.toLowerCase()))
                            .map(ev => (
                              <div
                                key={ev.id}
                                style={{ padding: '6px 8px', fontSize: '0.6rem', cursor: 'pointer', background: ev.id === unlockEventId ? 'rgba(233,69,96,0.15)' : 'transparent' }}
                                className="lock-drop-item"
                                onClick={() => { setUnlockEventId(ev.id); setLockDropOpen(false) }}
                              >🔒 {ev.name}{ev.term ? ` (${ev.term}${ev.week ? ` ${ev.week}` : ''})` : ''}</div>
                            ))
                          }
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <QuestionTagBar
            questions={quizQuestions}
            currentIdx={currentEditQ}
            onChangeTags={(i, tags) => updateQuestion(i, 'tags', tags)}
            quizSet={isImported ? getImportedQuizSet(editingImported) : null}
          />

          {/* Two-panel content area */}
          <div className="qt-split">
            {/* ========== LEFT PANEL ========== */}
            <div className="qt-split-left qe-left-edit" style={{ flex: 2 }}>

              {q.needsReview && (
                <div className="pdf-review-label">
                  <span>&#9888; Flagged for review</span>
                  {q.reviewReason && <span className="pdf-review-reason">{q.reviewReason}</span>}
                  <button className="btn btn-small btn-outline" style={{ marginLeft: 'auto', fontSize: '0.4rem', padding: '2px 6px' }} onClick={() => updateQuestion(currentEditQ, 'needsReview', false)}>Clear flag</button>
                </div>
              )}

              {/* --- MC / Drag-Drop / Free-Writing: single text editor --- */}
              {(qType === 'multiple-choice' || qType === 'drag-sentence' || qType === 'drag-summary' || qType === 'free-writing') && (
                <div className="qe-question-area">
                  <RichTextEditor
                    key={`text-${currentEditQ}`}
                    value={q.text}
                    onChange={(html) => updateQuestion(currentEditQ, 'text', html)}
                    placeholder={qType === 'free-writing' ? 'Stimulus / passage for the student...' : `Type question ${currentEditQ + 1} here...`}
                  />
                </div>
              )}

              {/* --- Cloze: text editor with blank instructions --- */}
              {qType === 'dropdown-cloze' && (
                <div className="qe-question-area">
                  <p style={{ fontSize: '0.6rem', color: '#888', marginBottom: 6 }}>
                    Use <code style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: 3, fontSize: '0.65rem' }}>___</code> (three underscores) to mark each blank in the passage.
                  </p>
                  <RichTextEditor
                    key={`text-cloze-${currentEditQ}`}
                    value={q.text}
                    onChange={(html) => updateQuestion(currentEditQ, 'text', html)}
                    placeholder="Type the cloze passage here, use ___ for each blank..."
                  />
                  {q.text && q.text.includes('___') && (() => {
                    let blankNum = 0
                    const preview = q.text.replace(/___/g, () => {
                      blankNum++
                      return `<span style="display:inline-block;background:#0f3460;border:2px solid var(--accent);border-radius:4px;padding:2px 10px;margin:0 2px;font-family:var(--font-pixel);font-size:0.55rem;color:var(--accent);vertical-align:middle;">Blank ${blankNum} ▼</span>`
                    })
                    return (
                      <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(15,52,96,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius)', fontSize: '0.8rem', lineHeight: 1.8 }}>
                        <p style={{ fontSize: '0.5rem', color: '#888', marginBottom: 4, fontFamily: 'var(--font-pixel)' }}>Preview — {blankNum} blank{blankNum !== 1 ? 's' : ''} detected</p>
                        <div dangerouslySetInnerHTML={{ __html: preview }} />
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* --- Multi-Description / Multi-Matching: tabbed editors --- */}
              {(qType === 'multi-description' || qType === 'multi-matching') && (
                <div className="qe-question-area">
                  <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {(q.descriptions || []).map((d, di) => (
                      <button
                        key={di}
                        className={`btn btn-small ${activeDescTab === di ? '' : 'btn-outline'}`}
                        style={{ fontSize: '0.6rem', padding: '4px 10px' }}
                        onClick={() => setActiveDescTab(di)}
                      >
                        {extractTabLabel(d.title, di)}
                      </button>
                    ))}
                    <button
                      className="btn btn-small btn-outline"
                      style={{ fontSize: '0.45rem', padding: '4px 8px' }}
                      onClick={() => {
                        const descs = [...(q.descriptions || [])]
                        const letter = String.fromCharCode(65 + descs.length)
                        descs.push({ title: `Tab ${letter}`, content: '' })
                        updateQuestion(currentEditQ, 'descriptions', descs)
                      }}
                    >+ Tab</button>
                    {(q.descriptions || []).length > 2 && (
                      <button
                        className="btn btn-small"
                        style={{ fontSize: '0.45rem', padding: '4px 8px', background: 'var(--danger)' }}
                        onClick={() => {
                          const descs = [...(q.descriptions || [])]
                          descs.pop()
                          updateQuestion(currentEditQ, 'descriptions', descs)
                          if (activeDescTab >= descs.length) setActiveDescTab(descs.length - 1)
                        }}
                      >- Tab</button>
                    )}
                  </div>
                  <input
                    value={(q.descriptions || [])[activeDescTab]?.title || ''}
                    onChange={(e) => {
                      const descs = [...(q.descriptions || [])]
                      descs[activeDescTab] = { ...descs[activeDescTab], title: e.target.value }
                      updateQuestion(currentEditQ, 'descriptions', descs)
                    }}
                    placeholder="Tab title..."
                    className="qe-option-input"
                    style={{ fontSize: '0.75rem', marginBottom: 6 }}
                  />
                  <RichTextEditor
                    key={`desc-${currentEditQ}-${activeDescTab}`}
                    value={(q.descriptions || [])[activeDescTab]?.content || ''}
                    onChange={(html) => {
                      const descs = [...(q.descriptions || [])]
                      descs[activeDescTab] = { ...descs[activeDescTab], content: html }
                      updateQuestion(currentEditQ, 'descriptions', descs)
                    }}
                    placeholder={`Content for ${(q.descriptions || [])[activeDescTab]?.title || 'this tab'}...`}
                  />
                </div>
              )}

              {/* --- Explanation area (all types) --- */}
              <div className="qe-explain-area">
                <p style={{ fontSize: '0.7rem', color: '#888', marginBottom: 4 }}>General explanation</p>
                <RichTextEditor
                  key={`exp-general-${currentEditQ}`}
                  value={q.expGeneral || ''}
                  onChange={(html) => updateQuestion(currentEditQ, 'expGeneral', html)}
                  placeholder="Overall concept explanation..."
                />
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.7rem', color: '#888', whiteSpace: 'nowrap' }}>Solution video</span>
                  <input
                    value={q.videoUrl || ''}
                    onChange={(e) => updateQuestion(currentEditQ, 'videoUrl', e.target.value)}
                    placeholder="YouTube URL..."
                    className="qe-option-input"
                    style={{ fontSize: '0.8rem' }}
                  />
                </div>
              </div>
            </div>

            <div className="qt-split-divider" />

            {/* ========== RIGHT PANEL ========== */}
            <div className="qt-split-right">

              {/* --- MC / Multi-Description: prompt + radio options --- */}
              {(qType === 'multiple-choice' || qType === 'multi-description') && (<>
                <div className="qt-prompt-area">
                  <RichTextEditor
                    key={`prompt-${currentEditQ}`}
                    value={q.prompt || ''}
                    onChange={(html) => updateQuestion(currentEditQ, 'prompt', html)}
                    placeholder="Question statement (shown above options)..."
                  />
                </div>
                <div className="qe-options-container">
                <p className="qe-options-label">Answer Options</p>
                <div className="qt-options">
                  {(() => {
                    const count = q.options ? q.options.filter((o, i) => i < 8 && (o || i < (q.optionCount || optionCount))).length : (q.optionCount || optionCount)
                    const visibleCount = q.optionCount || optionCount
                    return <>
                      {Array.from({ length: visibleCount }, (_, oi) => {
                        const letter = String.fromCharCode(65 + oi)
                        const isCorrect = q.correctIndex === oi
                        return (
                          <div key={oi}>
                            <div className={`qt-option ${isCorrect ? 'qt-option-selected' : ''}`} style={{ cursor: 'default' }}>
                              <span
                                className="qt-option-radio"
                                style={{ cursor: 'pointer' }}
                                onClick={() => updateQuestion(currentEditQ, 'correctIndex', oi)}
                              />
                              <input
                                value={q.options[oi] || ''}
                                onChange={(e) => updateOption(currentEditQ, oi, e.target.value)}
                                placeholder={`Option ${letter}`}
                                className="qe-option-input"
                              />
                            </div>
                            {hasContent && (
                              <div style={{ marginLeft: 64, marginTop: 2, marginBottom: 8 }}>
                                <RichTextEditor
                                  key={`exp-opt-${currentEditQ}-${letter}`}
                                  value={q.expOptions?.[letter] || ''}
                                  onChange={(html) => setQuizQuestions((prev) => {
                                    const next = [...prev]
                                    next[currentEditQ] = { ...next[currentEditQ], expOptions: { ...next[currentEditQ].expOptions, [letter]: html } }
                                    return next
                                  })}
                                  placeholder={`Explanation for ${letter}...`}
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        {visibleCount < 8 && (
                          <button className="btn btn-outline btn-small" style={{ fontSize: '0.5rem', padding: '4px 10px' }} onClick={() => {
                            setQuizQuestions(prev => {
                              const next = [...prev]
                              const opts = [...(next[currentEditQ].options || [])]
                              while (opts.length < visibleCount + 1) opts.push('')
                              next[currentEditQ] = { ...next[currentEditQ], options: opts, optionCount: visibleCount + 1 }
                              return next
                            })
                          }}>+ Option</button>
                        )}
                        {visibleCount > 1 && (
                          <button className="btn btn-small" style={{ fontSize: '0.5rem', padding: '4px 10px', background: 'var(--danger)' }} onClick={() => {
                            setQuizQuestions(prev => {
                              const next = [...prev]
                              const newCount = visibleCount - 1
                              const ci = next[currentEditQ].correctIndex >= newCount ? 0 : next[currentEditQ].correctIndex
                              next[currentEditQ] = { ...next[currentEditQ], optionCount: newCount, correctIndex: ci }
                              return next
                            })
                          }}>- Option</button>
                        )}
                      </div>
                    </>
                  })()}
                </div>
                </div>
              </>)}

              {/* --- Dropdown/Cloze: word banks per blank --- */}
              {qType === 'dropdown-cloze' && (
                <div style={{ overflowY: 'auto', padding: '0 4px' }}>
                  <p style={{ fontSize: '0.7rem', color: '#888', marginBottom: 8 }}>Word bank for each blank</p>
                  {(q.blanks || []).map((blank, bi) => (
                    <div key={bi} style={{ marginBottom: 12, padding: '8px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 'var(--radius)' }}>
                      <p style={{ fontSize: '0.6rem', fontWeight: 'bold', marginBottom: 6, color: 'var(--accent)' }}>Blank {bi + 1}</p>
                      {blank.options.map((opt, oi) => (
                        <div key={oi} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                          <span
                            style={{ cursor: 'pointer', width: 22, height: 22, minWidth: 22, borderRadius: '50%', border: '2px solid', borderColor: blank.correctIndex === oi ? 'var(--success)' : 'rgba(255,255,255,0.3)', background: blank.correctIndex === oi ? 'var(--success)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#1a1a2e', fontWeight: 'bold' }}
                            title={blank.correctIndex === oi ? 'Correct answer' : 'Set as correct'}
                            onClick={() => {
                              const blanks = [...(q.blanks || [])]
                              blanks[bi] = { ...blanks[bi], correctIndex: oi }
                              updateQuestion(currentEditQ, 'blanks', blanks)
                            }}
                          >{blank.correctIndex === oi ? '✓' : ''}</span>
                          <input
                            value={opt}
                            onChange={(e) => {
                              const blanks = [...(q.blanks || [])]
                              const opts = [...blanks[bi].options]
                              opts[oi] = e.target.value
                              blanks[bi] = { ...blanks[bi], options: opts }
                              updateQuestion(currentEditQ, 'blanks', blanks)
                            }}
                            placeholder={`Word/phrase ${oi + 1}`}
                            className="qe-option-input"
                            style={{ flex: 1, fontSize: '0.75rem' }}
                          />
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <button className="btn btn-outline btn-small" style={{ fontSize: '0.4rem', padding: '2px 6px' }} onClick={() => {
                          const blanks = [...(q.blanks || [])]
                          blanks[bi] = { ...blanks[bi], options: [...blanks[bi].options, ''] }
                          updateQuestion(currentEditQ, 'blanks', blanks)
                        }}>+ Option</button>
                        {blank.options.length > 2 && (
                          <button className="btn btn-small" style={{ fontSize: '0.4rem', padding: '2px 6px', background: 'var(--danger)' }} onClick={() => {
                            const blanks = [...(q.blanks || [])]
                            const opts = [...blanks[bi].options]
                            opts.pop()
                            blanks[bi] = { ...blanks[bi], options: opts, correctIndex: Math.min(blanks[bi].correctIndex, opts.length - 1) }
                            updateQuestion(currentEditQ, 'blanks', blanks)
                          }}>- Option</button>
                        )}
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-outline btn-small" style={{ fontSize: '0.5rem', padding: '4px 10px' }} onClick={() => {
                      updateQuestion(currentEditQ, 'blanks', [...(q.blanks || []), { options: ['', '', '', ''], correctIndex: 0 }])
                    }}>+ Blank</button>
                    {(q.blanks || []).length > 1 && (
                      <button className="btn btn-small" style={{ fontSize: '0.5rem', padding: '4px 10px', background: 'var(--danger)' }} onClick={() => {
                        const blanks = [...(q.blanks || [])]
                        blanks.pop()
                        updateQuestion(currentEditQ, 'blanks', blanks)
                      }}>- Blank</button>
                    )}
                  </div>
                </div>
              )}

              {/* --- Drag Sentences / Drag Summaries: options + answer key per gap --- */}
              {/* Answer key is correctOrder[gap] = option index - the same shape the
                  student screen grades against. This editor used to store the inverse
                  (option -> gap), so hand-built drag questions could be marked wrong. */}
              {(qType === 'drag-sentence' || qType === 'drag-summary') && (() => {
                const opts = q.summaryOptions || []
                const order = q.correctOrder || []
                const noun = qType === 'drag-sentence' ? 'Sentence' : 'Summary'
                const letter = (i) => String.fromCharCode(65 + i)
                const setOpts = (next) => {
                  updateQuestion(currentEditQ, 'summaryOptions', next)
                  // Keep the key valid if an option was removed.
                  if (order.some((o) => o >= next.length)) {
                    updateQuestion(currentEditQ, 'correctOrder', order.map((o) => (o >= next.length ? -1 : o)))
                  }
                }
                const setOrder = (next) => updateQuestion(currentEditQ, 'correctOrder', next)
                const gapLabel = (g) => (q.gapNumbers && q.gapNumbers[g] != null ? q.gapNumbers[g] : g + 1)
                return (
                  <div style={{ overflowY: 'auto', padding: '0 4px' }}>
                    <p style={{ fontSize: '0.7rem', color: '#888', marginBottom: 8 }}>{qType === 'drag-sentence' ? 'Sentences' : 'Paragraph summaries'} (include the extra one)</p>
                    {opts.map((opt, si) => (
                      <div key={si} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: '0.6rem', fontWeight: 'bold', color: 'var(--accent)', width: 16, textAlign: 'center' }}>{letter(si)}</span>
                        <input
                          value={opt}
                          onChange={(e) => { const next = [...opts]; next[si] = e.target.value; setOpts(next) }}
                          placeholder={`${noun} ${letter(si)}`}
                          className="qe-option-input"
                          style={{ flex: 1, fontSize: '0.7rem' }}
                        />
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, marginBottom: 14 }}>
                      <button className="btn btn-outline btn-small" style={{ fontSize: '0.45rem', padding: '3px 8px' }} onClick={() => setOpts([...opts, ''])}>+ {noun}</button>
                      {opts.length > 2 && (
                        <button className="btn btn-small" style={{ fontSize: '0.45rem', padding: '3px 8px', background: 'var(--danger)' }} onClick={() => setOpts(opts.slice(0, -1))}>- {noun}</button>
                      )}
                    </div>

                    <p style={{ fontSize: '0.7rem', color: '#888', marginBottom: 8 }}>Answer key: which {noun.toLowerCase()} fills each gap</p>
                    {order.map((optIdx, g) => (
                      <div key={g} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: '0.65rem', width: 56 }}>Gap {gapLabel(g)}</span>
                        <select
                          value={optIdx ?? -1}
                          onChange={(e) => { const next = [...order]; next[g] = parseInt(e.target.value, 10); setOrder(next) }}
                          style={{ flex: 1, fontSize: '0.65rem', padding: '3px 4px', borderRadius: 4, border: '1px solid #ccc' }}
                        >
                          <option value={-1}>Choose…</option>
                          {opts.map((o, oi) => (
                            <option key={oi} value={oi}>{letter(oi)}{o ? ` — ${o.slice(0, 50)}` : ''}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                    {new Set(order.filter((o) => o >= 0)).size !== order.filter((o) => o >= 0).length && (
                      <p style={{ fontSize: '0.6rem', color: 'var(--danger)' }}>Two gaps use the same {noun.toLowerCase()}.</p>
                    )}
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <button className="btn btn-outline btn-small" style={{ fontSize: '0.45rem', padding: '3px 8px' }} onClick={() => setOrder([...order, -1])}>+ Gap</button>
                      {order.length > 1 && (
                        <button className="btn btn-small" style={{ fontSize: '0.45rem', padding: '3px 8px', background: 'var(--danger)' }} onClick={() => setOrder(order.slice(0, -1))}>- Gap</button>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* --- Multi-Matching: match questions with extract dropdowns --- */}
              {qType === 'multi-matching' && (
                <div style={{ overflowY: 'auto', padding: '0 4px' }}>
                  <p style={{ fontSize: '0.6rem', color: '#888', marginBottom: 4 }}>Question statement (shown to students)</p>
                  <RichTextEditor
                    key={`mm-prompt-${currentEditQ}`}
                    value={q.prompt || ''}
                    onChange={(html) => updateQuestion(currentEditQ, 'prompt', html)}
                    placeholder="e.g. Choose from the sentences below the one which fits each gap..."
                  />
                  <p style={{ fontSize: '0.7rem', color: '#888', marginBottom: 8, marginTop: 12 }}>Match each question to the correct extract</p>
                  {(q.matchQuestions || []).map((mq, mi) => (
                    <div key={mi} style={{ marginBottom: 10, padding: '8px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 'var(--radius)' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: '0.6rem', fontWeight: 'bold', color: 'var(--accent)' }}>Q{mi + 1}</span>
                        <span style={{ fontSize: '0.55rem', color: '#888' }}>Correct answer:</span>
                        <select
                          value={mq.correctExtract}
                          onChange={(e) => {
                            const mqs = [...(q.matchQuestions || [])]
                            mqs[mi] = { ...mqs[mi], correctExtract: parseInt(e.target.value) }
                            updateQuestion(currentEditQ, 'matchQuestions', mqs)
                          }}
                          className="select"
                          style={{ width: 80, fontSize: '0.6rem', padding: '3px' }}
                        >
                          {(q.descriptions || []).map((d, di) => (
                            <option key={di} value={di}>{d.title}</option>
                          ))}
                        </select>
                      </div>
                      <RichTextEditor
                        key={`mq-${currentEditQ}-${mi}`}
                        value={mq.question}
                        onChange={(html) => {
                          const mqs = [...(q.matchQuestions || [])]
                          mqs[mi] = { ...mqs[mi], question: html }
                          updateQuestion(currentEditQ, 'matchQuestions', mqs)
                        }}
                        placeholder={`Question ${mi + 1}...`}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-outline btn-small" style={{ fontSize: '0.5rem', padding: '4px 10px' }} onClick={() => {
                      updateQuestion(currentEditQ, 'matchQuestions', [...(q.matchQuestions || []), { question: '', correctExtract: 0 }])
                    }}>+ Question</button>
                    {(q.matchQuestions || []).length > 1 && (
                      <button className="btn btn-small" style={{ fontSize: '0.5rem', padding: '4px 10px', background: 'var(--danger)' }} onClick={() => {
                        const mqs = [...(q.matchQuestions || [])]
                        mqs.pop()
                        updateQuestion(currentEditQ, 'matchQuestions', mqs)
                      }}>- Question</button>
                    )}
                  </div>
                </div>
              )}

              {/* --- Free Writing: prompt only --- */}
              {qType === 'free-writing' && (
                <div style={{ padding: '0 4px' }}>
                  <p style={{ fontSize: '0.7rem', color: '#888', marginBottom: 8 }}>Writing prompt (shown to student)</p>
                  <RichTextEditor
                    value={q.prompt || ''}
                    onChange={(html) => updateQuestion(currentEditQ, 'prompt', html)}
                    placeholder="Write the task instructions here (e.g. Write a persuasive essay about...)..."
                  />
                  <p style={{ fontSize: '0.6rem', color: '#666', marginTop: 12 }}>Students will see a text area to type their response. This question type requires manual marking.</p>
                </div>
              )}

            </div>
          </div>

          {/* Bottom bar */}
          <div className="qt-bottombar">
            <button className="qt-nav-btn qt-nav-back" onClick={() => setCurrentEditQ((c) => Math.max(0, c - 1))} disabled={currentEditQ === 0}>
              &#9664; Back
            </button>
            <div className="qt-bottom-center" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                className="btn btn-outline"
                style={{ fontSize: '0.65rem', padding: '10px 16px' }}
                onClick={() => {
                  setQuizQuestions((prev) => [...prev, emptyQuestion()])
                  setCurrentEditQ(quizQuestions.length)
                }}
              >
                + Add Q
              </button>
              <button
                className="btn btn-outline"
                style={{ fontSize: '0.65rem', padding: '10px 16px' }}
                onClick={handlePopulateExplanations}
                disabled={isGenerating}
              >
                {isGenerating ? `AI... (${generateProgress.done}/${generateProgress.total})` : 'AI Explanations'}
              </button>
              <button
                className="btn"
                style={{ fontSize: '0.65rem', padding: '10px 20px' }}
                onClick={handleSaveQuiz}
                disabled={isGenerating}
              >
                {editingQuiz === 'new' ? 'Save Quiz' : 'Update Quiz'}
              </button>
              <button
                className="qt-nav-btn qt-nav-done"
                style={{ fontSize: '0.9rem', padding: '10px 20px' }}
                onClick={() => { setEditingQuiz(null); setEditingImported(null); setPdfReviewFlags(null) }}
              >
                Cancel
              </button>
            </div>
            <button className="qt-nav-btn qt-nav-next" onClick={() => setCurrentEditQ((c) => Math.min(total - 1, c + 1))} disabled={currentEditQ === total - 1}>
              Next &#9654;
            </button>
          </div>

          {isGenerating && (
            <div style={{ position: 'absolute', bottom: 90, left: 24, right: 24 }}>
              <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  width: `${generateProgress.total ? (generateProgress.done / generateProgress.total) * 100 : 0}%`,
                  height: '100%',
                  background: 'var(--accent)',
                  borderRadius: 4,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          )}

          {pendingTypeChange && (
            <div className="neon-overlay">
              <div className="neon-popup" style={{ maxWidth: 420, padding: '32px 28px' }}>
                <p className="pixel-heading" style={{ fontSize: '1rem', color: 'var(--warning)', marginBottom: 12 }}>Change Question Type?</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.6, marginBottom: 24 }}>
                  Switching to <strong>{QUESTION_TYPES.find(t => t.value === pendingTypeChange)?.label}</strong>? Text and shared fields will be kept. Type-specific fields that don't apply may be reset.
                </p>
                <div className="neon-popup-actions">
                  <button className="btn btn-danger" style={{ padding: '10px 24px' }} onClick={() => applyTypeChange(pendingTypeChange)}>Switch Type</button>
                  <button className="btn btn-outline" style={{ padding: '10px 24px' }} onClick={() => setPendingTypeChange(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ===== MAIN 3-COLUMN VIEW =====
  return (
    <div className="page" style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: 'calc(100dvh - 40px)' }}>
      {showBulkTag && <BulkTagPanel onClose={() => { setShowBulkTag(false); forceRefresh() }} />}
      {tagAfterImport && <BulkTagPanel setIds={tagAfterImport} onClose={() => { setTagAfterImport(null); forceRefresh() }} />}
      {remark && (
        <div className="modal-overlay qtag-overlay" onClick={() => setRemark(null)}>
          <div className="qtag-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Mark this work again?</h3>
            <p className="qtag-sub">
              You changed the correct answer on {remark.keyChanges} question{remark.keyChanges === 1 ? '' : 's'} in <b>{remark.quizTitle}</b>.
              {' '}{remark.affected.length} submitted {remark.affected.length === 1 ? 'attempt was' : 'attempts were'} marked against the old answers.
            </p>
            <div className="qtag-review-list">
              {remark.affected.map((r) => (
                <div key={r.id} className="rm-row">
                  <span className="rm-name">{r.name}{r.kind === 'redo' ? ' (redo)' : ''}</span>
                  <span className="rm-old">{r.oldScore}/{r.total}</span>
                  <span className="rm-arrow">→</span>
                  <span className={`rm-new ${r.delta > 0 ? 'rm-up' : 'rm-down'}`}>{r.newScore}/{r.total}</span>
                  <span className={`rm-delta ${r.delta > 0 ? 'rm-up' : 'rm-down'}`}>{r.delta > 0 ? '+' : ''}{r.delta}</span>
                </div>
              ))}
            </div>
            <p className="qtag-sub">Scores that go up earn the extra coins; scores that go down keep the coins already awarded. Revision Hall cards for questions now answered correctly are archived.</p>
            <div className="qtag-modal-actions">
              <button className="qtag-btn" onClick={() => setRemark(null)}>Leave scores as they are</button>
              <button className="qtag-btn qtag-btn-primary" onClick={() => { const res = applyRemark(remark.setId); setRemark(null); setRemarkDone(res); forceRefresh() }}>Mark again</button>
            </div>
          </div>
        </div>
      )}
      {remarkDone && (
        <div className="modal-overlay qtag-overlay" onClick={() => setRemarkDone(null)}>
          <div className="qtag-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Marked again</h3>
            <p className="qtag-sub">
              {remarkDone.changed} attempt{remarkDone.changed === 1 ? '' : 's'} updated across {remarkDone.students} student{remarkDone.students === 1 ? '' : 's'}.
              {remarkDone.coinsAwarded > 0 && ` ${remarkDone.coinsAwarded} coins awarded for higher scores.`}
              {remarkDone.cardsArchived > 0 && ` ${remarkDone.cardsArchived} Revision Hall card${remarkDone.cardsArchived === 1 ? '' : 's'} archived.`}
            </p>
            <div className="qtag-modal-actions">
              <button className="qtag-btn qtag-btn-primary" onClick={() => setRemarkDone(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
      <div className="header">
        <h1 className="pixel-title">Quiz Builder</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(() => {
            const qr = getQuestionReports(orgId).filter(r => !r.resolved)
            const er = getExplanationReports(orgId).filter(r => !r.resolved)
            const total = qr.length + er.length
            if (total === 0) return null
            return <button className="btn btn-small" style={{ fontSize: '0.6rem', background: '#e65100', position: 'relative' }} onClick={() => setShowReports(!showReports)}>&#9888; Reports ({total})</button>
          })()}
          <button className="btn-logout" onClick={onBack}>Back</button>
        </div>
      </div>

      {showReports && (() => {
        const qr = getQuestionReports(orgId)
        const er = getExplanationReports(orgId)
        const allReports = [
          ...qr.map(r => ({ ...r, kind: 'question' })),
          ...er.map(r => ({ ...r, kind: 'explanation', errorType: r.reason })),
        ].sort((a, b) => new Date(b.date) - new Date(a.date))
        return (
          <div className="card mt-8" style={{ maxHeight: 400, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p className="pixel-heading" style={{ fontSize: '0.7rem', margin: 0 }}>Student Reports</p>
              <button className="btn btn-small btn-outline" style={{ fontSize: '0.5rem' }} onClick={() => setShowReports(false)}>Close</button>
            </div>
            {allReports.length === 0 ? (
              <p className="text-dim" style={{ fontSize: '0.75rem' }}>No reports yet.</p>
            ) : (
              <table className="score-table" style={{ fontSize: '0.65rem' }}>
                <thead><tr><th>Date</th><th>Type</th><th>Quiz</th><th>Q#</th><th>Student</th><th>Issue</th><th>Details</th><th>Status</th></tr></thead>
                <tbody>
                  {allReports.map(r => {
                    const set = getImportedQuizSet(r.quizSetId)
                    const student = getStudentById(r.studentId)
                    return (
                      <tr key={r.id} style={{ opacity: r.resolved ? 0.5 : 1 }}>
                        <td>{new Date(r.date).toLocaleDateString()}</td>
                        <td>{r.kind === 'question' ? '&#9888; Question' : '&#128172; Explanation'}</td>
                        <td>{set?.title || '?'}</td>
                        <td>Q{(r.questionIndex || 0) + 1}</td>
                        <td>{student ? fullName(student) : '?'}</td>
                        <td>{r.errorType}</td>
                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.details || '—'}</td>
                        <td>
                          {r.resolved ? <span style={{ color: '#66bb6a' }}>Resolved</span> : (
                            <button className="btn btn-small" style={{ fontSize: '0.5rem', padding: '2px 8px' }} onClick={() => {
                              if (r.kind === 'question') resolveQuestionReport(r.id, r.studentId)
                              else resolveExplanationReport(r.id, r.studentId)
                              forceRefresh()
                            }}>Resolve</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )
      })()}

      {/* Class + Term selector */}
      <div className="card mt-16" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p className="pixel-heading mb-8" style={{ margin: 0, fontSize: '0.6rem' }}>Class</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {classes.length === 0 ? (
              <span className="text-dim" style={{ fontSize: '0.8rem' }}>No classes yet.</span>
            ) : (
              [...classes].sort((a, b) => a.name.localeCompare(b.name)).map((cls) => (
                <button
                  key={cls.id}
                  className={`btn btn-small ${activeClass === cls.id ? '' : 'btn-outline'}`}
                  style={{ fontSize: '0.55rem', padding: '6px 12px' }}
                  onClick={() => { setActiveClass(activeClass === cls.id ? null : cls.id); setActiveTopic(null) }}
                >
                  {cls.name}
                </button>
              ))
            )}
          </div>
        </div>
        <div>
          <p className="pixel-heading mb-8" style={{ margin: 0, fontSize: '0.6rem' }}>Term</p>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={`btn btn-small ${!activeTerm ? '' : 'btn-outline'}`} style={{ fontSize: '0.55rem', padding: '6px 10px' }} onClick={() => setActiveTerm(null)}>All</button>
            {['T1', 'T2', 'T3', 'T4'].map((t) => (
              <button key={t} className={`btn btn-small ${activeTerm === t ? '' : 'btn-outline'}`} style={{ fontSize: '0.55rem', padding: '6px 10px' }} onClick={() => setActiveTerm(activeTerm === t ? null : t)}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      {/* 3-Column layout */}
      <div className="qb-columns">
        {/* LEFT: Assignment Quizzes & Tests */}
        <div className="qb-col">
          <div className="card" style={{ height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <p className="pixel-heading" style={{ margin: 0, fontSize: '0.6rem' }}>Assignments & Tests <span style={{ fontSize: '0.4rem', color: 'var(--text-dim)', fontWeight: 'normal' }}>({importedSets.length} shown / {allImported.length} total{assignedIds.size > 0 ? ` / ${assignedIds.size} assigned` : ''}{activeTerm ? ` / filter: ${activeTerm}` : ''})</span></p>
              <div style={{ display: 'flex', gap: 4 }}>
                {getLastImportBatch() && (
                  <button
                    className="btn btn-small btn-outline"
                    style={{ fontSize: '0.45rem', padding: '4px 8px', borderColor: 'var(--danger)', color: 'var(--danger)' }}
                    onClick={() => {
                      const batch = getLastImportBatch()
                      if (batch) requestConfirm(`Undo last import? This will remove ${batch.count} quiz set(s) and their images.`, () => { undoLastImport(); forceRefresh() })
                    }}
                  >
                    Undo Import ({getLastImportBatch()?.count})
                  </button>
                )}
                <button className="btn btn-small" style={{ fontSize: '0.45rem', padding: '4px 8px' }} onClick={() => fileInputRef.current?.click()} disabled={!!importProgress}>{importProgress ? 'Importing...' : 'Import JSON'}</button>
                <button className="btn btn-small" style={{ fontSize: '0.45rem', padding: '4px 8px' }} onClick={() => setShowBulkTag(true)}>{'✨'} Tag all with AI</button>
                <button className="btn btn-small" style={{ fontSize: '0.45rem', padding: '4px 8px', background: '#7c3aed' }} onClick={() => pdfInputRef.current?.click()} disabled={!!pdfProgress}>
                  {pdfProgress ? 'Processing...' : 'Import PDF'}
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept=".json" multiple style={{ display: 'none' }} onChange={handleImportJSON} />
              <input ref={pdfInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleImportPDF} />
            </div>

            {importProgress && (
              <div style={{ padding: '8px 10px', marginBottom: 6, background: 'rgba(0,255,136,0.08)', border: '1px solid var(--accent)', borderRadius: 'var(--radius)', fontSize: '0.65rem' }}>
                <div>Importing {importProgress.done}/{importProgress.total} quiz sets{importProgress.file ? ` — ${importProgress.file}` : ''}...</div>
                <div style={{ width: '100%', height: 4, background: 'var(--border)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${importProgress.total ? (importProgress.done / importProgress.total) * 100 : 0}%`, height: '100%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.3s ease' }} />
                </div>
              </div>
            )}

            {pdfProgress && (
              <div style={{ padding: '8px 10px', marginBottom: 6, background: 'rgba(124,58,237,0.1)', border: '1px solid #7c3aed', borderRadius: 'var(--radius)', fontSize: '0.65rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="pdf-spinner" />
                  <span>{pdfProgress}</span>
                </div>
              </div>
            )}

            {pdfPagePrompt && (
              <div className="neon-overlay" onClick={() => setPdfPagePrompt(null)}>
                <div className="neon-popup" onClick={e => e.stopPropagation()} style={{ minWidth: 280 }}>
                  <p className="neon-popup-text" style={{ marginBottom: 12 }}>
                    PDF has <strong>{pdfPagePrompt.totalPages}</strong> pages.<br />Select page range to extract:
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
                    <label style={{ fontSize: '0.7rem' }}>From</label>
                    <input
                      type="number"
                      min={1}
                      max={pdfPagePrompt.totalPages}
                      value={pdfPagePrompt.from}
                      onChange={e => setPdfPagePrompt(p => ({ ...p, from: Math.max(1, parseInt(e.target.value) || 1) }))}
                      className="input"
                      style={{ width: 60, textAlign: 'center', fontSize: '0.75rem', padding: '4px 6px' }}
                      autoFocus
                    />
                    <label style={{ fontSize: '0.7rem' }}>To</label>
                    <input
                      type="number"
                      min={1}
                      max={pdfPagePrompt.totalPages}
                      value={pdfPagePrompt.to}
                      onChange={e => setPdfPagePrompt(p => ({ ...p, to: Math.min(p.totalPages, parseInt(e.target.value) || p.totalPages) }))}
                      className="input"
                      style={{ width: 60, textAlign: 'center', fontSize: '0.75rem', padding: '4px 6px' }}
                    />
                  </div>
                  <div className="neon-popup-actions">
                    <button className="btn" onClick={() => {
                      const { file, from, to } = pdfPagePrompt
                      setPdfPagePrompt(null)
                      runPDFImport(file, { from, to })
                    }}>Extract</button>
                    <button className="btn" style={{ background: '#7c3aed' }} onClick={() => {
                      const { file, totalPages } = pdfPagePrompt
                      setPdfPagePrompt(null)
                      runPDFImport(file, { from: 1, to: totalPages })
                    }}>All Pages</button>
                    <button className="btn btn-outline" onClick={() => setPdfPagePrompt(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {importedSets.length > 0 && (
              <input
                value={importSearch}
                onChange={(e) => setImportSearch(e.target.value)}
                placeholder="Search quizzes..."
                className="input"
                style={{ fontSize: '0.75rem', padding: '6px 10px', marginBottom: 8 }}
              />
            )}

            {importedSets.length === 0 && quizFolders.length === 0 ? (
              <p className="text-dim" style={{ fontSize: '0.75rem' }}>No imported quizzes{activeTerm ? ` for ${activeTerm}` : ''}. Import a JSON export from CleverSpace.</p>
            ) : (() => {
              const searchLower = importSearch.toLowerCase()
              const filtered = searchLower
                ? importedSets.filter((s) => s.friendlyTitle.toLowerCase().includes(searchLower) || (s.rawTitle || '').toLowerCase().includes(searchLower))
                : importedSets
              const dir = importSort.asc ? 1 : -1
              const sorted = [...filtered].sort((a, b) => {
                if (importSort.col === 'name') return dir * a.friendlyTitle.localeCompare(b.friendlyTitle)
                if (importSort.col === 'term') return dir * (a.term || '').localeCompare(b.term || '')
                if (importSort.col === 'year') return dir * (a.year || '').localeCompare(b.year || '')
                if (importSort.col === 'week') return dir * (a.week || '').localeCompare(b.week || '')
                return 0
              })
              function toggleImportSort(col) {
                setImportSort((prev) => prev.col === col ? { col, asc: !prev.asc } : { col, asc: true })
              }
              const arrow = (col) => importSort.col === col ? (importSort.asc ? ' ▲' : ' ▼') : ''

              const visibleQuizzes = sorted.filter(s => (s.folderId || null) === currentFolderId)
              const visibleFolders = quizFolders.filter(f => (f.parentId || null) === currentFolderId)
              const breadcrumb = currentFolderId ? getFolderPath(currentFolderId) : []

              function buildFolderTree(parentId = null, prefix = '') {
                return quizFolders.filter(f => (f.parentId || null) === parentId && f.id !== currentFolderId).flatMap(f => [
                  { id: f.id, label: prefix + f.name },
                  ...buildFolderTree(f.id, prefix + f.name + ' / ')
                ])
              }
              const allFolderOptions = [{ id: null, label: 'Root' }, ...buildFolderTree()]

              function handleDropOnFolder(e, folderId) {
                e.preventDefault()
                e.stopPropagation()
                setDragOverFolder(null)
                const raw = e.dataTransfer.getData('quizSetIds')
                if (!raw) return
                for (const id of JSON.parse(raw)) updateImportedQuizSet(id, { folderId })
                setSelectedHomework(new Set())
                forceRefresh()
              }

              function renderQuizRow(set) {
                return (
                  <tr key={set.id} draggable onDragStart={(e) => handleDragStartQuiz(e, set.id, selectedHomework)} style={{ cursor: 'grab', ...(mergeTarget && mergeTarget.id !== set.id ? { cursor: 'pointer', background: 'rgba(255,171,0,0.04)' } : {}), ...(selectedHomework.has(set.id) ? { background: 'rgba(0,255,136,0.08)' } : {}) }}
                    onClick={mergeTarget && mergeTarget.id !== set.id ? () => {
                      requestConfirm(`Merge "${set.friendlyTitle}" (${set.questions.length}q) into "${mergeTarget.friendlyTitle}" (${mergeTarget.questions.length}q)? The merged quiz will be deleted.`, () => {
                        mergeImportedQuizSets(mergeTarget.id, set.id)
                        setMergeTarget(null)
                        forceRefresh()
                      })
                    } : undefined}
                  >
                    <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                        <input type="checkbox" checked={selectedHomework.has(set.id)} onChange={() => toggleSelect(set, selectedHomework, setSelectedHomework)} />
                        <button className="btn btn-danger btn-small" style={{ padding: '2px 6px', fontSize: '0.4rem', lineHeight: 1, minWidth: 0 }} onClick={() => requestConfirm(`Delete "${set.friendlyTitle}"?`, () => { deleteImportedQuizSet(set.id); forceRefresh() })}>x</button>
                      </div>
                    </td>
                    <td style={{ fontSize: '0.65rem' }}>{set.friendlyTitle}</td>
                    <td style={{ textAlign: 'center', padding: '2px' }}>
                      <select
                        value={set.term || ''}
                        onChange={(e) => { e.stopPropagation(); updateImportedQuizSet(set.id, { term: e.target.value }); forceRefresh() }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: 38, fontSize: '0.5rem', padding: '1px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: set.term ? 'var(--accent)' : 'var(--text-dim)', borderRadius: 2 }}
                      >
                        <option value="">--</option>
                        <option value="T1">T1</option>
                        <option value="T2">T2</option>
                        <option value="T3">T3</option>
                        <option value="T4">T4</option>
                      </select>
                    </td>
                    <td style={{ textAlign: 'center', fontSize: '0.55rem', color: set.year ? 'var(--token)' : 'var(--text-dim)' }}>{set.year || '--'}</td>
                    <td style={{ textAlign: 'center', fontSize: '0.55rem', color: set.week ? 'var(--coin)' : 'var(--text-dim)' }}>{set.week || '--'}</td>
                    <td style={{ textAlign: 'center', fontSize: '0.55rem' }}>{set.questions.length}</td>
                    <td style={{ textAlign: 'center', padding: '2px' }} onClick={(e) => e.stopPropagation()}>
                      <select
                        value={set.trialTestSubject || ''}
                        onChange={(e) => { e.stopPropagation(); const val = e.target.value; updateImportedQuizSet(set.id, { trialTest: !!val, trialTestSubject: val || null }); forceRefresh() }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: 46, fontSize: '0.45rem', padding: '1px', background: set.trialTestSubject ? 'rgba(0,229,255,0.12)' : 'transparent', border: `1px solid ${set.trialTestSubject ? 'var(--token)' : 'rgba(255,255,255,0.15)'}`, color: set.trialTestSubject ? 'var(--token)' : 'var(--text-dim)', borderRadius: 2 }}
                      >
                        <option value="">--</option>
                        <optgroup label="Selective">
                          <option value="sel-reading">S:Read</option>
                          <option value="sel-math">S:Math</option>
                          <option value="sel-thinking">S:Think</option>
                          <option value="sel-writing">S:Write</option>
                        </optgroup>
                        <optgroup label="OC">
                          <option value="oc-reading">OC:Read</option>
                          <option value="oc-math">OC:Math</option>
                          <option value="oc-thinking">OC:Think</option>
                        </optgroup>
                      </select>
                    </td>
                    <td style={{ textAlign: 'center', padding: '2px' }} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={!!set.homeworkMode} onChange={(e) => { e.stopPropagation(); updateImportedQuizSet(set.id, { homeworkMode: !set.homeworkMode }); forceRefresh() }} title="Homework mode — students can exit and resume" style={{ accentColor: set.homeworkMode ? '#76ff03' : undefined }} />
                    </td>
                    <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-outline btn-small" style={{ padding: '2px 5px', fontSize: '0.35rem', marginRight: 2 }} onClick={() => startEditImported(set)}>Edit</button>
                      <button className="btn btn-outline btn-small" style={{ padding: '2px 5px', fontSize: '0.35rem', borderColor: 'var(--warning)', color: 'var(--warning)' }} onClick={() => setMergeTarget(set)} title="Merge another quiz into this one">Merge</button>
                    </td>
                  </tr>
                )
              }

              function renderFolderRow(folder) {
                const quizCount = sorted.filter(s => s.folderId === folder.id).length
                const subFolderCount = quizFolders.filter(f => f.parentId === folder.id).length
                const isDragOver = dragOverFolder === folder.id
                return (
                  <tr key={`folder-${folder.id}`}
                    style={{ background: isDragOver ? 'rgba(0,255,136,0.12)' : 'rgba(106,90,205,0.06)', cursor: 'pointer', transition: 'background 0.15s' }}
                    onDoubleClick={() => { setCurrentFolderId(folder.id); setSelectedHomework(new Set()) }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverFolder(folder.id) }}
                    onDragLeave={() => setDragOverFolder(null)}
                    onDrop={(e) => handleDropOnFolder(e, folder.id)}
                  >
                    <td style={{ width: 24 }}></td>
                    <td style={{ fontSize: '0.65rem', padding: '5px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.75rem' }}>📁</span>
                        {renamingFolder === folder.id ? (
                          <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); if (renamingText.trim()) { renameQuizFolder(folder.id, renamingText.trim()); setRenamingFolder(null); forceRefresh() } }} onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 3, flex: 1 }}>
                            <input value={renamingText} onChange={(e) => setRenamingText(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === 'Escape') setRenamingFolder(null) }} onBlur={() => { if (renamingText.trim()) { renameQuizFolder(folder.id, renamingText.trim()); forceRefresh() } setRenamingFolder(null) }} style={{ flex: 1, fontSize: '0.6rem', padding: '1px 4px', background: 'transparent', border: '1px solid var(--accent)', color: '#fff', borderRadius: 2 }} />
                          </form>
                        ) : (
                          <span style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{folder.name}</span>
                        )}
                        <span style={{ fontSize: '0.45rem', color: 'var(--text-dim)' }}>
                          {quizCount} quiz{quizCount !== 1 ? 'zes' : ''}{subFolderCount > 0 ? `, ${subFolderCount} folder${subFolderCount !== 1 ? 's' : ''}` : ''}
                        </span>
                      </div>
                    </td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-outline btn-small" style={{ padding: '2px 5px', fontSize: '0.35rem', marginRight: 2 }} onClick={(e) => { e.stopPropagation(); setRenamingFolder(folder.id); setRenamingText(folder.name) }} title="Rename folder">Rename</button>
                      <button className="btn btn-danger btn-small" style={{ padding: '2px 5px', fontSize: '0.35rem' }} onClick={(e) => { e.stopPropagation(); requestConfirm(`Delete folder "${folder.name}"? Contents will be moved to the parent folder.`, () => { if (currentFolderId === folder.id) setCurrentFolderId(folder.parentId || null); deleteQuizFolder(folder.id); forceRefresh() }) }} title="Delete folder">x</button>
                    </td>
                  </tr>
                )
              }

              return (
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {mergeTarget && (
                    <div style={{ padding: '6px 10px', marginBottom: 6, background: 'rgba(255,171,0,0.1)', border: '1px solid var(--warning)', borderRadius: 'var(--radius)', fontSize: '0.65rem' }}>
                      <span style={{ color: 'var(--warning)' }}>Merge mode:</span> Select a quiz to merge into <strong>{mergeTarget.friendlyTitle}</strong>
                      <button className="btn btn-outline btn-small" style={{ marginLeft: 8, padding: '2px 6px', fontSize: '0.35rem' }} onClick={() => setMergeTarget(null)}>Cancel</button>
                    </div>
                  )}

                  {/* Back button + Breadcrumb + New Folder */}
                  {currentFolderId && (
                    <button onClick={() => { const parent = breadcrumb.length > 1 ? breadcrumb[breadcrumb.length - 2].id : null; setCurrentFolderId(parent); setSelectedHomework(new Set()) }} className="btn btn-outline btn-small" style={{ marginBottom: 6, fontSize: '0.5rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: '0.6rem' }}>&larr;</span> Back
                    </button>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.55rem', flex: 1 }}>
                      <span style={{ cursor: 'pointer', color: currentFolderId ? 'var(--accent)' : 'var(--text-dim)', fontWeight: currentFolderId ? 'normal' : 'bold' }} onClick={() => { setCurrentFolderId(null); setSelectedHomework(new Set()) }}>Root</span>
                      {breadcrumb.map((f, i) => (
                        <span key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <span style={{ color: 'var(--text-dim)' }}>/</span>
                          <span style={{ cursor: i < breadcrumb.length - 1 ? 'pointer' : 'default', color: i < breadcrumb.length - 1 ? 'var(--accent)' : '#fff', fontWeight: i === breadcrumb.length - 1 ? 'bold' : 'normal' }} onClick={() => { if (i < breadcrumb.length - 1) { setCurrentFolderId(f.id); setSelectedHomework(new Set()) } }}>{f.name}</span>
                        </span>
                      ))}
                    </div>
                    {showNewFolder ? (
                      <form onSubmit={(e) => { e.preventDefault(); if (newFolderName.trim()) { createQuizFolder(newFolderName.trim(), orgId, currentFolderId); setNewFolderName(''); setShowNewFolder(false); forceRefresh() } }} style={{ display: 'flex', gap: 4 }}>
                        <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Folder name" autoFocus onKeyDown={(e) => { if (e.key === 'Escape') setShowNewFolder(false) }} style={{ fontSize: '0.55rem', padding: '3px 6px', background: 'transparent', border: '1px solid var(--accent)', color: '#fff', borderRadius: 3, width: 110 }} />
                        <button type="submit" className="btn btn-small" style={{ fontSize: '0.4rem', padding: '3px 6px' }}>Create</button>
                        <button type="button" className="btn btn-outline btn-small" style={{ fontSize: '0.4rem', padding: '3px 6px' }} onClick={() => setShowNewFolder(false)}>Cancel</button>
                      </form>
                    ) : (
                      <button className="btn btn-outline btn-small" style={{ fontSize: '0.4rem', padding: '3px 8px' }} onClick={() => setShowNewFolder(true)}>+ New Folder</button>
                    )}
                  </div>

                  {/* Selection toolbar */}
                  {selectedHomework.size > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>{selectedHomework.size} selected</span>
                      <select style={{ fontSize: '0.5rem', padding: '2px 4px', background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 3 }} defaultValue="" onChange={(e) => {
                        if (!e.target.value) return
                        const fid = e.target.value === '__null__' ? null : e.target.value
                        selectedHomework.forEach(id => updateImportedQuizSet(id, { folderId: fid }))
                        setSelectedHomework(new Set())
                        forceRefresh()
                        e.target.value = ''
                      }}>
                        <option value="">Move to...</option>
                        {allFolderOptions.map(f => <option key={f.id || '__root__'} value={f.id || '__null__'}>{f.label}</option>)}
                      </select>
                      <button className="btn btn-danger btn-small" style={{ fontSize: '0.4rem', padding: '3px 8px' }} onClick={() => batchDelete(selectedHomework, setSelectedHomework)}>Delete Selected</button>
                      <button className="btn btn-outline btn-small" style={{ fontSize: '0.4rem', padding: '3px 8px' }} onClick={() => setSelectedHomework(new Set())}>Clear</button>
                    </div>
                  )}

                  <table className="table w-full">
                    <thead>
                      <tr>
                        <th style={{ width: 24, textAlign: 'center' }}><input type="checkbox" checked={visibleQuizzes.length > 0 && visibleQuizzes.every(s => selectedHomework.has(s.id))} onChange={() => toggleSelectAll(visibleQuizzes.map(s => s.id), selectedHomework, setSelectedHomework)} /></th>
                        <th className="sortable-th" style={{ textAlign: 'left', fontSize: '0.5rem' }} onClick={() => toggleImportSort('name')}>Quiz{arrow('name')}</th>
                        <th className="sortable-th" style={{ textAlign: 'center', width: 32, fontSize: '0.5rem' }} onClick={() => toggleImportSort('term')}>T{arrow('term')}</th>
                        <th className="sortable-th" style={{ textAlign: 'center', width: 32, fontSize: '0.5rem' }} onClick={() => toggleImportSort('year')}>Y{arrow('year')}</th>
                        <th className="sortable-th" style={{ textAlign: 'center', width: 32, fontSize: '0.5rem' }} onClick={() => toggleImportSort('week')}>W{arrow('week')}</th>
                        <th style={{ textAlign: 'center', width: 24, fontSize: '0.5rem' }}>Q</th>
                        <th style={{ textAlign: 'center', width: 52, fontSize: '0.5rem' }}>Trial</th>
                        <th style={{ textAlign: 'center', width: 28, fontSize: '0.5rem' }}>HW</th>
                        <th style={{ textAlign: 'center', width: 80, fontSize: '0.5rem' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleFolders.map(f => renderFolderRow(f))}
                      {visibleQuizzes.map(s => renderQuizRow(s))}
                    </tbody>
                  </table>
                  {visibleFolders.length === 0 && visibleQuizzes.length === 0 && (
                    <p className="text-dim" style={{ fontSize: '0.7rem', padding: '8px 0', textAlign: 'center' }}>{searchLower ? `No matches for "${importSearch}"` : 'This folder is empty'}</p>
                  )}
                </div>
              )
            })()}

            {unassignedQs.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <button className="btn btn-small btn-outline" style={{ fontSize: '0.45rem', padding: '3px 8px' }} onClick={() => setShowUnassigned(!showUnassigned)}>
                    {showUnassigned ? '▾' : '▸'} Unassigned ({unassignedQs.length})
                  </button>
                  {showUnassigned && (
                    <button className="btn btn-small btn-outline" style={{ fontSize: '0.4rem', padding: '2px 6px', borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={() => { requestConfirm(`Delete all ${unassignedQs.length} unassigned questions?`, () => { clearUnassignedQuestions(); setSelectedUnassigned(new Set()); forceRefresh() }) }}>
                      Clear All
                    </button>
                  )}
                </div>
                {showUnassigned && (
                  <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 6 }}>
                    {selectedUnassigned.size > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.5rem', color: 'var(--text-dim)' }}>{selectedUnassigned.size} selected</span>
                        <input value={unassignedQuizName} onChange={(e) => setUnassignedQuizName(e.target.value)} placeholder="Quiz name..." className="input" style={{ fontSize: '0.5rem', padding: '3px 6px', width: 120 }} />
                        <button className="btn btn-small" style={{ fontSize: '0.4rem', padding: '2px 6px' }} disabled={!unassignedQuizName.trim()} onClick={() => {
                          const result = createQuizFromUnassigned([...selectedUnassigned], unassignedQuizName.trim())
                          if (result) { setSelectedUnassigned(new Set()); setUnassignedQuizName(''); forceRefresh() }
                        }}>Create Quiz</button>
                        <button className="btn btn-small btn-outline" style={{ fontSize: '0.4rem', padding: '2px 6px', borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={() => {
                          requestConfirm(`Delete ${selectedUnassigned.size} selected question(s)?`, () => {
                            selectedUnassigned.forEach((id) => deleteUnassignedQuestion(id))
                            setSelectedUnassigned(new Set()); forceRefresh()
                          })
                        }}>Delete</button>
                      </div>
                    )}
                    <table className="table w-full">
                      <thead>
                        <tr>
                          <th style={{ width: 24, textAlign: 'center' }}><input type="checkbox" checked={unassignedQs.length > 0 && unassignedQs.every(q => selectedUnassigned.has(q.id))} onChange={() => {
                            if (unassignedQs.every(q => selectedUnassigned.has(q.id))) setSelectedUnassigned(new Set())
                            else setSelectedUnassigned(new Set(unassignedQs.map(q => q.id)))
                          }} /></th>
                          <th style={{ textAlign: 'left', fontSize: '0.5rem' }}>Title</th>
                          <th style={{ textAlign: 'center', width: 40, fontSize: '0.5rem' }}>Opts</th>
                          <th style={{ textAlign: 'center', width: 50, fontSize: '0.5rem' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {unassignedQs.map((q) => (
                          <tr key={q.id} style={{ ...(selectedUnassigned.has(q.id) ? { background: 'rgba(0,255,136,0.08)' } : {}) }}>
                            <td style={{ textAlign: 'center' }}><input type="checkbox" checked={selectedUnassigned.has(q.id)} onChange={() => {
                              setSelectedUnassigned(prev => { const next = new Set(prev); next.has(q.id) ? next.delete(q.id) : next.add(q.id); return next })
                            }} /></td>
                            <td style={{ fontSize: '0.5rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={q.originalTitle}>{q.originalTitle}</td>
                            <td style={{ textAlign: 'center', fontSize: '0.5rem' }}>{q.options.length}</td>
                            <td style={{ textAlign: 'center' }}>
                              <button className="btn btn-small btn-outline" style={{ fontSize: '0.35rem', padding: '1px 4px', borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={() => { deleteUnassignedQuestion(q.id); forceRefresh() }}>×</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* MIDDLE: Revision Quizzes */}
        <div className="qb-col">
          <div className="card" style={{ height: '100%' }}>
            <p className="pixel-heading" style={{ margin: 0, marginBottom: 12, fontSize: '0.6rem' }}>Revision Quizzes</p>

            {!activeClass ? (
              <p className="text-dim" style={{ fontSize: '0.75rem' }}>Select a class above to manage revision quizzes.</p>
            ) : (
              <>
                <form onSubmit={handleAddTopic} className="form-row mb-8" style={{ gap: 6 }}>
                  <input value={newTopicName} onChange={(e) => setNewTopicName(e.target.value)} placeholder="New topic" className="input flex-1" style={{ fontSize: '0.75rem' }} />
                  <select value={newTopicTerm} onChange={(e) => setNewTopicTerm(e.target.value)} className="select" style={{ width: 58, fontSize: '0.6rem', padding: '4px' }}>
                    <option value="">--</option>
                    <option value="T1">T1</option>
                    <option value="T2">T2</option>
                    <option value="T3">T3</option>
                    <option value="T4">T4</option>
                  </select>
                  <button type="submit" className="btn btn-small" style={{ fontSize: '0.45rem' }}>Add</button>
                </form>

                {topics.length === 0 ? (
                  <p className="text-dim" style={{ fontSize: '0.75rem' }}>No topics{activeTerm ? ` for ${activeTerm}` : ''} yet.</p>
                ) : termGroups.map((group) => (
                  <div key={group.term || '_none'} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: '0.5rem', fontFamily: 'var(--font-pixel)', color: group.term ? 'var(--accent)' : 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1, padding: '6px 0 4px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 4 }}>
                      {group.term || 'Unassigned'}
                    </div>
                    {group.topics.map((topic) => {
                      const topicQuizzes = getQuizzesForTopic(topic.id)
                      return (
                      <div key={topic.id}>
                        <div
                          className={`list-item topic-drag-item ${activeTopic === topic.id ? 'list-item-active' : ''}`}
                          style={{ fontSize: '0.75rem', padding: '6px 8px' }}
                          onClick={() => setActiveTopic(activeTopic === topic.id ? null : topic.id)}
                        >
                          <span className="topic-drag-handle" title="Drag to reorder">⠿</span>
                          <span className="bold flex-1">{topic.name}</span>
                          <select
                            value={topic.term || ''}
                            onChange={(e) => { e.stopPropagation(); updateTopic(topic.id, { term: e.target.value }); forceRefresh() }}
                            onClick={(e) => e.stopPropagation()}
                            className="select"
                            style={{ width: 50, fontSize: '0.5rem', padding: '2px 3px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: topic.term ? 'var(--accent)' : 'var(--text-dim)' }}
                          >
                            <option value="">--</option>
                            <option value="T1">T1</option>
                            <option value="T2">T2</option>
                            <option value="T3">T3</option>
                            <option value="T4">T4</option>
                          </select>
                          <span className="text-dim" style={{ fontSize: '0.55rem', marginLeft: 4, marginRight: 6 }}>{topicQuizzes.length}/8</span>
                          <button className="btn btn-danger btn-small" style={{ padding: '2px 5px', fontSize: '0.35rem' }} onClick={(e) => {
                            e.stopPropagation()
                            requestConfirm(`Delete topic "${topic.name}" and all its quizzes?`, () => { deleteTopic(topic.id); setActiveTopic(null); forceRefresh() })
                          }}>x</button>
                        </div>

                        {activeTopic === topic.id && (
                          <div style={{ paddingLeft: 16, marginBottom: 8 }}>
                            {topicQuizzes.length < 8 && (
                              <button className="btn btn-small" style={{ fontSize: '0.45rem', marginBottom: 6 }} onClick={startNewQuiz}>+ New Quiz</button>
                            )}
                            {topicQuizzes.length === 0 ? (
                              <p className="text-dim" style={{ fontSize: '0.7rem' }}>No quizzes yet.</p>
                            ) : topicQuizzes.map((quiz) => {
                              const attemptCount = getAttemptsForQuiz(quiz.id).length
                              const unlockEvent = quiz.unlockEventId ? classEvents.find((ev) => ev.id === quiz.unlockEventId) : null
                              return (
                                <div key={quiz.id} className="list-item" style={{ fontSize: '0.7rem', padding: '4px 8px', gap: 4, flexWrap: 'wrap' }}>
                                  <span className="bold" style={{ width: 55 }}>Quiz {quiz.number}</span>
                                  <span className="text-dim" style={{ fontSize: '0.55rem', flex: 1 }}>{quiz.questions.length}q · {quiz.timeLimit || 10}m</span>
                                  {unlockEvent && (
                                    <span style={{ fontSize: '0.45rem', color: 'var(--warning)', fontFamily: 'var(--font-pixel)' }} title={`Unlocks after: ${unlockEvent.name}`}>
                                      {unlockEvent.name}
                                    </span>
                                  )}
                                  {attemptCount > 0 && (
                                    <button className="btn btn-outline btn-small" style={{ padding: '2px 6px', fontSize: '0.35rem' }} onClick={() => setViewScoresQuiz(quiz)}>
                                      Scores ({attemptCount})
                                    </button>
                                  )}
                                  <button className="btn btn-outline btn-small" style={{ padding: '2px 6px', fontSize: '0.35rem' }} onClick={() => startEditQuiz(quiz)}>Edit</button>
                                  <button className="btn btn-danger btn-small" style={{ padding: '2px 5px', fontSize: '0.35rem' }} onClick={() => requestConfirm(`Delete Quiz ${quiz.number}?`, () => { deleteQuiz(quiz.id); forceRefresh() })}>x</button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      )
                    })}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

      </div>

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="modal-overlay">
          <div className="modal">
            <p className="modal-text">{confirmAction.message}</p>
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={() => { confirmAction.onConfirm(); setConfirmAction(null) }}>Yes</button>
              <button className="btn btn-outline" onClick={() => setConfirmAction(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Report Dialog */}
      {importReport && !importProgress && (
        <div className="modal-overlay">
          <div className="modal import-report-modal" style={{ minWidth: 320, maxWidth: 420 }}>
            <p className="pixel-heading" style={{ fontSize: '0.6rem', margin: '0 0 10px' }}>Import Report</p>
            {/* Scrolls inside the window; title and buttons stay visible. */}
            <div className="import-report-body" style={{ fontSize: '0.65rem', lineHeight: 1.6 }}>
              <div style={{ marginBottom: 8 }}>
                {importReport.files.map((f, i) => <div key={i} style={{ color: 'var(--text-dim)' }}>{i + 1}. {f}</div>)}
              </div>
              <table style={{ width: '100%', fontSize: '0.6rem', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td style={{ padding: '3px 0' }}>Total questions in file(s)</td><td style={{ textAlign: 'right', fontWeight: 'bold' }}>{importReport.totalQuestions}</td></tr>
                  <tr style={{ color: 'var(--accent)' }}><td style={{ padding: '3px 0' }}>Assigned to quizzes</td><td style={{ textAlign: 'right', fontWeight: 'bold' }}>{importReport.totalAssigned}</td></tr>
                  <tr style={{ color: importReport.totalUnassigned > 0 ? '#ffab00' : 'var(--text-dim)' }}><td style={{ padding: '3px 0' }}>Unassigned (no quiz match)</td><td style={{ textAlign: 'right', fontWeight: 'bold' }}>{importReport.totalUnassigned}</td></tr>
                  <tr><td style={{ padding: '3px 0' }}>Quiz sets created</td><td style={{ textAlign: 'right', fontWeight: 'bold' }}>{importReport.totalSets || 0}</td></tr>
                  {importReport.duplicates && importReport.duplicates.length > 0 && (
                    <tr style={{ color: '#42a5f5' }}><td style={{ padding: '3px 0' }}>Already existed</td><td style={{ textAlign: 'right', fontWeight: 'bold' }}>{importReport.duplicates.length}</td></tr>
                  )}
                </tbody>
              </table>
              {importReport.typeCounts && Object.keys(importReport.typeCounts).length > 0 && (
                <div className="import-type-counts" style={{ marginTop: 8 }}>
                  <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', marginBottom: 4 }}>Question types created</div>
                  {Object.entries(importReport.typeCounts).map(([type, n]) => (
                    <span key={type} className="import-type-chip">{({ 'multiple-choice': 'Multiple choice', 'multi-description': 'Multiple extracts', 'multi-matching': 'Matching', 'drag-sentence': 'Drag sentences', 'drag-summary': 'Drag summaries', 'free-writing': 'Free write', 'dropdown-cloze': 'Cloze' })[type] || type}: <b>{n}</b></span>
                  ))}
                </div>
              )}
              {importReport.flagged && importReport.flagged.length > 0 && (
                <details style={{ marginTop: 8 }} open>
                  <summary style={{ fontSize: '0.55rem', color: '#ffab00', cursor: 'pointer' }}>Needs review ({importReport.flagged.length}) — marked in Quiz Builder</summary>
                  <div style={{ maxHeight: 150, overflowY: 'auto', marginTop: 4, padding: '4px 6px', background: 'rgba(0,0,0,0.2)', borderRadius: 4 }}>
                    {importReport.flagged.map((f, i) => <div key={i} style={{ fontSize: '0.5rem', color: 'var(--text-dim)', padding: '2px 0' }}><b>{f.quiz} Q{Math.floor(f.number / 100)}</b> ({f.type}): {f.flags.join(' ')}</div>)}
                  </div>
                </details>
              )}
              {importReport.duplicates && importReport.duplicates.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: '0.55rem', color: '#42a5f5', cursor: 'pointer' }}>Show existing quizzes ({importReport.duplicates.length})</summary>
                  <div style={{ maxHeight: 120, overflowY: 'auto', marginTop: 4, padding: '4px 6px', background: 'rgba(0,0,0,0.2)', borderRadius: 4 }}>
                    {importReport.duplicates.map((d, i) => <div key={i} style={{ fontSize: '0.5rem', color: 'var(--text-dim)', padding: '1px 0' }}>{d.title} — {`${d.newInFile} in file: ${d.rebuilt ? `${d.rebuilt} rebuilt in place` : 'none rebuilt'}${d.appended > 0 ? `, +${d.appended} new added` : ''} (${d.existingCount} questions now)`}</div>)}
                  </div>
                </details>
              )}
              {importReport.unmatchedTitles && importReport.unmatchedTitles.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: '0.55rem', color: '#ffab00', cursor: 'pointer' }}>Show unmatched titles ({importReport.unmatchedTitles.length})</summary>
                  <div style={{ maxHeight: 150, overflowY: 'auto', marginTop: 4, padding: '4px 6px', background: 'rgba(0,0,0,0.2)', borderRadius: 4 }}>
                    {importReport.unmatchedTitles.map((t, i) => <div key={i} style={{ fontSize: '0.5rem', color: 'var(--text-dim)', padding: '1px 0' }}>{t}</div>)}
                  </div>
                </details>
              )}
              {importReport.errors.length > 0 && (
                <div style={{ marginTop: 8, color: 'var(--danger)', fontSize: '0.55rem' }}>
                  {importReport.errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
              {importReport.chunkSizes && (
                <div style={{ marginTop: 8, fontSize: '0.45rem', color: 'var(--text-dim)' }}>
                  DB: {Object.entries(importReport.chunkSizes).map(([k, v]) => `${k} ${(v / 1024).toFixed(0)}KB`).join(' · ')}
                  {importReport.chunkSizes.content > 900000 && <span style={{ color: 'var(--danger)', marginLeft: 4 }}> (content near 1MB limit!)</span>}
                </div>
              )}
            </div>
            <div className="modal-actions" style={{ marginTop: 12 }}>
              {importReport.setIds?.length > 0 && (
                <button className="btn" onClick={() => setTagAfterImport(importReport.setIds)}>{'✨'} Tag new questions with AI</button>
              )}
              <button className="btn" onClick={() => fileInputRef.current?.click()}>Import Another</button>
              <button className="btn btn-outline" onClick={() => setImportReport(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default QuizBuilder
