import { useState, useEffect } from 'react'
import LoginScreen from './pages/LoginScreen.jsx'
import Portal from './pages/Portal.jsx'
import TeacherDashboard from './pages/TeacherDashboard.jsx'
import SessionRevision from './pages/SessionRevision.jsx'
import GpuNotice from './components/GpuNotice.jsx'
import ScreenLeaveNotice from './components/ScreenLeaveNotice.jsx'
import PolicyNotice from './components/PolicyNotice.jsx'
import { initFirestore, setSyncScope, refreshSharedData, unsubscribeAggregates } from './data/firebase.js'
import { initStudentData, linkDojoCardQuestionIds } from './data/store.js'
import { auth, signOutUser } from './data/auth.js'

const SESSION_KEY = 'leaderboard_session'
const COOKIE_KEY = 'lb_session'

function setCookie(val) {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(val)};expires=${d.toUTCString()};path=/;SameSite=Lax`
}

function getCookie() {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function clearCookie() {
  document.cookie = `${COOKIE_KEY}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`
}

function loadSession() {
  let raw = sessionStorage.getItem(SESSION_KEY)
  if (raw) return JSON.parse(raw)
  raw = getCookie()
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      sessionStorage.setItem(SESSION_KEY, raw)
      return parsed
    } catch { return null }
  }
  return null
}

function App() {
  const [session, setSession] = useState(loadSession)
  const [dbReady, setDbReady] = useState(false)
  const [dbError, setDbError] = useState(null)
  const [tabBlurred, setTabBlurred] = useState(false)

  // Data loads only once a Firebase Auth session exists: security rules refuse
  // unauthenticated reads, and the sign-in screen needs no data at all.
  function startData(s) {
    setSyncScope(s.role)
    return initFirestore()
      .then(() => {
        setDbReady(true)
        // Signing in always starts from the current state, whatever this
        // browser had cached.
        refreshSharedData()
        if (s.role === 'student' && s.user?.id) {
          // Link cards once the student's document and quiz sets are loaded.
          initStudentData(s.user.id)
            .then(() => refreshSharedData())
            .then(() => linkDojoCardQuestionIds(s.user.id))
            .catch((e) => console.warn('Linking dojo cards to question ids failed:', e))
        }
      })
      .catch((err) => {
        console.error('Firestore init failed, falling back to local:', err)
        setDbError(err)
        setDbReady(true)
      })
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Firebase restores a persisted sign-in asynchronously.
      await auth.authStateReady()
      if (cancelled) return
      const existing = loadSession()
      const authed = auth.currentUser
      if (!existing) return
      if (!authed || String(authed.uid) !== String(existing.user?.id)) {
        // A saved session from before server-side sign-in (or for another
        // account) carries no valid auth token - ask the user to sign in again
        // rather than let every request be refused.
        sessionStorage.removeItem(SESSION_KEY)
        clearCookie()
        setSession(null)
        return
      }
      startData(existing)
    })()
    return () => { cancelled = true }
  }, [])

  /* ---- Tab-focus / copy prevention ---- */
  useEffect(() => {
    const show = () => setTabBlurred(true)
    const hide = () => setTabBlurred(false)

    const onVisChange = () => {
      if (document.hidden) show(); else hide()
    }
    document.addEventListener('visibilitychange', onVisChange)
    window.addEventListener('blur', show)
    window.addEventListener('focus', hide)

    // Block right-click context menu
    const blockCtx = (e) => e.preventDefault()
    document.addEventListener('contextmenu', blockCtx)

    // Block common copy/save/view-source shortcuts
    const blockKeys = (e) => {
      if ((e.ctrlKey || e.metaKey) && ['c','u','s'].includes(e.key.toLowerCase())) {
        e.preventDefault()
      }
    }
    document.addEventListener('keydown', blockKeys)

    return () => {
      document.removeEventListener('visibilitychange', onVisChange)
      window.removeEventListener('blur', show)
      window.removeEventListener('focus', hide)
      document.removeEventListener('contextmenu', blockCtx)
      document.removeEventListener('keydown', blockKeys)
    }
  }, [])

  // Everyone re-reads the shared data when their tab comes back to the front.
  // Teachers have live listeners as well, but a listener that never attached -
  // or dropped while the laptop slept - used to leave the dashboard showing
  // yesterday's picture until the page was reloaded.
  useEffect(() => {
    if (!session) return
    function onVisible() {
      if (document.visibilityState === 'visible') refreshSharedData()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [session?.role, session?.user?.id])

  function handleLogin(s) {
    const json = JSON.stringify(s)
    sessionStorage.setItem(SESSION_KEY, json)
    setCookie(json)
    setSession(s)
    startData(s).then(() => {
      // No standing subscription for students - pull once at sign-in.
      if (s.role === 'student') refreshSharedData()
    })
  }

  function handleLogout() {
    sessionStorage.removeItem(SESSION_KEY)
    clearCookie()
    unsubscribeAggregates()
    setSyncScope(null)
    signOutUser()
    setSession(null)
  }

  /* ---- Overlay (always rendered) ---- */
  const overlay = (
    <div className={`tab-blur-overlay${tabBlurred ? ' active' : ''}`}>
      <div className="tab-blur-overlay-title">Come back! 👀</div>
      <div className="tab-blur-overlay-subtitle">This tab must stay active</div>
    </div>
  )

  if (!session) {
    return <>{overlay}<LoginScreen onLogin={handleLogin} /></>
  }

  if (!dbReady) {
    return (
      <>
        {overlay}
        {/* Same loader as index.html. The negative delay resumes the bar where the
            page-start one had reached rather than restarting it from empty. */}
        <div className="boot-loader" role="status" aria-label="Loading">
          <div className="boot-logo"><img src="/avant-logo.png" alt="AVANT OC & Selective" /></div>
          <h1 className="boot-title">CleverSpace EduPortal</h1>
          <div className="boot-bar">
            <div className="boot-bar-fill" style={{ animationDelay: `-${Math.round(performance.now())}ms` }} />
          </div>
          <div className="boot-text">Loading</div>
        </div>
      </>
    )
  }

  if (session.role === 'teacher') {
    return <>{overlay}<GpuNotice /><div className="teacher-app"><TeacherDashboard teacher={session.user} isAdmin={!!session.isAdmin} onLogout={handleLogout} /></div></>
  }

  const revisionKey = `revisionDoneAt_${session.user.id}`
  const lastRevision = localStorage.getItem(revisionKey)
  const revisionDone = lastRevision && (Date.now() - Number(lastRevision)) < 24 * 60 * 60 * 1000
  if (!revisionDone) {
    return <>{overlay}<GpuNotice /><SessionRevision user={session.user} onComplete={() => { localStorage.setItem(revisionKey, String(Date.now())); setSession({ ...session }) }} /></>
  }

  return <>{overlay}<GpuNotice /><ScreenLeaveNotice />
          <PolicyNotice studentId={session.user.id} /><Portal user={session.user} onLogout={handleLogout} /></>
}

export default App
