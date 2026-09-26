import { initializeApp } from 'firebase/app'
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, getDocs, deleteDoc, runTransaction, updateDoc, arrayUnion } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyB4plF1oMkqzR2pW40Ecw094u-6ftbYuJI",
  authDomain: "cleverspacev2.firebaseapp.com",
  projectId: "cleverspacev2",
  storageBucket: "cleverspacev2.firebasestorage.app",
  messagingSenderId: "99357995338",
  appId: "1:99357995338:web:81bca894b1594fa63b51b3",
  measurementId: "G-DEBD9NZ0ED"
}

export const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

const CHUNKS = ['core', 'content', 'activity', 'shop', 'extras']
// Quiz sets are one document each in QUIZ_SETS_COLLECTION. The old
// appData/imports-0..3 buckets are no longer read or written: the one-off
// migration from them is complete, and treating an empty collection as
// "not yet migrated" resurrected deleted quizzes from that stale backup.
const QUIZ_SETS_COLLECTION = 'quizSets'
const UNASSIGNED_DOC = 'unassigned'

const CHUNK_KEYS = {
  core: ['organisations', 'teachers', 'students', 'classes', '_savedAt', 'notificationPrefs', 'smsLog', 'leaderboardSnapshots'],
  content: ['topics', 'tagLibrary', 'classGroups', 'policies', 'quizzes', 'quizAttempts', 'courses', 'quizFolders', 'writingMarks', 'questionReports', 'explanationReports', 'newsfeedPosts'],
  activity: ['scores', 'testEvents', 'eventTemplates', 'homeworkAttempts', 'homeworkStarts', 'homeworkRedos', 'homeworkProgress', 'dailyTrivia', 'dailyPuzzles'],
  shop: ['shopItems', 'shopCategories', 'purchases', 'avatarPool', 'shopPools', 'lootChestPool', 'voucherConfig'],
  extras: ['battlegroundsData', 'dojoCards', 'dojoClones', 'dojoKills', 'dojoCustomReview', 'vocabBank', 'wordleSolvers', 'arenaGhosts'],
}

let _cache = null
let _ready = false
let _readyPromise = null
let _writeQueue = Promise.resolve()
let _lastWriteErrors = []
let _lastWrittenChunks = {}
let _localWriteInFlight = new Set()
let _changeListeners = []
let _lastWrittenSets = {}      // setId -> serialised form last persisted
let _lastWrittenUnassigned = null
let _setWritesInFlight = new Set()
let _sharedListenersStarted = false
let _sharedUnsubs = []
let _syncScope = null
let _syncUserId = null

export function isDataReady() {
  return _ready
}

export function getLastWriteErrors() {
  return _lastWriteErrors
}

export function getChunkSizes() {
  if (!_cache) return {}
  const sizes = {}
  for (const chunk of CHUNKS) {
    const payload = buildPayload(chunk, _cache)
    sizes[chunk] = JSON.stringify(payload).length
  }
  // Quiz sets are one document each now; report the largest so the 1 MiB
  // per-document cap stays visible.
  const sets = _cache.importedQuizSets || []
  let biggest = 0
  for (const set of sets) {
    const n = JSON.stringify(set).length
    if (n > biggest) biggest = n
  }
  if (sets.length) {
    sizes[`${QUIZ_SETS_COLLECTION} (${sets.length} docs, largest)`] = biggest
  }
  sizes[UNASSIGNED_DOC] = JSON.stringify(_cache.unassignedQuestions || []).length
  return sizes
}

export function onDataChange(fn) {
  _changeListeners.push(fn)
  return () => { _changeListeners = _changeListeners.filter(f => f !== fn) }
}

function notifyChange() {
  for (const fn of _changeListeners) {
    try { fn() } catch {}
  }
}

function getLocalData() {
  let raw
  try { raw = localStorage.getItem('leaderboard_data') } catch { raw = null }
  return raw ? JSON.parse(raw) : null
}

// Fields that must never be written back into the shared (all-signed-in-users
// readable) student records. They live in studentContacts, teacher-only.
const PRIVATE_STUDENT_FIELDS = ['parentPhone', 'parentEmail', 'password']

function withoutPrivateFields(students) {
  if (!students || typeof students !== 'object') return students
  const out = {}
  for (const [id, s] of Object.entries(students)) {
    if (!s || typeof s !== 'object' || !PRIVATE_STUDENT_FIELDS.some((f) => f in s)) { out[id] = s; continue }
    const copy = { ...s }
    for (const f of PRIVATE_STUDENT_FIELDS) delete copy[f]
    out[id] = copy
  }
  return out
}

// ------------------------------------------------------------
// Nested arrays
//
// Firestore refuses an array whose elements are themselves arrays, and one
// rejected field fails the whole document. A quiz attempt stores one answer per
// question, and a cloze, drag or matching answer IS an array - so a single such
// question in a quiz made every write of that student's document fail, and
// their results vanished on the next reload.
//
// Arrays nested directly inside arrays are wrapped on the way out and unwrapped
// on the way in, so the rest of the app keeps working with plain arrays.
// ------------------------------------------------------------
const NESTED_ARRAY_KEY = '__arr'

function packNested(value, insideArray = false) {
  if (Array.isArray(value)) {
    const items = value.map((item) => packNested(item, true))
    return insideArray ? { [NESTED_ARRAY_KEY]: items } : items
  }
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = packNested(v, false)
    return out
  }
  return value
}

function unpackNested(value) {
  if (Array.isArray(value)) return value.map(unpackNested)
  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 1 && keys[0] === NESTED_ARRAY_KEY && Array.isArray(value[NESTED_ARRAY_KEY])) {
      return value[NESTED_ARRAY_KEY].map(unpackNested)
    }
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = unpackNested(v)
    return out
  }
  return value
}

function buildPayload(chunk, data) {
  const keys = CHUNK_KEYS[chunk]
  const payload = {}
  for (const key of keys) {
    if (data[key] !== undefined) {
      payload[key] = chunk === 'core' && key === 'students' ? withoutPrivateFields(data[key]) : data[key]
    }
  }
  return payload
}

