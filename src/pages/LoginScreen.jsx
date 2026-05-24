import { useState } from 'react'

function LoginScreen({ onLogin }) {
  const [nickname, setNickname] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = nickname.trim()
    if (!trimmed) return
    onLogin({ name: trimmed, coins: 120, rewardPoints: 450 })
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Welcome to the Leaderboard!</h1>
      <p style={styles.subtitle}>Enter your nickname to get started</p>

      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Student or Teacher nickname"
          style={styles.input}
          autoFocus
        />
        <button type="submit" style={styles.button}>
          Let's Go!
        </button>
      </form>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px',
  },
  title: {
    color: '#fff',
    fontSize: '2.4rem',
    marginBottom: '8px',
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: '1.1rem',
    marginBottom: '32px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    width: '100%',
    maxWidth: '360px',
  },
  input: {
    padding: '16px 20px',
    fontSize: '1.2rem',
    borderRadius: '12px',
    border: 'none',
    outline: 'none',
    textAlign: 'center',
  },
  button: {
    padding: '16px',
    fontSize: '1.2rem',
    fontWeight: 'bold',
    borderRadius: '12px',
    border: 'none',
    background: '#f6d365',
    color: '#333',
    cursor: 'pointer',
  },
}

export default LoginScreen
