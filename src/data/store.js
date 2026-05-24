// ============================================================
// DATA STORE
// All app data lives here. Uses localStorage for persistence.
// Structure:
//   organisations: { [orgId]: { name, teacherId } }
//   teachers:      { [teacherId]: { name, orgId } }
//   students:      { [studentId]: { name, orgId, coinsSpent, tokens } }
//   classes:       { [classId]: { name, orgId, teacherId, studentIds[] } }
//   testEvents:    [ { id, classId, name, date } ]
//   scores:        [ { id, studentId, classId, testEventId, value, date } ]
//
// Coins = total score points across all classes - coinsSpent
// Tokens = awarded by teachers only (separate currency)
// ============================================================

const STORAGE_KEY = 'leaderboard_data'

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    const data = JSON.parse(raw)
    if (!data.scores) data.scores = []
    if (!data.testEvents) data.testEvents = []
    // Migrate old students: rewardPoints -> tokens, add coinsSpent
    for (const id of Object.keys(data.students || {})) {
      const s = data.students[id]
      if (s.rewardPoints !== undefined) {
        s.tokens = s.rewardPoints
        delete s.rewardPoints
      }
      if (s.tokens === undefined) s.tokens = 0
      if (s.coinsSpent === undefined) s.coinsSpent = 0
      delete s.coins
    }
    // Migrate old scores: add testEventId if missing
    for (const sc of data.scores) {
      if (!sc.testEventId) sc.testEventId = null
    }
    return data
  }
  return { organisations: {}, teachers: {}, students: {}, classes: {}, scores: [], testEvents: [] }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
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

// --- Teacher Actions ---

export function createTeacher(name) {
  const data = loadData()
  const teacherId = generateId(8)
  data.teachers[teacherId] = { name, orgId: null }
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

// --- Organisation Actions ---

export function createOrganisation(name, teacherId) {
  const data = loadData()
  const orgId = generateOrgId()
  data.organisations[orgId] = { name, teacherId }
  data.teachers[teacherId].orgId = orgId
  saveData(data)
  return { id: orgId, name }
}

export function getOrganisation(orgId) {
  const data = loadData()
  const org = data.organisations[orgId]
  if (!org) return null
  return { id: orgId, ...org }
}

// --- Student Actions ---

export function createStudent(name, orgId = null) {
  const data = loadData()
  const studentId = generateStudentId()
  data.students[studentId] = { name, orgId, coinsSpent: 0, tokens: 0 }
  saveData(data)
  return { id: studentId, ...data.students[studentId] }
}

export function getStudentById(studentId) {
  const data = loadData()
  const student = data.students[studentId]
  if (!student) return null
  // Calculate coins: total scores - spent
  const totalEarned = data.scores
    .filter((s) => s.studentId === studentId)
    .reduce((sum, s) => sum + s.value, 0)
  return {
    id: studentId,
    ...student,
    coins: totalEarned - student.coinsSpent,
    totalEarned,
  }
}

export function deleteStudent(studentId) {
  const data = loadData()
  if (!data.students[studentId]) return false
  delete data.students[studentId]
  data.scores = data.scores.filter((s) => s.studentId !== studentId)
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
  const totalEarned = data.scores
    .filter((s) => s.studentId === studentId)
    .reduce((sum, s) => sum + s.value, 0)
  data.students[studentId].coinsSpent = totalEarned - newBalance
  saveData(data)
  return true
}

// --- Class Actions ---

export function createClass(name, orgId, teacherId) {
  const data = loadData()
  const classId = generateId(6)
  data.classes[classId] = { name, orgId, teacherId, studentIds: [] }
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
      const totalEarned = data.scores
        .filter((sc) => sc.studentId === id)
        .reduce((sum, sc) => sum + sc.value, 0)
      return { id, ...s, coins: totalEarned - s.coinsSpent, totalEarned }
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

// --- Test Event Actions ---

export function createTestEvent(classId, name) {
  const data = loadData()
  const id = generateId(8)
  const date = new Date().toISOString()
  data.testEvents.push({ id, classId, name, date })
  saveData(data)
  return { id, classId, name, date }
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

// --- Leaderboard ---

export function getLeaderboard(classId) {
  const data = loadData()
  const cls = data.classes[classId]
  if (!cls) return []

  return cls.studentIds
    .map((sid) => {
      const student = data.students[sid]
      if (!student) return null
      const points = data.scores
        .filter((s) => s.studentId === sid && s.classId === classId)
        .reduce((sum, s) => sum + s.value, 0)
      return { id: sid, name: student.name, points }
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      return a.name.localeCompare(b.name)
    })
}