// ------------------------------------------------------------
// Parent contact details (studentContacts/{studentId}, teachers only)
// ------------------------------------------------------------
let _contacts = null

/** Loads every student's parent contact. Teachers only - rules refuse others. */
export async function loadContacts(force = false) {
  if (_contacts && !force) return _contacts
  try {
    const snap = await getDocs(collection(db, 'studentContacts'))
    _contacts = {}
    for (const d of snap.docs) _contacts[d.id] = d.data()
    notifyChange()
  } catch (e) {
    console.warn('Firestore: could not load parent contacts:', e?.code || e)
    _contacts = _contacts || {}
  }
  return _contacts
}

/** @returns {{parentPhone: string, parentEmail: string}} ('' when not loaded) */
export function getContact(studentId) {
  const c = (_contacts && _contacts[studentId]) || {}
  return { parentPhone: c.parentPhone || '', parentEmail: c.parentEmail || '' }
}

/** A signed-in student's own parent contact (rules allow only their own). */
export async function loadOwnContact(studentId) {
  try {
    const snap = await getDoc(doc(db, 'studentContacts', String(studentId)))
    return snap.exists() ? snap.data() : {}
  } catch {
    return {}
  }
}

export async function saveContact(studentId, fields) {
  const next = { ...getContact(studentId), ...fields, updatedAt: Date.now() }
  _contacts = { ...(_contacts || {}), [studentId]: next }
  notifyChange()
  await setDoc(doc(db, 'studentContacts', String(studentId)), next)
}


/** Quiz sets used by the courses of every class this student belongs to. */
function assignedQuizSetIds(data, studentId) {
  if (!studentId) return []
  const classIds = Object.entries(data.classes || {})
    .filter(([, cls]) => Array.isArray(cls?.studentIds) && cls.studentIds.includes(studentId))
    .map(([id]) => id)
  const ids = new Set()
  for (const course of data.courses || []) {
    if (!classIds.includes(course.classId)) continue
    // A course can be limited to named students within the class; no list
    // means the whole class takes it. Mirrors courseIncludesStudent in store.js.
    if (Array.isArray(course.studentIds) && !course.studentIds.includes(studentId)) continue
    for (const mod of course.modules || []) for (const id of mod.quizSetIds || []) ids.add(id)
  }
  return [...ids]
}

// The quiz library is the largest read this app makes (~22 MB across 600+
// documents). On a weak connection it can fail outright, and it used to do so
// silently: a teacher was then shown only the handful of sets that later got
// fetched on demand, which looks exactly like "my imports did not upload".
let _libraryError = null

/** The error from the last whole-library read, or null. */
export function getLibraryError() {
  return _libraryError
}

async function fetchWholeLibrary() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const qs = await getDocs(collection(db, QUIZ_SETS_COLLECTION))
      _libraryError = null
      return qs
    } catch (e) {
      console.warn(`Firestore: quizSets read failed (attempt ${attempt}/3):`, e)
      _libraryError = e?.message || String(e)
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 800))
    }
  }
  return null
}

/**
 * Re-reads the whole library and merges it into the cache. Used by the "Sync
 * library" button, so a teacher whose first read failed - or who is on a second
 * device - can pull in what another device imported without signing out.
 * @returns {Promise<{ok:boolean, total:number, added:number, error:string|null}>}
 */
export async function resyncQuizSets() {
  if (!_cache) return { ok: false, total: 0, added: 0, error: 'not ready' }
  const qs = await fetchWholeLibrary()
  if (!qs) return { ok: false, total: 0, added: 0, error: _libraryError }
  const remote = qs.docs.map((d) => d.data()).filter((s) => s && s.id)
  const byId = new Map((_cache.importedQuizSets || []).map((s) => [s.id, s]))
  let added = 0
  for (const set of remote) {
    if (!byId.has(set.id)) added++
    byId.set(set.id, set)
    _lastWrittenSets[set.id] = JSON.stringify(set)
  }
  _cache.importedQuizSets = [...byId.values()]
  notifyChange()
  return { ok: true, total: remote.length, added, error: null }
}

/**
 * Writes every cached quiz set the server does not have. Recovers a library
 * that was imported on a device whose uploads never finished.
 * @returns {Promise<{checked:number, uploaded:number}>}
 */
export async function uploadMissingQuizSets() {
  if (!_cache) return { checked: 0, uploaded: 0 }
  const local = (_cache.importedQuizSets || []).filter((s) => s && s.id)
  const qs = await fetchWholeLibrary()
  const onServer = new Set(qs ? qs.docs.map((d) => d.id) : [])
  const missing = local.filter((s) => !onServer.has(s.id))
  for (const set of missing) {
    try {
      await setDoc(doc(db, QUIZ_SETS_COLLECTION, set.id), packNested(set))
      _lastWrittenSets[set.id] = JSON.stringify(set)
    } catch (e) {
      console.warn(`Firestore: failed to upload quiz set ${set.id}:`, e)
    }
  }
  return { checked: local.length, uploaded: missing.length }
}

/** Reads the named quiz sets, in parallel, skipping any that no longer exist. */
async function fetchQuizSets(ids) {
  const wanted = [...new Set(ids)].filter(Boolean)
  if (!wanted.length) return []
  const snaps = await Promise.all(wanted.map((id) => getDoc(doc(db, QUIZ_SETS_COLLECTION, id)).catch(() => null)))
  return snaps.filter((snap) => snap && snap.exists()).map((snap) => unpackNested(snap.data()))
}

/**
 * Makes sure these quiz sets are in the cache, fetching any that are missing.
 * Students load their assigned sets at sign-in; this covers the rest - a quiz
 * assigned mid-session, or a set behind an old attempt or a revision card.
 * @returns {Promise<number>} how many were added
 */
/**
 * Re-reads one quiz set from Firestore and replaces the cached copy.
 *
 * A student downloads their quizzes at sign-in, so a teacher's change - a time
 * limit, a fixed answer, an extra question - would otherwise not reach anyone
 * already signed in. One document read before a quiz starts is cheap and keeps
 * a paper's rules current.
 * @returns {Promise<object|null>} the fresh set, or null if it is gone
 */
