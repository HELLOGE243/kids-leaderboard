import { useState, useRef, useMemo } from 'react'
import SYDNEY_SCHOOLS from '../data/sydneySchools.js'
import { lookupUser, loginUser, resetPassword, signupUser } from '../data/auth.js'

// Password field with an eye button to show or hide what was typed.
function PasswordInput(props) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="pw-field">
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <line x1="3" y1="3" x2="21" y2="21" />}
        </svg>
      </button>
    </div>
  )
}

function LoginScreen({ onLogin }) {
  const [role, setRole] = useState(null)
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [pendingUser, setPendingUser] = useState(null)
  const [step, setStep] = useState('nickname')
  const [showNewUserPopup, setShowNewUserPopup] = useState(false)
  const [yearGroup, setYearGroup] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [schoolSearch, setSchoolSearch] = useState('')
  const [showSchoolDropdown, setShowSchoolDropdown] = useState(false)
  const [parentPhone, setParentPhone] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const nicknameRef = useRef(null)
  const schoolRef = useRef(null)
  // Label shown on the submit button while a server call is in flight.
  const [busy, setBusy] = useState('')
  // Runs fn with the busy label shown; returns its result, or null if a call is already running.
  async function withResult(label, fn) {
    if (busy) return null
    setBusy(label)
    try { return await fn() } finally {
      setBusy('')
      // The inert form dropped focus; put the cursor back (e.g. after "Wrong password").
      setTimeout(() => document.querySelector('form.form-stack input:not([type=hidden])')?.focus(), 0)
    }
  }
  // While busy the whole form is inert: no typing, clicking or re-submitting.
  const formBusyProps = busy ? { inert: true, 'aria-busy': true } : {}
  const submitLabel = (text) => busy ? <><span className="login-spinner" aria-hidden="true" />{busy}</> : text

  const filteredSchools = useMemo(() => {
    if (schoolSearch.length < 2) return []
    const q = schoolSearch.toLowerCase()
    return SYDNEY_SCHOOLS.filter(s => s.toLowerCase().includes(q)).slice(0, 8)
  }, [schoolSearch])

  const isTeacher = role === 'teacher'
  const label = isTeacher ? 'Teacher' : 'Student'

  async function handleNicknameSubmit(e) {
    e.preventDefault()
    const name = nickname.trim()
    if (!name) return

    // Ask the server whether the account exists and has a password set. The
    // browser is never told what the password is.
    const res = await withResult('Checking…', () => lookupUser(role, name))
    if (!res) return
    if (res.error === 'network') {
      setError('Could not reach the server. Check your connection.')
      return
    }
    if (!res.exists) {
      setShowNewUserPopup(true)
      return
    }

    setError('')
    setPendingUser(res.user)
    setStep(res.hasPassword ? 'enter-password' : 'set-password')
  }

  function handleNewUserYes() {
    // Nothing is created yet: the account is made on the server in one step
    // when the password is set, once the user is past every form.
    setShowNewUserPopup(false)
    setPendingUser({ id: null, name: nickname.trim(), isNew: true })
    setStep(isTeacher ? 'set-password' : 'profile')
  }

  function handleNewUserNo() {
    setShowNewUserPopup(false)
    setTimeout(() => nicknameRef.current?.focus(), 0)
  }

  const [pendingApproval, setPendingApproval] = useState(false)

  function formatAusPhone(raw) {
    let digits = raw.replace(/[^\d]/g, '')
    if (digits.startsWith('61')) digits = '0' + digits.slice(2)
    if (!digits.startsWith('0') && digits.length > 0) digits = '0' + digits
    digits = digits.slice(0, 10)
    if (digits.length <= 4) return digits
    if (digits.length <= 7) return digits.slice(0, 4) + ' ' + digits.slice(4)
    return digits.slice(0, 4) + ' ' + digits.slice(4, 7) + ' ' + digits.slice(7)
  }

  function handlePhoneChange(e) {
    const formatted = formatAusPhone(e.target.value)
    setParentPhone(formatted)
    setError('')
  }

  function handleProfileSubmit(e) {
    e.preventDefault()
    if (!firstName.trim()) { setError('Please enter your first name.'); return }
    if (!lastName.trim()) { setError('Please enter your last name.'); return }
    if (!yearGroup) { setError('Please select your year group.'); return }
    if (!schoolName.trim()) { setError('Please enter your school name.'); return }
    const phoneDigits = parentPhone.replace(/[^\d]/g, '')
    if (phoneDigits.length < 10) { setError("Please enter a valid phone number."); return }
    if (!parentEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail.trim())) { setError("Please enter a valid parent email."); return }
    // Duplicate phone/email is checked by the server at sign-up, so the browser
    // never needs other students' contact details.
    setError('')
    setStep('set-password')
  }

  async function handleSetPassword(e) {
    e.preventDefault()
    if (!password.trim()) { setError('Enter a password.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }

    if (pendingUser?.isNew) {
      const profile = isTeacher ? null : {
        firstName: firstName.trim(), lastName: lastName.trim(), yearGroup,
        schoolName: schoolName.trim(), parentPhone: parentPhone.trim(), parentEmail: parentEmail.trim(),
      }
      const res = await withResult('Creating account…', () => signupUser(role, pendingUser.name, password, profile))
      if (!res) return
      if (!res.ok) {
        const msg = res.error === 'network' ? 'Could not reach the server.' : (res.error || 'Could not create account.')
        setError(msg)
        // A duplicate phone/email is fixed on the profile form.
        if (/phone|email/i.test(msg) && !isTeacher) setStep('profile')
        return
      }
      setError('')
      setPassword('')
      setConfirmPassword('')
      // New students and teachers both wait for approval.
      setPendingApproval(true)
      return
    }

    // The server stores the hash and signs this browser in. Nothing about the
    // credential is kept client-side.
    const res = await withResult('Signing in…', () => loginUser(role, pendingUser.name, password))
    if (!res) return
    if (!res.ok) {
      setError(res.error === 'network' ? 'Could not reach the server.' : 'Could not set password.')
      return
    }
    const loggedIn = res.user ? { ...pendingUser, ...res.user } : pendingUser
    setError('')
    setPassword('')
    setConfirmPassword('')
    if (!isTeacher && loggedIn.approved === false) {
      setPendingApproval(true)
      return
    }
    onLogin({ role, user: loggedIn, isAdmin: !!res.isAdmin })
  }

  async function handleEnterPassword(e) {
    e.preventDefault()

    // Verified server-side; on success the browser is signed in with a
    // Firebase Auth custom token.
    const res = await withResult('Signing in…', () => loginUser(role, pendingUser.name, password))
    if (!res) return
    if (res.error === 'pending-approval') {
      setError('')
      setPassword('')
      setPendingApproval(true)
      return
    }
    if (!res.ok) {
      setError(res.error === 'network' ? 'Could not reach the server.' : 'Wrong password.')
      return
    }
    const loggedIn = res.user ? { ...pendingUser, ...res.user } : pendingUser
    setError('')
    setPassword('')
    if (!isTeacher && loggedIn.approved === false) {
      setPendingApproval(true)
      return
    }
    onLogin({ role, user: loggedIn, isAdmin: !!res.isAdmin })
  }

  function resetToNickname() {
    setStep('nickname')
    setPendingUser(null)
    setPassword('')
    setConfirmPassword('')
    setYearGroup('')
    setSchoolName('')
    setSchoolSearch('')
    setParentPhone('')
    setFirstName('')
    setLastName('')
    setParentEmail('')
    setForgotEmail('')
    setError('')
  }

  if (pendingApproval) {
    return (
      <div className="page-center landing-page">
        <img src="/avant-logo.png" alt="AVANT OC & Selective" className="landing-logo" />
        <h1 className="landing-heading">Account Pending</h1>
        <p className="landing-text" style={{ marginBottom: 16, maxWidth: 340, textAlign: 'center', lineHeight: 1.5 }}>
          {isTeacher ? 'Your teacher account is waiting for admin approval. Please check back later.' : 'Your account has been created and is waiting for teacher approval. Please check back later.'}
        </p>
        <button className="btn landing-btn" onClick={() => { setPendingApproval(false); setPendingUser(null); setStep('nickname'); setPassword(''); setConfirmPassword(''); setError(''); setRole(null) }}>Back</button>
      </div>
    )
  }

  // Role selection
  if (!role) {
    return (
      <div className="page-center landing-page">
        <img src="/avant-logo.png" alt="AVANT OC & Selective" className="landing-logo" />
        <h1 className="landing-title">Cleverspace EduPortal</h1>
        <div className="role-row" style={{ marginTop: 32 }}>
          <button className="role-btn" onClick={() => setRole('student')}>
            I am a Student
          </button>
          <button className="role-btn role-btn-alt" onClick={() => setRole('teacher')}>
            I am a Teacher
          </button>
        </div>
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <button className="google-login-btn" onClick={() => alert('Google login will be available when deployed.')}>
            <svg width="18" height="18" viewBox="0 0 48 48" style={{ marginRight: 10, flexShrink: 0 }}>
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.1 24.1 0 0 0 0 21.56l7.98-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }

  // Profile (new student only)
  if (step === 'profile' && pendingUser) {
    return (
      <div className="page-center landing-page">
        <img src="/avant-logo.png" alt="AVANT OC & Selective" className="landing-logo" />
        <h1 className="landing-heading">A bit about you, <span style={{ color: '#ffd700' }}>{pendingUser.name}</span></h1>
        <form onSubmit={handleProfileSubmit} {...formBusyProps} className="form-stack">
          <input
            type="text"
            value={firstName}
            onChange={(e) => { setFirstName(e.target.value); setError('') }}
            placeholder="First name"
            className="input input-center landing-input"
            autoFocus
          />
          <input
            type="text"
            value={lastName}
            onChange={(e) => { setLastName(e.target.value); setError('') }}
            placeholder="Last name"
            className="input input-center landing-input"
          />
          <select
            value={yearGroup}
            onChange={(e) => { setYearGroup(e.target.value); setError('') }}
            className="input input-center landing-input"
            style={{ appearance: 'auto' }}
          >
            <option value="">Select your year group</option>
            {['Year 3', 'Year 4', 'Year 5', 'Year 6', 'Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12'].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <div style={{ position: 'relative', width: '100%' }} ref={schoolRef}>
            <input
              type="text"
              value={schoolSearch}
              onChange={(e) => { setSchoolSearch(e.target.value); setSchoolName(e.target.value); setShowSchoolDropdown(true); setError('') }}
              onFocus={() => { if (schoolSearch.length >= 2) setShowSchoolDropdown(true) }}
              onBlur={() => setTimeout(() => setShowSchoolDropdown(false), 200)}
              placeholder="Search your school"
              className="input input-center landing-input"
              autoComplete="off"
            />
            {showSchoolDropdown && schoolSearch.length >= 2 && filteredSchools.length > 0 && (
              <div className="school-dropdown">
                {filteredSchools.map((s, i) => (
                  <div key={i} className="school-dropdown-item" onMouseDown={() => { setSchoolName(s); setSchoolSearch(s); setShowSchoolDropdown(false) }}>{s}</div>
                ))}
              </div>
            )}
          </div>
          <p className="landing-text" style={{ margin: '8px 0 0', fontSize: '0.75rem', opacity: 0.7 }}>Parent / Guardian Contact</p>
          <input
            type="tel"
            value={parentPhone}
            onChange={handlePhoneChange}
            placeholder="Parent's phone — 04XX XXX XXX"
            className="input input-center landing-input"
          />
          <input
            type="email"
            value={parentEmail}
            onChange={(e) => { setParentEmail(e.target.value); setError('') }}
            placeholder="Parent's email"
            className="input input-center landing-input"
          />
          {error && <p className="error-text text-center">{error}</p>}
          <button type="submit" className="btn landing-btn" disabled={!!busy}>{submitLabel("Next")}</button>
          <button type="button" className="btn btn-outline landing-btn" onClick={resetToNickname}>
            Back
          </button>
        </form>
      </div>
    )
  }

  // Set password (first time / new user)
  if (step === 'set-password' && pendingUser) {
    return (
      <div className="page-center landing-page">
        <img src="/avant-logo.png" alt="AVANT OC & Selective" className="landing-logo" />
        <h1 className="landing-heading">Welcome, <span style={{ color: '#ffd700' }}>{pendingUser.name}</span>!</h1>
        <p className="landing-text">Set a password for your account</p>
        <form onSubmit={handleSetPassword} {...formBusyProps} className="form-stack">
          <PasswordInput
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError('') }}
            placeholder="Create password"
            className="input input-center landing-input"
            autoFocus
          />
          <PasswordInput
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
            placeholder="Confirm password"
            className="input input-center landing-input"
          />
          {error && <p className="error-text text-center">{error}</p>}
          <button type="submit" className="btn landing-btn" disabled={!!busy}>{submitLabel("Set Password")}</button>
          <button type="button" className="btn btn-outline landing-btn" onClick={resetToNickname}>
            Back
          </button>
        </form>
      </div>
    )
  }

  // Enter password (returning user or admin)
  if (step === 'enter-password' && pendingUser) {
    return (
      <div className="page-center landing-page">
        <img src="/avant-logo.png" alt="AVANT OC & Selective" className="landing-logo" />
        <h1 className="landing-heading"><>Welcome, <span style={{ color: '#ffd700' }}>{pendingUser.name}</span>!</></h1>
        <p className="landing-text">Enter your password</p>
        <form onSubmit={handleEnterPassword} {...formBusyProps} className="form-stack">
          <PasswordInput
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError('') }}
            placeholder="Password"
            className="input input-center landing-input"
            autoFocus
          />
          {error && <p className="error-text text-center">{error}</p>}
          <button type="submit" className="btn landing-btn" disabled={!!busy}>{submitLabel("Let's Go!")}</button>
          {pendingUser && (
            <button type="button" className="landing-forgot-btn" onClick={() => { setError(''); setForgotEmail(''); setPassword(''); setStep('forgot-password') }}>
              Forgot password?
            </button>
          )}
          <button type="button" className="btn btn-outline landing-btn" onClick={resetToNickname}>
            Back
          </button>
        </form>
      </div>
    )
  }

  // Forgot password — verify parent email
  if (step === 'forgot-password' && pendingUser) {
    const handleForgotSubmit = (e) => {
      e.preventDefault()
      const entered = forgotEmail.trim()
      if (!entered) { setError('Please enter the parent email on file.'); return }
      // Verification happens on the server when the new password is submitted;
      // the email on file is never sent to the browser.
      setError('')
      setStep('reset-password')
    }
    return (
      <div className="page-center landing-page">
        <img src="/avant-logo.png" alt="AVANT OC & Selective" className="landing-logo" />
        <h1 className="landing-heading">Reset Password</h1>
        <p className="landing-text">Enter the parent email linked to <span style={{ color: '#ffd700' }}>{pendingUser.name}</span>'s account</p>
        <form onSubmit={handleForgotSubmit} {...formBusyProps} className="form-stack">
          <input
            type="email"
            value={forgotEmail}
            onChange={(e) => { setForgotEmail(e.target.value); setError('') }}
            placeholder="Parent's email"
            className="input input-center landing-input"
            autoFocus
          />
          {error && <p className="error-text text-center">{error}</p>}
          <button type="submit" className="btn landing-btn">Verify</button>
          <button type="button" className="btn btn-outline landing-btn" onClick={() => { setError(''); setStep('enter-password') }}>
            Back
          </button>
        </form>
      </div>
    )
  }

  // Reset password (after verification)
  if (step === 'reset-password' && pendingUser) {
    const handleResetSubmit = (e) => {
      e.preventDefault()
      if (!password.trim()) { setError('Enter a new password.'); return }
      if (password !== confirmPassword) { setError('Passwords do not match.'); return }
      withResult('Saving…', () => resetPassword(role, pendingUser.name, forgotEmail.trim(), password)).then((res) => {
        if (!res) return
        if (!res.ok) {
          setError(res.error === 'network' ? 'Could not reach the server.' : res.error)
          setStep('forgot-password')
          return
        }
        setError('')
        setPassword('')
        setConfirmPassword('')
        setForgotEmail('')
        setStep('enter-password')
      })
    }
    return (
      <div className="page-center landing-page">
        <img src="/avant-logo.png" alt="AVANT OC & Selective" className="landing-logo" />
        <h1 className="landing-heading">New Password</h1>
        <p className="landing-text">Set a new password for <span style={{ color: '#ffd700' }}>{pendingUser.name}</span></p>
        <form onSubmit={handleResetSubmit} {...formBusyProps} className="form-stack">
          <PasswordInput
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError('') }}
            placeholder="New password"
            className="input input-center landing-input"
            autoFocus
          />
          <PasswordInput
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setError('') }}
            placeholder="Confirm new password"
            className="input input-center landing-input"
          />
          {error && <p className="error-text text-center">{error}</p>}
          <button type="submit" className="btn landing-btn" disabled={!!busy}>{submitLabel("Reset Password")}</button>
          <button type="button" className="btn btn-outline landing-btn" onClick={() => { setError(''); setPassword(''); setConfirmPassword(''); setStep('forgot-password') }}>
            Back
          </button>
        </form>
      </div>
    )
  }

  // Nickname entry
  return (
    <div className="page-center landing-page">
      <img src="/avant-logo.png" alt="AVANT OC & Selective" className="landing-logo" />
      <h1 className="landing-heading">{label} Login</h1>
      <p className="landing-text">Enter your nickname</p>
      <form onSubmit={handleNicknameSubmit} {...formBusyProps} className="form-stack">
        <input
          ref={nicknameRef}
          type="text"
          value={nickname}
          onChange={(e) => { setNickname(e.target.value); setError('') }}
          placeholder="Your nickname"
          className="input input-center landing-input"
          autoFocus
        />
        {error && <p className="error-text text-center">{error}</p>}
        <button type="submit" className="btn landing-btn" disabled={!!busy}>{submitLabel("Let's Go!")}</button>
        <button type="button" className="btn btn-outline landing-btn" onClick={() => { setRole(null); setNickname(''); setError('') }}>
          Back
        </button>
      </form>

      {showNewUserPopup && (
        <div className="neon-overlay" onClick={handleNewUserNo}>
          <div className="neon-popup" onClick={e => e.stopPropagation()} onKeyDown={e => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault()
              const btns = e.currentTarget.querySelectorAll('button')
              const idx = [...btns].indexOf(document.activeElement)
              const next = e.key === 'ArrowRight' ? (idx + 1) % btns.length : (idx - 1 + btns.length) % btns.length
              btns[next]?.focus()
            }
          }}>
            <p className="neon-popup-text">Username not found.<br/>Are you a new user?</p>
            <div className="neon-popup-actions">
              <button className="btn" onClick={handleNewUserYes} autoFocus>Yes</button>
              <button className="btn btn-outline" onClick={handleNewUserNo}>No</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LoginScreen
