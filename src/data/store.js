// ============================================================
// DATA STORE
// All app data lives here. Uses localStorage for persistence.
// Structure:
//   organisations:   { [orgId]: { name, teacherId } }
//   teachers:        { [teacherId]: { name, orgId } }
//   students:        { [studentId]: { name, orgId, coinsSpent, tokens, avatar, unlockedAvatars[] } }
//   classes:         { [classId]: { name, orgId, teacherId, studentIds[] } }
//   eventTemplates:  [ { id, name, orgId } ]
//   testEvents:      [ { id, classId, name, date, templateId? } ]
//   scores:          [ { id, studentId, classId, testEventId, value, date } ]
//   shopItems:       [ { id, name, price, icon, category, orgId } ]
//   shopCategories:  [ { id, name, orgId } ]
//   purchases:       [ { id, studentId, itemId, itemName, price, date, status } ]
//
// Coins = total score points across all classes - coinsSpent
// Tokens = awarded by teachers only (separate currency)
//
// Ranking: when a testEvent has a templateId, rank against ALL scores
//          from ALL events with that templateId. Otherwise rank within
//          just that event's scores.
// ============================================================

import { extractAndStoreImages, findImageRefs, deleteImages } from './imageStore.js'
import { pickSolutionVideo } from '../utils/video.js'
import { getFirestoreCache, saveToFirestore, isDataReady, onDataChange, onBroadcast, sendBroadcast, loadStudentFirestore, saveStudentFirestore, isStudentDataReady, getStudentCache, getStudentDataKeys, getStudentProfileKeys, subscribeLeaderboard, getLeaderboardCache, subscribeQuizStats, getQuizStatsCache, preloadStudents, getAllStudentCaches, scheduleLocalMirror } from './firebase.js'

export { onDataChange, onBroadcast, sendBroadcast }

const STORAGE_KEY = 'leaderboard_data'

function buildData(data) {
  if (data) {
    if (!data.organisations) data.organisations = {}
    if (!data.teachers) data.teachers = {}
    if (!data.students) data.students = {}
    if (!data.classes) data.classes = {}
    if (!data.scores) data.scores = []
    if (!data.testEvents) data.testEvents = []
    if (!data.eventTemplates) data.eventTemplates = []
    if (!data.shopItems) data.shopItems = []
    if (!data.shopCategories) data.shopCategories = []
    if (!data.purchases) data.purchases = []
    if (!data.avatarPool) data.avatarPool = []
    for (const cat of data.shopCategories) { if (!cat.groups) cat.groups = [] }
    for (const item of data.shopItems) { if (!item.group) item.group = '' }
    // Migrate unlockedAvatars from plain URLs to {url, rarity} objects, add stars field
    for (const id of Object.keys(data.students || {})) {
      const s = data.students[id]
      if (s.unlockedAvatars && s.unlockedAvatars.length > 0 && typeof s.unlockedAvatars[0] === 'string') {
        s.unlockedAvatars = s.unlockedAvatars.map((url) => ({ url, rarity: 'common', stars: 1 }))
      }
      if (s.unlockedAvatars) {
        for (const av of s.unlockedAvatars) { if (!av.stars) av.stars = 1 }
      }
    }
    // Migrate old students: rewardPoints -> tokens, add coinsSpent
    for (const id of Object.keys(data.students || {})) {
      const s = data.students[id]
      if (s.rewardPoints !== undefined) {
        s.tokens = s.rewardPoints
        delete s.rewardPoints
      }
      if (s.tokens === undefined) s.tokens = 0
      if (s.coinsSpent === undefined) s.coinsSpent = 0
      if (!s.avatar) s.avatar = null
      if (!s.unlockedAvatars) s.unlockedAvatars = []
      if (s.approved === undefined) s.approved = true
      if (s.archived === undefined) s.archived = false
      delete s.coins
    }
    for (const id of Object.keys(data.classes || {})) {
      const c = data.classes[id]
      if (c.yearGroup === undefined) c.yearGroup = ''
      c.studentIds = c.studentIds.filter(sid => !!data.students[sid])
    }
    // Migrate old scores: add testEventId if missing
    for (const sc of data.scores) {
      if (!sc.testEventId) sc.testEventId = null
    }
    if (!data.topics) data.topics = []
    if (!data.quizzes) data.quizzes = []
    if (!data.quizAttempts) data.quizAttempts = []
    if (!data.importedQuizSets) data.importedQuizSets = []
    if (!data.unassignedQuestions) data.unassignedQuestions = []
    if (!data.courses) data.courses = []
    if (!data.homeworkAttempts) data.homeworkAttempts = []
    for (const q of data.quizzes) {
      if (q.timeLimit === undefined) q.timeLimit = 10
    }
    data.topics.forEach((t, i) => { if (t.order === undefined) t.order = i; if (!t.term) t.term = '' })
    for (const id of Object.keys(data.organisations || {})) {
      const o = data.organisations[id]
      if (o.activeTerm === undefined) o.activeTerm = 'T1'
      if (o.logo === undefined) o.logo = null
    }
    // Clean up orphaned orgs (no matching teacher)
    const orgIds = Object.keys(data.organisations)
    if (orgIds.length > 1) {
      for (const id of orgIds) {
        const o = data.organisations[id]
        if (o.teacherId && !data.teachers[o.teacherId]) {
          delete data.organisations[id]
        }
      }
    }
    for (const ev of data.testEvents) {
      if (ev.term === undefined) ev.term = ''
      if (ev.week === undefined) ev.week = ''
    }
    for (const c of (data.courses || [])) {
      if (c.term === undefined) c.term = ''
    }
    if (!data.homeworkStarts) data.homeworkStarts = []
    if (!data.shopPools) data.shopPools = []
    if (!data.lootChestPool) data.lootChestPool = []
    if (!data.voucherConfig) data.voucherConfig = {}
    if (!data.battlegroundsData) data.battlegroundsData = { wagers: [] }
    // Migrate rarity tiers: old -> new
    const RARITY_MAP = { uncommon: 'rare', rare: 'super-rare', ultra: 'legendary', legendary: 'mythic' }
    if (!data._rarityMigrated) {
      for (const av of data.avatarPool) {
        if (RARITY_MAP[av.rarity]) av.rarity = RARITY_MAP[av.rarity]
      }
      for (const id of Object.keys(data.students || {})) {
        const s = data.students[id]
        if (s.unlockedAvatars) {
          for (const a of s.unlockedAvatars) {
            if (RARITY_MAP[a.rarity]) a.rarity = RARITY_MAP[a.rarity]
          }
        }
      }
      data._rarityMigrated = true
    }
    // Seed tokensEarned from current tokens
    for (const id of Object.keys(data.students || {})) {
      const s = data.students[id]
      if (s.tokensEarned === undefined) s.tokensEarned = s.tokens || 0
      if (!s.unlockedLoot) s.unlockedLoot = []
      if (s.battlegroundsApproved === undefined) s.battlegroundsApproved = true
      if (s.battlegroundsLastActive === undefined) s.battlegroundsLastActive = null
    }
    if (!data.writingMarks) data.writingMarks = []
    if (!data.dojoCards) data.dojoCards = []
    if (!data.dojoClones) data.dojoClones = []
    if (!data.dojoKills) data.dojoKills = {}
    if (!data.questionReports) data.questionReports = []
    if (!data.explanationReports) data.explanationReports = []
    if (!data.vocabBank) data.vocabBank = []
    if (!data.smsLog) data.smsLog = []
    if (!data.notificationPrefs) data.notificationPrefs = {}
    for (const id of Object.keys(data.students || {})) {
      const s = data.students[id]
      if (s.parentPhone === undefined) s.parentPhone = ''
      if (s.parentEmail === undefined) s.parentEmail = ''
    }
    if (!data.quizFolders) data.quizFolders = []
    if (!data.leaderboardSnapshots) data.leaderboardSnapshots = []
    for (const id of Object.keys(data.students || {})) {
      const s = data.students[id]
      if (s.bonusCoins === undefined) s.bonusCoins = 0
    }
    return data
  }
  return { organisations: {}, teachers: {}, students: {}, classes: {}, scores: [], testEvents: [], eventTemplates: [], shopItems: [], shopCategories: [], purchases: [], avatarPool: [], topics: [], quizzes: [], quizAttempts: [], importedQuizSets: [], courses: [], homeworkAttempts: [], homeworkStarts: [], shopPools: [], lootChestPool: [], voucherConfig: {}, battlegroundsData: { wagers: [] }, questionReports: [], explanationReports: [], quizFolders: [], leaderboardSnapshots: [], writingMarks: [], vocabBank: [], smsLog: [], notificationPrefs: {} }
}

// --- loadData cache ---------------------------------------------------------
// buildData() runs ~20 full passes over every collection. It used to run on
// every one of the 200+ accessor calls below. The migrations are idempotent
// and mutate in place, so we memoise the result and only rebuild when the
// underlying source actually changes:
//   - Firestore mode: the _cache object is mutated in place by snapshot
//     handlers, which always call notifyChange() -> _dataVersion bumps.
//   - localStorage mode: the raw serialised string is the identity.
let _ldCache = null
let _ldSource = null
let _ldVersion = -1
let _dataVersion = 0

onDataChange(() => { _dataVersion++ })

/** Invalidate the memoised store snapshot (exported for tests/debugging). */
export function invalidateDataCache() {
  _ldCache = null
  _ldSource = null
  _ldVersion = -1
}

function loadData() {
  const ready = isDataReady()
  let source
  if (ready) {
    source = getFirestoreCache()
  } else {
    try { source = localStorage.getItem(STORAGE_KEY) } catch { source = null }
  }

  if (_ldCache !== null && _ldSource === source && _ldVersion === _dataVersion) {
    return _ldCache
  }

  if (!source) {
    // No data yet - hand back a fresh empty shape each time, as before.
    _ldCache = null
    _ldSource = null
    return buildData(null)
  }

  const raw = ready ? source : JSON.parse(source)
  const data = buildData(raw)
  _ldCache = data
  _ldSource = source
  _ldVersion = _dataVersion
  return data
}

function saveData(data) {
  data._savedAt = Date.now()
  if (isDataReady()) {
    // Firestore is the source of truth; the localStorage copy is only an
    // offline fallback, so write it in the background rather than
    // re-serialising ~4 MB on every save.
    scheduleLocalMirror(data)
  } else {
    // Offline/local mode: localStorage *is* the store - persist immediately.
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch { /* quota exceeded or restricted */ }
  }
  // Writes can introduce records that predate a migration (e.g. a newly
  // created student missing a field a later migration adds), so invalidate
  // and let the next read re-migrate. Reads vastly outnumber writes, which
  // is where the redundant sweeps actually were.
  _dataVersion++
  if (isDataReady()) saveToFirestore(data)
}

// --- Per-Student Data Helpers ---

const _studentLocalCache = {}

function loadStudentData(studentId) {
  if (!studentId) return null
  if (isStudentDataReady(studentId)) {
    return getStudentCache(studentId)
  }
  if (_studentLocalCache[studentId]) return _studentLocalCache[studentId]
  return null
}

function saveStudentData(studentId, sData) {
  if (!studentId) return
  sData._savedAt = Date.now()
  _studentLocalCache[studentId] = sData
  if (isDataReady()) saveStudentFirestore(studentId, sData)
}

export async function initStudentData(studentId) {
  if (!studentId) return
  let sData = await loadStudentFirestore(studentId)
  if (sData && sData._migrated) return sData

  const data = loadData()
  sData = sData || {}
  const KEYS = getStudentDataKeys()
  for (const key of KEYS) {
    if (!sData[key] || (Array.isArray(sData[key]) && sData[key].length === 0)) {
      const shared = data[key]
      if (Array.isArray(shared)) {
        sData[key] = shared.filter(item => item.studentId === studentId)
      } else if (typeof shared === 'object' && shared !== null && !Array.isArray(shared)) {
        sData[key] = shared[studentId] !== undefined ? { [studentId]: shared[studentId] } : {}
      }
    }
  }

  const PROFILE_KEYS = getStudentProfileKeys()
  const studentProfile = (data.students || {})[studentId]
  if (studentProfile && !sData.profile) {
    sData.profile = {}
    for (const key of PROFILE_KEYS) {
      if (studentProfile[key] !== undefined) sData.profile[key] = studentProfile[key]
    }
  }

  sData._migrated = true
  saveStudentData(studentId, sData)
  _studentLocalCache[studentId] = sData
  return sData
}

/**
 * Migrates every student into their own `studentData/{id}` document and
 * reports what happened.
 *
 * Until now migration was lazy - it ran at login, so a student who had not
 * signed in since the per-student layer shipped still lived only in the shared
 * arrays. Cross-student reads therefore silently fell back to the global blob.
 * This makes the per-student documents complete and authoritative, which is
 * the prerequisite for retiring the shared write.
 *
 * Idempotent: already-migrated students are skipped.
 *
 * @returns {Promise<{total:number, migrated:number, alreadyDone:number,
 *                    failed:Array<{id:string,error:string}>,
 *                    mismatches:Array<object>}>}
 */
export async function migrateAllStudents() {
  const data = loadData()
  const ids = Object.keys(data.students || {})
  const KEYS = getStudentDataKeys()
  const report = { total: ids.length, migrated: 0, alreadyDone: 0, reconciled: 0, failed: [], mismatches: [] }

  for (const id of ids) {
    try {
      const before = await loadStudentFirestore(id)
      const wasMigrated = !!(before && before._migrated)

      const sData = await initStudentData(id)
      if (wasMigrated) report.alreadyDone++
      else report.migrated++

      // Reconcile: initStudentData only backfills a key when the per-student
      // array is empty, so records added to the shared arrays after a
      // student's first migration never reached their document. Merge any
      // stragglers across, then verify nothing is left behind - a surviving
      // mismatch means records would be lost when the shared write goes.
      let changed = false
      for (const key of KEYS) {
        const shared = data[key]
        if (!Array.isArray(shared)) continue
        const mine = shared.filter((item) => item && item.studentId === id)
        if (mine.length === 0) continue
        if (!Array.isArray(sData[key])) sData[key] = []
        const own = sData[key]
        const seen = new Set(own.map((item, i) => (item && item.id != null ? item.id : `__idx${i}`)))
        for (const item of mine) {
          const k = item.id != null ? item.id : JSON.stringify(item)
          if (seen.has(k)) continue
          // No id to match on: fall back to deep comparison before adding.
          if (item.id == null && own.some((o) => JSON.stringify(o) === JSON.stringify(item))) continue
          own.push(item)
          seen.add(k)
          changed = true
          report.reconciled++
        }
      }
      if (changed) saveStudentData(id, sData)

      for (const key of KEYS) {
        const shared = data[key]
        if (!Array.isArray(shared)) continue
        const sharedCount = shared.filter((item) => item && item.studentId === id).length
        const ownCount = Array.isArray(sData?.[key]) ? sData[key].length : 0
        if (ownCount < sharedCount) {
          report.mismatches.push({ id, key, shared: sharedCount, perStudent: ownCount })
        }
      }
    } catch (e) {
      report.failed.push({ id, error: e?.message || String(e) })
    }
  }
  return report
}

function getStudentArray(studentId, key) {
  const sData = loadStudentData(studentId)
  if (sData && sData._migrated) return sData[key] || []
  const data = loadData()
  const arr = data[key] || []
  return Array.isArray(arr) ? arr.filter(item => item.studentId === studentId) : []
}

/**
 * Writes a student's own record into their own document.
 *
 * This used to write the shared appData chunk as well. That shared write was
 * the concurrency defect: setDoc replaces the whole document, so two students
 * submitting at the same moment each wrote the entire array and one attempt
 * was silently overwritten - and Firestore sustains only about one write per
 * second per document, so a class submitting together contended badly.
 *
 * Every student now writes only studentData/{their id}: different documents,
 * no contention, nothing lost. Cross-student views read the per-student
 * documents (teachers preload a class) or the server-maintained quizStats /
 * leaderboards collections.
 *
 * Falls back to the shared array only for an unmigrated student, which should
 * no longer occur - Phase 1 migrated and reconciled everyone - but keeps a
 * brand-new student safe until initStudentData() has run.
 */
function mutateStudentArray(studentId, key, mutateFn) {
  const sData = loadStudentData(studentId)
  if (sData && sData._migrated) {
    if (!sData[key]) sData[key] = []
    mutateFn(sData[key], sData)
    saveStudentData(studentId, sData)
    return
  }
  console.warn(`store: student ${studentId} is not migrated; falling back to the shared array for "${key}"`)
  const data = loadData()
  if (!data[key]) data[key] = []
  mutateFn(data[key], data)
  saveData(data)
}

function getStudentProfile(studentId) {
  const sData = loadStudentData(studentId)
  if (sData && sData._migrated && sData.profile) return sData.profile
  const data = loadData()
  return (data.students || {})[studentId] || {}
}

function mutateStudentProfile(studentId, mutateFn) {
  const sData = loadStudentData(studentId)
  if (sData && sData._migrated) {
    if (!sData.profile) sData.profile = {}
    mutateFn(sData.profile)
    saveStudentData(studentId, sData)
    const data = loadData()
    const student = (data.students || {})[studentId]
    if (student) {
      Object.assign(student, sData.profile)
      saveData(data)
    }
    return
  }
  const data = loadData()
  const student = (data.students || {})[studentId]
  if (!student) return
  mutateFn(student)
  saveData(data)
}

// --- ID Generation ---