export async function refreshQuizSet(id) {
  if (!id || !_cache) return null
  try {
    const snap = await getDoc(doc(db, QUIZ_SETS_COLLECTION, id))
    if (!snap.exists()) return null
    const fresh = unpackNested(snap.data())
    const sets = _cache.importedQuizSets || []
    const idx = sets.findIndex((s) => s && s.id === id)
    if (idx >= 0) sets[idx] = fresh
    else sets.push(fresh)
    _cache.importedQuizSets = sets
    _lastWrittenSets[id] = JSON.stringify(fresh)
    notifyChange()
    return fresh
  } catch (e) {
    console.warn(`Firestore: failed to refresh quiz set ${id}:`, e)
    return null
  }
}

export async function ensureQuizSetsLoaded(ids) {
  if (!_cache) return 0
  const have = new Set((_cache.importedQuizSets || []).map((s) => s.id))
  const missing = [...new Set(ids)].filter((id) => id && !have.has(id))
  if (!missing.length) return 0
  const fetched = await fetchQuizSets(missing)
  if (!fetched.length) return 0
  _cache.importedQuizSets = [...(_cache.importedQuizSets || []), ...fetched]
  for (const set of fetched) _lastWrittenSets[set.id] = JSON.stringify(set)
  notifyChange()
  return fetched.length
}

// ------------------------------------------------------------
// Shared AI explanations
//
// Explanations the AI writes during review are worth generating once for the
// whole school, not once per student: the second student to ask the same
// question reads the first one's answer. Keyed by quiz set, with one entry per
// question, so a set's explanations arrive in a single read.
// ------------------------------------------------------------
const AI_EXPLANATIONS_COLLECTION = 'aiExplanations'
const _aiExpCache = new Map() // setId -> { [questionKey]: { general, options } }

/** Loads (and memoises) every cached explanation for one quiz set. */
export async function loadAiExplanations(setId) {
  if (!setId) return {}
  if (_aiExpCache.has(setId)) return _aiExpCache.get(setId)
  let data = {}
  try {
    const snap = await getDoc(doc(db, AI_EXPLANATIONS_COLLECTION, String(setId)))
    if (snap.exists()) data = snap.data() || {}
  } catch (e) {
    console.warn('Firestore: failed to load AI explanations:', e)
  }
  _aiExpCache.set(setId, data)
  return data
}

/**
 * Stores one question's generated explanation for everyone else. Merges, so two
 * students generating different questions at once cannot overwrite each other.
 */
export async function saveAiExplanation(setId, questionKey, payload) {
  if (!setId || !questionKey || !payload) return false
  const local = _aiExpCache.get(setId) || {}
  local[questionKey] = payload
  _aiExpCache.set(setId, local)
  try {
    await setDoc(doc(db, AI_EXPLANATIONS_COLLECTION, String(setId)), { [questionKey]: payload }, { merge: true })
    return true
  } catch (e) {
    console.warn('Firestore: failed to save AI explanation:', e)
    return false
  }
}

/** Drops a set's memoised explanations (after a teacher edits its questions). */
export function clearAiExplanationCache(setId) {
  if (setId) _aiExpCache.delete(setId)
  else _aiExpCache.clear()
}

/**
 * Subscribes to the shared appData chunks.
 *
 * Only teachers do this. Every listener receives the *entire* document on each
 * write, so having every student subscribe made the cost of one write scale
 * with the number of people online - the fanout that breaks under concurrent
 * quiz-taking. Teachers are few, so their live dashboards cost little.
 * Students read once at load and subscribe only to their own document.
 */
function startListeners() {
  if (_sharedListenersStarted) return
  _sharedListenersStarted = true
  for (const chunk of CHUNKS) {
    const ref = doc(db, 'appData', chunk)
    _sharedUnsubs.push(onSnapshot(ref, (snap) => {
      if (!snap.exists()) return
      if (snap.metadata.hasPendingWrites) return
      if (_localWriteInFlight.has(chunk)) return

      const remoteData = unpackNested(snap.data())
      const keys = CHUNK_KEYS[chunk]
      let changed = false
      for (const key of keys) {
        if (remoteData[key] !== undefined) {
          _cache[key] = remoteData[key]
          changed = true
        }
      }

      if (changed) {
        _lastWrittenChunks[chunk] = JSON.stringify(buildPayload(chunk, _cache))
        scheduleLocalMirror()
        notifyChange()
      }
    }, (err) => {
      console.warn(`Firestore: listener for "${chunk}" failed:`, err)
    }))
  }

  // The legacy imports-N buckets are no longer watched. They are a read-only
  // backup since quiz sets moved to per-document storage, and a snapshot from
  // them would overwrite fresh per-set data with stale bucket contents.
}

/**
 * Forgets everything this tab loaded, so the next sign-in reads from scratch.
 *
 * initFirestore() memoises its promise for the life of the tab. Without this,
 * signing out of a student account and into a teacher account in the same tab
 * kept the student's data: a student loads only their assigned quiz sets, so
 * the teacher was shown that handful and none of the rest of the library.
 */
export function resetFirestore() {
  for (const unsub of _sharedUnsubs) {
    try { unsub() } catch { /* already gone */ }
  }
  _sharedUnsubs = []
  _sharedListenersStarted = false
  for (const id of Object.keys(_studentListeners)) {
    try { _studentListeners[id]() } catch { /* already gone */ }
    delete _studentListeners[id]
  }
  for (const id of Object.keys(_studentCache)) delete _studentCache[id]
  for (const id of Object.keys(_studentLastWritten)) delete _studentLastWritten[id]
  stopBroadcastListener()
  clearAiExplanationCache()
  _cache = null
  _ready = false
  _readyPromise = null
  _lastWrittenChunks = {}
  _lastWrittenSets = {}
  _lastWrittenUnassigned = null
  _libraryError = null
  _syncScope = null
  _syncUserId = null
}

