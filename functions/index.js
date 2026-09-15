// Runtime: Node.js 22 (set in firebase.json and package.json engines).
const functions = require('firebase-functions')
const cors = require('cors')({ origin: true })

/**
 * Verifies the caller's Firebase ID token (`Authorization: Bearer <token>`).
 * These endpoints spend real money (Claude, Twilio), so they must not be usable
 * by anyone who simply finds the URL.
 * @returns decoded token, or null when missing/invalid
 */
async function verifyCaller(req) {
  const header = req.get('Authorization') || ''
  const idToken = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!idToken) return null
  try {
    return await admin.auth().verifyIdToken(idToken)
  } catch {
    return null
  }
}

// --- Claude API credentials ---
// Preferred: Workload Identity Federation. The function's Google service
// account identity token is exchanged for a short-lived Anthropic token, so no
// static key is stored anywhere. Enabled when ANTHROPIC_FEDERATION_RULE_ID,
// ANTHROPIC_ORGANIZATION_ID and ANTHROPIC_SERVICE_ACCOUNT_ID are set (these are
// ids, not secrets). Falls back to CLAUDE_API_KEY until then.
const ANTHROPIC_AUDIENCE = 'https://api.anthropic.com'
let federatedToken = null // { value, expiresAt }

async function exchangeFederatedToken() {
  // Google identity tokens carry a jti and are single-use, so fetch a fresh one per exchange.
  const idRes = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity'
      + `?audience=${encodeURIComponent(ANTHROPIC_AUDIENCE)}&format=full`,
    { headers: { 'Metadata-Flavor': 'Google' } },
  )
  if (!idRes.ok) throw new Error(`Metadata identity token failed: ${idRes.status}`)
  const assertion = (await idRes.text()).trim()

  const body = {
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
    federation_rule_id: process.env.ANTHROPIC_FEDERATION_RULE_ID,
    organization_id: process.env.ANTHROPIC_ORGANIZATION_ID,
    service_account_id: process.env.ANTHROPIC_SERVICE_ACCOUNT_ID,
  }
  if (process.env.ANTHROPIC_WORKSPACE_ID) body.workspace_id = process.env.ANTHROPIC_WORKSPACE_ID

  const tokRes = await fetch('https://api.anthropic.com/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!tokRes.ok) throw new Error(`Anthropic token exchange failed: ${tokRes.status} ${await tokRes.text()}`)
  const { access_token, expires_in } = await tokRes.json()
  return { value: access_token, expiresAt: Date.now() + expires_in * 1000 }
}

async function claudeAuthHeader() {
  if (process.env.ANTHROPIC_FEDERATION_RULE_ID) {
    // Refresh two minutes before expiry.
    if (!federatedToken || Date.now() > federatedToken.expiresAt - 120000) {
      federatedToken = await exchangeFederatedToken()
    }
    return { Authorization: `Bearer ${federatedToken.value}` }
  }
  const apiKey = process.env.CLAUDE_API_KEY
  return apiKey ? { 'x-api-key': apiKey } : null
}

// --- Claude API proxy ---
exports.claudeProxy = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }
    if (!(await verifyCaller(req))) {
      return res.status(401).json({ error: { message: 'Sign in required' } })
    }

    try {
      const auth = await claudeAuthHeader()
      if (!auth) {
        return res.status(500).json({ error: 'Claude API credentials not configured' })
      }
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...auth,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(req.body),
      })
      const data = await response.text()
      res.status(response.status).set('Content-Type', 'application/json').send(data)
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })
})

// --- SMS via Twilio ---
exports.sendSMS = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' })
    }
    // Only teachers send parent notifications.
    const caller = await verifyCaller(req)
    if (!caller || caller.role !== 'teacher') {
      return res.status(403).json({ success: false, error: 'Teacher sign-in required' })
    }

    const { phone, message } = req.body
    if (!phone || !message) {
      return res.status(400).json({ success: false, error: 'Missing phone or message' })
    }

    if (!smsConfigured()) {
      return res.status(500).json({ success: false, error: 'Twilio not configured' })
    }

    try {
      const result = await sendTwilio(phone, message)
      return res.json({ success: true, sid: result.sid })
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message })
    }
  })
})

function smsConfigured() {
  return !!(process.env.TWILIO_SID && process.env.TWILIO_AUTH && process.env.TWILIO_PHONE)
}

async function sendTwilio(to, body) {
  const twilio = require('twilio')
  const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH)
  return client.messages.create({ body, from: process.env.TWILIO_PHONE, to })
}

