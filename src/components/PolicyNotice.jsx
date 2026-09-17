import { useEffect, useRef, useState } from 'react'
import { policyNeedsAcceptance, acceptPolicy } from '../data/store.js'
import { isStudentDataReady, onDataChange } from '../data/firebase.js'

// Shown after a student signs in, and again whenever the school changes the
// terms, until it is ticked. It cannot be dismissed by clicking away: the point
// is that families have actually seen the refund and credit rules.

export default function PolicyNotice({ studentId, onDone }) {
  const [policy, setPolicy] = useState(null)
  const [checked, setChecked] = useState(false)
  const [readToEnd, setReadToEnd] = useState(false)
  const bodyRef = useRef(null)

  // Wait for this student's own document: their acceptance is recorded there,
  // and asking before it loads would prompt someone who has already agreed.
  useEffect(() => {
    const check = () => {
      if (!isStudentDataReady(studentId)) return
      setPolicy(policyNeedsAcceptance(studentId))
    }
    check()
    return onDataChange(check)
  }, [studentId])

  // Only ask them to tick once the text has actually been scrolled through
  // (short policies count as read straight away).
  useEffect(() => {
    const el = bodyRef.current
    if (!el || !policy) return
    const check = () => {
      if (el.scrollHeight - el.clientHeight < 24 || el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReadToEnd(true)
    }
    check()
    el.addEventListener('scroll', check)
    return () => el.removeEventListener('scroll', check)
  }, [policy])

  if (!policy) return null

  function accept() {
    acceptPolicy(studentId, policy.version)
    setPolicy(null)
    onDone?.()
  }

  return (
    <div className="pn-overlay" role="dialog" aria-modal="true" aria-labelledby="pn-title">
      <div className="pn-card">
        <h2 className="pn-title" id="pn-title">{policy.title || 'Refunds and credits'}</h2>
        <p className="pn-sub">Please read this before you start. Your parent or guardian should read it too.</p>
        <div className="pn-body" ref={bodyRef} tabIndex={0}>
          {policy.body.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para.split('\n').map((line, j) => <span key={j}>{line}<br /></span>)}</p>
          ))}
        </div>
        {!readToEnd && <p className="pn-hint">Scroll to the end to continue.</p>}
        <label className={`pn-check${readToEnd ? '' : ' is-disabled'}`}>
          <input type="checkbox" checked={checked} disabled={!readToEnd} onChange={(e) => setChecked(e.target.checked)} />
          <span>I have read and understood the refund and credit policy.</span>
        </label>
        <button className="pn-btn" disabled={!checked} onClick={accept}>Continue</button>
      </div>
    </div>
  )
}