function generateId(length) {
  const chars = '0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

function generateStudentId() {
  const data = loadData()
  let id
  do {
    id = generateId(8)
  } while (data.students[id])
  return id
}

function generateOrgId() {
  const data = loadData()
  let id
  do {
    id = generateId(6)
  } while (data.organisations[id])
  return id
}

// --- Admin ---

// --- Teacher Actions ---

export function createTeacher(name) {
  const data = loadData()
  const teacherId = generateId(8)
  let orgId = null
  const existingOrg = Object.entries(data.organisations)[0]
  if (existingOrg) {
    orgId = existingOrg[0]
  } else {
    orgId = generateOrgId()
    data.organisations[orgId] = { name: 'My Organisation', teacherId }
  }
  data.teachers[teacherId] = { name, orgId }
  saveData(data)
  return { id: teacherId, ...data.teachers[teacherId] }
}

export function getTeacherByName(name) {
  const data = loadData()
  const entry = Object.entries(data.teachers).find(
    ([, t]) => t.name.toLowerCase() === name.toLowerCase()
  )
  if (!entry) return null
  return { id: entry[0], ...entry[1] }
}

export function deleteTeacher(teacherId) {
  const data = loadData()
  if (!data.teachers[teacherId]) return false
  delete data.teachers[teacherId]
  saveData(data)
  return true
}

export function getAllTeachers() {
  const data = loadData()
  return Object.entries(data.teachers).map(([id, t]) => ({ id, ...t }))
}

// --- Organisation Actions ---

export function createOrganisation(name, teacherId) {
  const data = loadData()
  const orgId = generateOrgId()
  data.organisations[orgId] = { name, teacherId }
  data.teachers[teacherId].orgId = orgId
  saveData(data)
  return { id: orgId, name }
}

export function updateOrganisationName(orgId, newName) {
  const data = loadData()
  if (!data.organisations[orgId]) return
  data.organisations[orgId].name = newName
  saveData(data)
}

export function updateOrgCode(oldCode, newCode) {
  const data = loadData()
  const trimmed = newCode.trim()
  if (!trimmed || !data.organisations[oldCode]) return false
  if (trimmed === oldCode) return true
  if (data.organisations[trimmed]) return false // code already taken

  // Move org to new key
  data.organisations[trimmed] = data.organisations[oldCode]
  delete data.organisations[oldCode]

  // Update teacher reference
  const teacherId = data.organisations[trimmed].teacherId
  if (data.teachers[teacherId]) data.teachers[teacherId].orgId = trimmed

  // Update all students in this org
  for (const s of Object.values(data.students)) {
    if (s.orgId === oldCode) s.orgId = trimmed
  }

  saveData(data)
  return true
}

export function getOrganisation(orgId) {
  const data = loadData()
  const org = data.organisations[orgId]
  if (!org) return null
  return { id: orgId, ...org }
}

export function getFirstOrg() {
  const data = loadData()
  for (const [orgId, org] of Object.entries(data.organisations)) {
    if (org.teacherId && data.teachers[org.teacherId]) {
      return { id: orgId, ...org }
    }
  }
  const entry = Object.entries(data.organisations)[0]
  if (!entry) return null
  return { id: entry[0], ...entry[1] }
}

export function updateOrganisation(orgId, updates) {
  const data = loadData()
  const org = data.organisations[orgId]
  if (!org) return null
  Object.assign(org, updates)
  saveData(data)
  return { id: orgId, ...org }
}

export function getActiveTerm(orgId) {
  const data = loadData()
  return data.organisations[orgId]?.activeTerm || 'T1'
}

// --- Student Actions ---

export function createStudent(name, orgId = null, approved = true) {
  const data = loadData()
  const studentId = generateStudentId()
  data.students[studentId] = { name, orgId, coinsSpent: 0, tokens: 0, approved }
  saveData(data)
  return { id: studentId, ...data.students[studentId] }
}

export function approveStudent(studentId) {
  const data = loadData()
  if (!data.students[studentId]) return false
  data.students[studentId].approved = true
  saveData(data)
  return true
}

export function getStudentById(studentId) {
  const data = loadData()
  const student = data.students[studentId]
  if (!student) return null
  const totalPoints = data.scores
    .filter((s) => s.studentId === studentId)
    .reduce((sum, s) => sum + s.value, 0)
  const totalEarned = totalPoints * 10 + (student.bonusCoins || 0)
  return {
    id: studentId,
    ...student,
    coins: totalEarned - student.coinsSpent,
    totalEarned,
    totalPoints,
  }
}

export function deleteStudent(studentId) {
  const data = loadData()
  if (!data.students[studentId]) return false
  const studentName = data.students[studentId].name
  delete data.students[studentId]
  data.scores = data.scores.filter((s) => s.studentId !== studentId)
  // Preserve quiz/homework attempts for historical analytics — tag with student name
  for (const a of data.quizAttempts) {
    if (a.studentId === studentId) a._deletedStudentName = studentName
  }
  for (const a of (data.homeworkAttempts || [])) {
    if (a.studentId === studentId) a._deletedStudentName = studentName
  }
  for (const a of (data.homeworkRedos || [])) {
    if (a.studentId === studentId) a._deletedStudentName = studentName
  }
  data.homeworkStarts = data.homeworkStarts.filter((h) => h.studentId !== studentId)
  data.purchases = data.purchases.filter((p) => p.studentId !== studentId)
  for (const cls of Object.values(data.classes)) {
    cls.studentIds = cls.studentIds.filter(id => id !== studentId)
  }
  saveData(data)
  return true
}

export function archiveStudent(studentId) {
  const data = loadData()
  if (!data.students[studentId]) return false
  data.students[studentId].archived = true
  saveData(data)
  return true
}

export function unarchiveStudent(studentId) {
  const data = loadData()
  if (!data.students[studentId]) return false
  data.students[studentId].archived = false
  saveData(data)
  return true
}

export function updateStudent(studentId, updates) {
  const data = loadData()
  if (!data.students[studentId]) return null
  Object.assign(data.students[studentId], updates)
  saveData(data)
  return getStudentById(studentId)
}

export function spendCoins(studentId, amount) {
  const data = loadData()
  if (!data.students[studentId]) return false
  data.students[studentId].coinsSpent += amount
  saveData(data)
  return true
}

export function setCoinsBalance(studentId, newBalance) {
  // Teacher sets coins directly by adjusting coinsSpent
  const data = loadData()
  if (!data.students[studentId]) return false
  const totalPoints = data.scores
    .filter((s) => s.studentId === studentId)
    .reduce((sum, s) => sum + s.value, 0)
  const totalEarned = totalPoints * 10
  data.students[studentId].coinsSpent = totalEarned - newBalance
  saveData(data)
  return true
}

// --- Class Actions ---

export function createClass(name, orgId, teacherId, yearGroup = '') {
  const data = loadData()
  const classId = generateId(6)
  data.classes[classId] = { name, orgId, teacherId, studentIds: [], yearGroup }
  saveData(data)
  return { id: classId, ...data.classes[classId] }
}

export function updateClass(classId, updates) {
  const data = loadData()
  if (!data.classes[classId]) return null
  if (updates.name !== undefined) data.classes[classId].name = updates.name
  if (updates.image !== undefined) data.classes[classId].image = updates.image
  saveData(data)
  return { id: classId, ...data.classes[classId] }
}

export function deleteClass(classId) {
  const data = loadData()
  if (!data.classes[classId]) return false
  delete data.classes[classId]
  data.scores = data.scores.filter((s) => s.classId !== classId)
  saveData(data)
  return true
}

export function assignStudentToClass(classId, studentId) {
  const data = loadData()
  if (!data.classes[classId]) return false
  if (!data.students[studentId]) return false
  if (!data.classes[classId].studentIds.includes(studentId)) {
    data.classes[classId].studentIds.push(studentId)
  }
  saveData(data)
  return true
}

export function removeStudentFromClass(classId, studentId) {
  const data = loadData()
  if (!data.classes[classId]) return false
  data.classes[classId].studentIds = data.classes[classId].studentIds.filter(
    (id) => id !== studentId
  )
  saveData(data)
  return true
}

export function getClassesForStudent(studentId) {
  const data = loadData()
  return Object.entries(data.classes)
    .filter(([, cls]) => cls.studentIds.includes(studentId))
    .map(([id, cls]) => ({ id, ...cls }))
}

export function getClassById(classId) {
  const data = loadData()
  const cls = (data.classes || {})[classId]
  return cls ? { id: classId, ...cls } : null
}

export function getClassesForOrg(orgId) {
  const data = loadData()
  return Object.entries(data.classes)
    .filter(([, cls]) => cls.orgId === orgId)
    .map(([id, cls]) => ({ id, ...cls }))
}

export function getStudentsInOrg(orgId) {
  const data = loadData()
  return Object.entries(data.students)
    .filter(([, s]) => s.orgId === orgId)
    .map(([id, s]) => {
      const totalPoints = data.scores
        .filter((sc) => sc.studentId === id)
        .reduce((sum, sc) => sum + sc.value, 0)
      const totalEarned = totalPoints * 10
      return { id, ...s, coins: totalEarned - s.coinsSpent, totalEarned, totalPoints }
    })
}

export function findStudentInOrgByName(orgId, name) {
  const data = loadData()
  const entry = Object.entries(data.students).find(
    ([, s]) => s.orgId === orgId && s.name.toLowerCase() === name.toLowerCase()
  )
  if (!entry) return null
  return { id: entry[0], ...entry[1] }
}

export function fullName(student) {
  if (student.firstName && student.lastName) return `${student.firstName} ${student.lastName}`
  return student.name
}

export function findStudentByName(name) {
  const data = loadData()
  const entry = Object.entries(data.students).find(
    ([, s]) => s.name.toLowerCase() === name.toLowerCase()
  )
  if (!entry) return null
  return { id: entry[0], ...entry[1] }
}

export function isPhoneTaken(phone, excludeId) {
  const data = loadData()
  const digits = phone.replace(/[^\d]/g, '')
  return Object.entries(data.students).some(
    ([id, s]) => id !== excludeId && s.parentPhone && s.parentPhone.replace(/[^\d]/g, '') === digits
  )
}

export function isEmailTaken(email, excludeId) {
  const data = loadData()
  const lower = email.toLowerCase().trim()
  return Object.entries(data.students).some(
    ([id, s]) => id !== excludeId && s.parentEmail && s.parentEmail.toLowerCase().trim() === lower
  )
}

// --- Test Event Actions ---

export function createTestEvent(classId, name, totalMarks, term = '', week = '') {
  const data = loadData()
  const id = generateId(8)
  const date = new Date().toISOString()
  data.testEvents.push({ id, classId, name, date, totalMarks: totalMarks || null, term, week })
  saveData(data)
  return { id, classId, name, date, totalMarks, term, week }
}

export function getTestEventsForClass(classId) {
  const data = loadData()
  return data.testEvents.filter((e) => e.classId === classId)
}

export function updateTestEvent(eventId, updates) {
  const data = loadData()
  const idx = data.testEvents.findIndex((e) => e.id === eventId)
  if (idx === -1) return null
  Object.assign(data.testEvents[idx], updates)
  saveData(data)
  return data.testEvents[idx]
}

export function deleteTestEvent(eventId) {
  const data = loadData()
  data.testEvents = data.testEvents.filter((e) => e.id !== eventId)
  data.scores = data.scores.filter((s) => s.testEventId !== eventId)
  saveData(data)
  return true
}

// --- Score Actions ---

export function addScore(studentId, classId, value, testEventId = null) {
  const data = loadData()
  const id = generateId(10)
  const date = new Date().toISOString()
  data.scores.push({ id, studentId, classId, testEventId, value, date })
  saveData(data)
  return { id, studentId, classId, testEventId, value, date }
}

export function getScoresForClass(classId) {
  const data = loadData()
  return data.scores.filter((s) => s.classId === classId)
}

export function getScoresForStudentInClass(studentId, classId) {
  const data = loadData()
  return data.scores.filter((s) => s.studentId === studentId && s.classId === classId)
}

export function getScoresForStudent(studentId) {
  const data = loadData()
  return data.scores.filter((s) => s.studentId === studentId)
}

export function getScoresForTestEvent(testEventId) {
  const data = loadData()
  return data.scores.filter((s) => s.testEventId === testEventId)
}

export function updateScore(scoreId, updates) {
  const data = loadData()
  const idx = data.scores.findIndex((s) => s.id === scoreId)
  if (idx === -1) return null
  Object.assign(data.scores[idx], updates)
  saveData(data)
  return data.scores[idx]
}

export function deleteScore(scoreId) {
  const data = loadData()
  data.scores = data.scores.filter((s) => s.id !== scoreId)
  saveData(data)
  return true
}

// --- Event Templates ---

export function createEventTemplate(name, orgId) {
  const data = loadData()
  const id = generateId(8)
  data.eventTemplates.push({ id, name, orgId })
  saveData(data)
  return { id, name, orgId }
}

export function getEventTemplatesForOrg(orgId) {
  const data = loadData()
  return data.eventTemplates.filter((t) => t.orgId === orgId)
}

export function deleteEventTemplate(templateId) {
  const data = loadData()
  data.eventTemplates = data.eventTemplates.filter((t) => t.id !== templateId)
  // Unlink events that used this template
  for (const ev of data.testEvents) {
    if (ev.templateId === templateId) ev.templateId = null
  }
  saveData(data)
  return true
}

// --- Leaderboard ---

export function getLeaderboard(classId, term) {
  const data = loadData()
  const cls = data.classes[classId]
  if (!cls) return []
  const termEventIds = term
    ? new Set(data.testEvents.filter(e => e.classId === classId && e.term === term).map(e => e.id))
    : null

  return cls.studentIds
    .map((sid) => {
      const student = data.students[sid]
      if (!student || student.archived) return null
      const points = data.scores
        .filter((s) => s.studentId === sid && s.classId === classId && (!termEventIds || termEventIds.has(s.testEventId)))
        .reduce((sum, s) => sum + s.value, 0)
      return { id: sid, name: student.name, points, avatar: student.avatar || null }
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      return a.name.localeCompare(b.name)
    })
}

// --- Leaderboard Snapshots ---

export function snapshotLeaderboards(orgId, term) {
  const data = loadData()
  if (!data.leaderboardSnapshots) data.leaderboardSnapshots = []
  const existing = data.leaderboardSnapshots.find(s => s.orgId === orgId && s.term === term)
  if (existing) return existing
  const classIds = Object.entries(data.classes).filter(([, c]) => c.orgId === orgId).map(([id]) => id)
  const classSnapshots = classIds.map(classId => {
    const cls = data.classes[classId]
    const testLb = getLeaderboard(classId, term)
    const hwLb = getHomeworkLeaderboard(classId, term)
    return { classId, className: cls?.name || classId, testLeaderboard: testLb, homeworkLeaderboard: hwLb }
  })
  const snapshot = {
    id: 'snap-' + Date.now(),
    orgId,
    term,
    date: new Date().toISOString(),
    classes: classSnapshots,
  }
  data.leaderboardSnapshots.push(snapshot)
  saveData(data)
  return snapshot
}

export function getPastLeaderboards(orgId) {
  const data = loadData()
  return (data.leaderboardSnapshots || [])
    .filter(s => s.orgId === orgId)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
}

// --- Ranking per Event ---

export function getRankingForStudentInClass(studentId, classId) {
  // Returns [{ eventId, eventName, date, rank, totalStudents, score }]
  // sorted by event date.
  // If event has a templateId, rank against ALL scores from ALL events
  // with that templateId. Otherwise rank within just that event.
  const data = loadData()

  const events = data.testEvents.filter((e) => e.classId === classId)
  const results = []

  for (const event of events) {
    // Get this student's score for this event
    const studentScore = data.scores.find(
      (s) => s.studentId === studentId && s.testEventId === event.id
    )
    if (!studentScore) continue

    // Determine the pool of scores to rank against
    let poolScores
    if (event.templateId) {
      // Pool: all events with the same templateId
      const linkedEventIds = data.testEvents
        .filter((e) => e.templateId === event.templateId)
        .map((e) => e.id)
      poolScores = data.scores.filter((s) => linkedEventIds.includes(s.testEventId))
    } else {
      // Pool: just this event
      poolScores = data.scores.filter((s) => s.testEventId === event.id)
    }

    // Deduplicate: one score per student (highest)
    const bestByStudent = {}
    for (const sc of poolScores) {
      if (!bestByStudent[sc.studentId] || sc.value > bestByStudent[sc.studentId]) {
        bestByStudent[sc.studentId] = sc.value
      }
    }

    // Sort descending by score, then alphabetical
    const ranked = Object.entries(bestByStudent)
      .map(([sid, value]) => ({ sid, value }))
      .sort((a, b) => {
        if (b.value !== a.value) return b.value - a.value
        const nameA = data.students[a.sid]?.name || ''
        const nameB = data.students[b.sid]?.name || ''
        return nameA.localeCompare(nameB)
      })

    const rank = ranked.findIndex((r) => r.sid === studentId) + 1

    results.push({
      eventId: event.id,
      eventName: event.name,
      date: event.date,
      rank,
      totalStudents: ranked.length,
      score: studentScore.value,
    })
  }

  return results.sort((a, b) => new Date(a.date) - new Date(b.date))
}

// --- Shop Items ---

export function createShopItem(name, price, icon, category, orgId, description = '', group = '') {
  const data = loadData()
  const id = generateId(8)
  data.shopItems.push({ id, name, price, icon, category, orgId, description, group })
  saveData(data)
  return { id, name, price, icon, category, orgId, description, group }
}

export function updateShopItem(itemId, updates) {
  const data = loadData()
  const idx = data.shopItems.findIndex((i) => i.id === itemId)
  if (idx === -1) return null
  Object.assign(data.shopItems[idx], updates)
  saveData(data)
  return data.shopItems[idx]
}

export function deleteShopItem(itemId) {
  const data = loadData()
  data.shopItems = data.shopItems.filter((i) => i.id !== itemId)
  saveData(data)
  return true
}

export function getShopItemsForOrg(orgId) {
  const data = loadData()
  return data.shopItems.filter((i) => i.orgId === orgId)
}

export function getShopCategories(orgId) {
  const data = loadData()
  return data.shopCategories.filter((c) => c.orgId === orgId)
}

export function createShopCategory(name, orgId) {
  const data = loadData()
  const id = generateId(6)
  data.shopCategories.push({ id, name, orgId })
  saveData(data)
  return { id, name, orgId }
}

export function deleteShopCategory(categoryId) {
  const data = loadData()
  data.shopCategories = data.shopCategories.filter((c) => c.id !== categoryId)
  saveData(data)
  return true
}

export function renameShopCategory(categoryId, newName) {
  const data = loadData()
  const cat = data.shopCategories.find((c) => c.id === categoryId)
  if (!cat) return null
  const oldName = cat.name
  cat.name = newName
  for (const item of data.shopItems) {
    if (item.category === oldName && item.orgId === cat.orgId) item.category = newName
  }
  saveData(data)
  return cat
}

export function addGroupToCategory(categoryId, groupName) {
  const data = loadData()
  const cat = data.shopCategories.find((c) => c.id === categoryId)
  if (!cat) return null
  if (!cat.groups) cat.groups = []
  if (cat.groups.includes(groupName)) return cat
  cat.groups.push(groupName)
  saveData(data)
  return cat
}

export function removeGroupFromCategory(categoryId, groupName) {
  const data = loadData()
  const cat = data.shopCategories.find((c) => c.id === categoryId)
  if (!cat) return null
  cat.groups = (cat.groups || []).filter((g) => g !== groupName)
  for (const item of data.shopItems) {
    if (item.group === groupName && item.category === cat.name && item.orgId === cat.orgId) item.group = ''
  }
  saveData(data)
  return cat
}

// --- Purchases ---

export function purchaseItem(studentId, itemId) {
  const data = loadData()
  const item = data.shopItems.find((i) => i.id === itemId)
  if (!item) return null
  const student = data.students[studentId]
  if (!student) return null

  const totalPoints = data.scores
    .filter((s) => s.studentId === studentId)
    .reduce((sum, s) => sum + s.value, 0)
  const coins = totalPoints * 10 - student.coinsSpent
  if (coins < item.price) return null

  student.coinsSpent += item.price
  const id = generateId(10)
  const purchase = { id, studentId, itemId, itemName: item.name, price: item.price, date: new Date().toISOString(), status: 'pending' }
  data.purchases.push(purchase)
  saveData(data)
  return purchase
}

export function getPurchasesForStudent(studentId) {
  const data = loadData()
  return data.purchases.filter((p) => p.studentId === studentId).sort((a, b) => new Date(b.date) - new Date(a.date))
}

export function getPurchasesForOrg(orgId) {
  const data = loadData()
  const orgStudentIds = new Set(
    Object.entries(data.students).filter(([, s]) => s.orgId === orgId).map(([id]) => id)
  )
  return data.purchases
    .filter((p) => orgStudentIds.has(p.studentId))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
}

export function setPurchaseStatus(purchaseId, status) {
  const data = loadData()
  const p = data.purchases.find((p) => p.id === purchaseId)
  if (!p) return false
  p.status = status
  saveData(data)
  return true
}

// --- Avatars ---

export function setAvatar(studentId, avatarUrl) {
  const data = loadData()
  if (!data.students[studentId]) return false
  data.students[studentId].avatar = avatarUrl
  saveData(data)
  return true
}

export function unlockAvatar(studentId, avatarUrl, rarity = 'common') {
  const data = loadData()
  if (!data.students[studentId]) return false
  if (!data.students[studentId].unlockedAvatars) data.students[studentId].unlockedAvatars = []
  const already = data.students[studentId].unlockedAvatars.find((a) => a.url === avatarUrl)
  if (!already) {
    data.students[studentId].unlockedAvatars.push({ url: avatarUrl, rarity, stars: 1 })
  }
  saveData(data)
  return true
}

export function spendTokens(studentId, amount) {
  const data = loadData()
  if (!data.students[studentId]) return false
  if (data.students[studentId].tokens < amount) return false
  data.students[studentId].tokens -= amount
  saveData(data)
  return true
}

export function addTokens(studentId, amount) {
  const data = loadData()
  if (!data.students[studentId]) return false
  data.students[studentId].tokens += amount
  data.students[studentId].tokensEarned = (data.students[studentId].tokensEarned || 0) + amount
  saveData(data)
  return true
}

export function addCoins(studentId, amount) {
  const data = loadData()
  if (!data.students[studentId]) return false
  data.students[studentId].bonusCoins = (data.students[studentId].bonusCoins || 0) + amount
  saveData(data)
  return true
}

// --- Avatar Pool ---

const RARITY_TIERS = ['common', 'rare', 'super-rare', 'legendary', 'mythic']
const RARITY_WEIGHTS = { common: 50, rare: 30, 'super-rare': 12, legendary: 6, mythic: 2 }

export { RARITY_TIERS, RARITY_WEIGHTS }

export function getAvatarPool(orgId) {
  const data = loadData()
  return data.avatarPool.filter((a) => a.orgId === orgId)
}

export function addAvatarToPool(orgId, url, rarity = 'common', name = '') {
  const data = loadData()
  const id = generateId(8)
  data.avatarPool.push({ id, orgId, url, rarity, name })
  saveData(data)
  return { id, orgId, url, rarity, name }
}

export function updatePoolAvatar(avatarId, updates) {
  const data = loadData()
  const idx = data.avatarPool.findIndex((a) => a.id === avatarId)
  if (idx === -1) return null
  Object.assign(data.avatarPool[idx], updates)
  saveData(data)
  return data.avatarPool[idx]
}

export function deletePoolAvatar(avatarId) {
  const data = loadData()
  data.avatarPool = data.avatarPool.filter((a) => a.id !== avatarId)
  saveData(data)
  return true
}

export function rollEgg(studentId, orgId) {
  const data = loadData()
  const student = data.students[studentId]
  if (!student || student.tokens < 1) return null

  const pool = data.avatarPool.filter((a) => a.orgId === orgId)
  if (pool.length === 0) return null

  // Weighted rarity roll
  const totalWeight = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0)
  let roll = Math.random() * totalWeight
  let pickedRarity = 'common'
  for (const tier of RARITY_TIERS) {
    roll -= RARITY_WEIGHTS[tier]
    if (roll <= 0) { pickedRarity = tier; break }
  }

  // Filter pool by rarity, fall back to nearest available tier
  let candidates = pool.filter((a) => a.rarity === pickedRarity)
  if (candidates.length === 0) {
    const idx = RARITY_TIERS.indexOf(pickedRarity)
    for (let d = 1; d < RARITY_TIERS.length; d++) {
      if (idx - d >= 0) candidates = pool.filter((a) => a.rarity === RARITY_TIERS[idx - d])
      if (candidates.length > 0) { pickedRarity = RARITY_TIERS[idx - d]; break }
      if (idx + d < RARITY_TIERS.length) candidates = pool.filter((a) => a.rarity === RARITY_TIERS[idx + d])
      if (candidates.length > 0) { pickedRarity = RARITY_TIERS[idx + d]; break }
    }
  }
  if (candidates.length === 0) return null

  const picked = candidates[Math.floor(Math.random() * candidates.length)]

  // Deduct token
  student.tokens -= 1

  // Unlock (check for duplicate → star upgrade)
  if (!student.unlockedAvatars) student.unlockedAvatars = []
  const existing = student.unlockedAvatars.find((a) => a.url === picked.url)
  const isDuplicate = !!existing
  let newStars = 1
  if (isDuplicate) {
    if (existing.stars < 3) {
      existing.stars += 1
      newStars = existing.stars
    } else {
      newStars = 3
    }
  } else {
    student.unlockedAvatars.push({ url: picked.url, rarity: picked.rarity, stars: 1 })
  }

  saveData(data)
  return { avatar: picked, isDuplicate, newStars }
}