/** Australian mobile in any common form -> "+614XXXXXXXX", else null. */
function normaliseAuMobile(raw) {
  let d = String(raw || '').replace(/[^\d]/g, '')
  if (d.startsWith('61')) d = '0' + d.slice(2)
  return /^04\d{8}$/.test(d) ? '+61' + d.slice(1) : null
}

// ============================================================
// LEADERBOARD + QUIZ STATS AGGREGATION
//
// Student work lives in studentData/{studentId}. Leaderboards and percentiles
// are inherently cross-student, so rather than have every client read every
// student's document (or contend on one shared aggregate doc, which Firestore
// caps at roughly one write per second), this trigger maintains small
// per-student summary documents:
//
//   leaderboards/{classId}/entries/{studentId}   -> points per term
//   quizStats/{quizSetId}/attempts/{studentId}   -> that student's percentage
//
// Every write targets a *different* document, so concurrent submissions never
// contend. Clients subscribe to these small collections and Firestore pushes
// only the changed entry, which is what makes updates instant without fanning
// a large document out to everyone.
//
// Writing them server-side also means a student cannot forge their own score.
// ============================================================
const admin = require('firebase-admin')
if (admin.apps.length === 0) admin.initializeApp()
const db = admin.firestore()

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const APP_DATA_TTL_MS = 30 * 1000

let _appDataCache = null
let _appDataCachedAt = 0

/** Reads the shared course/class structure, cached briefly across invocations. */
async function getAppData() {
  const now = Date.now()
  if (_appDataCache && now - _appDataCachedAt < APP_DATA_TTL_MS) return _appDataCache
  const [core, content, activity] = await Promise.all([
    db.collection('appData').doc('core').get(),
    db.collection('appData').doc('content').get(),
    db.collection('appData').doc('activity').get(),
  ])
  _appDataCache = {
    students: (core.exists && core.data().students) || {},
    classes: (core.exists && core.data().classes) || {},
    courses: (content.exists && content.data().courses) || [],
    homeworkStarts: (activity.exists && activity.data().homeworkStarts) || [],
  }
  _appDataCachedAt = now
  return _appDataCache
}

/** quizSetId -> { courseId, moduleIndex, term } for one class. */
function buildQuizModuleMap(courses, classId) {
  const map = new Map()
  for (const course of courses) {
    if (course.classId !== classId) continue
    const modules = course.modules || []
    for (let mi = 0; mi < modules.length; mi++) {
      for (const qsId of modules[mi].quizSetIds || []) {
        map.set(qsId, { courseId: course.id, moduleIndex: mi, term: course.term || '' })
      }
    }
  }
  return map
}

/**
 * Mirrors getHomeworkLeaderboard(): an attempt counts only if it landed before
 * its module deadline (course start + (moduleIndex + 1) weeks). Points are
 * tallied per term so clients can filter without another round trip.
 */
function computePoints(attempts, quizModuleMap, starts, studentId) {
  const points = { all: 0 }
  for (const a of attempts) {
    const loc = quizModuleMap.get(a.quizSetId)
    if (!loc) continue
    const start = starts.find((h) => h.studentId === studentId && h.courseId === loc.courseId)
    let counts = true
    if (start) {
      const deadline = new Date(start.startedDate).getTime() + (loc.moduleIndex + 1) * WEEK_MS
      counts = new Date(a.date).getTime() <= deadline
    }
    if (!counts) continue
    const score = Number(a.score) || 0
    points.all += score
    const term = loc.term || a.term || ''
    if (term) points[term] = (points[term] || 0) + score
  }
  return points
}

