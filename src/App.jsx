import { useState } from 'react'
import LoginScreen from './pages/LoginScreen.jsx'
import Portal from './pages/Portal.jsx'

function App() {
  const [user, setUser] = useState(null)

  if (!user) {
    return <LoginScreen onLogin={setUser} />
  }

  return <Portal user={user} onLogout={() => setUser(null)} />
}

export default App