export async function initFirestore() {
  if (_readyPromise) return _readyPromise

  _readyPromise = (async () => {
    try {
      const cloudData = {}
      let hasCloudData = false

      // A teacher browses the whole library, so they read all of it. A student
      // needs only the quizzes their own classes use: the library is tens of
      // megabytes, and downloading it to twenty devices at the start of a
      // lesson is what makes a classroom crawl.
      const studentOnly = _syncScope === 'student'
      const allReads = [
        ...CHUNKS.map((chunk) => getDoc(doc(db, 'appData', chunk)).then((snap) => ({ type: 'chunk', chunk, snap })).catch((e) => { console.warn(`Firestore: failed to load chunk "${chunk}":`, e); return null })),
        ...(studentOnly ? [] : [
          fetchWholeLibrary().then((qs) => ({ type: 'quizSets', qs })),
          getDoc(doc(db, 'appData', UNASSIGNED_DOC)).then((snap) => ({ type: 'unassigned', snap })).catch(() => null),
        ]),
      ]
      const results = await Promise.all(allReads)

      let perSetSets = []
      let perSetUnassigned = []

      for (const r of results) {
        if (!r) continue
        if (r.type === 'quizSets') {
          perSetSets = r.qs ? r.qs.docs.map((d) => d.data()) : []
          if (perSetSets.length) hasCloudData = true
          continue
        }
        if (!r.snap || !r.snap.exists()) continue
        hasCloudData = true
        if (r.type === 'chunk') {
          Object.assign(cloudData, unpackNested(r.snap.data()))
        } else if (r.type === 'unassigned') {
          perSetUnassigned = unpackNested(r.snap.data()).unassignedQuestions || []
        }
      }

      if (studentOnly) {
        perSetSets = await fetchQuizSets(assignedQuizSetIds(cloudData, _syncUserId))
        if (perSetSets.length) hasCloudData = true
      }

      // An empty collection means there are no quiz sets - never a reason to
      // restore anything.
      cloudData.importedQuizSets = perSetSets
      cloudData.unassignedQuestions = perSetUnassigned

      const localData = getLocalData()
      const localTs = localData?._savedAt || 0
      const cloudTs = cloudData._savedAt || 0

      // The cloud is always authoritative when it has data. This used to
      // force-upload a localStorage copy whenever its timestamp looked newer -
      // a device with a skewed clock, or a save still in flight, would then
      // overwrite every shared document (and resurrect deleted quiz sets) with
      // its stale copy. localStorage is only a fallback when the cloud is empty
      // or unreachable.
      if (hasCloudData) {
        if (localTs > cloudTs) {
          console.warn(`Firestore: ignoring newer-looking localStorage copy (local=${localTs}, cloud=${cloudTs}); cloud is authoritative`)
        }
        _cache = cloudData
      } else {
        _cache = localData || {}
      }
    } catch (e) {
      console.error('Firestore init error:', e)
      _cache = getLocalData() || {}
    }

    if (!_cache) _cache = {}
    _ready = true

    for (const chunk of CHUNKS) {
      _lastWrittenChunks[chunk] = JSON.stringify(buildPayload(chunk, _cache))
    }
    for (const set of _cache.importedQuizSets || []) {
      if (set && set.id) _lastWrittenSets[set.id] = JSON.stringify(set)
    }
    _lastWrittenUnassigned = JSON.stringify(_cache.unassignedQuestions || [])

    try {
      startBroadcastListener()
      // Shared-chunk listeners wait for setSyncScope() once the role is known.
      if (_syncScope === 'teacher') startListeners()
    } catch (e) {
      console.warn('Firestore: failed to start real-time listeners:', e)
    }
  })()

  return _readyPromise
}

/**
 * Declares how much this client should keep live-synced.
 * 'teacher' subscribes to the shared chunks; 'student' subscribes to nothing
 * global (their own studentData listener is started separately).
 */
export function setSyncScope(role, userId = null) {
  _syncScope = role
  _syncUserId = userId ? String(userId) : null
  if (role !== 'teacher') return
  // Called either side of initFirestore(): start now if the data is already
  // loaded, otherwise as soon as it is. Waiting on _ready alone meant a teacher
  // who signed in mid-load got no live updates at all until they reloaded.
  const start = () => {
    try { startListeners() } catch (e) {
      console.warn('Firestore: failed to start shared listeners:', e)
    }
  }
  if (_ready) start()
  else if (_readyPromise) _readyPromise.then(start).catch(() => {})
}

/**
 * Re-reads the shared chunks once. Students have no standing subscription, so
 * this is how they pick up teacher-side changes (new assignments, term
 * changes) - called on sign-in and when the tab regains focus.
 */
export async function refreshSharedData() {
  if (!_ready || !_cache) return false
  try {
    const snaps = await Promise.all(
      CHUNKS.map((chunk) =>
        getDoc(doc(db, 'appData', chunk))
          .then((snap) => ({ chunk, snap }))
          .catch(() => null)
      )
    )
    let changed = false
    for (const r of snaps) {
      if (!r || !r.snap.exists()) continue
      const remote = unpackNested(r.snap.data())
      for (const key of CHUNK_KEYS[r.chunk]) {
        if (remote[key] === undefined) continue
        if (JSON.stringify(_cache[key]) === JSON.stringify(remote[key])) continue
        _cache[key] = remote[key]
        changed = true
      }
      _lastWrittenChunks[r.chunk] = JSON.stringify(buildPayload(r.chunk, _cache))
    }
    if (changed) notifyChange()
    return changed
  } catch (e) {
    console.warn('Firestore: refreshSharedData failed:', e)
    return false
  }
}

export function getSyncScope() {
  return _syncScope
}

/** The user id this tab's data was loaded for, as a string. */
export function getSyncUserId() {
  return _syncUserId
}

export function getFirestoreCache() {
  return _cache
}

// ------------------------------------------------------------
// Write coalescing
//
// Every save used to deep-clone the whole dataset (~4 MB) and queue a full
// write pass immediately, and every save and every incoming snapshot also
// re-serialised the dataset into localStorage. Deleting ten quiz sets meant
// ten clones, ten write passes and ten 4 MB localStorage writes, all on the
// main thread - which is what made bulk actions freeze.
//
// Saves now mark the data dirty and a single flush runs shortly afterwards,
// so a burst of changes costs one write pass. No clone is needed: Firestore
// serialises the payload synchronously when setDoc is called, and the cache
// always holds the newest state. Pending writes are flushed when the page is
// hidden or closed so nothing is lost.
// ------------------------------------------------------------
const WRITE_COALESCE_MS = 250
const LOCAL_MIRROR_MS = 2000
let _flushTimer = null
let _mirrorTimer = null