// Collocated with Firestore (australia-southeast1): a us-central1 function
// would add a cross-Pacific round trip to every update, which undermines the
// point of pushing these changes out instantly.
exports.onStudentDataWrite = functions
  .region('australia-southeast1')
  .runWith({ memory: '256MB', timeoutSeconds: 60 })
  .firestore.document('studentData/{studentId}')
  .onWrite(async (change, context) => {
    const studentId = context.params.studentId
    const after = change.after.exists ? change.after.data() : null

    // Student document deleted - clear their entries.
    if (!after) {
      const stale = await db.collectionGroup('entries').where('studentId', '==', studentId).get()
      await Promise.all(stale.docs.map((d) => d.ref.delete()))
      return null
    }

    const app = await getAppData()
    const student = app.students[studentId]
    if (!student) return null

    const attempts = Array.isArray(after.homeworkAttempts) ? after.homeworkAttempts : []
    // Checkpoint (progress test) attempts get the same per-quiz stats, keyed by
    // quiz id, so reports can show a percentile for them too.
    const checkpointAttempts = (Array.isArray(after.quizAttempts) ? after.quizAttempts : []).map((a) => ({ ...a, quizSetId: a.quizId }))
    const writes = []

    // --- leaderboard entries, one per class the student belongs to ---
    for (const [classId, cls] of Object.entries(app.classes)) {
      if (!Array.isArray(cls.studentIds) || !cls.studentIds.includes(studentId)) continue
      const ref = db.collection('leaderboards').doc(classId).collection('entries').doc(studentId)
      if (student.archived) {
        writes.push(ref.delete())
        continue
      }
      const map = buildQuizModuleMap(app.courses, classId)
      const points = computePoints(attempts, map, app.homeworkStarts, studentId)
      writes.push(
        ref.set({
          studentId,
          name: student.name || '',
          avatar: student.avatar || null,
          points,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      )
    }

    // --- quiz stats, only for attempts that actually changed ---
    const before = change.before.exists ? change.before.data() : null
    const beforeAttempts = before
      ? [...(Array.isArray(before.homeworkAttempts) ? before.homeworkAttempts : []), ...(Array.isArray(before.quizAttempts) ? before.quizAttempts : []).map((a) => ({ ...a, quizSetId: a.quizId }))]
      : []
    const beforeById = new Map(beforeAttempts.map((a) => [a.id, JSON.stringify(a)]))
    for (const a of [...attempts, ...checkpointAttempts]) {
      if (!a || !a.quizSetId) continue
      if (beforeById.get(a.id) === JSON.stringify(a)) continue
      const total = Number(a.total) || 0
      const score = Number(a.score) || 0
      writes.push(
        db.collection('quizStats').doc(a.quizSetId).collection('attempts').doc(studentId).set({
          studentId,
          score,
          total,
          pct: total > 0 ? (score / total) * 100 : 0,
          date: a.date || null,
          term: a.term || null,
          orgId: a.orgId || null,
        })
      )
    }

    await Promise.all(writes)
    return null
  })

// ============================================================
// AUTHENTICATION
//
// The app previously compared passwords in the browser against values stored
// in a world-readable Firestore document. That left every student's password,
// name and parent contact details retrievable by anyone with the project id,
// and it meant request.auth was always null - so security rules had no
// identity to enforce against.
//
// These endpoints verify credentials server-side and mint a Firebase Auth
// custom token. The sign-in experience is unchanged (nickname + password);
// what changes is that the browser never receives a stored credential, and
// every client ends up holding a real auth token - which is what makes
// meaningful security rules possible.
//
// Password hashes live in credentials/{role}_{id}: a collection no client may
// read, kept separate from the profile data clients legitimately need.
// ============================================================
const crypto = require('crypto')

const SCRYPT_KEYLEN = 64

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex')
  return `scrypt$${salt}$${hash}`
}

function isLegacyPlaintext(stored) {
  return !!stored && !String(stored).startsWith('scrypt$')
}

function verifyPassword(password, stored) {
  if (!stored) return false
  // Legacy plaintext value: compare directly so existing accounts keep
  // working, then the caller upgrades it to a hash.
  if (isLegacyPlaintext(stored)) return String(password) === String(stored)
  const [, salt, expected] = String(stored).split('$')
  const actual = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex')
  const a = Buffer.from(actual, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

// The core document is ~700 KB. Reading it on every sign-in call (lookup, then
// login) was most of the sign-in delay, so it is cached briefly per instance.
const CORE_TTL_MS = 30 * 1000
let _core = null
let _coreAt = 0

async function getCore(fresh = false) {
  if (!fresh && _core && Date.now() - _coreAt < CORE_TTL_MS) return _core
  const snap = await db.collection('appData').doc('core').get()
  _core = snap.exists ? snap.data() : {}
  _coreAt = Date.now()
  return _core
}

function findIn(core, role, name) {
  const bucket = role === 'teacher' ? core.teachers || {} : core.students || {}
  const wanted = String(name || '').trim().toLowerCase()
  const entry = Object.entries(bucket).find(([, u]) => String(u.name || '').toLowerCase() === wanted)
  return entry ? { id: entry[0], ...entry[1] } : null
}

/**
 * Looks a user up by name. Uses the cached core document, and on a miss
 * re-reads it once - an account created seconds ago must still be found.
 */
async function findUser(role, name) {
  const cached = findIn(await getCore(), role, name)
  if (cached) return cached
  return findIn(await getCore(true), role, name)
}

function credentialRef(role, id) {
  return db.collection('credentials').doc(`${role}_${id}`)
}

// Parent contact details live in studentContacts/{studentId}, readable only by
// teachers. They used to sit on each student record in the shared core
// document, where any signed-in student could read other families' numbers.
function contactRef(studentId) {
  return db.collection('studentContacts').doc(String(studentId))
}

/** "0412 345 678" -> "••••678": enough to tell entries apart, not to call. */
function maskPhone(phone) {
  const digits = String(phone || '').replace(/[^\d]/g, '')
  return digits ? `••••${digits.slice(-3)}` : ''
}

/** A student's parent contact, preferring the private store over legacy fields. */
async function readContact(user) {
  const snap = await contactRef(user.id).get()
  const c = snap.exists ? snap.data() : {}
  return {
    parentPhone: c.parentPhone || user.parentPhone || '',
    parentEmail: c.parentEmail || user.parentEmail || '',
  }
}

/** Reads the effective stored credential, preferring the private collection. */
async function readCredential(role, user) {
  const credSnap = await credentialRef(role, user.id).get()
  if (credSnap.exists && credSnap.data().password) {
    return { stored: credSnap.data().password }
  }
  return { stored: user.password || null }
}

/**
 * Strips fields the client has no business receiving during sign-in.
 * Parent contact details are verified server-side (password reset) and must
 * not be handed to anyone who merely knows a student's nickname.
 */
function publicUser(user) {
  const copy = { ...user }
  delete copy.password
  delete copy.parentEmail
  delete copy.parentPhone
  return copy
}

function sendJson(res, status, body) {
  res.set('Cache-Control', 'no-store')
  return res.status(status).json(body)
}

exports.authLookup = functions
  .region('australia-southeast1')
  // Kept warm: every sign-in calls this, and a cold start added ~5s.
  .runWith({ minInstances: 1 })
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
      try {
        const { role, name } = req.body || {}
        if (!role || !name) return sendJson(res, 400, { error: 'role and name are required' })
        const user = await findUser(role, name)
        if (!user) return sendJson(res, 200, { exists: false })
        const { stored } = await readCredential(role, user)
        return sendJson(res, 200, { exists: true, hasPassword: !!stored, user: publicUser(user) })
      } catch (e) {
        console.error('authLookup failed:', e)
        return sendJson(res, 500, { error: 'Lookup failed' })
      }
    })
  })

