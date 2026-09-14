import { useState } from 'react'
import { detectGraphicsAcceleration, isChromiumBrowser } from '../utils/graphics.js'

const CHROME_URL = 'https://www.google.com/chrome/'

/**
 * Shown whenever the browser is painting on the CPU instead of the GPU.
 * Rendering is many times slower in that mode, which is what makes the site
 * feel laggy even though the build is identical everywhere.
 *
 * Deliberately not suppressible: it reappears on every sign-in and every
 * reload until acceleration is actually switched on, because until then the
 * student is using a degraded version of the app.
 */
export default function GpuNotice() {
  // Detection is synchronous and cannot change for the life of the page.
  const [dismissed, setDismissed] = useState(false)
  const { accelerated, renderer } = detectGraphicsAcceleration()

  if (accelerated || dismissed) return null

  const chromium = isChromiumBrowser()

  return (
    <div className="neon-overlay" style={{ zIndex: 9999 }}>
      <div className="neon-popup gpu-notice">
        <div className="gpu-notice-icon">⚡</div>

        <p className="gpu-notice-title">
          {chromium ? 'Turn on graphics acceleration' : 'Your browser is running slowly'}
        </p>

        <p className="gpu-notice-body">
          This device is drawing the site with its processor instead of its graphics
          card, which makes everything feel slow and laggy.
          {chromium
            ? ' Switching it on takes about 20 seconds and makes a big difference.'
            : ' For the best experience we recommend using Google Chrome.'}
        </p>

        {chromium ? (
          <ol className="gpu-notice-steps">
            <li>
              Copy this into your address bar:
              <code className="gpu-notice-code">chrome://settings/system</code>
            </li>
            <li>Turn on <strong>“Use graphics acceleration when available”</strong></li>
            <li>Click <strong>Relaunch</strong>, then sign back in</li>
          </ol>
        ) : (
          <>
            <ol className="gpu-notice-steps">
              <li>
                Install Google Chrome, then open CleverSpace in it:
                <a
                  className="gpu-notice-link"
                  href={CHROME_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download Chrome
                </a>
              </li>
              <li>
                Or, in your current browser, look in Settings for
                {' '}<strong>“hardware acceleration”</strong> and turn it on
              </li>
              <li>Restart the browser, then sign back in</li>
            </ol>
          </>
        )}

        {renderer && renderer !== 'none' && renderer !== 'unknown' && (
          <p className="gpu-notice-detail">Currently rendering with: {renderer}</p>
        )}

        <div className="neon-popup-actions gpu-notice-actions">
          <button className="btn" onClick={() => setDismissed(true)}>
            Continue anyway
          </button>
        </div>

        <p className="gpu-notice-footnote">
          This message will keep appearing until acceleration is switched on.
        </p>
      </div>
    </div>
  )
}