// --- Topics ---

export function createTopic(name, classId, term = '') {
  const data = loadData()
  const maxOrder = data.topics.filter((t) => t.classId === classId).reduce((m, t) => Math.max(m, t.order ?? 0), -1)
  const id = 'topic-' + generateId(6)
  data.topics.push({ id, name, classId, order: maxOrder + 1, term })
  saveData(data)
  return data.topics[data.topics.length - 1]
}

export function updateTopic(topicId, updates) {
  const data = loadData()
  const topic = data.topics.find((t) => t.id === topicId)
  if (!topic) return null
  Object.assign(topic, updates)
  saveData(data)
  return topic
}

export function getTopicsForClass(classId) {
  const data = loadData()
  return data.topics.filter((t) => t.classId === classId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

export function reorderTopics(classId, orderedIds) {
  const data = loadData()
  orderedIds.forEach((id, i) => {
    const topic = data.topics.find((t) => t.id === id && t.classId === classId)
    if (topic) topic.order = i
  })
  saveData(data)
}

export function deleteTopic(topicId) {
  const data = loadData()
  data.topics = data.topics.filter((t) => t.id !== topicId)
  data.quizzes = data.quizzes.filter((q) => q.topicId !== topicId)
  data.quizAttempts = data.quizAttempts.filter((a) => {
    return data.quizzes.some((q) => q.id === a.quizId)
  })
  saveData(data)
  return true
}

// --- Quizzes ---
// quiz: { id, topicId, classId, number (1-8), timeLimit (minutes), unlockEventId (test event that unlocks this quiz), questions: [{ text, options: [string], correctIndex: number }] }

export function createQuiz(topicId, classId, number, questions, timeLimit = 10, unlockEventId = null) {
  const data = loadData()
  const id = 'quiz-' + generateId(6)
  data.quizzes.push({ id, topicId, classId, number, timeLimit, unlockEventId, questions })
  saveData(data)
  return data.quizzes[data.quizzes.length - 1]
}

export function updateQuiz(quizId, updates) {
  const data = loadData()
  const quiz = data.quizzes.find((q) => q.id === quizId)
  if (!quiz) return null
  Object.assign(quiz, updates)
  saveData(data)
  return quiz
}

export function deleteQuiz(quizId) {
  const data = loadData()
  data.quizzes = data.quizzes.filter((q) => q.id !== quizId)
  data.quizAttempts = data.quizAttempts.filter((a) => a.quizId !== quizId)
  saveData(data)
  return true
}

export function getQuizzesForTopic(topicId) {
  const data = loadData()
  return data.quizzes.filter((q) => q.topicId === topicId).sort((a, b) => a.number - b.number)
}

export function getQuizzesForClass(classId) {
  const data = loadData()
  return data.quizzes.filter((q) => q.classId === classId)
}

export function getQuizById(quizId) {
  const data = loadData()
  return data.quizzes.find((q) => q.id === quizId) || null
}

// --- Quiz Attempts ---
// attempt: { id, quizId, studentId, answers: [number], score, total, date }

export function submitQuizAttempt(quizId, studentId, answers, questionTimes) {
  const data = loadData()
  const quiz = data.quizzes.find((q) => q.id === quizId)
  if (!quiz) return null
  const existing = getStudentArray(studentId, 'quizAttempts').find(a => a.quizId === quizId)
  if (existing) return null
  let score = 0
  quiz.questions.forEach((q, i) => {
    if (answers[i] === q.correctIndex) score++
  })
  const id = 'attempt-' + generateId(6)
  const student = data.students[studentId]
  const orgId = student?.orgId || null
  const term = orgId ? (data.organisations[orgId]?.activeTerm || null) : null
  const attempt = { id, quizId, studentId, answers, score, total: quiz.questions.length, date: new Date().toISOString(), questionTimes: questionTimes || [], term, orgId }
  mutateStudentArray(studentId, 'quizAttempts', (arr) => arr.push(attempt))
  return attempt
}

export function getAttemptsForStudent(studentId) {
  return getStudentArray(studentId, 'quizAttempts')
}

export function getAttemptForQuiz(quizId, studentId) {
  return getStudentArray(studentId, 'quizAttempts').find(a => a.quizId === quizId) || null
}

export function getAttemptsForQuiz(quizId) {
  const data = loadData()
  return data.quizAttempts.filter((a) => a.quizId === quizId)
}

export function deleteQuizAttempt(quizId, studentId) {
  mutateStudentArray(studentId, 'quizAttempts', (arr) => {
    const filtered = arr.filter(a => !(a.quizId === quizId && a.studentId === studentId))
    arr.length = 0
    arr.push(...filtered)
  })
  return true
}

export function saveReviewState(quizId, studentId, reviewState) {
  mutateStudentArray(studentId, 'quizAttempts', (arr) => {
    const attempt = arr.find(a => a.quizId === quizId && a.studentId === studentId)
    if (attempt) attempt.reviewState = reviewState
  })
  return true
}

export function getReviewState(quizId, studentId) {
  const attempt = getStudentArray(studentId, 'quizAttempts').find(a => a.quizId === quizId)
  return attempt?.reviewState || null
}

export function getQuizUnlockCount(studentId, classId) {
  const data = loadData()
  return data.scores.filter((s) => s.studentId === studentId && s.classId === classId).length
}

export function isQuizUnlocked(quizId, studentId) {
  const data = loadData()
  const quiz = data.quizzes.find((q) => q.id === quizId)
  if (!quiz) return false
  if (!quiz.unlockEventId) return true
  return data.scores.some((s) => s.studentId === studentId && s.testEventId === quiz.unlockEventId)
}

// --- Imported Quiz Sets ---

function friendlyQuizName(raw) {
  return raw
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
}

export function fixMojibake(text) {
  if (!text) return text
  return text
    // CP1252 mojibake (3-byte UTF-8 read as Windows-1252 then re-encoded)
    .replace(/\u00e2\u20ac\u02dc/g, '\u2018')
    .replace(/\u00e2\u20ac\u2122/g, '\u2019')
    .replace(/\u00e2\u20ac\u0153/g, '\u201c')
    .replace(/\u00e2\u20ac\u009d/g, '\u201d')
    .replace(/\u00e2\u20ac\u201c/g, '\u2013')
    .replace(/\u00e2\u20ac\u201d/g, '\u2014')
    .replace(/\u00e2\u20ac\u00a6/g, '\u2026')
    .replace(/\u00e2\u20ac\u2039/g, '\u2039')
    .replace(/\u00e2\u20ac\u203a/g, '\u203a')
    // ISO-8859-1 mojibake fallback (bytes 80-9F as control chars)
    .replace(/\u00e2\u0080\u0098/g, '\u2018')
    .replace(/\u00e2\u0080\u0099/g, '\u2019')
    .replace(/\u00e2\u0080\u009c/g, '\u201c')
    .replace(/\u00e2\u0080\u009d/g, '\u201d')
    .replace(/\u00e2\u0080\u0093/g, '\u2013')
    .replace(/\u00e2\u0080\u0094/g, '\u2014')
    .replace(/\u00e2\u0080\u00a6/g, '\u2026')
    // 2-byte sequences (same in Latin-1 and CP1252)
    .replace(/\u00c3\u0097/g, '\u00d7')
    .replace(/\u00c3\u00b7/g, '\u00f7')
    .replace(/\u00c2\u00a0/g, ' ')
    .replace(/\u00c2\u00b0/g, '\u00b0')
    .replace(/\u00c2\u00bd/g, '\u00bd')
    .replace(/\u00c2\u00bc/g, '\u00bc')
    .replace(/\u00c2\u00be/g, '\u00be')
    .replace(/\u00c2\u00b2/g, '\u00b2')
    .replace(/\u00c2\u00b3/g, '\u00b3')
    .replace(/\u00c3\u00a9/g, '\u00e9')
    .replace(/\u00c2\u00a3/g, '\u00a3')
    .replace(/\u00c2\u00ab/g, '\u00ab')
    .replace(/\u00c2\u00bb/g, '\u00bb')
}

export function unescapeHtml(text) {
  if (!text) return text
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function extractPrompt(html) {
  if (!html) return { body: '', prompt: '' }
  const parts = html.split(/<\/p>\s*/i).filter(Boolean)
  if (parts.length <= 1) return { body: html, prompt: '' }
  const lastRaw = parts.pop()
  const lastText = lastRaw.replace(/<[^>]*>/g, '').trim()
  if (lastText.endsWith('?') || lastText.endsWith(':') || /^(choose|select|which|what|how|find|calculate|determine|identify|complete|work out)/i.test(lastText)) {
    const promptParts = [lastRaw]
    while (parts.length > 0) {
      const prevText = parts[parts.length - 1].replace(/<[^>]*>/g, '').trim()
      if (prevText.endsWith('.') || prevText.endsWith('!') || prevText.endsWith('?') || prevText.endsWith(':') || prevText === '') break
      promptParts.unshift(parts.pop())
    }
    const prompt = promptParts.map(p => p.replace(/<p[^>]*>/gi, '').trim()).join(' ')
    const body = parts.map(p => p.endsWith('</p>') ? p : p + '</p>').join('')
    return { body, prompt }
  }
  return { body: html, prompt: '' }
}

function parseQuizMeta(key) {
  const termMatch = key.match(/T(\d)/)
  const yearMatch = key.match(/Y(\d+)/)
  const weekMatch = key.match(/W(\d+)/)
  return {
    term: termMatch ? `T${termMatch[1]}` : '',
    year: yearMatch ? `Y${yearMatch[1]}` : '',
    week: weekMatch ? `W${weekMatch[1]}` : '',
  }
}

export async function importQuizzesFromJSON(jsonArray, onProgress) {
  const data = loadData()
  if (!data.importedQuizSets) data.importedQuizSets = []
  if (!data.unassignedQuestions) data.unassignedQuestions = []
  const localSets = [...data.importedQuizSets]

  const quizMap = {}
  const unmatched = []
  for (const q of jsonArray) {
    if (!q.title || !q.answers) continue
    const match = q.title.match(/^(.+?)Q(\d+)(?:\(([a-z])\))?$/)
    if (!match) {
      const options = q.answers.map((a) => unescapeHtml(a.text))
      const correctIndex = q.answers.findIndex((a) => a.isCorrect)
      unmatched.push({
        id: 'uq-' + generateId(6),
        originalTitle: q.title,
        text: unescapeHtml(q.description || ''),
        options,
        correctIndex: correctIndex >= 0 ? correctIndex : 0,
        videoUrl: pickSolutionVideo(q),
        importedAt: Date.now(),
      })
      continue
    }
    const quizKey = match[1]
    const baseNum = parseInt(match[2])
    const subLetter = match[3]
    const questionNum = subLetter ? baseNum * 100 + (subLetter.charCodeAt(0) - 96) : baseNum * 100
    if (!quizMap[quizKey]) quizMap[quizKey] = []
    const options = q.answers.map((a) => unescapeHtml(a.text))
    const correctIndex = q.answers.findIndex((a) => a.isCorrect)
    quizMap[quizKey].push({
      number: questionNum,
      text: unescapeHtml(q.description || ''),
      options,
      correctIndex: correctIndex >= 0 ? correctIndex : 0,
      explanation: '',
      // CleverSpace's solution video (or one embedded in the solution or
      // question) goes into the question's "Solution video" field.
      videoUrl: pickSolutionVideo(q),
    })
  }

  const entries = Object.entries(quizMap)
  const batchId = 'batch-' + Date.now()
  const added = []
  const duplicates = []
  for (let i = 0; i < entries.length; i++) {
    const [key, questions] = entries[i]
    try {
      questions.sort((a, b) => a.number - b.number)

      for (const q of questions) {
        try {
          q.text = fixMojibake(await extractAndStoreImages(q.text))
        } catch (e) {
          q.text = fixMojibake(q.text)
          console.warn(`Import: image extraction failed for ${key} Q${q.number}:`, e)
        }
        q.options = q.options.map((o) => fixMojibake(o))
      }

      const newQs = questions.map((q) => {
        const split = extractPrompt(q.text)
        return {
          text: split.body,
          prompt: split.prompt,
          options: q.options,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
          videoUrl: q.videoUrl || '',
          // Source question number (Q12 -> 1200, Q12(b) -> 1202) so a set whose
          // questions arrive across several import files stays in order.
          number: q.number,
        }
      })

      const existingIdx = localSets.findIndex((s) => s.rawTitle === key)
      if (existingIdx !== -1) {
        const existing = localSets[existingIdx]
        const existingTexts = new Set(existing.questions.map((q) => (q.text || '').replace(/<[^>]*>/g, '').trim().slice(0, 100)))
        const fresh = newQs.filter((q) => {
          const plain = (q.text || '').replace(/<[^>]*>/g, '').trim().slice(0, 100)
          return !existingTexts.has(plain)
        })
        // Questions already in the set still pick up a solution video they
        // were imported without.
        const byText = new Map(newQs.map((q) => [(q.text || '').replace(/<[^>]*>/g, '').trim().slice(0, 100), q]))
        for (const eq of existing.questions) {
          if (eq.videoUrl) continue
          const match = byText.get((eq.text || '').replace(/<[^>]*>/g, '').trim().slice(0, 100))
          if (match?.videoUrl) eq.videoUrl = match.videoUrl
        }
        duplicates.push({ title: existing.friendlyTitle || existing.rawTitle, existingCount: existing.questions.length, newInFile: newQs.length, appended: fresh.length })
        if (fresh.length > 0) {
          existing.questions.push(...fresh)
          if (existing.questions.every((eq) => typeof eq.number === 'number')) {
            existing.questions.sort((a, b) => a.number - b.number)
          }
        }
        added.push(existing)
      } else {
        const meta = parseQuizMeta(key)
        const set = {
          id: 'imp-' + generateId(6),
          batchId,
          rawTitle: key,
          friendlyTitle: friendlyQuizName(key),
          term: meta.term,
          year: meta.year,
          week: meta.week,
          questions: newQs,
        }
        localSets.push(set)
        added.push(set)
      }
    } catch (e) {
      console.error(`Import: failed to process quiz "${key}":`, e)
    }
    if (onProgress) onProgress(i + 1, entries.length)
  }

  for (const uq of unmatched) {
    try {
      uq.text = fixMojibake(await extractAndStoreImages(uq.text))
    } catch (e) {
      uq.text = fixMojibake(uq.text)
    }
    uq.options = uq.options.map((o) => fixMojibake(o))
    const existing = data.unassignedQuestions.findIndex((x) => x.originalTitle === uq.originalTitle)
    if (existing !== -1) data.unassignedQuestions.splice(existing, 1)
    data.unassignedQuestions.push(uq)
  }

  data.importedQuizSets = localSets
  saveData(data)
  return { added, unassignedCount: unmatched.length, unmatchedTitles: unmatched.map((u) => u.originalTitle), duplicates }
}

export function importQuizSetsFromPDF(sections, meta) {
  const data = loadData()
  if (!data.importedQuizSets) data.importedQuizSets = []

  const batchId = 'batch-' + Date.now()
  const added = []

  for (const section of sections) {
    const rawTitle = (meta.subject + meta.term + meta.year + meta.week + '_' + section.sectionTitle).replace(/\s+/g, '')
    const questions = (section.questions || []).map(q => ({
      text: q.text || '',
      prompt: '',
      options: q.options || [],
      correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
      explanation: '',
      needsReview: !!q.needsReview,
      reviewReason: q.reviewReason || '',
      originalType: q.originalType || 'mcq',
    }))

    if (questions.length === 0) continue

    const set = {
      id: 'imp-' + generateId(6),
      batchId,
      rawTitle,
      friendlyTitle: (meta.subject ? meta.subject + ' ' : '') + section.sectionTitle,
      term: meta.term,
      year: meta.year,
      week: meta.week,
      pdfImport: true,
      questions,
    }
    data.importedQuizSets.push(set)
    added.push(set)
  }

  saveData(data)
  return added
}

export function getImportedQuizSets(termFilter) {
  const data = loadData()
  const sets = (data.importedQuizSets || []).map((s) => {
    if (s.year === undefined || s.week === undefined) {
      const meta = parseQuizMeta(s.rawTitle || '')
      if (!s.year) s.year = meta.year
      if (!s.week) s.week = meta.week
    }
    return s
  })
  if (!termFilter) return sets
  return sets.filter((s) => !s.term || s.term === termFilter)
}

export function getTrialTests(termFilter) {
  const data = loadData()
  const sets = (data.importedQuizSets || []).filter((s) => s.trialTest).map((s) => {
    if (s.year === undefined || s.week === undefined) {
      const meta = parseQuizMeta(s.rawTitle || '')
      if (!s.year) s.year = meta.year
      if (!s.week) s.week = meta.week
    }
    return s
  })
  if (!termFilter) return sets
  return sets.filter((s) => s.term === termFilter)
}

export function mergeImportedQuizSets(keepId, mergeId) {
  const data = loadData()
  const sets = data.importedQuizSets || []
  const keep = sets.find((s) => s.id === keepId)
  const merge = sets.find((s) => s.id === mergeId)
  if (!keep || !merge) return null
  const existingNums = new Set(keep.questions.map((q) => q.number))
  let maxNum = keep.questions.reduce((m, q) => Math.max(m, q.number || 0), 0)
  for (const q of merge.questions) {
    if (existingNums.has(q.number)) {
      maxNum++
      keep.questions.push({ ...q, number: maxNum })
    } else {
      keep.questions.push({ ...q })
    }
  }
  keep.questions.sort((a, b) => (a.number || 0) - (b.number || 0))
  data.importedQuizSets = sets.filter((s) => s.id !== mergeId)
  saveData(data)
  return keep
}

export function getImportedQuizSet(id) {
  const data = loadData()
  return (data.importedQuizSets || []).find((s) => s.id === id) || null
}

export function updateImportedQuizSet(id, updates) {
  const data = loadData()
  const set = (data.importedQuizSets || []).find((s) => s.id === id)
  if (!set) return null
  Object.assign(set, updates)
  saveData(data)
  return set
}

export function deleteImportedQuizSet(id) {
  const data = loadData()
  const set = (data.importedQuizSets || []).find((s) => s.id === id)
  const removedAttemptIds = new Set()
  for (const a of [...(data.homeworkAttempts || []), ...(data.homeworkRedos || [])]) {
    if (a.quizSetId === id) removedAttemptIds.add(a.id)
  }
  data.importedQuizSets = (data.importedQuizSets || []).filter((s) => s.id !== id)
  data.homeworkAttempts = (data.homeworkAttempts || []).filter(a => a.quizSetId !== id)
  data.homeworkRedos = (data.homeworkRedos || []).filter(a => a.quizSetId !== id)
  data.homeworkProgress = (data.homeworkProgress || []).filter(p => p.quizSetId !== id)
  data.questionReports = (data.questionReports || []).filter(r => r.quizSetId !== id)
  if (removedAttemptIds.size > 0) {
    data.writingMarks = (data.writingMarks || []).filter(m => !removedAttemptIds.has(m.attemptId))
  }
  for (const course of (data.courses || [])) {
    for (const mod of course.modules) {
      mod.quizSetIds = (mod.quizSetIds || []).filter(qid => qid !== id)
    }
  }
  saveData(data)
  const affectedStudentIds = Object.keys(data.students || {})
  for (const sid of affectedStudentIds) {
    const sData = loadStudentData(sid)
    if (!sData || !sData._migrated) continue
    let changed = false
    if (sData.homeworkAttempts?.length) { const len = sData.homeworkAttempts.length; sData.homeworkAttempts = sData.homeworkAttempts.filter(a => a.quizSetId !== id); if (sData.homeworkAttempts.length !== len) changed = true }
    if (sData.homeworkRedos?.length) { const len = sData.homeworkRedos.length; sData.homeworkRedos = sData.homeworkRedos.filter(a => a.quizSetId !== id); if (sData.homeworkRedos.length !== len) changed = true }
    if (sData.homeworkProgress?.length) { const len = sData.homeworkProgress.length; sData.homeworkProgress = sData.homeworkProgress.filter(p => p.quizSetId !== id); if (sData.homeworkProgress.length !== len) changed = true }
    if (sData.quizAttempts?.length) { const len = sData.quizAttempts.length; sData.quizAttempts = sData.quizAttempts.filter(a => a.quizId !== id); if (sData.quizAttempts.length !== len) changed = true }
    if (changed) saveStudentData(sid, sData)
  }
  if (set) {
    const imageKeys = []
    for (const q of set.questions) imageKeys.push(...findImageRefs(q.text))
    if (imageKeys.length > 0) deleteImages(imageKeys)
  }
  return true
}

export function getLastImportBatch() {
  const data = loadData()
  const sets = data.importedQuizSets || []
  const batches = [...new Set(sets.filter((s) => s.batchId).map((s) => s.batchId))]
  if (batches.length === 0) return null
  const lastBatch = batches.sort().pop()
  const batchSets = sets.filter((s) => s.batchId === lastBatch)
  return { batchId: lastBatch, count: batchSets.length, sets: batchSets }
}

export function undoLastImport() {
  const batch = getLastImportBatch()
  if (!batch) return 0
  const data = loadData()
  const toRemove = (data.importedQuizSets || []).filter((s) => s.batchId === batch.batchId)
  const imageKeys = []
  for (const set of toRemove) {
    for (const q of set.questions) imageKeys.push(...findImageRefs(q.text))
  }
  data.importedQuizSets = (data.importedQuizSets || []).filter((s) => s.batchId !== batch.batchId)
  saveData(data)
  if (imageKeys.length > 0) deleteImages(imageKeys)
  return toRemove.length
}

// --- Unassigned Questions ---

export function getUnassignedQuestions() {
  const data = loadData()
  return data.unassignedQuestions || []
}

export function deleteUnassignedQuestion(id) {
  const data = loadData()
  const q = (data.unassignedQuestions || []).find((x) => x.id === id)
  if (q) {
    const imageKeys = findImageRefs(q.text)
    if (imageKeys.length > 0) deleteImages(imageKeys)
  }
  data.unassignedQuestions = (data.unassignedQuestions || []).filter((x) => x.id !== id)
  saveData(data)
}

export function clearUnassignedQuestions() {
  const data = loadData()
  const all = data.unassignedQuestions || []
  const imageKeys = []
  for (const q of all) imageKeys.push(...findImageRefs(q.text))
  if (imageKeys.length > 0) deleteImages(imageKeys)
  data.unassignedQuestions = []
  saveData(data)
}

export function createQuizFromUnassigned(questionIds, title) {
  const data = loadData()
  if (!data.importedQuizSets) data.importedQuizSets = []
  const pool = data.unassignedQuestions || []
  const selected = questionIds.map((id) => pool.find((q) => q.id === id)).filter(Boolean)
  if (selected.length === 0) return null
  const set = {
    id: 'imp-' + generateId(6),
    batchId: 'manual-' + Date.now(),
    rawTitle: title,
    friendlyTitle: title,
    term: '',
    year: '',
    week: '',
    questions: selected.map((q, i) => {
      const split = extractPrompt(q.text)
      return {
        number: i + 1,
        text: split.body,
        prompt: split.prompt,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: '',
      }
    }),
  }
  data.importedQuizSets.push(set)
  data.unassignedQuestions = pool.filter((q) => !questionIds.includes(q.id))
  saveData(data)
  return set
}

// --- Quiz Folders ---

export function getQuizFolders(orgId) {
  const data = loadData()
  return (data.quizFolders || []).filter(f => f.orgId === orgId)
}

export function createQuizFolder(name, orgId, parentId = null) {
  const data = loadData()
  if (!data.quizFolders) data.quizFolders = []
  const id = 'qf-' + generateId(6)
  const folder = { id, name, orgId, parentId }
  data.quizFolders.push(folder)
  saveData(data)
  return folder
}

export function renameQuizFolder(folderId, name) {
  const data = loadData()
  const folder = (data.quizFolders || []).find(f => f.id === folderId)
  if (!folder) return null
  folder.name = name
  saveData(data)
  return folder
}

export function deleteQuizFolder(folderId) {
  const data = loadData()
  const folder = (data.quizFolders || []).find(f => f.id === folderId)
  if (!folder) return false
  const parentId = folder.parentId || null
  for (const s of data.importedQuizSets || []) {
    if (s.folderId === folderId) s.folderId = parentId
  }
  for (const f of data.quizFolders || []) {
    if (f.parentId === folderId) f.parentId = parentId
  }
  data.quizFolders = (data.quizFolders || []).filter(f => f.id !== folderId)
  saveData(data)
  return true
}

export function getFolderPath(folderId) {
  const data = loadData()
  const folders = data.quizFolders || []
  const path = []
  let current = folderId
  while (current) {
    const f = folders.find(x => x.id === current)
    if (!f) break
    path.unshift(f)
    current = f.parentId
  }
  return path
}

// --- Courses ---

export function createCourse(name, classId, orgId, term = '') {
  const data = loadData()
  if (!data.courses) data.courses = []
  const id = 'course-' + generateId(6)
  const course = { id, name, classId, orgId, term, modules: [] }
  data.courses.push(course)
  saveData(data)
  return course
}

export function updateCourse(courseId, updates) {
  const data = loadData()
  const course = (data.courses || []).find((c) => c.id === courseId)
  if (!course) return null
  if (updates.name !== undefined) course.name = updates.name
  if (updates.classId !== undefined) course.classId = updates.classId
  if (updates.image !== undefined) course.image = updates.image
  if (updates.term !== undefined) course.term = updates.term
  saveData(data)
  return course
}

export function deleteCourse(courseId) {
  const data = loadData()
  data.courses = (data.courses || []).filter((c) => c.id !== courseId)
  saveData(data)
  return true
}

export function getCoursesForOrg(orgId) {
  const data = loadData()
  return (data.courses || []).filter((c) => c.orgId === orgId)
}

export function getCourseById(courseId) {
  const data = loadData()
  return (data.courses || []).find((c) => c.id === courseId) || null
}

export function addModuleToCourse(courseId, name) {
  const data = loadData()
  const course = (data.courses || []).find((c) => c.id === courseId)
  if (!course) return null
  const id = 'mod-' + generateId(6)
  const mod = { id, name, quizSetIds: [] }
  course.modules.push(mod)
  saveData(data)
  return mod
}

export function updateModule(courseId, moduleId, updates) {
  const data = loadData()
  const course = (data.courses || []).find((c) => c.id === courseId)
  if (!course) return null
  const mod = course.modules.find((m) => m.id === moduleId)
  if (!mod) return null
  if (updates.name !== undefined) mod.name = updates.name
  if (updates.quizSetIds !== undefined) mod.quizSetIds = updates.quizSetIds
  saveData(data)
  return mod
}

export function deleteModule(courseId, moduleId) {
  const data = loadData()
  const course = (data.courses || []).find((c) => c.id === courseId)
  if (!course) return false
  course.modules = course.modules.filter((m) => m.id !== moduleId)
  saveData(data)
  return true
}

export function assignQuizToModule(courseId, moduleId, quizSetId) {
  const data = loadData()
  const course = (data.courses || []).find((c) => c.id === courseId)
  if (!course) return false
  const mod = course.modules.find((m) => m.id === moduleId)
  if (!mod) return false
  if (!mod.quizSetIds.includes(quizSetId)) mod.quizSetIds.push(quizSetId)
  saveData(data)
  return true
}

export function removeQuizFromModule(courseId, moduleId, quizSetId) {
  const data = loadData()
  const course = (data.courses || []).find((c) => c.id === courseId)
  if (!course) return false
  const mod = course.modules.find((m) => m.id === moduleId)
  if (!mod) return false
  mod.quizSetIds = mod.quizSetIds.filter((id) => id !== quizSetId)
  saveData(data)
  return true
}

export function getAssignedQuizSetIds() {
  const data = loadData()
  const ids = new Set()
  for (const course of (data.courses || [])) {
    for (const mod of (course.modules || [])) {
      for (const qsId of (mod.quizSetIds || [])) ids.add(qsId)
    }
  }
  return ids
}

export function getCoursesForStudent(studentId) {
  const data = loadData()
  const studentClassIds = Object.entries(data.classes)
    .filter(([, cls]) => cls.studentIds.includes(studentId))
    .map(([id]) => id)
  return (data.courses || []).filter((c) => studentClassIds.includes(c.classId))
}

export function getNewCourseCount(studentId) {
  const courses = getCoursesForStudent(studentId)
  const data = loadData()
  return courses.filter(c => !(data.homeworkStarts || []).some(h => h.studentId === studentId && h.courseId === c.id)).length
}

// --- Homework Attempts ---

function scoreOneQuestion(q, answer) {
  const type = q.type || 'multiple-choice'
  if (type === 'multiple-choice' || type === 'multi-description') return answer === q.correctIndex ? 1 : 0
  if (type === 'dropdown-cloze') {
    if (!Array.isArray(answer) || !q.blanks) return 0
    return q.blanks.filter((b, j) => answer[j] === b.correctIndex).length
  }
  if (type === 'drag-drop' || type === 'drag-sentence' || type === 'drag-summary') {
    if (!Array.isArray(answer) || !q.correctOrder) return 0
    return q.correctOrder.filter((c, j) => answer[j] === c).length
  }
  if (type === 'multi-matching') {
    if (!Array.isArray(answer) || !q.matchQuestions) return 0
    return q.matchQuestions.filter((mq, j) => answer[j] === mq.correctExtract).length
  }
  return 0
}

function totalMarksForQuestion(q) {
  const type = q.type || 'multiple-choice'
  if (type === 'dropdown-cloze') return q.blanks?.length || 1
  if (type === 'drag-drop' || type === 'drag-sentence' || type === 'drag-summary') return q.correctOrder?.length || 6
  if (type === 'multi-matching') return q.matchQuestions?.length || 1
  if (type === 'free-writing') return 0
  return 1
}

export function submitHomeworkAttempt(quizSetId, studentId, answers, questionTimes) {
  const existing = getStudentArray(studentId, 'homeworkAttempts').find(a => a.quizSetId === quizSetId)
  if (existing) return null
  const data = loadData()
  const set = (data.importedQuizSets || []).find((s) => s.id === quizSetId)
  if (!set) return null
  let score = 0
  set.questions.forEach((q, i) => {
    score += scoreOneQuestion(q, answers[i])
  })
  const id = 'hwatt-' + generateId(6)
  let total = 0
  set.questions.forEach(q => { total += totalMarksForQuestion(q) })
  const student = data.students[studentId]
  const orgId = student?.orgId || null
  const term = orgId ? (data.organisations[orgId]?.activeTerm || null) : null
  const attempt = { id, quizSetId, studentId, answers, score, total, questionTimes: questionTimes || [], date: new Date().toISOString(), term, orgId }
  mutateStudentArray(studentId, 'homeworkAttempts', (arr) => arr.push(attempt))
  return attempt
}

export function getHomeworkAttempt(quizSetId, studentId) {
  return getStudentArray(studentId, 'homeworkAttempts').find(a => a.quizSetId === quizSetId) || null
}

/**
 * Gathers a per-student array across every student document currently cached,
 * falling back to the shared array for students not yet loaded.
 *
 * Per-student documents are authoritative (Phase 1 migrated and reconciled
 * them). The shared arrays remain only as a fallback until the dual write is
 * removed, so a student whose document has not been preloaded still appears.
 */
function collectStudentArray(key) {
  const caches = getAllStudentCaches()
  const ids = Object.keys(caches)
  const out = []
  const covered = new Set()
  for (const id of ids) {
    const sData = caches[id]
    if (!sData || !sData._migrated) continue
    covered.add(id)
    const arr = sData[key]
    if (Array.isArray(arr)) out.push(...arr)
  }
  const data = loadData()
  for (const item of data[key] || []) {
    if (item && covered.has(item.studentId)) continue
    out.push(item)
  }
  return out
}

/**
 * Cohort figures for one quiz (rank, class average, how many sat it).
 *
 * Served from the server-maintained quizStats collection: one tiny document
 * per student per quiz, holding score/total/pct. That is everything these
 * callers need, and it means a student never reads another student's document
 * - which is what allows the shared attempt array to go away.
 *
 * Falls back to per-student documents (teacher views preload them) when stats
 * have not arrived yet.
 */
export function getHomeworkAttemptsForQuiz(quizSetId) {
  subscribeQuizStats(quizSetId)
  const stats = getQuizStatsCache(quizSetId)
  if (stats && stats.length > 0) {
    return stats.map((s) => ({
      quizSetId,
      studentId: s.studentId,
      score: s.score,
      total: s.total,
      date: s.date,
      term: s.term,
      orgId: s.orgId,
    }))
  }
  return collectStudentArray('homeworkAttempts').filter((a) => a.quizSetId === quizSetId)
}

export function getHomeworkAttemptsForStudent(studentId) {
  return getStudentArray(studentId, 'homeworkAttempts')
}

export function deleteHomeworkAttempt(quizSetId, studentId) {
  mutateStudentArray(studentId, 'homeworkAttempts', (arr) => {
    const filtered = arr.filter(a => !(a.quizSetId === quizSetId && a.studentId === studentId))
    arr.length = 0
    arr.push(...filtered)
  })
  return true
}

export function resetQuizForStudent(quizSetId, studentId) {
  deleteQuizAttempt(quizSetId, studentId)
  deleteHomeworkAttempt(quizSetId, studentId)
  clearHomeworkProgress(quizSetId, studentId)
  mutateStudentArray(studentId, 'homeworkRedos', (arr) => {
    const filtered = arr.filter(r => r.quizSetId !== quizSetId)
    arr.length = 0
    arr.push(...filtered)
  })
  mutateStudentArray(studentId, 'dojoCards', (arr) => {
    const filtered = arr.filter(c => c.sourceId !== quizSetId)
    arr.length = 0
    arr.push(...filtered)
  })
  return true
}

export function saveHomeworkReviewState(quizSetId, studentId, reviewState) {
  mutateStudentArray(studentId, 'homeworkAttempts', (arr) => {
    const attempt = arr.find(a => a.quizSetId === quizSetId && a.studentId === studentId)
    if (attempt) attempt.reviewState = reviewState
  })
  return true
}

export function getHomeworkReviewState(quizSetId, studentId) {
  const attempt = getStudentArray(studentId, 'homeworkAttempts').find(a => a.quizSetId === quizSetId)
  return attempt?.reviewState || null
}

export function saveHomeworkProgress(quizSetId, studentId, progress) {
  const entry = { quizSetId, studentId, ...progress, savedAt: new Date().toISOString() }
  mutateStudentArray(studentId, 'homeworkProgress', (arr) => {
    const idx = arr.findIndex(p => p.quizSetId === quizSetId && p.studentId === studentId)
    if (idx >= 0) arr[idx] = entry
    else arr.push(entry)
  })
}

export function getHomeworkProgress(quizSetId, studentId) {
  return getStudentArray(studentId, 'homeworkProgress').find(p => p.quizSetId === quizSetId) || null
}

export function clearHomeworkProgress(quizSetId, studentId) {
  mutateStudentArray(studentId, 'homeworkProgress', (arr, ctx) => {
    const filtered = arr.filter(p => !(p.quizSetId === quizSetId && p.studentId === studentId))
    arr.length = 0
    arr.push(...filtered)
  })
}

export function submitHomeworkRedo(quizSetId, studentId, answers, questionTimes) {
  const data = loadData()
  const set = (data.importedQuizSets || []).find((s) => s.id === quizSetId)
  if (!set) return null
  let score = 0
  set.questions.forEach((q, i) => {
    score += scoreOneQuestion(q, answers[i])
  })
  const id = 'hwredo-' + generateId(6)
  let total = 0
  set.questions.forEach(q => { total += totalMarksForQuestion(q) })
  const student = data.students[studentId]
  const orgId = student?.orgId || null
  const term = orgId ? (data.organisations[orgId]?.activeTerm || null) : null
  const attempt = { id, quizSetId, studentId, answers, score, total, questionTimes: questionTimes || [], date: new Date().toISOString(), term, orgId }
  mutateStudentArray(studentId, 'homeworkRedos', (arr) => arr.push(attempt))
  return attempt
}

export function getHomeworkRedos(quizSetId, studentId) {
  return getStudentArray(studentId, 'homeworkRedos')
    .filter(a => a.quizSetId === quizSetId)
}

export function getLatestHomeworkRedo(quizSetId, studentId) {
  const redos = getHomeworkRedos(quizSetId, studentId)
  return redos.length > 0 ? redos[redos.length - 1] : null
}

// --- Analytics ---

export function getAllAttemptsForQuizSet(quizSetId, filters = {}) {
  const data = loadData()
  let attempts = collectStudentArray('homeworkAttempts').filter(a => a.quizSetId === quizSetId)
  const redos = collectStudentArray('homeworkRedos').filter(a => a.quizSetId === quizSetId)
  attempts = [...attempts, ...redos]

  // Cover students whose documents are not loaded on this client (a student
  // only holds their own). quizStats carries score/total for everyone who sat
  // the quiz, which is enough for counts and averages; per-question detail
  // still comes from the documents a teacher preloads.
  subscribeQuizStats(quizSetId)
  const stats = getQuizStatsCache(quizSetId)
  if (stats) {
    const have = new Set(attempts.map((a) => a.studentId))
    for (const s of stats) {
      if (have.has(s.studentId)) continue
      attempts.push({ quizSetId, studentId: s.studentId, score: s.score, total: s.total, date: s.date, term: s.term, orgId: s.orgId })
    }
  }
  if (filters.term) attempts = attempts.filter(a => a.term === filters.term)
  if (filters.orgId) attempts = attempts.filter(a => a.orgId === filters.orgId)
  return attempts.map(a => {
    const student = data.students[a.studentId]
    return { ...a, studentName: student ? fullName(student) : (a._deletedStudentName || 'Deleted Student'), isActive: !!student && !student.archived }
  })
}

export function getAllAttemptsForQuiz(quizId, filters = {}) {
  const data = loadData()
  let attempts = collectStudentArray('quizAttempts').filter(a => a.quizId === quizId)
  if (filters.term) attempts = attempts.filter(a => a.term === filters.term)
  if (filters.orgId) attempts = attempts.filter(a => a.orgId === filters.orgId)
  return attempts.map(a => {
    const student = data.students[a.studentId]
    return { ...a, studentName: student ? fullName(student) : (a._deletedStudentName || 'Deleted Student'), isActive: !!student && !student.archived }
  })
}

function computeStats(scores) {
  if (scores.length === 0) return { count: 0, mean: 0, median: 0, min: 0, max: 0, stdDev: 0, percentiles: {} }
  const sorted = [...scores].sort((a, b) => a - b)
  const count = sorted.length
  const sum = sorted.reduce((s, v) => s + v, 0)
  const mean = sum / count
  const median = count % 2 === 0 ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2 : sorted[Math.floor(count / 2)]
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / count
  const stdDev = Math.sqrt(variance)
  const pct = p => sorted[Math.min(Math.floor(p / 100 * count), count - 1)]
  return { count, mean: Math.round(mean * 100) / 100, median, min: sorted[0], max: sorted[count - 1], stdDev: Math.round(stdDev * 100) / 100, percentiles: { p10: pct(10), p25: pct(25), p50: pct(50), p75: pct(75), p90: pct(90) } }
}

export function getQuizSetAnalytics(quizSetId, filters = {}) {
  const attempts = getAllAttemptsForQuizSet(quizSetId, filters)
  if (attempts.length === 0) return { attempts: [], stats: computeStats([]), pctStats: computeStats([]), questionStats: [] }
  const scores = attempts.map(a => a.score)
  const pcts = attempts.map(a => a.total > 0 ? Math.round((a.score / a.total) * 100) : 0)
  const data = loadData()
  const set = (data.importedQuizSets || []).find(s => s.id === quizSetId)
  const questionStats = []
  if (set) {
    for (let i = 0; i < set.questions.length; i++) {
      const q = set.questions[i]
      const answeredAttempts = attempts.filter(a => a.answers && a.answers[i] !== undefined)
      const correct = answeredAttempts.filter(a => {
        if (q.correctIndex !== undefined) return a.answers[i] === q.correctIndex
        return scoreOneQuestion(q, a.answers[i]) > 0
      }).length
      const times = answeredAttempts.map(a => (a.questionTimes || [])[i]).filter(t => typeof t === 'number' && t > 0)
      questionStats.push({
        index: i,
        text: q.text || '',
        totalAttempts: answeredAttempts.length,
        correctCount: correct,
        correctRate: answeredAttempts.length > 0 ? Math.round((correct / answeredAttempts.length) * 100) : 0,
        avgTime: times.length > 0 ? Math.round(times.reduce((s, v) => s + v, 0) / times.length) : null
      })
    }
  }
  return { attempts, stats: computeStats(scores), pctStats: computeStats(pcts), questionStats }
}

export function getQuizAnalytics(quizId, filters = {}) {
  const attempts = getAllAttemptsForQuiz(quizId, filters)
  if (attempts.length === 0) return { attempts: [], stats: computeStats([]), pctStats: computeStats([]), questionStats: [] }
  const scores = attempts.map(a => a.score)
  const pcts = attempts.map(a => a.total > 0 ? Math.round((a.score / a.total) * 100) : 0)
  const data = loadData()
  const quiz = (data.quizzes || []).find(q => q.id === quizId)
  const questionStats = []
  if (quiz) {
    for (let i = 0; i < quiz.questions.length; i++) {
      const q = quiz.questions[i]
      const answeredAttempts = attempts.filter(a => a.answers && a.answers[i] !== undefined)
      const correct = answeredAttempts.filter(a => a.answers[i] === q.correctIndex).length
      const times = answeredAttempts.map(a => (a.questionTimes || [])[i]).filter(t => typeof t === 'number' && t > 0)
      questionStats.push({
        index: i,
        text: q.text || '',
        totalAttempts: answeredAttempts.length,
        correctCount: correct,
        correctRate: answeredAttempts.length > 0 ? Math.round((correct / answeredAttempts.length) * 100) : 0,
        avgTime: times.length > 0 ? Math.round(times.reduce((s, v) => s + v, 0) / times.length) : null
      })
    }
  }
  return { attempts, stats: computeStats(scores), pctStats: computeStats(pcts), questionStats }
}

export function getStudentPercentile(studentId, quizSetId) {
  // Server-maintained per-attempt stats: one tiny document per student per
  // quiz, so a percentile no longer requires everyone's attempt history.
  subscribeQuizStats(quizSetId)
  const stats = getQuizStatsCache(quizSetId)
  if (stats && stats.length >= 2) {
    const mine = stats.find((a) => a.studentId === studentId)
    if (!mine) return null
    const below = stats.filter((a) => (a.pct || 0) < (mine.pct || 0)).length
    return Math.round((below / stats.length) * 100)
  }

  const all = getAllAttemptsForQuizSet(quizSetId)
  const studentAttempt = all.find(a => a.studentId === studentId)
  if (!studentAttempt || all.length < 2) return null
  const studentPct = studentAttempt.total > 0 ? (studentAttempt.score / studentAttempt.total) * 100 : 0
  const below = all.filter(a => {
    const pct = a.total > 0 ? (a.score / a.total) * 100 : 0
    return pct < studentPct
  }).length
  return Math.round((below / all.length) * 100)
}

export function getCoursePercentile(studentId, courseId) {
  const data = loadData()
  const course = (data.courses || []).find(c => c.id === courseId)
  if (!course) return null
  const allQuizSetIds = course.modules.flatMap(m => m.quizSetIds)
  if (allQuizSetIds.length === 0) return null
  const attempts = data.homeworkAttempts || []
  const relevantAttempts = attempts.filter(a => allQuizSetIds.includes(a.quizSetId))
  const studentIds = [...new Set(relevantAttempts.map(a => a.studentId))]
  if (studentIds.length < 2) return null
  const studentAvgs = []
  for (const sid of studentIds) {
    let totalScore = 0, totalMarks = 0
    for (const qsId of allQuizSetIds) {
      const attempt = relevantAttempts.find(a => a.quizSetId === qsId && a.studentId === sid)
      if (attempt) { totalScore += attempt.score; totalMarks += attempt.total }
    }
    if (totalMarks > 0) studentAvgs.push({ sid, pct: (totalScore / totalMarks) * 100 })
  }
  const me = studentAvgs.find(s => s.sid === studentId)
  if (!me || studentAvgs.length < 2) return null
  const below = studentAvgs.filter(s => s.pct < me.pct).length
  return Math.round((below / studentAvgs.length) * 100)
}

export function getOverallPercentile(studentId) {
  const data = loadData()
  const attempts = data.homeworkAttempts || []
  if (attempts.length === 0) return null
  const studentIds = [...new Set(attempts.map(a => a.studentId))]
  if (studentIds.length < 2) return null
  const studentAvgs = []
  for (const sid of studentIds) {
    const sa = attempts.filter(a => a.studentId === sid)
    const totalScore = sa.reduce((s, a) => s + a.score, 0)
    const totalMarks = sa.reduce((s, a) => s + a.total, 0)
    if (totalMarks > 0) studentAvgs.push({ sid, pct: (totalScore / totalMarks) * 100 })
  }
  const me = studentAvgs.find(s => s.sid === studentId)
  if (!me || studentAvgs.length < 2) return null
  const below = studentAvgs.filter(s => s.pct < me.pct).length
  return Math.round((below / studentAvgs.length) * 100)
}

// --- Homework Leaderboard ---

export function getHomeworkLeaderboard(classId, term) {
  // Prefer the server-maintained entries: they update within about a second of
  // any student's submission and cost one small document each, rather than
  // recomputing from every student's attempt history on every render.
  // Falls back to local computation until the first snapshot arrives.
  subscribeLeaderboard(classId)
  const entries = getLeaderboardCache(classId)
  if (entries) {
    return entries
      .map((e) => ({
        id: e.studentId,
        name: e.name || '',
        points: term ? (e.points?.[term] || 0) : (e.points?.all || 0),
        avatar: e.avatar || null,
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points
        return a.name.localeCompare(b.name)
      })
  }

  const data = loadData()
  const cls = data.classes[classId]
  if (!cls) return []
  const classCourses = (data.courses || []).filter(c => c.classId === classId && (!term || c.term === term))
  const quizModuleMap = new Map()
  for (const course of classCourses) {
    for (let mi = 0; mi < course.modules.length; mi++) {
      for (const qsId of course.modules[mi].quizSetIds) {
        quizModuleMap.set(qsId, { courseId: course.id, moduleIndex: mi })
      }
    }
  }
  return cls.studentIds
    .map(sid => {
      const student = data.students[sid]
      if (!student || student.archived) return null
      let totalScore = 0
      for (const a of (data.homeworkAttempts || [])) {
        if (a.studentId !== sid) continue
        const loc = quizModuleMap.get(a.quizSetId)
        if (!loc) continue
        const start = (data.homeworkStarts || []).find(h => h.studentId === sid && h.courseId === loc.courseId)
        if (!start) { totalScore += a.score; continue }
        const deadlineMs = new Date(start.startedDate).getTime() + (loc.moduleIndex + 1) * 7 * 24 * 60 * 60 * 1000
        if (new Date(a.date).getTime() <= deadlineMs) totalScore += a.score
      }
      return { id: sid, name: student.name, points: totalScore, avatar: student.avatar || null }
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      return a.name.localeCompare(b.name)
    })
}

export function getHomeworkWeeklyStats(classId, studentId) {
  const data = loadData()
  const cls = data.classes[classId]
  if (!cls) return []
  const classCourses = (data.courses || []).filter(c => c.classId === classId)
  const results = []
  for (const course of classCourses) {
    for (let mi = 0; mi < course.modules.length; mi++) {
      const mod = course.modules[mi]
      if (mod.quizSetIds.length === 0) continue
      const studentScores = cls.studentIds.map(sid => {
        const attempts = mod.quizSetIds.map(qsId =>
          (data.homeworkAttempts || []).find(a => a.quizSetId === qsId && a.studentId === sid)
        ).filter(Boolean)
        if (attempts.length === 0) return null
        const score = attempts.reduce((s, a) => s + a.score, 0)
        const total = attempts.reduce((s, a) => s + a.total, 0)
        return { sid, pct: total > 0 ? Math.round((score / total) * 100) : 0 }
      }).filter(Boolean)
      const myEntry = studentScores.find(s => s.sid === studentId)
      if (!myEntry) continue
      const sorted = [...studentScores].sort((a, b) => b.pct - a.pct)
      const rank = sorted.findIndex(s => s.sid === studentId) + 1
      const firstAttempt = (data.homeworkAttempts || []).find(a => mod.quizSetIds.includes(a.quizSetId) && a.studentId === studentId)
      results.push({
        moduleName: mod.name,
        value: myEntry.pct,
        rank,
        totalStudents: studentScores.length,
        date: firstAttempt?.date || new Date().toISOString(),
      })
    }
  }
  return results
}

export function getHomeworkOverviewForStudent(studentId, classId) {
  const data = loadData()
  const classCourses = (data.courses || []).filter(c => c.classId === classId)
  const results = []
  for (const course of classCourses) {
    const start = (data.homeworkStarts || []).find(h => h.studentId === studentId && h.courseId === course.id)
    const moduleResults = course.modules.map((mod, i) => {
      const quizAttempts = mod.quizSetIds.map(qsId => {
        const attempt = (data.homeworkAttempts || []).find(a => a.quizSetId === qsId && a.studentId === studentId)
        return attempt ? { score: attempt.score, total: attempt.total } : null
      }).filter(Boolean)
      const totalScore = quizAttempts.reduce((s, a) => s + a.score, 0)
      const totalMarks = quizAttempts.reduce((s, a) => s + a.total, 0)
      return { name: mod.name, index: i, quizCount: mod.quizSetIds.length, completed: quizAttempts.length, totalScore, totalMarks }
    })
    results.push({ courseId: course.id, courseName: course.name, term: course.term, started: !!start, modules: moduleResults })
  }
  return results
}

// --- Homework Start Tracking ---

export function startHomeworkCourse(studentId, courseId) {
  const existing = getStudentArray(studentId, 'homeworkStarts').find(h => h.courseId === courseId)
  if (existing) return existing
  const record = { id: 'hwstart-' + generateId(6), studentId, courseId, startedDate: new Date().toISOString() }
  mutateStudentArray(studentId, 'homeworkStarts', (arr) => arr.push(record))
  return record
}

export function getHomeworkStart(studentId, courseId) {
  return getStudentArray(studentId, 'homeworkStarts').find(h => h.courseId === courseId) || null
}

export function getUnlockedModuleCount(studentId, courseId) {
  const start = getHomeworkStart(studentId, courseId)
  if (!start) return 0
  const days = Math.floor((Date.now() - new Date(start.startedDate).getTime()) / (1000 * 60 * 60 * 24))
  return Math.floor(days / 7) + 1
}

export function getModuleDeadline(studentId, courseId, moduleIndex) {
  const start = getHomeworkStart(studentId, courseId)
  if (!start) return null
  return new Date(new Date(start.startedDate).getTime() + (moduleIndex + 1) * 7 * 24 * 60 * 60 * 1000)
}

export function getPendingHomeworkCount(studentId) {
  const data = loadData()
  const studentClassIds = Object.entries(data.classes)
    .filter(([, cls]) => cls.studentIds.includes(studentId))
    .map(([id]) => id)
  const courses = (data.courses || []).filter((c) => studentClassIds.includes(c.classId))
  let pending = 0, overdue = 0
  for (const course of courses) {
    const unlocked = getUnlockedModuleCount(studentId, course.id)
    if (unlocked === 0) continue
    const start = getHomeworkStart(studentId, course.id)
    const days = Math.floor((Date.now() - new Date(start.startedDate).getTime()) / (1000 * 60 * 60 * 24))
    const currentWeek = Math.floor(days / 7)
    const modules = course.modules || []
    for (let i = 0; i < Math.min(unlocked, modules.length); i++) {
      for (const qsId of (modules[i].quizSetIds || [])) {
        if (!(data.homeworkAttempts || []).some((a) => a.quizSetId === qsId && a.studentId === studentId)) {
          if (i < currentWeek) overdue++; else pending++
        }
      }
    }
  }
  return { pending, overdue }
}

export function getSchoolNewsfeed(orgId) {
  const data = loadData()
  const posts = (data.newsfeedPosts || []).filter(p => p.orgId === orgId)
  if (posts.length > 0) return posts.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8)
  return [
    { id: 'welcome', title: 'Welcome Back!', body: 'A new term begins — set your goals and aim high this semester.', color: '#42a5f5', icon: '🎓', date: new Date().toISOString(), upvotes: 24, views: 128 },
    { id: 'tip1', title: 'Study Tip', body: 'Review your notes within 24 hours of each lesson to boost retention by 60%.', color: '#66bb6a', icon: '💡', date: new Date().toISOString(), upvotes: 18, views: 94 },
    { id: 'tip2', title: 'Dojo Reminder', body: 'Visit your Revision Dojo daily — spacing out practice is the key to long-term memory.', color: '#ab47bc', icon: '🥷', date: new Date().toISOString(), upvotes: 12, views: 67 },
    { id: 'tip3', title: 'Coin Challenge', body: 'Complete all your assignments this week to earn bonus coins in the shop!', color: '#ffab00', icon: '🪙', date: new Date().toISOString(), upvotes: 31, views: 152 },
  ]
}

export function createNewsfeedPost(orgId, { title, body, color, icon }) {
  const data = loadData()
  if (!data.newsfeedPosts) data.newsfeedPosts = []
  const post = { id: 'nf-' + generateId(6), orgId, title, body, color: color || '#42a5f5', icon: icon || '📢', date: new Date().toISOString(), upvotes: 0, views: 0 }
  data.newsfeedPosts.push(post)
  saveData(data)
  return post
}

export function updateNewsfeedPost(postId, updates) {
  const data = loadData()
  const post = (data.newsfeedPosts || []).find(p => p.id === postId)
  if (!post) return null
  if (updates.title !== undefined) post.title = updates.title
  if (updates.body !== undefined) post.body = updates.body
  if (updates.color !== undefined) post.color = updates.color
  if (updates.icon !== undefined) post.icon = updates.icon
  saveData(data)
  return post
}

export function deleteNewsfeedPost(postId) {
  const data = loadData()
  data.newsfeedPosts = (data.newsfeedPosts || []).filter(p => p.id !== postId)
  saveData(data)
}

export function getStudentFeedData(studentId) {
  const data = loadData()
  const attempts = (data.homeworkAttempts || []).filter(a => a.studentId === studentId)
  const redos = (data.homeworkRedos || []).filter(r => r.studentId === studentId)
  const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000

  const hwCompleted = [...attempts, ...redos]
    .filter(a => a.date && new Date(a.date).getTime() >= twoDaysAgo)
    .map(a => {
      const set = (data.importedQuizSets || []).find(s => s.id === a.quizSetId)
      let courseId = null, moduleId = null
      for (const c of (data.courses || [])) {
        for (const m of (c.modules || [])) {
          if ((m.quizSetIds || []).includes(a.quizSetId)) { courseId = c.id; moduleId = m.id; break }
        }
        if (courseId) break
      }
      const course = courseId ? (data.courses || []).find(c => c.id === courseId) : null
      return { id: a.id, name: set ? (set.friendlyTitle || set.rawTitle || 'Quiz') : 'Quiz', courseName: course ? course.name : '', score: a.score, total: a.total, date: a.date, isRedo: !!a.redoOf, source: 'homework', courseId, moduleId, quizSetId: a.quizSetId }
    })

  const progressCompleted = (data.quizAttempts || [])
    .filter(a => a.studentId === studentId && a.date && new Date(a.date).getTime() >= twoDaysAgo)
    .map(a => {
      const quiz = (data.quizzes || []).find(q => q.id === a.quizId)
      const topic = quiz ? (data.topics || []).find(t => t.id === quiz.topicId) : null
      return { id: a.id, name: quiz ? quiz.title : 'Progress Test', courseName: topic ? topic.name : '', score: a.score, total: a.total, date: a.date, isRedo: false, source: 'progress', quizId: a.quizId, topicId: quiz?.topicId || null, classId: quiz?.classId || null }
    })

  const allSorted = [...hwCompleted, ...progressCompleted]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
  const seen = new Set()
  const allCompleted = allSorted.filter(a => {
    const key = a.source === 'homework' ? `hw-${a.quizSetId}` : `prog-${a.quizId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 5)

  const studentClassIds = Object.entries(data.classes)
    .filter(([, cls]) => cls.studentIds.includes(studentId))
    .map(([id]) => id)
  const courses = (data.courses || []).filter(c => studentClassIds.includes(c.classId))
  const dueAssignments = []
  for (const course of courses) {
    let start = getHomeworkStart(studentId, course.id)
    if (!start) {
      const hasAttempt = (data.homeworkAttempts || []).some(a => a.studentId === studentId && (course.modules || []).some(m => (m.quizSetIds || []).includes(a.quizSetId)))
      if (hasAttempt) {
        start = startHomeworkCourse(studentId, course.id)
      } else {
        continue
      }
    }
    const unlocked = getUnlockedModuleCount(studentId, course.id)
    if (unlocked === 0) continue
    const days = Math.floor((Date.now() - new Date(start.startedDate).getTime()) / (1000 * 60 * 60 * 24))
    const currentWeek = Math.floor(days / 7)
    const modules = course.modules || []
    for (let i = 0; i < Math.min(unlocked, modules.length); i++) {
      const mod = modules[i]
      for (const qsId of (mod.quizSetIds || [])) {
        const set = (data.importedQuizSets || []).find(s => s.id === qsId)
        if (set && set.trialTest) continue
        if (!(data.homeworkAttempts || []).some(a => a.quizSetId === qsId && a.studentId === studentId)) {
          dueAssignments.push({ id: qsId, name: set ? (set.friendlyTitle || set.rawTitle || 'Quiz') : 'Quiz', module: mod.name || `Module ${i + 1}`, course: course.name, courseId: course.id, moduleId: mod.id, overdue: i < currentWeek })
        }
      }
    }
  }
  return { recentCompleted: allCompleted, dueAssignments }
}

// --- Revision Dojo ---

export function addDojoCard(studentId, question, sourceType, sourceId, questionIndex, meta) {
  const existingCards = getStudentArray(studentId, 'dojoCards')
  const exists = existingCards.find(c => c.sourceId === sourceId && c.questionIndex === questionIndex && !c.archived)
  if (exists) {
    if (meta && (!exists.courseName || !exists.quizTitle || !exists.className)) {
      mutateStudentArray(studentId, 'dojoCards', (arr) => {
        const card = arr.find(c => c.id === exists.id)
        if (card) {
          if (meta.courseName) card.courseName = meta.courseName
          if (meta.quizTitle) card.quizTitle = meta.quizTitle
          if (meta.className) card.className = meta.className
        }
      })
    }
    return exists
  }
  const data = loadData()
  const quizSet = (data.importedQuizSets || []).find(s => s.id === sourceId)
  const card = {
    id: 'dojo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    studentId,
    question,
    sourceType,
    sourceId,
    questionIndex,
    className: meta?.className || '',
    courseName: meta?.courseName || '',
    quizTitle: meta?.quizTitle || '',
    topic: quizSet?.topic || meta?.topic || '',
    firstIncorrectDate: new Date().toISOString(),
    nextReviewDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    correctStreak: 0,
    answerCount: 0,
    archived: false,
    archivedDate: null,
    askTeacher: false,
  }
  mutateStudentArray(studentId, 'dojoCards', (arr) => arr.push(card))
  return card
}

export function findQuizSetLocation(quizSetId) {
  const data = loadData()
  for (const c of (data.courses || [])) {
    for (const m of (c.modules || [])) {
      if ((m.quizSetIds || []).includes(quizSetId)) return { courseId: c.id, moduleId: m.id, quizSetId }
    }
  }
  return null
}

export function getDojoCardsForStudent(studentId) {
  return getStudentArray(studentId, 'dojoCards').filter(c => !c.archived)
}

export function getDueDojoCards(studentId) {
  const now = new Date().toISOString()
  return getStudentArray(studentId, 'dojoCards').filter(c => !c.archived && !c.askTeacher && (!c.nextReviewDate || c.nextReviewDate <= now))
}

export function getDojoAskTeacherCards(studentId) {
  return getStudentArray(studentId, 'dojoCards').filter(c => c.askTeacher && !c.archived)
}

export function getDojoArchivedCards(studentId) {
  return getStudentArray(studentId, 'dojoCards').filter(c => c.archived)
}

function findDojoCardOwner(cardId) {
  const data = loadData()
  const card = (data.dojoCards || []).find(c => c.id === cardId)
  return card?.studentId || null
}

function incrementDojoKills(studentId) {
  const sData = loadStudentData(studentId)
  if (sData && sData._migrated) {
    if (!sData.dojoKills) sData.dojoKills = {}
    sData.dojoKills[studentId] = (sData.dojoKills[studentId] || 0) + 1
    saveStudentData(studentId, sData)
  }
  const data = loadData()
  if (!data.dojoKills) data.dojoKills = {}
  data.dojoKills[studentId] = (data.dojoKills[studentId] || 0) + 1
  saveData(data)
}

export function recordDojoAnswer(cardId, correct) {
  const studentId = findDojoCardOwner(cardId)
  if (!studentId) return null
  let result = null
  mutateStudentArray(studentId, 'dojoCards', (arr) => {
    const card = arr.find(c => c.id === cardId)
    if (!card) return
    card.answerCount = (card.answerCount || 0) + 1
    if (correct) {
      card.correctStreak = (card.correctStreak || 0) + 1
      if (card.correctStreak >= 3) {
        card.archived = true
        card.archivedDate = new Date().toISOString()
      } else {
        card.nextReviewDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }
    } else {
      card.correctStreak = 0
      card.nextReviewDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    }
    result = { ...card }
  })
  if (result && result.correctStreak >= 3 && correct) incrementDojoKills(studentId)
  return result
}

export function recordCompulsoryRevisionAnswer(cardId, correct) {
  const studentId = findDojoCardOwner(cardId)
  if (!studentId) return null
  let result = null
  mutateStudentArray(studentId, 'dojoCards', (arr) => {
    const card = arr.find(c => c.id === cardId)
    if (!card) return
    card.answerCount = (card.answerCount || 0) + 1
    if (correct) {
      card.correctStreak = (card.correctStreak || 0) + 1
      if (card.correctStreak >= 3) {
        card.archived = true
        card.archivedDate = new Date().toISOString()
      } else {
        card.nextReviewDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      }
    } else {
      card.correctStreak = 0
    }
    result = { ...card }
  })
  if (result && result.correctStreak >= 3 && correct) incrementDojoKills(studentId)
  return result
}

export function markDojoAskTeacher(cardId) {
  const studentId = findDojoCardOwner(cardId)
  if (!studentId) return
  mutateStudentArray(studentId, 'dojoCards', (arr) => {
    const card = arr.find(c => c.id === cardId)
    if (card) card.askTeacher = true
  })
}

export function returnDojoCardToTraining(cardId) {
  const studentId = findDojoCardOwner(cardId)
  if (!studentId) return
  mutateStudentArray(studentId, 'dojoCards', (arr) => {
    const card = arr.find(c => c.id === cardId)
    if (card) {
      card.askTeacher = false
      card.correctStreak = 0
      card.nextReviewDate = new Date().toISOString()
    }
  })
}

export function getDojoKills(studentId) {
  const sData = loadStudentData(studentId)
  if (sData && sData._migrated && sData.dojoKills !== undefined) {
    return (sData.dojoKills || {})[studentId] || 0
  }
  const data = loadData()
  return (data.dojoKills || {})[studentId] || 0
}

export function redeemDojoKills(studentId, count) {
  const available = getDojoKills(studentId)
  const redeemable = Math.min(count, available)
  if (redeemable <= 0) return 0
  const sData = loadStudentData(studentId)
  if (sData && sData._migrated) {
    if (!sData.dojoKills) sData.dojoKills = {}
    sData.dojoKills[studentId] = available - redeemable
    saveStudentData(studentId, sData)
  }
  const data = loadData()
  if (!data.dojoKills) data.dojoKills = {}
  data.dojoKills[studentId] = available - redeemable
  const student = data.students[studentId]
  if (student) {
    student.tokens = (student.tokens || 0) + redeemable * 5
    student.tokensEarned = (student.tokensEarned || 0) + redeemable * 5
  }
  saveData(data)
  return redeemable * 5
}

export function saveDojoClones(cardId, studentId, questions) {
  const entry = {
    id: 'clone_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    dojoCardId: cardId,
    studentId,
    questions,
    generatedDate: new Date().toISOString(),
    reviewed: false,
  }
  mutateStudentArray(studentId, 'dojoClones', (arr) => arr.push(entry))
  return entry
}

export function getDojoClonesForTeacher(orgId) {
  const data = loadData()
  const orgStudentIds = Object.values(data.students).filter(s => s.orgId === orgId).map(s => s.id)
  return (data.dojoClones || []).filter(c => orgStudentIds.includes(c.studentId) && !c.reviewed)
}

export function markDojoCloneReviewed(cloneId) {
  const data = loadData()
  const clone = (data.dojoClones || []).find(c => c.id === cloneId)
  if (clone) clone.reviewed = true
  saveData(data)
}

export function reportDojoClone(cardId, studentId, questionIndex) {
  const data = loadData()
  const clone = (data.dojoClones || []).find(c => c.dojoCardId === cardId && c.studentId === studentId)
  if (clone && clone.questions[questionIndex]) {
    clone.questions[questionIndex].reported = true
  }
  saveData(data)
}

// --- Dojo: Endless Practice ---
export function getDojoEndlessCards(studentId, { topic, count } = {}) {
  let cards = getStudentArray(studentId, 'dojoCards').filter(c => !c.archived && !c.askTeacher)
  if (topic && topic !== 'all') {
    cards = cards.filter(c => (c.topic || '') === topic)
  }
  cards.sort((a, b) => (a.answerCount || 0) - (b.answerCount || 0))
  if (count && count > 0 && count < cards.length) {
    cards = cards.slice(0, count)
  }
  return cards
}

export function getDojoTopics(studentId) {
  const cards = getStudentArray(studentId, 'dojoCards').filter(c => !c.archived && !c.askTeacher)
  const topics = {}
  for (const c of cards) {
    const t = c.topic || 'Uncategorised'
    topics[t] = (topics[t] || 0) + 1
  }
  return topics
}

export function setQuizSetTopic(quizSetId, topic) {
  const data = loadData()
  const set = (data.importedQuizSets || []).find(s => s.id === quizSetId)
  if (!set) return
  set.topic = topic
  for (const card of (data.dojoCards || [])) {
    if (card.sourceId === quizSetId) card.topic = topic
  }
  saveData(data)
}

export function archiveDojoCard(cardId) {
  const studentId = findDojoCardOwner(cardId)
  if (!studentId) return
  mutateStudentArray(studentId, 'dojoCards', (arr) => {
    const card = arr.find(c => c.id === cardId)
    if (card) { card.archived = true; card.archivedDate = new Date().toISOString() }
  })
}

export function unarchiveDojoCard(cardId) {
  const studentId = findDojoCardOwner(cardId)
  if (!studentId) return
  mutateStudentArray(studentId, 'dojoCards', (arr) => {
    const card = arr.find(c => c.id === cardId)
    if (card) { card.archived = false; card.archivedDate = null; card.correctStreak = 0; card.nextReviewDate = new Date().toISOString() }
  })
}

// --- Dojo: Custom Image Questions ---
export function addCustomDojoCard(studentId, question, orgId, topic) {
  const card = {
    id: 'dojo_custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    studentId,
    question,
    sourceType: 'custom',
    sourceId: 'custom_' + Date.now(),
    questionIndex: 0,
    courseName: 'My Questions',
    quizTitle: 'Uploaded',
    topic: topic || '',
    firstIncorrectDate: new Date().toISOString(),
    nextReviewDate: new Date().toISOString(),
    correctStreak: 0,
    answerCount: 0,
    archived: false,
    archivedDate: null,
    askTeacher: false,
    custom: true,
  }
  mutateStudentArray(studentId, 'dojoCards', (arr) => arr.push(card))
  mutateStudentArray(studentId, 'dojoCustomReview', (arr) => arr.push({
    id: card.id,
    studentId,
    orgId,
    question,
    submittedDate: new Date().toISOString(),
    status: 'pending',
  }))
  return card
}

export function getCustomDojoReviewQueue(orgId) {
  const data = loadData()
  return (data.dojoCustomReview || []).filter(r => r.orgId === orgId && r.status === 'pending')
}

export function approveCustomDojoCard(reviewId) {
  const data = loadData()
  const review = (data.dojoCustomReview || []).find(r => r.id === reviewId)
  if (review) review.status = 'approved'
  saveData(data)
}

export function rejectCustomDojoCard(reviewId) {
  const data = loadData()
  const review = (data.dojoCustomReview || []).find(r => r.id === reviewId)
  if (review) review.status = 'rejected'
  const card = (data.dojoCards || []).find(c => c.id === reviewId)
  if (card) {
    data.dojoCards = data.dojoCards.filter(c => c.id !== reviewId)
  }
  saveData(data)
}

// --- Shop Pools (Books / Tech & Novelty) ---

export function getPoolItems(orgId, pool) {
  const data = loadData()
  return data.shopPools.filter(i => i.orgId === orgId && i.pool === pool)
}

export function createPoolItem(pool, name, price, icon, orgId, description = '') {
  const data = loadData()
  const id = generateId(8)
  const item = { id, orgId, pool, name, price, icon, description }
  data.shopPools.push(item)
  saveData(data)
  return item
}

export function updatePoolItem(itemId, updates) {
  const data = loadData()
  const idx = data.shopPools.findIndex(i => i.id === itemId)
  if (idx === -1) return null
  Object.assign(data.shopPools[idx], updates)
  saveData(data)
  return data.shopPools[idx]
}

export function deletePoolItem(itemId) {
  const data = loadData()
  data.shopPools = data.shopPools.filter(i => i.id !== itemId)
  saveData(data)
  return true
}

// --- Loot Chest Pool ---

export function getLootChestPool(orgId) {
  const data = loadData()
  return (data.lootChestPool || []).filter(a => a.orgId === orgId)
}

export function addLootChestItem(orgId, url, rarity = 'common', name = '', lootType = 'decoration') {
  const data = loadData()
  const id = generateId(8)
  data.lootChestPool.push({ id, orgId, url, rarity, name, lootType })
  saveData(data)
  return { id, orgId, url, rarity, name, lootType }
}

export function updateLootChestItem(itemId, updates) {
  const data = loadData()
  const idx = (data.lootChestPool || []).findIndex(a => a.id === itemId)
  if (idx === -1) return null
  Object.assign(data.lootChestPool[idx], updates)
  saveData(data)
  return data.lootChestPool[idx]
}

export function deleteLootChestItem(itemId) {
  const data = loadData()
  data.lootChestPool = (data.lootChestPool || []).filter(a => a.id !== itemId)
  saveData(data)
  return true
}

export function rollLootChest(studentId, orgId) {
  const data = loadData()
  const student = data.students[studentId]
  if (!student || student.tokens < 1) return null

  const pool = (data.lootChestPool || []).filter(a => a.orgId === orgId)
  if (pool.length === 0) return null

  const totalWeight = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0)
  let roll = Math.random() * totalWeight
  let pickedRarity = 'common'
  for (const tier of RARITY_TIERS) {
    roll -= RARITY_WEIGHTS[tier]
    if (roll <= 0) { pickedRarity = tier; break }
  }

  let candidates = pool.filter(a => a.rarity === pickedRarity)
  if (candidates.length === 0) {
    const idx = RARITY_TIERS.indexOf(pickedRarity)
    for (let d = 1; d < RARITY_TIERS.length; d++) {
      if (idx - d >= 0) candidates = pool.filter(a => a.rarity === RARITY_TIERS[idx - d])
      if (candidates.length > 0) { pickedRarity = RARITY_TIERS[idx - d]; break }
      if (idx + d < RARITY_TIERS.length) candidates = pool.filter(a => a.rarity === RARITY_TIERS[idx + d])
      if (candidates.length > 0) { pickedRarity = RARITY_TIERS[idx + d]; break }
    }
  }
  if (candidates.length === 0) return null

  const picked = candidates[Math.floor(Math.random() * candidates.length)]
  student.tokens -= 1
  if (!student.unlockedLoot) student.unlockedLoot = []
  const isDuplicate = student.unlockedLoot.some(a => a.url === picked.url)
  if (!isDuplicate) {
    student.unlockedLoot.push({ url: picked.url, rarity: picked.rarity, name: picked.name, lootType: picked.lootType })
  }

  saveData(data)
  return { loot: picked, isDuplicate }
}

// --- Voucher Config ---

export function getVoucherConfig(orgId) {
  const data = loadData()
  return data.voucherConfig[orgId] || {
    enabled: true,
    tiers: [
      { amount: 20, price: 2000, enabled: true },
      { amount: 50, price: 5000, enabled: true },
      { amount: 100, price: 10000, enabled: true },
    ],
  }
}

export function updateVoucherConfig(orgId, config) {
  const data = loadData()
  data.voucherConfig[orgId] = config
  saveData(data)
  return config
}

// --- Deterministic Shop Rotation ---

function seededRandom(seed) {
  let t = (seed + 0x6D2B79F5) | 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function seededShuffle(arr, seed) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    const j = seed % (i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function getShopRotationEpoch() {
  const ANCHOR = new Date('2024-01-01T00:00:00Z').getTime()
  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000
  const epoch = Math.floor((Date.now() - ANCHOR) / TWO_WEEKS_MS)
  const nextRefresh = ANCHOR + (epoch + 1) * TWO_WEEKS_MS
  return { epoch, nextRefreshMs: nextRefresh }
}

export function getRotatedShopItems(orgId) {
  const data = loadData()
  const { epoch } = getShopRotationEpoch()

  const booksPool = data.shopPools.filter(i => i.orgId === orgId && i.pool === 'books').sort((a, b) => a.id.localeCompare(b.id))
  const techPool = data.shopPools.filter(i => i.orgId === orgId && i.pool === 'tech').sort((a, b) => a.id.localeCompare(b.id))

  const books = seededShuffle(booksPool, epoch).slice(0, 5)
  const tech = seededShuffle(techPool, epoch).slice(0, 3)

  const vc = data.voucherConfig[orgId] || {
    enabled: true,
    tiers: [
      { amount: 20, price: 2000, enabled: true },
      { amount: 50, price: 5000, enabled: true },
      { amount: 100, price: 10000, enabled: true },
    ],
  }
  const vouchers = vc.enabled
    ? vc.tiers.filter(t => t.enabled).map(t => ({
        id: `voucher-${t.amount}`,
        name: `$${t.amount} Gift Voucher`,
        price: t.price,
        icon: '🎟️',
        isVoucher: true,
      }))
    : []

  const cosmetics = [
    { id: 'avatar-egg', name: 'Avatar Sprite Egg', price: 1, icon: '🥚', currency: 'tokens', type: 'egg' },
    { id: 'loot-chest', name: 'Treasure Loot Chest', price: 1, icon: '🎁', currency: 'tokens', type: 'lootChest' },
  ]

  return { books, tech, vouchers, cosmetics }
}

// --- Purchase Pool Item (rotated items) ---

export function getPurchasedTracks(studentId) {
  const data = loadData()
  const student = data.students[studentId]
  return (student && student.purchasedTracks) || []
}

export function getRotatedTracks(allTracks, studentId) {
  const { epoch } = getShopRotationEpoch()
  const shuffled = seededShuffle(allTracks, epoch * 7919)
  const onSale = shuffled.slice(0, 3)
  const owned = getPurchasedTracks(studentId)
  const onSaleIds = new Set(onSale.map(t => t.id))
  const ownedOffSale = allTracks.filter(t => owned.includes(t.id) && !onSaleIds.has(t.id))
  return { onSale, ownedOffSale }
}

export function purchaseTrack(studentId, trackId, price) {
  const data = loadData()
  const student = data.students[studentId]
  if (!student) return false
  if (!student.purchasedTracks) student.purchasedTracks = []
  if (student.purchasedTracks.includes(trackId)) return false
  const totalPoints = data.scores.filter(s => s.studentId === studentId).reduce((sum, s) => sum + s.value, 0)
  const coins = totalPoints * 10 - student.coinsSpent
  if (coins < price) return false
  student.coinsSpent += price
  student.purchasedTracks.push(trackId)
  saveData(data)
  return true
}

export function purchasePoolItem(studentId, item) {
  const data = loadData()
  const student = data.students[studentId]
  if (!student) return null

  if (item.currency === 'tokens') {
    if (student.tokens < item.price) return null
    student.tokens -= item.price
  } else {
    const totalPoints = data.scores.filter(s => s.studentId === studentId).reduce((sum, s) => sum + s.value, 0)
    const coins = totalPoints * 10 - student.coinsSpent
    if (coins < item.price) return null
    student.coinsSpent += item.price
  }

  const id = generateId(10)
  const purchase = {
    id,
    studentId,
    itemId: item.id,
    itemName: item.name,
    price: item.price,
    currency: item.currency || 'coins',
    date: new Date().toISOString(),
    status: 'pending',
  }
  data.purchases.push(purchase)
  saveData(data)
  return purchase
}

// --- Lifetime Tokens Leaderboard ---

export function getLifetimeTokensLeaderboard(orgId) {
  const data = loadData()
  return Object.entries(data.students)
    .filter(([, s]) => s.orgId === orgId && !s.archived)
    .map(([id, s]) => ({ id, name: s.name, tokensEarned: s.tokensEarned || 0, avatar: s.avatar }))
    .sort((a, b) => b.tokensEarned - a.tokensEarned)
}

export function isBattlegroundsApproved(studentId) {
  const data = loadData()
  const s = data.students[studentId]
  return s ? !!s.battlegroundsApproved : false
}

export function setBattlegroundsApproval(studentId, approved) {
  const data = loadData()
  if (!data.students[studentId]) return false
  data.students[studentId].battlegroundsApproved = approved
  saveData(data)
  return true
}

export function pingBattlegroundsPresence(studentId) {
  const data = loadData()
  if (!data.students[studentId]) return
  data.students[studentId].battlegroundsLastActive = Date.now()
  saveData(data)
}

export function getBattlegroundsOnlineCount(orgId) {
  const data = loadData()
  const threshold = Date.now() - 5 * 60 * 1000
  return Object.values(data.students)
    .filter(s => s.orgId === orgId && !s.archived && s.battlegroundsApproved && s.battlegroundsLastActive > threshold)
    .length
}

export function getTodayTriviaKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getDailyTrivia() {
  const data = loadData()
  const today = getTodayTriviaKey()
  if (data.dailyTrivia && data.dailyTrivia.date === today) return data.dailyTrivia
  return null
}

export function setDailyTrivia(trivia) {
  const data = loadData()
  data.dailyTrivia = { ...trivia, date: getTodayTriviaKey() }
  saveData(data)
}

export function hasDailyTriviaBeenAnswered(studentId) {
  const data = loadData()
  const s = data.students[studentId]
  if (!s) return true
  return s.lastTriviaDate === getTodayTriviaKey()
}

export function completeDailyTrivia(studentId, correct, chosenIndex) {
  const data = loadData()
  if (!data.students[studentId]) return false
  data.students[studentId].lastTriviaDate = getTodayTriviaKey()
  data.students[studentId].lastTriviaCorrect = correct
  data.students[studentId].lastTriviaChoice = chosenIndex
  if (correct) {
    data.students[studentId].tokens = (data.students[studentId].tokens || 0) + 1
    data.students[studentId].tokensEarned = (data.students[studentId].tokensEarned || 0) + 1
  }
  saveData(data)
  return correct
}

export function getDailyTriviaStats() {
  const data = loadData()
  const todayKey = getTodayTriviaKey()
  let total = 0
  let correct = 0
  const choices = [0, 0, 0, 0]
  for (const s of Object.values(data.students)) {
    if (s.lastTriviaDate === todayKey) {
      total++
      if (s.lastTriviaCorrect) correct++
      if (s.lastTriviaChoice != null && s.lastTriviaChoice >= 0 && s.lastTriviaChoice < 4) {
        choices[s.lastTriviaChoice]++
      }
    }
  }
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0
  const choicePcts = total > 0 ? choices.map(c => Math.round((c / total) * 100)) : [0, 0, 0, 0]
  return { total, correct, pct, choices, choicePcts }
}

export function getDailyGameState(studentId, gameId) {
  const data = loadData()
  const s = data.students[studentId]
  if (!s) return null
  const key = getTodayTriviaKey()
  return s.dailyGames?.[key]?.[gameId] || null
}

export function saveDailyGameState(studentId, gameId, state) {
  const data = loadData()
  if (!data.students[studentId]) return
  const key = getTodayTriviaKey()
  if (!data.students[studentId].dailyGames) data.students[studentId].dailyGames = {}
  if (!data.students[studentId].dailyGames[key]) data.students[studentId].dailyGames[key] = {}
  data.students[studentId].dailyGames[key][gameId] = state
  saveData(data)
}

export function awardDailyGameCoins(studentId, gameId, amount) {
  const data = loadData()
  if (!data.students[studentId]) return false
  const key = getTodayTriviaKey()
  const games = data.students[studentId].dailyGames?.[key]
  if (games?.[gameId]?.coinsAwarded) return false
  if (!data.students[studentId].dailyGames) data.students[studentId].dailyGames = {}
  if (!data.students[studentId].dailyGames[key]) data.students[studentId].dailyGames[key] = {}
  if (!data.students[studentId].dailyGames[key][gameId]) data.students[studentId].dailyGames[key][gameId] = {}
  data.students[studentId].dailyGames[key][gameId].coinsAwarded = true
  data.students[studentId].coinsSpent = (data.students[studentId].coinsSpent || 0) - amount
  saveData(data)
  return true
}

export function getDailyPuzzles() {
  const data = loadData()
  const today = getTodayTriviaKey()
  if (data.dailyPuzzles && data.dailyPuzzles.date === today) return data.dailyPuzzles
  return null
}

export function setDailyPuzzles(puzzles) {
  const data = loadData()
  data.dailyPuzzles = { ...puzzles, date: getTodayTriviaKey() }
  saveData(data)
}

export function getWordleHistory(studentId) {
  const data = loadData()
  const s = data.students[studentId]
  if (!s?.dailyGames) return { distribution: [0, 0, 0, 0, 0, 0], played: 0, won: 0 }
  const dist = [0, 0, 0, 0, 0, 0]
  let played = 0, won = 0
  for (const dateKey of Object.keys(s.dailyGames)) {
    const ws = s.dailyGames[dateKey]?.wordle
    if (!ws?.gameOver) continue
    played++
    if (ws.won && ws.guesses) {
      won++
      const idx = Math.min(ws.guesses.length, 6) - 1
      dist[idx]++
    }
  }
  return { distribution: dist, played, won }
}

export function recordWordleSolve(studentId) {
  const data = loadData()
  const today = getTodayTriviaKey()
  if (!data.wordleSolvers) data.wordleSolvers = {}
  if (!data.wordleSolvers[today]) data.wordleSolvers[today] = []
  if (!data.wordleSolvers[today].includes(studentId)) {
    data.wordleSolvers[today].push(studentId)
    saveData(data)
  }
  return data.wordleSolvers[today].indexOf(studentId) + 1
}

export function getWordleSolveOrder(studentId) {
  const data = loadData()
  const today = getTodayTriviaKey()
  const solvers = data.wordleSolvers?.[today] || []
  const idx = solvers.indexOf(studentId)
  return idx === -1 ? null : idx + 1
}

export function getWordleSolverCount() {
  const data = loadData()
  const today = getTodayTriviaKey()
  return data.wordleSolvers?.[today]?.length || 0
}

const ELO_TIERS = [
  { name: 'Bronze', min: 0, max: 1199, color: '#cd7f32', icon: '🥉' },
  { name: 'Silver', min: 1200, max: 1399, color: '#c0c0c0', icon: '🥈' },
  { name: 'Gold', min: 1400, max: 1599, color: '#ffd700', icon: '🥇' },
  { name: 'Platinum', min: 1600, max: 1799, color: '#00d4ff', icon: '💎' },
  { name: 'Diamond', min: 1800, max: 9999, color: '#b388ff', icon: '👑' },
]

export function getEloTiers() { return ELO_TIERS }

export function getArenaTier(elo) {
  return ELO_TIERS.find(t => elo >= t.min && elo <= t.max) || ELO_TIERS[0]
}

export function getArenaElo(studentId, arenaId) {
  const data = loadData()
  const s = data.students[studentId]
  if (!s) return { elo: 1000, tier: ELO_TIERS[0] }
  const elo = s.arenaElo?.[arenaId] || 1000
  return { elo, tier: getArenaTier(elo) }
}

export function updateArenaElo(studentId, arenaId, opponentElo, won) {
  const data = loadData()
  const s = data.students[studentId]
  if (!s) return { elo: 1000, change: 0 }
  if (!s.arenaElo) s.arenaElo = {}
  const current = s.arenaElo[arenaId] || 1000
  const K = 32
  const expected = 1 / (1 + Math.pow(10, (opponentElo - current) / 400))
  const score = won ? 1 : 0
  const change = Math.round(K * (score - expected))
  const newElo = Math.max(0, current + change)
  s.arenaElo[arenaId] = newElo
  saveData(data)
  return { elo: newElo, change }
}

export function getArenaGhosts(arenaId) {
  const data = loadData()
  return data.arenaGhosts?.[arenaId] || []
}

export function findGhostByElo(arenaId, targetElo, excludeStudentId) {
  const ghosts = getArenaGhosts(arenaId)
  const candidates = ghosts.filter(g => g.studentId !== excludeStudentId)
  if (candidates.length === 0) return null
  candidates.sort((a, b) => Math.abs(a.elo - targetElo) - Math.abs(b.elo - targetElo))
  const closePool = candidates.filter(g => Math.abs(g.elo - targetElo) <= 300)
  const pool = closePool.length > 0 ? closePool : candidates.slice(0, 5)
  return pool[Math.floor(Math.random() * pool.length)]
}

export function saveArenaGhost(arenaId, ghost) {
  const data = loadData()
  if (!data.arenaGhosts) data.arenaGhosts = {}
  if (!data.arenaGhosts[arenaId]) data.arenaGhosts[arenaId] = []
  const existing = data.arenaGhosts[arenaId]
  const dupeIdx = existing.findIndex(g => g.studentId === ghost.studentId)
  if (dupeIdx !== -1) existing[dupeIdx] = ghost
  else existing.push(ghost)
  saveData(data)
}

export function getArenaHistory(studentId, arenaId) {
  const data = loadData()
  const s = data.students[studentId]
  if (!s?.arenaHistory) return []
  return (s.arenaHistory[arenaId] || []).slice(-20)
}

export function saveArenaMatch(studentId, arenaId, match) {
  const data = loadData()
  const s = data.students[studentId]
  if (!s) return
  if (!s.arenaHistory) s.arenaHistory = {}
  if (!s.arenaHistory[arenaId]) s.arenaHistory[arenaId] = []
  s.arenaHistory[arenaId].push(match)
  saveData(data)
}

export function getArenaLeaderboard(arenaId) {
  const data = loadData()
  const entries = []
  for (const [id, s] of Object.entries(data.students)) {
    const elo = s.arenaElo?.[arenaId] || 1000
    const matches = s.arenaHistory?.[arenaId] || []
    const wins = matches.filter(m => m.result === 'win').length
    const losses = matches.filter(m => m.result === 'loss').length
    if (matches.length > 0) {
      entries.push({ id, name: s.name, avatar: s.avatar, elo, wins, losses, played: matches.length })
    }
  }
  return entries.sort((a, b) => b.elo - a.elo)
}

// ========== WRITING MARKS ==========

export const WRITING_RUBRIC = [
  { key: 'content', name: 'Content and Ideas', criteria: ['Focuses on the main topic or storyline', 'Includes relevant details and examples', 'Shows original thinking and creativity'] },
  { key: 'structure', name: 'Structure and Organization', criteria: ['Uses clear paragraphs with a beginning, middle, and end', 'Follows the correct text structure (like a story arc or report format)', 'Uses transition words to connect ideas smoothly'] },
  { key: 'vocabulary', name: 'Vocabulary and Word Choice', criteria: ['Uses varied and precise words', 'Includes interesting verbs, adjectives, and nouns', 'Avoids repeating the same words too often'] },
  { key: 'fluency', name: 'Sentence Structure and Fluency', criteria: ['Mixes simple, compound, and complex sentences', 'Writes sentences that flow well when read aloud', 'Avoids run-on or confusing sentences'] },
  { key: 'mechanics', name: 'Spelling, Punctuation, and Grammar', criteria: ['Spells common and grade-level words correctly', 'Uses capital letters and full stops accurately', 'Applies commas, quotation marks, and apostrophes correctly'] },
]

export function getWritingSubmissions(quizSetId, orgId) {
  const data = loadData()
  const set = data.importedQuizSets.find(s => s.id === quizSetId)
  if (!set) return []
  const writingIndices = set.questions.map((q, i) => q.type === 'free-writing' ? i : -1).filter(i => i >= 0)
  if (writingIndices.length === 0) return []
  const attempts = data.homeworkAttempts.filter(a => a.quizSetId === quizSetId && (!orgId || !a.orgId || a.orgId === orgId))
  const redos = (data.homeworkRedos || []).filter(a => a.quizSetId === quizSetId && (!orgId || !a.orgId || a.orgId === orgId))
  const allAttempts = [...attempts, ...redos]
  const submissions = []
  for (const att of allAttempts) {
    const student = data.students[att.studentId]
    if (!student) continue
    for (const qi of writingIndices) {
      const answer = att.answers?.[qi]
      if (typeof answer === 'string' && answer.trim().length > 0) {
        const mark = data.writingMarks.find(m => m.attemptId === att.id && m.questionIndex === qi)
        submissions.push({
          attemptId: att.id,
          questionIndex: qi,
          studentId: att.studentId,
          studentName: fullName(student),
          studentAvatar: student.avatar,
          question: set.questions[qi],
          answer,
          date: att.date,
          mark: mark || null,
        })
      }
    }
  }
  return submissions.sort((a, b) => new Date(b.date) - new Date(a.date))
}

export function getWritingMark(attemptId, questionIndex) {
  const data = loadData()
  return data.writingMarks.find(m => m.attemptId === attemptId && m.questionIndex === questionIndex) || null
}

export function saveWritingMark({ attemptId, questionIndex, studentId, quizSetId, teacherId, orgId, categories, annotations, overallComment }) {
  const data = loadData()
  const totalScore = categories.reduce((sum, c) => sum + (c.score || 0), 0)
  const existing = data.writingMarks.findIndex(m => m.attemptId === attemptId && m.questionIndex === questionIndex)
  const mark = {
    id: existing >= 0 ? data.writingMarks[existing].id : 'wm-' + generateId(6),
    attemptId, questionIndex, studentId, quizSetId, teacherId, orgId,
    categories,
    totalScore,
    annotations: annotations || [],
    overallComment: overallComment || '',
    date: new Date().toISOString(),
  }
  if (existing >= 0) {
    data.writingMarks[existing] = mark
  } else {
    data.writingMarks.push(mark)
  }
  saveData(data)
  return mark
}

export function deleteWritingMark(attemptId, questionIndex) {
  const data = loadData()
  data.writingMarks = data.writingMarks.filter(m => !(m.attemptId === attemptId && m.questionIndex === questionIndex))
  saveData(data)
}

export function getStudentWritingMarks(studentId) {
  const data = loadData()
  return data.writingMarks.filter(m => m.studentId === studentId)
}

export function getQuizSetsWithWriting(orgId) {
  const data = loadData()
  return data.importedQuizSets.filter(s => {
    if (orgId && s.orgId && s.orgId !== orgId) return false
    return s.questions.some(q => q.type === 'free-writing')
  }).map(s => {
    const writingCount = s.questions.filter(q => q.type === 'free-writing').length
    const attempts = data.homeworkAttempts.filter(a => a.quizSetId === s.id && (!orgId || !a.orgId || a.orgId === orgId))
    const submissions = getWritingSubmissions(s.id, orgId)
    const marked = submissions.filter(sub => sub.mark).length
    return { id: s.id, title: s.title || 'Untitled', writingCount, submissionCount: submissions.length, markedCount: marked, courseId: s.courseId }
  })
}

// ========== QUESTION & EXPLANATION REPORTS ==========

export function reportQuestionError(quizSetId, questionIndex, studentId, errorType, details) {
  const id = 'qr-' + generateId(6)
  const report = { id, quizSetId, questionIndex, studentId, errorType, details, date: new Date().toISOString(), resolved: false }
  mutateStudentArray(studentId, 'questionReports', (arr) => arr.push(report))
  return id
}

export function getQuestionReports(orgId) {
  const data = loadData()
  return data.questionReports.filter(r => {
    if (!orgId) return true
    const set = data.importedQuizSets.find(s => s.id === r.quizSetId)
    return set?.orgId === orgId
  }).sort((a, b) => new Date(b.date) - new Date(a.date))
}

export function resolveQuestionReport(reportId) {
  const data = loadData()
  const r = data.questionReports.find(r => r.id === reportId)
  if (r) { r.resolved = true; saveData(data) }
}

export function reportExplanation(quizSetId, questionIndex, studentId, reason, details) {
  const id = 'er-' + generateId(6)
  const report = { id, quizSetId, questionIndex, studentId, reason, details, date: new Date().toISOString(), resolved: false }
  mutateStudentArray(studentId, 'explanationReports', (arr) => arr.push(report))
  return id
}

export function getExplanationReports(orgId) {
  const data = loadData()
  return data.explanationReports.filter(r => {
    if (!orgId) return true
    const set = data.importedQuizSets.find(s => s.id === r.quizSetId)
    return set?.orgId === orgId
  }).sort((a, b) => new Date(b.date) - new Date(a.date))
}

export function resolveExplanationReport(reportId) {
  const data = loadData()
  const r = data.explanationReports.find(r => r.id === reportId)
  if (r) { r.resolved = true; saveData(data) }
}

// ===== Vocabulary Bank =====
export function getVocabBank(studentId, includeArchived = false) {
  const all = getStudentArray(studentId, 'vocabBank')
  const filtered = includeArchived ? all : all.filter(w => !w.archived)
  return filtered.sort((a, b) => a.word.localeCompare(b.word))
}

export function addToVocabBank(studentId, word, context, source, definition) {
  const lower = word.toLowerCase().trim()
  const existing = getStudentArray(studentId, 'vocabBank').find(v => v.word.toLowerCase() === lower)
  if (existing) return existing.id
  const id = 'vb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
  mutateStudentArray(studentId, 'vocabBank', (arr) => arr.push({ id, studentId, word: word.trim(), definition: definition || '', context: context || '', source: source || '', dateAdded: new Date().toISOString(), familiarity: 0 }))

  return id
}

export function removeFromVocabBank(studentId, wordId) {
  mutateStudentArray(studentId, 'vocabBank', (arr) => {
    const filtered = arr.filter(v => v.id !== wordId)
    arr.length = 0
    arr.push(...filtered)
  })

}

export function updateVocabWord(wordId, updates) {
  const data = loadData()
  const word = (data.vocabBank || []).find(v => v.id === wordId)
  if (!word) return
  mutateStudentArray(word.studentId, 'vocabBank', (arr) => {
    const idx = arr.findIndex(v => v.id === wordId)
    if (idx >= 0) Object.assign(arr[idx], updates)
  })

}

export function getVocabBankStats(studentId) {
  const all = getStudentArray(studentId, 'vocabBank')
  const active = all.filter(w => !w.archived)
  const now = new Date()
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)
  return {
    total: active.length,
    archived: all.filter(w => w.archived).length,
    thisWeek: active.filter(v => new Date(v.dateAdded) >= weekAgo).length,
    mastered: active.filter(v => v.familiarity >= 3).length,
  }
}

export function archiveVocabWord(wordId) {
  updateVocabWord(wordId, { archived: true })
}

// ===== SMS Notifications =====
export function updateStudentContact(studentId, { parentPhone, parentEmail }) {
  const data = loadData()
  const student = data.students[studentId]
  if (!student) return
  if (parentPhone !== undefined) student.parentPhone = parentPhone
  if (parentEmail !== undefined) student.parentEmail = parentEmail
  saveData(data)

}

export function getOverdueStudents(orgId) {
  const data = loadData()
  const results = []
  for (const [id, s] of Object.entries(data.students || {})) {
    if (!s.classId) continue
    const cls = data.classes?.[s.classId]
    if (cls?.orgId !== orgId) continue
    const { pending, overdue } = getPendingHomeworkCount(id)
    if (overdue > 0) {
      results.push({ studentId: id, name: fullName(s), parentPhone: s.parentPhone || '', parentEmail: s.parentEmail || '', overdue, pending })
    }
  }
  return results.sort((a, b) => b.overdue - a.overdue)
}

export function logSms(entry) {
  const data = loadData()
  data.smsLog.push({ ...entry, id: 'sms_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), sentAt: new Date().toISOString() })
  saveData(data)

}

export function getSmsLog(orgId) {
  const data = loadData()
  return data.smsLog.filter(l => l.orgId === orgId).sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
}

export function setNotificationPrefs(orgId, prefs) {
  const data = loadData()
  data.notificationPrefs[orgId] = { ...(data.notificationPrefs[orgId] || {}), ...prefs }
  saveData(data)

}

export function getNotificationPrefs(orgId) {
  const data = loadData()
  return data.notificationPrefs[orgId] || { smsEnabled: false, overdueReminderDays: 3 }
}

/**
 * Loads every student document for a class so the cross-student teacher views
 * can read per-student data synchronously. Call on entering a class view.
 * @returns {Promise<{loaded:number, missing:number}>}
 */
export async function preloadClassStudents(classId) {
  const data = loadData()
  const cls = data.classes[classId]
  if (!cls) return { loaded: 0, missing: 0 }
  return preloadStudents(cls.studentIds || [])
}

/** Preloads every student in the org - used by org-wide teacher views. */
export async function preloadAllStudents() {
  const data = loadData()
  return preloadStudents(Object.keys(data.students || {}))
}

export function getClassDashboardData(classId) {
  const data = loadData()
  const cls = data.classes[classId]
  if (!cls) return null
  const classCourses = (data.courses || []).filter(c => c.classId === classId)
  const allQuizSetIds = []
  for (const course of classCourses) {
    for (const mod of course.modules) {
      for (const qsId of mod.quizSetIds) allQuizSetIds.push(qsId)
    }
  }
  const allHwAttempts = collectStudentArray('homeworkAttempts')
  const allHwRedos = collectStudentArray('homeworkRedos')
  const studentRows = cls.studentIds.map(sid => {
    const student = data.students[sid]
    if (!student || student.archived) return null
    const attempts = allHwAttempts.filter(a => a.studentId === sid && allQuizSetIds.includes(a.quizSetId))
    const redos = allHwRedos.filter(a => a.studentId === sid && allQuizSetIds.includes(a.quizSetId))
    const allAttempts = [...attempts, ...redos]
    const completed = new Set(allAttempts.map(a => a.quizSetId)).size
    const totalScore = allAttempts.reduce((s, a) => s + a.score, 0)
    const totalMarks = allAttempts.reduce((s, a) => s + a.total, 0)
    const avgPct = totalMarks > 0 ? Math.round((totalScore / totalMarks) * 100) : 0
    return { id: sid, name: fullName(student), yearGroup: student.yearGroup || cls.yearGroup || '', school: student.school || '', completed, total: allQuizSetIds.length, avgPct, totalScore, totalMarks }
  }).filter(Boolean)
  return { cls: { id: classId, ...cls }, courses: classCourses, quizSetIds: allQuizSetIds, students: studentRows, totalQuizzes: allQuizSetIds.length }
}

export function getQuizResultsGrid(quizSetId) {
  const data = loadData()
  const qs = (data.importedQuizSets || []).find(s => s.id === quizSetId)
  if (!qs) return null
  const attempts = collectStudentArray('homeworkAttempts').filter(a => a.quizSetId === quizSetId)
  const redos = collectStudentArray('homeworkRedos').filter(a => a.quizSetId === quizSetId)
  const all = [...attempts, ...redos]
  const byStudent = new Map()
  for (const a of all) {
    const prev = byStudent.get(a.studentId)
    if (!prev || new Date(a.date) > new Date(prev.date)) byStudent.set(a.studentId, a)
  }
  const reports = (data.questionReports || []).filter(r => r.quizSetId === quizSetId && !r.resolved)
  const rows = []
  for (const [sid, attempt] of byStudent) {
    const student = data.students[sid]
    if (!student || student.archived) continue
    const questionResults = (qs.questions || []).map((q, i) => {
      const answer = attempt.answers?.[i]
      if (answer === undefined || answer === null) return 'skipped'
      return scoreOneQuestion(q, answer) > 0 ? 'correct' : 'incorrect'
    })
    const reportedQuestions = reports.filter(r => r.studentId === sid).map(r => r.questionIndex)
    rows.push({ studentId: sid, studentName: fullName(student), score: attempt.score, total: attempt.total, pct: attempt.total > 0 ? Math.round((attempt.score / attempt.total) * 100) : 0, date: attempt.date, questionResults, reportedQuestions, time: attempt.questionTimes })
  }
  const reportedQuestionIndices = [...new Set(reports.map(r => r.questionIndex))]
  return { quizSet: qs, rows, questionCount: qs.questions?.length || 0, reportedQuestionIndices }
}

export function getStudentClassScores(studentId, classId) {
  const data = loadData()
  const classCourses = (data.courses || []).filter(c => c.classId === classId)
  const student = data.students[studentId]
  if (!student) return null
  const cls = data.classes[classId]
  const result = []
  for (const course of classCourses) {
    const modules = course.modules.map(mod => {
      const quizzes = mod.quizSetIds.map(qsId => {
        const qs = (data.importedQuizSets || []).find(s => s.id === qsId)
        const attempt = (data.homeworkAttempts || []).find(a => a.quizSetId === qsId && a.studentId === studentId)
        const redo = (data.homeworkRedos || []).find(a => a.quizSetId === qsId && a.studentId === studentId)
        const best = redo && (!attempt || new Date(redo.date) > new Date(attempt.date)) ? redo : attempt
        return { id: qsId, title: qs?.rawTitle || qs?.name || qsId, score: best?.score ?? null, total: best?.total ?? null, pct: best && best.total > 0 ? Math.round((best.score / best.total) * 100) : null, date: best?.date || null }
      })
      return { name: mod.name, quizzes }
    })
    result.push({ courseId: course.id, courseName: course.name, term: course.term, modules })
  }
  return { student: { id: studentId, name: fullName(student), yearGroup: student.yearGroup || cls?.yearGroup || '', school: student.school || '' }, courses: result }
}