/**
 * Password reset, verified against the parent email held on the account.
 * The comparison happens here so the email is never sent to the browser.
 */
exports.authResetPassword = functions
  .region('australia-southeast1')
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
      try {
        const { role, name, parentEmail, newPassword } = req.body || {}
        if (!role || !name || !parentEmail || !newPassword) {
          return sendJson(res, 400, { error: 'Missing details' })
        }
        const user = await findUser(role, name)
        // Same response whether or not the account exists, so this cannot be
        // used to discover which nicknames are registered.
        const contact = user ? await readContact(user) : {}
        const stored = String(contact.parentEmail || '').trim().toLowerCase()
        if (!user || !stored || stored !== String(parentEmail).trim().toLowerCase()) {
          return sendJson(res, 401, { error: 'Email does not match our records.' })
        }
        await credentialRef(role, user.id).set({ password: hashPassword(newPassword), updatedAt: Date.now() })
        const token = await admin.auth().createCustomToken(String(user.id), {
          role,
          orgId: user.orgId || null,
        })
        return sendJson(res, 200, { ok: true, token, user: publicUser(user) })
      } catch (e) {
        console.error('authResetPassword failed:', e)
        return sendJson(res, 500, { error: 'Reset failed' })
      }
    })
  })

exports.authLogin = functions
  .region('australia-southeast1')
  // Kept warm: every sign-in calls this, and a cold start added ~5s.
  .runWith({ minInstances: 1 })
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
      try {
        const { role, name, password } = req.body || {}
        if (!role || !name) return sendJson(res, 400, { error: 'role and name are required' })

        const user = await findUser(role, name)
        if (!user) return sendJson(res, 401, { error: 'Incorrect details' })

        const { stored } = await readCredential(role, user)

        // A teacher token grants read access to every student's work, so
        // self-registered teachers wait for an admin. Existing teachers have no
        // `approved` field and are unaffected.
        if (role === 'teacher' && user.approved === false) {
          if (stored && !verifyPassword(password, stored)) {
            return sendJson(res, 401, { error: 'Incorrect password' })
          }
          return sendJson(res, 403, { error: 'pending-approval' })
        }

        if (!stored) {
          // No credential yet: the set-password step supplies it.
          if (!password) return sendJson(res, 400, { error: 'password required' })
          await credentialRef(role, user.id).set({ password: hashPassword(password), updatedAt: Date.now() })
        } else if (!verifyPassword(password, stored)) {
          return sendJson(res, 401, { error: 'Incorrect password' })
        } else if (isLegacyPlaintext(stored)) {
          // Correct password against a legacy plaintext value - upgrade it.
          await credentialRef(role, user.id).set({ password: hashPassword(password), updatedAt: Date.now() })
        }

        const isAdmin = role === 'teacher' && isAdminTeacher(user)
        const token = await admin.auth().createCustomToken(String(user.id), {
          role,
          orgId: user.orgId || null,
          admin: isAdmin,
        })
        return sendJson(res, 200, { ok: true, token, isAdmin, user: publicUser(user) })
      } catch (e) {
        console.error('authLogin failed:', e)
        return sendJson(res, 500, { error: 'Login failed' })
      }
    })
  })

