import { useState } from 'react'
import LoginScreen from './pages/LoginScreen.jsx'
import Portal from './pages/Portal.jsx'
import TeacherDashboard from './pages/TeacherDashboard.jsx'

const SESSION_KEY = 'leaderboard_session'

function loadSession() {
  const raw = localStorage.getItem(SESSION_KEY)
  if (raw) return JSON.parse(raw)
  return null
}

function App() {
  const [session, setSession] = useState(loadSession)

  function handleLogin(s) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    setSession(s)
  }

  function handleLogout() {
    localStorage.removeItem(SESSION_KEY)
    setSession(null)
  }

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />
  }

  if (session.role === 'teacher') {
    return <TeacherDashboard teacher={session.user} onLogout={handleLogout} />
  }

  return <Portal user={session.user} onLogout={handleLogout} />
}

export default App