function flushWrites() {
  if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null }
  const data = _cache
  if (!data) return
  _inFlight++
  _writeQueue = _writeQueue
    .then(() => writeAllChunks(data, false))
    .catch((e) => { console.error('Firestore write failed:', e) })
    .finally(() => { _inFlight = Math.max(0, _inFlight - 1) })
}

/** Mirrors the cache into localStorage in the background (offline fallback only). */
export function scheduleLocalMirror(data) {
  if (data) _cache = _cache || data
  if (_mirrorTimer) return
  const run = () => {
    _mirrorTimer = null
    try { localStorage.setItem('leaderboard_data', JSON.stringify(_cache)) } catch { /* quota or blocked */ }
  }
  _mirrorTimer = typeof requestIdleCallback === 'function'
    ? requestIdleCallback(run, { timeout: LOCAL_MIRROR_MS })
    : setTimeout(run, LOCAL_MIRROR_MS)
}

// Tracks writes that have been queued but not confirmed, so the page can warn
// before closing. Uploading a quiz library takes a while; a reload halfway
// through used to leave the sets on this device only.
let _inFlight = 0

/** How many write passes are still waiting to reach Firestore. */
export function pendingWriteCount() {
  return _inFlight + (_flushTimer ? 1 : 0)
}

if (typeof window !== 'undefined') {
  const flushNow = () => { if (_flushTimer) flushWrites() }
  window.addEventListener('pagehide', flushNow)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow()
  })
  window.addEventListener('beforeunload', (e) => {
    flushNow()
    if (pendingWriteCount() === 0) return
    e.preventDefault()
    e.returnValue = 'Changes are still saving to the cloud. Leave anyway?'
    return e.returnValue
  })
}

export function saveToFirestore(data) {
  _cache = data
  if (_flushTimer) return
  _flushTimer = setTimeout(flushWrites, WRITE_COALESCE_MS)
}

/**
 * Writes anything still waiting and resolves once it has landed. Call before
 * reloading or re-reading: saves are coalesced for 250ms, so a reload straight
 * after a change could otherwise discard it.
 */
export async function flushPendingWrites() {
  flushWrites()
  try { await _writeQueue } catch { /* the write logs its own failure */ }
}

/**
 * Persists imported quiz sets as one document per set.
 *
 * Each set averages ~34 KB and the largest is ~148 KB, so every document sits
 * far below Firestore's 1 MiB cap - the ceiling the old 4-bucket layout hit.
 * Only sets whose content actually changed are written, so editing one quiz
 * costs one small write instead of rewriting a ~1 MB bucket.
 */
async function writeQuizSets(data) {
  const sets = data.importedQuizSets || []
  const seen = new Set()

  for (const set of sets) {
    if (!set || !set.id) continue
    seen.add(set.id)
    const serialised = JSON.stringify(set)
    if (_lastWrittenSets[set.id] === serialised) continue
    try {
      _setWritesInFlight.add(set.id)
      await setDoc(doc(db, QUIZ_SETS_COLLECTION, set.id), packNested(set))
      _lastWrittenSets[set.id] = serialised
      _setWritesInFlight.delete(set.id)
    } catch (e) {
      delete _lastWrittenSets[set.id]
      const size = serialised.length
      console.error(`Firestore: quiz set "${set.id}" write failed (${(size / 1024).toFixed(0)} KB):`, e)
      _lastWriteErrors.push({ chunk: `quizSet:${set.id}`, size, error: e.message })
      setTimeout(() => _setWritesInFlight.delete(set.id), 3000)
    }
  }

  // Remove documents for sets deleted locally.
  for (const id of Object.keys(_lastWrittenSets)) {
    if (seen.has(id)) continue
    try {
      await deleteDoc(doc(db, QUIZ_SETS_COLLECTION, id))
      delete _lastWrittenSets[id]
    } catch (e) {
      console.warn(`Firestore: failed to delete quiz set "${id}":`, e)
    }
  }

  const unassigned = data.unassignedQuestions || []
  const unassignedStr = JSON.stringify(unassigned)
  if (unassignedStr !== _lastWrittenUnassigned) {
    try {
      await setDoc(doc(db, 'appData', UNASSIGNED_DOC), packNested({ unassignedQuestions: unassigned }))
      _lastWrittenUnassigned = unassignedStr
    } catch (e) {
      console.error('Firestore: unassigned questions write failed:', e)
      _lastWriteErrors.push({ chunk: UNASSIGNED_DOC, size: unassignedStr.length, error: e.message })
    }
  }
}

// ------------------------------------------------------------
// Three-way merge for shared chunk writes
//
// Chunks used to be written with setDoc(payload): this client's entire copy
// replaced the document. A client holding an old copy - every student, since
// they no longer live-subscribe - therefore erased everyone else's newer
// changes (new students, approvals, other students' scores) whenever it saved
// anything in that chunk.
//
// Now each write runs in a transaction: read the current document, work out
// what *this* client changed relative to what it last saw (base), and apply
// only those changes on top of the fresh document. Records are matched by key
// (maps) or by `id` (arrays of records), recursing into nested maps, so edits
// to different records - or different fields of one record - never collide.
// Values without that structure fall back to last-write-wins, as before.
// ------------------------------------------------------------
const MERGE_DEPTH = 3

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function isRecordArray(a) {
  return Array.isArray(a) && a.every((x) => isPlainObject(x) && x.id != null)
}

