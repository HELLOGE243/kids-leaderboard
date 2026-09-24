import { useState, useEffect, useRef } from 'react'
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

/**
 * Start-up loader. The bar creeps while the app loads; once it is ready the bar
 * runs from wherever it had reached to 100%, holds there for a beat, then the
 * whole screen fades away - rather than vanishing mid-progress.
 *
 * Matches the markup in index.html, and the negative delay resumes that bar
 * where it had got to instead of restarting from empty.
 */
function BootLoader({ done, onHidden }) {
  const fillRef = useRef(null)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (!done) return
    const el = fillRef.current
    const timers = []
    if (el) {
      // Freeze at the width the animation had reached, then glide to 100%.
      const pct = (el.getBoundingClientRect().width / (el.parentElement?.getBoundingClientRect().width || 1)) * 100
      el.style.animation = 'none'
      el.style.width = `${Math.max(0, Math.min(100, pct))}%`
      void el.offsetWidth
      el.style.transition = 'width .45s cubic-bezier(.2, .8, .2, 1)'
      el.style.width = '100%'
    }
    // Full bar for a beat, then fade the screen out.
    timers.push(setTimeout(() => setLeaving(true), 900))
    timers.push(setTimeout(() => onHidden(), 1450))
    return () => timers.forEach(clearTimeout)
  }, [done, onHidden])

  return (
    <div className={`boot-loader${leaving ? ' is-leaving' : ''}`} role="status" aria-label="Loading">
      <div className="boot-logo"><img src="/avant-logo.png" alt="AVANT OC & Selective" /></div>
      <h1 className="boot-title">CleverSpace EduPortal</h1>
      <div className="boot-bar">
        <div className="boot-bar-fill" ref={fillRef} style={{ animationDelay: `-${Math.round(performance.now())}ms` }} />
      </div>
      <div className="boot-text">{done ? 'Ready' : 'Loading'}</div>
    </div>
  )
}

function App() {
  const [session, setSession] = useState(loadSession)
  const [dbReady, setDbReady] = useState(false)
  // The loader stays up a moment after loading finishes, to fill and fade out.
  const [bootHidden, setBootHidden] = useState(false)
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

  /* ---- Tab-focus / copy prevention (students only) ----
     These guard exam conditions: a student must stay on the quiz tab and must
     not copy the questions out. A teacher has every right to switch windows and
     to copy text while building quizzes, so none of it applies to them. */
  const isStudent = session?.role === 'student'
  useEffect(() => {
    if (!isStudent) { setTabBlurred(false); return undefined }
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
  }, [isStudent])

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

  /* ---- "Stay on this tab" overlay: students only ---- */
  const overlay = isStudent ? (
    <div className={`tab-blur-overlay${tabBlurred ? ' active' : ''}`}>
      <div className="tab-blur-overlay-title">Come back! 👀</div>
      <div className="tab-blur-overlay-subtitle">This tab must stay active</div>
    </div>
  ) : null

  if (!session) {
    return <>{overlay}<LoginScreen onLogin={handleLogin} /></>
  }

  if (!bootHidden) {
    return (
      <>
        {overlay}
        <BootLoader done={dbReady} onHidden={() => setBootHidden(true)} />
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
