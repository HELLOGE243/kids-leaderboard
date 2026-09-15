import { useEffect, useState } from 'react'
import { onScreenNotice, MAX_SCREEN_LEAVES } from '../utils/screenGuard.js'

// Popup for quiz screen-leave warnings and lockouts (see utils/screenGuard.js).
function ScreenLeaveNotice() {
  const [notice, setNotice] = useState(null)
  useEffect(() => onScreenNotice(setNotice), [])
  if (!notice) return null

  const locked = notice.type === 'lockout'
  return (
    <div className="neon-overlay" style={{ zIndex: 100000 }}>
      <div className="neon-popup" style={{ maxWidth: 440, padding: '32px 28px', textAlign: 'center' }}>
        <p className="pixel-heading" style={{ color: locked ? 'var(--danger)' : 'var(--warning)', marginBottom: 12 }}>
          {locked ? 'Quiz submitted' : `Warning ${notice.count} of ${MAX_SCREEN_LEAVES - 1}`}
        </p>
        <p className="neon-popup-text" style={{ fontSize: '1rem', marginBottom: 20 }}>
          {locked
            ? `You left the quiz screen ${notice.count} times, so your quiz was submitted automatically with the answers you had. Your teacher can see this.`
            : `You left the quiz screen. Keep this screen open until you finish. ${notice.remaining === 1 ? 'Next time' : `After ${notice.remaining} more times`}, your quiz will be submitted automatically.`}
        </p>
        <div className="neon-popup-actions">
          <button className="btn" autoFocus onClick={() => setNotice(null)}>{locked ? 'OK' : 'Back to quiz'}</button>
        </div>
      </div>
    </div>
  )
}

export default ScreenLeaveNotice