// ============================================================
// ADMIN
//
// Admin used to be a hardcoded name/password compared in the browser - so the
// credential shipped in the public JavaScript bundle. Admin is now an ordinary
// teacher account whose name is listed here (a name is not a secret; the
// password is verified like any other account), and the admin endpoints below
// require a signed-in admin's ID token.
// ============================================================
const ADMIN_TEACHER_NAMES = ['rob']

function isAdminTeacher(user) {
  return ADMIN_TEACHER_NAMES.includes(String(user?.name || '').trim().toLowerCase())
}

/** Resolves the caller from an `Authorization: Bearer <idToken>` header. */
async function requireAdmin(req) {
  const header = req.get('Authorization') || ''
  const idToken = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!idToken) return null
  try {
    const decoded = await admin.auth().verifyIdToken(idToken)
    return decoded.role === 'teacher' && decoded.admin === true ? decoded : null
  } catch {
    return null
  }
}

/**
 * Admin actions:
 *   status              -> which teachers have a password set
 *   resetTeacher        -> clear a teacher's password (they set a new one at next sign-in)
 *   migrateCredentials  -> hash every plaintext password into credentials/ and
 *                          delete the plaintext copies from the shared core doc
 */
// ============================================================
// SIGN-UP
//
// Accounts used to be created from the browser before the user had signed in,
// which cannot work once security rules require a signed-in identity - and it
// meant the duplicate phone/email check needed every student's parent contact
// details in the browser. Creation now happens here in one step, together with
// the password, and the check runs server-side.
// ============================================================
function randomDigits(n) {
  let out = ''
  for (let i = 0; i < n; i++) out += crypto.randomInt(10)
  return out
}

const digitsOnly = (s) => String(s || '').replace(/[^\d]/g, '')

// ============================================================
// PARENT CONTACT VERIFICATION
//
// Sign-up emails a 6-digit code to the parent's email address (sent from the
// academy Gmail account over SMTP). A correct code returns a short-lived token
// that authSignup requires; the parent's mobile is then bound to the account
// alongside the verified email. Only hashes are stored, in
// contactVerifications/{sha256(email)} (no client access under the rules).
// While SMTP isn't configured, verification is switched off (status says so)
// rather than blocking every sign-up.
// ============================================================
const CODE_TTL_MS = 10 * 60 * 1000
const TOKEN_TTL_MS = 30 * 60 * 1000
const MAX_SENDS_PER_HOUR = 3
const MIN_RESEND_MS = 30 * 1000
const MAX_CODE_ATTEMPTS = 5
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex')
const normaliseEmail = (e) => {
  const v = String(e || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null
}
const verificationRef = (email) => db.collection('contactVerifications').doc(sha256(email))

function emailConfigured() {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS)
}

let _mailer = null
/** Sends one email from the academy account (Gmail SMTP by default). */
async function sendEmail(to, subject, text, html) {
  if (!_mailer) {
    const nodemailer = require('nodemailer')
    const port = Number(process.env.SMTP_PORT || 465)
    _mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  }
  return _mailer.sendMail({ from: `"${process.env.SMTP_FROM_NAME || 'Avant CleverSpace'}" <${process.env.SMTP_USER}>`, to, subject, text, html })
}

