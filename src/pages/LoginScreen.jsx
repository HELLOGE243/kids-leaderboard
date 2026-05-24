import { useState } from 'react'
import { getTeacherByName, createTeacher, findStudentInOrgByName, getOrganisation } from '../data/store.js'

function LoginScreen({ onLogin }) {
  const [role, setRole] = useState(null)
  const [teacherName, setTeacherName] = useState('')
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
      setError('Organisation not found. Check your code.')
      return
    }

    const student = findStudentInOrgByName(code, name)
    if (!student) {
      setError('Nickname not found. Ask your teacher.')
      return
    }

    setError('')
    onLogin({ role: 'student', user: student })
  }

  // Role selection
  if (!role) {
    return (
      <div className="page-center">
        <h1 className="pixel-title">Kids Leaderboard</h1>
        <p className="pixel-subtitle">Who are you?</p>
        <div className="role-row">
          <button className="role-btn" onClick={() => setRole('student')}>
            Student
          </button>
          <button className="role-btn role-btn-alt" onClick={() => setRole('teacher')}>
            Teacher
          </button>
        </div>
      </div>
    )
  }

  // Teacher login
  if (role === 'teacher') {
    return (
      <div className="page-center">
        <h1 className="pixel-title">Teacher Login</h1>
        <p className="pixel-subtitle">Enter your nickname</p>
        <form onSubmit={handleTeacherLogin} className="form-stack">
          <input
            type="text"
            value={teacherName}
            onChange={(e) => setTeacherName(e.target.value)}
            placeholder="Teacher nickname"
            className="input input-center"
            autoFocus
          />
          <button type="submit" className="btn">Let's Go!</button>
          <button type="button" className="btn btn-outline" onClick={() => setRole(null)}>
            Back
          </button>
        </form>
      </div>
    )
  }

  // Student login
  return (
    <div className="page-center">
      <h1 className="pixel-title">Student Login</h1>
      <p className="pixel-subtitle">Enter your details</p>
      <form onSubmit={handleStudentLogin} className="form-stack">
        <input
          type="text"
          value={studentNickname}
          onChange={(e) => { setStudentNickname(e.target.value); setError('') }}
          placeholder="Your nickname"
          className="input input-center"
          autoFocus
        />
        <input
          type="text"
          value={studentOrgCode}
          onChange={(e) => { setStudentOrgCode(e.target.value); setError('') }}
          placeholder="Organisation code"
          className="input input-center"
        />
        {error && <p className="error-text text-center">{error}</p>}
        <button type="submit" className="btn">Let's Go!</button>
        <button type="button" className="btn btn-outline" onClick={() => setRole(null)}>
          Back
        </button>
      </form>
    </div>
  )
}

export default LoginScreen