function mergeValue(base, local, fresh, depth = 0) {
  // Untouched by this client: the server's version stands (including its
  // additions and deletions).
  if (sameValue(local, base)) return fresh === undefined ? local : fresh

  if (depth < MERGE_DEPTH && isPlainObject(local) && isPlainObject(base)) {
    const out = isPlainObject(fresh) ? { ...fresh } : {}
    for (const k of new Set([...Object.keys(base), ...Object.keys(local)])) {
      if (sameValue(local[k], base[k])) continue
      if (local[k] === undefined) delete out[k]
      else out[k] = mergeValue(base[k], local[k], out[k], depth + 1)
    }
    return out
  }

  if (isRecordArray(local) && isRecordArray(base)) {
    const baseById = new Map(base.map((x) => [x.id, x]))
    const localById = new Map(local.map((x) => [x.id, x]))
    const result = []
    const seen = new Set()
    for (const item of Array.isArray(fresh) ? fresh : []) {
      const id = item?.id
      if (id == null) { result.push(item); continue }
      seen.add(id)
      const inBase = baseById.has(id)
      const inLocal = localById.has(id)
      if (inBase && !inLocal) continue // removed here
      if (inLocal && !sameValue(localById.get(id), baseById.get(id))) {
        result.push(localById.get(id)) // changed here
      } else {
        result.push(item)
      }
    }
    for (const item of local) {
      if (!seen.has(item.id) && !baseById.has(item.id)) result.push(item) // added here
    }
    return result
  }

  return local
}

async function writeChunk(chunk, payload, forceAll) {
  const ref = doc(db, 'appData', chunk)
  const baseStr = _lastWrittenChunks[chunk]

  // No known base (or an explicit full resync): nothing to merge against.
  if (forceAll || !baseStr) {
    await setDoc(ref, packNested(payload))
    return payload
  }

  const base = JSON.parse(baseStr)
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    const fresh = snap.exists() ? unpackNested(snap.data()) : {}
    const merged = {}
    for (const key of CHUNK_KEYS[chunk]) {
      const v = mergeValue(base[key], payload[key], fresh[key])
      if (v !== undefined) merged[key] = v
    }
    tx.set(ref, packNested(merged))
    return merged
  })
}

// ------------------------------------------------------------
// What a student may change in the shared chunks (mirrors firestore.rules).
//
// `keys` are the top-level fields a student write may touch; `ownMaps` are
// maps keyed by student id where only the student's own entry may change.
// Students cannot edit courses, quizzes, classes, the shop setup, teachers,
// or anyone else's record.
// ------------------------------------------------------------
const STUDENT_WRITABLE = {
  core: { keys: ['students', '_savedAt'], ownMaps: ['students'] },
  activity: { keys: ['scores', 'dailyTrivia', 'dailyPuzzles'], ownMaps: [] },
  shop: { keys: ['purchases'], ownMaps: [] },
  extras: { keys: ['wordleSolvers', 'arenaGhosts', 'dojoClones', 'dojoKills'], ownMaps: ['dojoKills'] },
  content: { keys: [], ownMaps: [] },
}

/**
 * Restricts a student's chunk payload to what they are allowed to change,
 * taking every other value from `base` (what this client last saw).
 *
 * Needed beyond the rules themselves: loading data fills in defaults across
 * every record (other students, courses, classes), so an unrestricted student
 * save would carry those edits too - and the rules would then reject the whole
 * write, losing the student's genuine change along with it.
 */
function projectStudentPayload(chunk, payload, base, uid) {
  const allowed = STUDENT_WRITABLE[chunk] || { keys: [], ownMaps: [] }
  const out = {}
  for (const key of CHUNK_KEYS[chunk]) {
    const fromBase = base ? base[key] : undefined
    if (!allowed.keys.includes(key)) {
      if (fromBase !== undefined) out[key] = fromBase
      continue
    }
    if (allowed.ownMaps.includes(key)) {
      const merged = { ...(fromBase || {}) }
      const mine = payload[key] ? payload[key][uid] : undefined
      if (mine === undefined) delete merged[uid]
      else merged[uid] = mine
      out[key] = merged
      continue
    }
    if (payload[key] !== undefined) out[key] = payload[key]
    else if (fromBase !== undefined) out[key] = fromBase
  }
  return out
}

async function writeAllChunks(data, forceAll) {
  _lastWriteErrors = []
  let adoptedRemote = false
  const studentUid = _syncScope === 'student' ? getAuth(app).currentUser?.uid : null
  for (const chunk of CHUNKS) {
    let payload = buildPayload(chunk, data)
    if (Object.keys(payload).length === 0) continue
    if (_syncScope === 'student') {
      const baseStr = _lastWrittenChunks[chunk]
      if (!studentUid || !baseStr) continue // nothing a student can safely write
      payload = projectStudentPayload(chunk, payload, JSON.parse(baseStr), studentUid)
    }

    const payloadStr = JSON.stringify(payload)
    if (!forceAll && payloadStr === _lastWrittenChunks[chunk]) continue

    try {
      _localWriteInFlight.add(chunk)
      const written = await writeChunk(chunk, payload, forceAll)
      const writtenStr = JSON.stringify(written)
      // Adopt changes other clients made in the meantime.
      if (_cache && writtenStr !== payloadStr) {
        for (const key of CHUNK_KEYS[chunk]) {
          if (written[key] !== undefined) _cache[key] = written[key]
        }
        adoptedRemote = true
      }
      _lastWrittenChunks[chunk] = writtenStr
      _localWriteInFlight.delete(chunk)
    } catch (e) {
      // Keep the base: dropping it would make the next write a blind overwrite.
      const size = payloadStr.length
      console.error(`Firestore: chunk "${chunk}" write failed (${(size / 1024).toFixed(0)} KB):`, e)
      _lastWriteErrors.push({ chunk, size, error: e.message })
      setTimeout(() => _localWriteInFlight.delete(chunk), 3000)
    }
  }
  if (adoptedRemote) notifyChange()
  await writeQuizSets(data)

  if (_lastWriteErrors.length > 0) {
    console.warn(`Firestore: ${_lastWriteErrors.length} chunk(s) failed to write:`, _lastWriteErrors.map(e => `${e.chunk} (${(e.size / 1024).toFixed(0)} KB)`).join(', '))
  }
}