exports.phoneVerify = functions
  .region('australia-southeast1')
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
      try {
        const { action, email: rawEmail, code } = req.body || {}
        if (action === 'status') return sendJson(res, 200, { required: emailConfigured(), channel: 'email' })
        if (!emailConfigured()) return sendJson(res, 503, { error: 'Email codes are not set up yet.' })

        const email = normaliseEmail(rawEmail)
        if (!email) return sendJson(res, 400, { error: "Enter the parent's email address." })
        const ref = verificationRef(email)
        const now = Date.now()

        if (action === 'send') {
          const result = await db.runTransaction(async (tx) => {
            const cur = (await tx.get(ref)).data() || {}
            const sends = (cur.sends || []).filter((t) => now - t < 60 * 60 * 1000)
            if (sends.length && now - sends[sends.length - 1] < MIN_RESEND_MS) return { error: 'Please wait 30 seconds before asking for another code.', status: 429 }
            if (sends.length >= MAX_SENDS_PER_HOUR) return { error: 'Too many codes sent to this email. Try again in an hour.', status: 429 }
            const newCode = randomDigits(6)
            tx.set(ref, { codeHash: sha256(email + newCode), expiresAt: now + CODE_TTL_MS, attempts: 0, sends: [...sends, now], tokenHash: null, tokenExpires: 0 })
            return { code: newCode }
          })
          if (result.error) return sendJson(res, result.status, { error: result.error })
          await sendEmail(
            email,
            `Your CleverSpace code: ${result.code}`,
            `Your CleverSpace verification code is ${result.code}. It expires in 10 minutes.\n\nIf you didn't sign up a student at Avant, you can ignore this email.`,
            `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#1a1a2e">
              <h2 style="margin:0 0 12px">Verify your email</h2>
              <p>Use this code to finish signing up your child on Avant CleverSpace:</p>
              <p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f3f4f6;border-radius:10px;padding:14px;text-align:center">${result.code}</p>
              <p style="color:#6b7280;font-size:13px">It expires in 10 minutes. Homework and test updates will be sent to this email. If you didn't sign up a student at Avant, you can ignore this email.</p>
            </div>`,
          )
          return sendJson(res, 200, { ok: true })
        }

        if (action === 'check') {
          const result = await db.runTransaction(async (tx) => {
            const cur = (await tx.get(ref)).data()
            if (!cur || !cur.codeHash || now > cur.expiresAt) return { error: 'That code has expired. Send a new one.', status: 400 }
            if ((cur.attempts || 0) >= MAX_CODE_ATTEMPTS) return { error: 'Too many wrong attempts. Send a new code.', status: 429 }
            if (sha256(email + String(code || '').trim()) !== cur.codeHash) {
              tx.update(ref, { attempts: (cur.attempts || 0) + 1 })
              return { error: 'That code is not right. Check the email and try again.', status: 400 }
            }
            const token = crypto.randomBytes(24).toString('hex')
            tx.update(ref, { codeHash: null, tokenHash: sha256(token), tokenExpires: now + TOKEN_TTL_MS })
            return { token }
          })
          if (result.error) return sendJson(res, result.status, { error: result.error })
          return sendJson(res, 200, { ok: true, token: result.token })
        }

        return sendJson(res, 400, { error: 'Unknown action' })
      } catch (e) {
        console.error('phoneVerify failed:', e)
        return sendJson(res, 500, { error: 'Could not send the code. Check the email address and try again.' })
      }
    })
  })

/** True if `token` proves `rawEmail` was verified recently; consumes it. */
async function consumeEmailToken(rawEmail, token) {
  const email = normaliseEmail(rawEmail)
  if (!email || !token) return false
  const ref = verificationRef(email)
  const cur = (await ref.get()).data()
  if (!cur || !cur.tokenHash || Date.now() > cur.tokenExpires || cur.tokenHash !== sha256(token)) return false
  await ref.delete()
  return true
}

