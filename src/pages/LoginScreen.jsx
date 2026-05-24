import { useState } from 'react'
import { getTeacherByName, createTeacher, findStudentInOrgByName, getOrganisation } from '../data/store.js'

function LoginScreen({ onLogin }) {
  const [role, setRole] = useState(null)

  // Teacher state
  const [teacherName, setTeacherName] = useState('')

  // Student state
  const [studentNickname, setStudentNickname] = useState('')
  const [studentOrgCode, setStudentOrgCode] = useState('')
  const [error, setError] = useState('')

  function handleTeacherLogin(e) {
    e.preventDefault()
    const trimmed = teacherName.trim()
    if (!trimmed) return
    let teacher = getTeacherByName(trimmed)
    if (!teacher) teacher = createTeacher(trimmed)
    onLogin({ role: 'teacher', user: teacher })
  }

  function handleStudentLogin(e) {
    e.preventDefault()
    const name = studentNickname.trim()
    const code = studentOrgCode.trim()
    if (!name || !code) return

    const org = getOrganisation(code)
    if (!org) {
      setError('Organisation not found. Check the code your teacher gave you.')
      return
    }

    const student = findStudentInOrgByName(code, name)
    if (!student) {
      setError('No student with that nickname in this organisation. Ask your teacher.')
      return
    }

    setError('')
    onLogin({ role: 'student', user: student })
  }

  // Role selection
  if (!role) {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>Kids Leaderboard</h1>
        <p style={styles.subtitle}>Who are you?</p>
        <div style={styles.roleRow}>
          <button onClick={() => setRole('student')} style={styles.roleBtn}>
            I'm a Student
          </button>
          <button onClick={() => setRole('teacher')} style={{ ...styles.roleBtn, background: '#a29bfe' }}>
            I'm a Teacher
          </button>
        </div>
      </div>
    )
  }

  // Teacher login
  if (role === 'teacher') {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>Teacher Login</h1>
        <p style={styles.subtitle}>Enter your nickname</p>
        <form onSubmit={handleTeacherLogin} style={styles.form}>
          <input
            type="text"
            value={teacherName}
            onChange={(e) => setTeacherName(e.target.value)}
            placeholder="Teacher nickname"
            style={styles.input}
            autoFocus
          />
          <button type="submit" style={styles.button}>Let's Go!</button>
          <button type="button" onClick={() => setRole(null)} style={styles.backBtn}>Back</button>
        </form>
      </div>
    )
  }

  // Student login — nickname + org code
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Student Login</h1>
      <p style={styles.subtitle}>Enter the details your teacher gave you</p>
      <form onSubmit={handleStudentLogin} style={styles.form}>
        <input
          type="text"
          value={studentNickname}
          onChange={(e) => { setStudentNickname(e.target.value); setError('') }}
          placeholder="Your nickname"
          style={styles.input}
          autoFocus
        />
        <input
          type="text"
          value={studentOrgCode}
          onChange={(e) => { setStudentOrgCode(e.target.value); setError('') }}
          placeholder="Organisation code"
          style={styles.input}
        />
        {error && <p style={styles.error}>{error}</p>}
        <button type="submit" style={styles.button}>Let's Go!</button>
        <button type="button" onClick={() => setRole(null)} style={styles.backBtn}>Back</button>
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
  roleRow: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  roleBtn: {
    padding: '24px 40px',
    fontSize: '1.3rem',
    fontWeight: 'bold',
    borderRadius: '14px',
    border: 'none',
    background: '#f6d365',
    color: '#333',
    cursor: 'pointer',
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
  backBtn: {
    padding: '12px',
    fontSize: '1rem',
    borderRadius: '10px',
    border: '2px solid rgba(255,255,255,0.5)',
    background: 'transparent',
    color: '#fff',
    cursor: 'pointer',
  },
  error: {
    color: '#ff7675',
    fontSize: '0.95rem',
    textAlign: 'center',
  },
}

export default LoginScreen