// --- Per-student data ---
const STUDENT_DATA_KEYS = [
  'homeworkAttempts', 'homeworkRedos', 'homeworkProgress', 'homeworkStarts',
  'quizAttempts', 'dojoCards', 'dojoClones', 'dojoKills', 'dojoCustomReview',
  'purchases', 'vocabBank', 'questionReports', 'explanationReports',
  'scores', 'policyAcceptances',
]

const STUDENT_PROFILE_KEYS = [
  'tokens', 'tokensEarned', 'coinsSpent', 'bonusCoins',
  'avatar', 'unlockedAvatars', 'unlockedLoot',
  'arenaElo', 'arenaHistory', 'dailyGames',
  'battlegroundsLastActive', 'purchasedTracks',
  'lastTriviaDate', 'lastTriviaCorrect', 'lastTriviaChoice',
]

let _studentCache = {}
let _studentWriteQueues = {}
let _studentListeners = {}
let _studentLastWritten = {}
let _studentWriteInFlight = new Set()

export function getStudentDataKeys() { return STUDENT_DATA_KEYS }
export function getStudentProfileKeys() { return STUDENT_PROFILE_KEYS }

export function isStudentDataReady(studentId) {
  return !!_studentCache[studentId]
}

export function getStudentCache(studentId) {
  return _studentCache[studentId] || null
}

/**
 * Bulk-loads a set of students' documents into the cache without attaching
 * listeners.
 *
 * Teachers use this when opening a class so that cross-student views (results
 * grids, attempt lists) can stay synchronous while reading per-student
 * documents instead of the shared blob. Listeners are deliberately not started
 * - a teacher watching 30 student documents would reintroduce the fanout that
 * Phase 2 removed, and these views refresh on demand.
 *
 * @param {string[]} studentIds
 * @param {boolean} [force] re-read even if already cached
 * @returns {Promise<{loaded:number, missing:number}>}
 */
export async function preloadStudents(studentIds, force = false) {
  const ids = (studentIds || []).filter(Boolean)
  const todo = force ? ids : ids.filter((id) => !_studentCache[id])
  let loaded = 0
  let missing = 0
  await Promise.all(
    todo.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, 'studentData', id))
        if (snap.exists()) {
          _studentCache[id] = unpackNested(snap.data())
          _studentLastWritten[id] = JSON.stringify(_studentCache[id])
          loaded++
        } else {
          _studentCache[id] = {}
          missing++
        }
      } catch (e) {
        console.warn(`Firestore: failed to preload student ${id}:`, e)
      }
    })
  )
  if (loaded > 0) notifyChange()
  return { loaded, missing }
}

/** All currently cached student documents, keyed by id. */
export function getAllStudentCaches() {
  return _studentCache
}

export async function loadStudentFirestore(studentId) {
  if (_studentCache[studentId]) return _studentCache[studentId]
  try {
    const ref = doc(db, 'studentData', studentId)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      _studentCache[studentId] = unpackNested(snap.data())
    } else {
      _studentCache[studentId] = {}
    }
    _studentLastWritten[studentId] = JSON.stringify(_studentCache[studentId])
    startStudentListener(studentId)
    return _studentCache[studentId]
  } catch (e) {
    console.warn(`Firestore: failed to load student data for ${studentId}:`, e)
    _studentCache[studentId] = {}
    return _studentCache[studentId]
  }
}

export function saveStudentFirestore(studentId, studentData) {
  _studentCache[studentId] = studentData
  const snapshot = JSON.parse(JSON.stringify(studentData))
  if (!_studentWriteQueues[studentId]) _studentWriteQueues[studentId] = Promise.resolve()
  _studentWriteQueues[studentId] = _studentWriteQueues[studentId].then(async () => {
    const payloadStr = JSON.stringify(snapshot)
    if (payloadStr === _studentLastWritten[studentId]) return
    const ref = doc(db, 'studentData', studentId)
    try {
      _studentWriteInFlight.add(studentId)
      await setDoc(ref, packNested(snapshot))
      _studentLastWritten[studentId] = payloadStr
      _studentWriteInFlight.delete(studentId)
    } catch (e) {
      console.error(`Firestore: student "${studentId}" write failed:`, e)
      // One retry: a student's work is the one thing this app cannot lose, and
      // a dropped write is invisible until they reload and find it gone.
      try {
        await new Promise((r) => setTimeout(r, 1200))
        await setDoc(ref, packNested(snapshot))
        _studentLastWritten[studentId] = payloadStr
        console.warn(`Firestore: student "${studentId}" write succeeded on retry`)
      } catch (e2) {
        console.error(`Firestore: student "${studentId}" write failed again:`, e2)
      }
      _studentWriteInFlight.delete(studentId)
    }
  }).catch((e) => {
    console.error(`Firestore: student write queue error for ${studentId}:`, e)
  })
}

function startStudentListener(studentId) {
  if (_studentListeners[studentId]) return
  const ref = doc(db, 'studentData', studentId)
  _studentListeners[studentId] = onSnapshot(ref, (snap) => {
    if (!snap.exists()) return
    if (snap.metadata.hasPendingWrites) return
    if (_studentWriteInFlight.has(studentId)) return
    _studentCache[studentId] = unpackNested(snap.data())
    _studentLastWritten[studentId] = JSON.stringify(_studentCache[studentId])
    notifyChange()
  }, (err) => {
    console.warn(`Firestore: student listener for "${studentId}" failed:`, err)
  })
}

export function unsubscribeStudent(studentId) {
  if (_studentListeners[studentId]) {
    _studentListeners[studentId]()
    delete _studentListeners[studentId]
  }
  delete _studentCache[studentId]
  delete _studentWriteQueues[studentId]
  delete _studentLastWritten[studentId]
}

// --- Broadcast system for global notifications ---
let _broadcastListeners = []
let _seenBroadcasts = new Set()
let _broadcastReady = false

export function onBroadcast(fn) {
  _broadcastListeners.push(fn)
  return () => { _broadcastListeners = _broadcastListeners.filter(f => f !== fn) }
}

/**
 * "Ana finished Reading Quiz 3" toasts, in one shared document.
 *
 * Appends rather than read-modify-write: a class submitting together used to
 * overwrite each other's messages, and every submission read the document
 * first. Old messages are pruned occasionally instead of on every send.
 */