exports.authSignup = functions
  .region('australia-southeast1')
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
      try {
        const { role, name, password, profile } = req.body || {}
        const cleanName = String(name || '').trim()
        if (!['student', 'teacher'].includes(role)) return sendJson(res, 400, { error: 'Invalid role' })
        if (cleanName.length < 1 || cleanName.length > 40) return sendJson(res, 400, { error: 'Please enter a nickname.' })
        if (!password || String(password).length < 1) return sendJson(res, 400, { error: 'Enter a password.' })

        let emailVerified = false
        if (role === 'student') {
          const p = profile || {}
          if (!normaliseAuMobile(p.parentPhone)) return sendJson(res, 400, { error: "Enter the parent's mobile number (04XX XXX XXX)." })
          if (emailConfigured()) {
            emailVerified = await consumeEmailToken(p.parentEmail, p.verifyToken)
            if (!emailVerified) return sendJson(res, 400, { error: "Please verify the parent's email again." })
          }
        }

        const coreRef = db.collection('appData').doc('core')
        const existingContacts = role === 'student'
          ? (await db.collection('studentContacts').get()).docs.map((d) => d.data())
          : []
        const created = await db.runTransaction(async (tx) => {
          const core = (await tx.get(coreRef)).data() || {}
          const bucketName = role === 'teacher' ? 'teachers' : 'students'
          const bucket = core[bucketName] || {}
          const lower = cleanName.toLowerCase()
          if (Object.values(bucket).some((u) => String(u.name || '').toLowerCase() === lower)) {
            return { error: 'That nickname is already taken.', status: 409 }
          }

          let id
          do { id = randomDigits(8) } while (bucket[id])
          const orgs = core.organisations || {}
          const updates = []

          if (role === 'student') {
            const p = profile || {}
            const phone = digitsOnly(p.parentPhone)
            const email = String(p.parentEmail || '').trim().toLowerCase()
            for (const s of [...existingContacts, ...Object.values(core.students || {})]) {
              if (phone && digitsOnly(s.parentPhone) === phone) {
                return { error: 'This phone number is already registered to another student.', status: 409 }
              }
              if (email && String(s.parentEmail || '').trim().toLowerCase() === email) {
                return { error: 'This email is already registered to another student.', status: 409 }
              }
            }
            // Mirrors getFirstOrg(): prefer an org that has a live teacher.
            const orgEntry = Object.entries(orgs).find(([, o]) => o.teacherId && (core.teachers || {})[o.teacherId]) || Object.entries(orgs)[0]
            updates.push(new admin.firestore.FieldPath('students', id), {
              name: cleanName,
              orgId: orgEntry ? orgEntry[0] : null,
              coinsSpent: 0,
              tokens: 0,
              approved: false,
              firstName: String(p.firstName || '').trim(),
              lastName: String(p.lastName || '').trim(),
              yearGroup: p.yearGroup || '',
              schoolName: String(p.schoolName || '').trim(),
            })
          } else {
            let orgId = Object.keys(orgs)[0]
            if (!orgId) {
              do { orgId = randomDigits(6) } while (orgs[orgId])
              updates.push(new admin.firestore.FieldPath('organisations', orgId), { name: 'My Organisation', teacherId: id })
            }
            updates.push(new admin.firestore.FieldPath('teachers', id), { name: cleanName, orgId, approved: false })
          }

          tx.update(coreRef, ...updates)
          return { id }
        })

        if (created.error) return sendJson(res, created.status, { error: created.error })
        _core = null // the cached core no longer contains the new account

        await credentialRef(role, created.id).set({ password: hashPassword(password), updatedAt: Date.now() })
        if (role === 'student') {
          const p = profile || {}
          await contactRef(created.id).set({
            parentPhone: String(p.parentPhone || '').trim(),
            parentEmail: String(p.parentEmail || '').trim(),
            // The mobile is bound to the account alongside the verified email; it
            // is not itself proven reachable until a text is delivered to it.
            emailVerified,
            ...(emailVerified ? { emailVerifiedAt: Date.now() } : {}),
            phoneVerified: false,
            updatedAt: Date.now(),
          })
        }

        if (role === 'teacher') {
          return sendJson(res, 200, { ok: true, pendingApproval: true })
        }
        const token = await admin.auth().createCustomToken(String(created.id), { role: 'student', orgId: null, admin: false })
        return sendJson(res, 200, { ok: true, token, isAdmin: false, user: { id: created.id, name: cleanName, approved: false } })
      } catch (e) {
        console.error('authSignup failed:', e)
        return sendJson(res, 500, { error: 'Sign-up failed' })
      }
    })
  })

