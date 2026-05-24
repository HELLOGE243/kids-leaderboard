// ============================================================
// DATA STORE
// All app data lives here. Uses localStorage for persistence.
// Structure:
//   organisations:   { [orgId]: { name, teacherId } }
//   teachers:        { [teacherId]: { name, orgId } }
//   students:        { [studentId]: { name, orgId, coinsSpent, tokens } }
//   classes:         { [classId]: { name, orgId, teacherId, studentIds[] } }
//   eventTemplates:  [ { id, name, orgId } ]
//   testEvents:      [ { id, classId, name, date, templateId? } ]
//   scores:          [ { id, studentId, classId, testEventId, value, date } ]
//
// Coins = total score points across all classes - coinsSpent
// Tokens = awarded by teachers only (separate currency)
//
// Ranking: when a testEvent has a templateId, rank against ALL scores
//          from ALL events with that templateId. Otherwise rank within
//          just that event's scores.
// ============================================================

const STORAGE_KEY = 'leaderboard_data'

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    const data = JSON.parse(raw)
    if (!data.scores) data.scores = []
    if (!data.testEvents) data.testEvents = []
    if (!data.eventTemplates) data.eventTemplates = []
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
  return { organisations: {}, teachers: {}, students: {}, classes: {}, scores: [], testEvents: [], eventTemplates: [] }
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
  // Calculate coins: (total scores x 10) - spent
  const totalPoints = data.scores
    .filter((s) => s.studentId === studentId)
    .reduce((sum, s) => sum + s.value, 0)
  const totalEarned = totalPoints * 10
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
  const totalPoints = data.scores
    .filter((s) => s.studentId === studentId)
    .reduce((sum, s) => sum + s.value, 0)
  const totalEarned = totalPoints * 10
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