export async function sendBroadcast(message) {
  const id = Date.now() + '-' + Math.random().toString(36).slice(2, 8)
  const ref = doc(db, 'appData', 'broadcasts')
  _seenBroadcasts.add(id)
  const entry = { id, message, ts: Date.now() }
  try {
    await updateDoc(ref, { messages: arrayUnion(entry) })
  } catch {
    // The document may not exist yet.
    try { await setDoc(ref, { messages: [entry] }, { merge: true }) } catch (e) { console.warn('Broadcast send failed:', e) }
  }
  // Roughly one in ten sends tidies up; messages older than a minute are dead.
  if (Math.random() < 0.1) {
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref)
        const messages = snap.exists() ? (snap.data().messages || []) : []
        const cutoff = Date.now() - 60000
        const recent = messages.filter((m) => m && m.ts > cutoff)
        if (recent.length !== messages.length) tx.set(ref, { messages: recent })
      })
    } catch { /* tidying is best-effort */ }
  }
}

let _broadcastUnsub = null

function stopBroadcastListener() {
  if (_broadcastUnsub) {
    try { _broadcastUnsub() } catch { /* already gone */ }
    _broadcastUnsub = null
  }
}

function startBroadcastListener() {
  stopBroadcastListener()
  const ref = doc(db, 'appData', 'broadcasts')
  _broadcastUnsub = onSnapshot(ref, (snap) => {
    if (!snap.exists()) return
    if (snap.metadata.hasPendingWrites) return
    const messages = snap.data().messages || []
    const cutoff = Date.now() - 30000
    for (const m of messages) {
      if (m.ts < cutoff) continue
      if (_seenBroadcasts.has(m.id)) continue
      _seenBroadcasts.add(m.id)
      if (_broadcastReady) {
        for (const fn of _broadcastListeners) {
          try { fn(m.message) } catch {}
        }
      }
    }
  }, (err) => {
    console.warn('Broadcast listener failed:', err)
  })
  setTimeout(() => { _broadcastReady = true }, 2000)
}

// ============================================================
// LEADERBOARD + QUIZ STATS (maintained by the onStudentDataWrite function)
//
// These are small, per-student documents grouped into tiny collections, so
// subscribing is cheap and Firestore pushes only the entry that changed -
// unlike the shared appData chunks, where any write sends the whole document
// to every listener. This is what makes leaderboards and percentiles update
// instantly without reintroducing fanout.
//
// Subscriptions attach lazily on first read and notify on update, so callers
// stay synchronous and components re-render through the existing change
// notification.
// ============================================================
const _lbCache = {}
const _lbUnsub = {}
const _qsCache = {}
const _qsUnsub = {}

export function subscribeLeaderboard(classId) {
  if (!classId || _lbUnsub[classId]) return
  try {
    _lbUnsub[classId] = onSnapshot(
      collection(db, 'leaderboards', classId, 'entries'),
      (snap) => {
        _lbCache[classId] = snap.docs.map((d) => d.data())
        notifyChange()
      },
      (err) => console.warn(`Leaderboard listener for class ${classId} failed:`, err)
    )
  } catch (e) {
    console.warn('Failed to subscribe to leaderboard:', e)
  }
}

/** @returns {Array|null} null means "not loaded yet" - callers should fall back. */
export function getLeaderboardCache(classId) {
  return _lbCache[classId] || null
}

export function subscribeQuizStats(quizSetId) {
  if (!quizSetId || _qsUnsub[quizSetId]) return
  try {
    _qsUnsub[quizSetId] = onSnapshot(
      collection(db, 'quizStats', quizSetId, 'attempts'),
      (snap) => {
        _qsCache[quizSetId] = snap.docs.map((d) => d.data())
        notifyChange()
      },
      (err) => console.warn(`Quiz stats listener for ${quizSetId} failed:`, err)
    )
  } catch (e) {
    console.warn('Failed to subscribe to quiz stats:', e)
  }
}

/** @returns {Array|null} null means "not loaded yet". */
export function getQuizStatsCache(quizSetId) {
  return _qsCache[quizSetId] || null
}

/** Drops all aggregate subscriptions (called on sign-out). */
export function unsubscribeAggregates() {
  for (const k of Object.keys(_lbUnsub)) {
    try { _lbUnsub[k]() } catch { /* already gone */ }
    delete _lbUnsub[k]
    delete _lbCache[k]
  }
  for (const k of Object.keys(_qsUnsub)) {
    try { _qsUnsub[k]() } catch { /* already gone */ }
    delete _qsUnsub[k]
    delete _qsCache[k]
  }
}


/** Most recent parent notifications (teachers only). */
export async function loadParentNotifications(max = 100) {
  const { query, orderBy, limit } = await import('firebase/firestore')
  const snap = await getDocs(query(collection(db, 'parentNotifications'), orderBy('createdAt', 'desc'), limit(max)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/** Removes a student's own document (called when the account is deleted). */
export async function deleteStudentFirestore(studentId) {
  delete _studentCache[studentId]
  delete _studentLastWritten[studentId]
  try {
    await deleteDoc(doc(db, 'studentData', String(studentId)))
  } catch (e) {
    console.warn(`Firestore: could not delete student "${studentId}":`, e)
  }
}

/**
 * Watches this account's session. One device per account: signing in somewhere
 * else replaces the recorded session id, and whichever device still holds the
 * old one signs itself out.
 *
 * @param {string} userId
 * @param {string} sessionId the id this device was given at sign-in
 * @param {() => void} onReplaced called once, when a newer sign-in takes over
 * @returns {() => void} stop watching
 */
export function watchSession(userId, sessionId, onReplaced) {
  if (!userId || !sessionId) return () => {}
  let done = false
  const unsub = onSnapshot(
    doc(db, 'sessions', String(userId)),
    (snap) => {
      if (done || !snap.exists()) return
      const current = snap.data().sessionId
      if (current && current !== sessionId) {
        done = true
        unsub()
        onReplaced()
      }
    },
    (e) => console.warn('Session watch failed:', e?.code || e),
  )
  return () => { done = true; unsub() }
}