exports.authAdmin = functions
  .region('australia-southeast1')
  .runWith({ timeoutSeconds: 120 })
  .https.onRequest((req, res) => {
    cors(req, res, async () => {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
      const caller = await requireAdmin(req)
      if (!caller) return sendJson(res, 403, { error: 'Admin only' })
      try {
        const { action, teacherId } = req.body || {}
        const coreRef = db.collection('appData').doc('core')

        if (action === 'status') {
          const core = (await coreRef.get()).data() || {}
          const teachers = core.teachers || {}
          const out = {}
          await Promise.all(Object.keys(teachers).map(async (id) => {
            const { stored } = await readCredential('teacher', { id, ...teachers[id] })
            out[id] = !!stored
          }))
          return sendJson(res, 200, { ok: true, hasPassword: out })
        }

        if (action === 'approveTeacher') {
          if (!teacherId) return sendJson(res, 400, { error: 'teacherId required' })
          await coreRef.update(new admin.firestore.FieldPath('teachers', String(teacherId), 'approved'), true)
          _core = null
          return sendJson(res, 200, { ok: true })
        }

        if (action === 'resetTeacher') {
          if (!teacherId) return sendJson(res, 400, { error: 'teacherId required' })
          await credentialRef('teacher', teacherId).delete()
          await coreRef.update(new admin.firestore.FieldPath('teachers', String(teacherId), 'password'), admin.firestore.FieldValue.delete())
            .catch(() => { /* no legacy field */ })
          return sendJson(res, 200, { ok: true })
        }

        if (action === 'backfillQuizStats') {
          // Writes quizStats for every existing homework and checkpoint attempt,
          // for attempts made before checkpoint stats were recorded.
          const snap = await db.collection('studentData').get()
          let written = 0
          let batch = db.batch()
          let inBatch = 0
          for (const d of snap.docs) {
            const data = d.data() || {}
            const all = [
              ...(Array.isArray(data.homeworkAttempts) ? data.homeworkAttempts : []),
              ...(Array.isArray(data.quizAttempts) ? data.quizAttempts : []).map((a) => ({ ...a, quizSetId: a.quizId })),
            ]
            for (const a of all) {
              if (!a || !a.quizSetId) continue
              const total = Number(a.total) || 0
              const score = Number(a.score) || 0
              batch.set(db.collection('quizStats').doc(a.quizSetId).collection('attempts').doc(d.id), {
                studentId: d.id, score, total, pct: total > 0 ? (score / total) * 100 : 0,
                date: a.date || null, term: a.term || null, orgId: a.orgId || null,
              })
              written++
              if (++inBatch === 400) { await batch.commit(); batch = db.batch(); inBatch = 0 }
            }
          }
          if (inBatch) await batch.commit()
          return sendJson(res, 200, { ok: true, written })
        }

        if (action === 'migrateContacts') {
          // Moves parent phone/email off the shared student records into the
          // teacher-only studentContacts store, and masks phone numbers in the
          // shared SMS log. A contact already in the private store is kept.
          const core = (await coreRef.get()).data() || {}
          const report = { moved: 0, keptExisting: 0, removedFromCore: 0, smsLogMasked: 0 }
          const updates = []
          for (const [id, s] of Object.entries(core.students || {})) {
            const hasPhone = s.parentPhone !== undefined
            const hasEmail = s.parentEmail !== undefined
            if (!hasPhone && !hasEmail) continue
            if (s.parentPhone || s.parentEmail) {
              const existing = (await contactRef(id).get()).data() || {}
              const merged = {
                parentPhone: existing.parentPhone || s.parentPhone || '',
                parentEmail: existing.parentEmail || s.parentEmail || '',
                updatedAt: Date.now(),
              }
              if (existing.parentPhone || existing.parentEmail) report.keptExisting++
              else report.moved++
              await contactRef(id).set(merged)
            }
            if (hasPhone) { updates.push(new admin.firestore.FieldPath('students', id, 'parentPhone'), admin.firestore.FieldValue.delete()); report.removedFromCore++ }
            if (hasEmail) { updates.push(new admin.firestore.FieldPath('students', id, 'parentEmail'), admin.firestore.FieldValue.delete()); report.removedFromCore++ }
          }
          if (Array.isArray(core.smsLog) && core.smsLog.some((l) => l && l.phone && !String(l.phone).startsWith('•'))) {
            const masked = core.smsLog.map((l) => {
              if (!l || !l.phone || String(l.phone).startsWith('•')) return l
              report.smsLogMasked++
              return { ...l, phone: maskPhone(l.phone) }
            })
            updates.push('smsLog', masked)
          }
          if (updates.length) await coreRef.update(...updates)
          _core = null
          return sendJson(res, 200, { ok: true, report })
        }

        if (action === 'migrateCredentials') {
          const core = (await coreRef.get()).data() || {}
          const report = { hashed: 0, alreadyHashed: 0, removedFromCore: 0 }
          const deletes = []
          for (const [role, bucketName] of [['teacher', 'teachers'], ['student', 'students']]) {
            for (const [id, u] of Object.entries(core[bucketName] || {})) {
              if (u.password === undefined) continue
              if (u.password) {
                const credSnap = await credentialRef(role, id).get()
                if (credSnap.exists && credSnap.data().password) {
                  report.alreadyHashed++
                } else {
                  // Hash the legacy value (or keep an existing hash) so the
                  // account keeps working once the plaintext copy is gone.
                  const pw = String(u.password)
                  await credentialRef(role, id).set({
                    password: pw.startsWith('scrypt$') ? pw : hashPassword(pw),
                    updatedAt: Date.now(),
                  })
                  report.hashed++
                }
              }
              deletes.push(new admin.firestore.FieldPath(bucketName, String(id), 'password'), admin.firestore.FieldValue.delete())
              report.removedFromCore++
            }
          }
          if (deletes.length) await coreRef.update(...deletes)
          return sendJson(res, 200, { ok: true, report })
        }

        return sendJson(res, 400, { error: 'Unknown action' })
      } catch (e) {
        console.error('authAdmin failed:', e)
        return sendJson(res, 500, { error: 'Admin action failed' })
      }
    })
  })
