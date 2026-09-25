import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth'
import { app } from './firebase.js'

// Credentials are verified by Cloud Functions, never in the browser. The
// browser receives a Firebase Auth custom token instead of ever seeing a
// stored password, which is also what gives Firestore security rules an
// identity (request.auth) to enforce against.
const FUNCTIONS_BASE = 'https://australia-southeast1-cleverspacev2.cloudfunctions.net'

export const auth = getAuth(app)

async function postJson(path, body) {
  const res = await fetch(`${FUNCTIONS_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  let data
  try { data = await res.json() } catch { data = null }
  return { ok: res.ok, status: res.status, data }
}

/**
 * Looks up an account by name without revealing anything secret.
 * @returns {Promise<{exists:boolean, hasPassword?:boolean, user?:object, error?:string}>}
 */
export async function lookupUser(role, name) {
  try {
    const { ok, data } = await postJson('authLookup', { role, name })
    if (!ok || !data) return { exists: false, error: data?.error || 'Lookup failed' }
    return data
  } catch (e) {
    console.error('lookupUser failed:', e)
    return { exists: false, error: 'network' }
  }
}

/**
 * Verifies credentials server-side and signs the browser in with the returned
 * custom token.
 * @returns {Promise<{ok:boolean, user?:object, error?:string}>}
 */
export async function loginUser(role, name, password) {
  try {
    const { ok, data } = await postJson('authLogin', { role, name, password })
    if (!ok || !data?.token) {
      return { ok: false, error: data?.error || 'Login failed' }
    }
    await establishSession(data.token)
    return { ok: true, user: data.user, isAdmin: !!data.isAdmin, sessionId: data.sessionId || null }
  } catch (e) {
    console.error('loginUser failed:', e)
    return { ok: false, error: 'network' }
  }
}

/**
 * Creates an account on the server in one step (record + password). New
 * accounts wait for approval, so no session is started here.
 * @returns {Promise<{ok:boolean, pendingApproval?:boolean, error?:string}>}
 */
export async function signupUser(role, name, password, profile) {
  try {
    const { ok, data } = await postJson('authSignup', { role, name, password, profile })
    if (!ok || !data?.ok) return { ok: false, error: data?.error || 'Sign-up failed' }
    return { ok: true, pendingApproval: true, sessionId: data.sessionId || null }
  } catch (e) {
    console.error('signupUser failed:', e)
    return { ok: false, error: 'network' }
  }
}

/**
 * Parent contact verification at sign-up (code sent to the parent's email).
 *   phoneVerification('status')              -> { ok, required }
 *   phoneVerification('send', email)         -> { ok } (emails a 6-digit code)
 *   phoneVerification('check', email, code)  -> { ok, token } (pass token to sign-up)
 */
export async function phoneVerification(action, email, code) {
  try {
    const { ok, data } = await postJson('phoneVerify', { action, email, code })
    if (!ok) return { ok: false, error: data?.error || 'Something went wrong. Try again.' }
    return { ok: true, ...data }
  } catch (e) {
    console.error('phoneVerification failed:', e)
    return { ok: false, error: 'Could not reach the server.' }
  }
}

/**
 * Resets a password after the server verifies the parent email on file.
 * @returns {Promise<{ok:boolean, user?:object, error?:string}>}
 */
export async function resetPassword(role, name, parentEmail, newPassword) {
  try {
    const { ok, data } = await postJson('authResetPassword', { role, name, parentEmail, newPassword })
    if (!ok || !data?.token) return { ok: false, error: data?.error || 'Reset failed' }
    await establishSession(data.token)
    return { ok: true, user: data.user, isAdmin: !!data.isAdmin, sessionId: data.sessionId || null }
  } catch (e) {
    console.error('resetPassword failed:', e)
    return { ok: false, error: 'network' }
  }
}

/**
 * Establishes the Firebase Auth session. By the time this runs the server has
 * already verified the credentials, so a failure here must not block sign-in:
 * it only means requests are not yet carrying an auth token (e.g. the Auth
 * product is not enabled). Security rules must not be enforced until
 * isAuthenticated() is reliably true for signed-in users.
 */
async function establishSession(token) {
  try {
    await signInWithCustomToken(auth, token)
  } catch (e) {
    console.warn('Firebase Auth session not established:', e?.code || e)
  }
}

/**
 * Calls an admin-only server action with this browser's ID token.
 * @param {'status'|'approveTeacher'|'resetTeacher'|'migrateCredentials'} action
 */
export async function adminAction(action, payload = {}) {
  const user = auth.currentUser
  if (!user) return { ok: false, error: 'Sign out and back in to use admin tools.' }
  try {
    const idToken = await user.getIdToken()
    const res = await fetch(`${FUNCTIONS_BASE}/authAdmin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action, ...payload }),
    })
    let data
    try { data = await res.json() } catch { data = null }
    if (!res.ok) return { ok: false, error: data?.error || `Failed (${res.status})` }
    return data
  } catch (e) {
    console.error('adminAction failed:', e)
    return { ok: false, error: 'network' }
  }
}

/**
 * fetch() that sends the signed-in user's Firebase ID token. The Claude proxy
 * and SMS function reject requests without one, so they can no longer be used
 * by anyone who simply finds their URL.
 */
export async function authedFetch(url, init = {}) {
  const headers = new Headers(init.headers || {})
  const user = auth.currentUser
  if (user) headers.set('Authorization', `Bearer ${await user.getIdToken()}`)
  return fetch(url, { ...init, headers })
}

/** Signs the browser out of Firebase Auth. */
export async function signOutUser() {
  try {
    await signOut(auth)
  } catch (e) {
    console.warn('signOutUser failed:', e)
  }
}

/** True once a Firebase Auth session exists on this client. */
export function isAuthenticated() {
  return !!auth.currentUser
}
