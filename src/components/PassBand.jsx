import { useEffect, useRef, useState } from 'react'
import SpriteAnimation from './SpriteAnimation.jsx'
import { pickCelebration, pickPassWord, runLength } from '../data/celebrations.js'

/**
 * The band that crosses the screen when a dojo question is got right.
 *
 * Built on the Daily Revision card's correct-answer band, deliberately: a
 * student already knows what that sweep means, and a second, different
 * celebration for the same event would be a new thing to learn rather than a
 * reward. The word changes, and a sprite may pop out over it, but the shape
 * is the one they know.
 *
 * What changes between showings - the word, and which animation plays - is
 * decided here rather than by the dojo, and never repeats what came last, so
 * the fifth one in a session still lands.
 *
 * @param {number} nonce changes on every correct answer; a new value replays
 * @param {() => void} [onDone]
 */
function PassBand({ nonce, onDone }) {
  const lastWord = useRef(null)
  const lastSheet = useRef(null)
  const [shown, setShown] = useState(null)
  const doneCb = useRef(onDone)

  useEffect(() => { doneCb.current = onDone })

  useEffect(() => {
    if (nonce == null) return undefined
    const word = pickPassWord(lastWord.current)
    const sheet = pickCelebration('pass', lastSheet.current)
    lastWord.current = word
    lastSheet.current = sheet?.id || null
    setShown({ word, sheet, key: nonce })
    // The band's own animation runs 1.6s; a sprite may run longer, and
    // whichever is longer decides when the screen is handed back.
    const ms = Math.max(1600, sheet ? runLength(sheet) + 250 : 0)
    const t = setTimeout(() => { setShown(null); doneCb.current?.() }, ms)
    return () => clearTimeout(t)
  }, [nonce])

  if (!shown) return null

  return (
    <div className="td-pass-burst" key={shown.key}>
      <div className="td-pass-strip">
        <span className="td-pass-shimmer" aria-hidden="true" />
        <span className="td-pass-text">{shown.word}</span>
      </div>
      {shown.sheet && (
        <SpriteAnimation sheet={shown.sheet} size={200} className="td-pass-sprite" />
      )}
    </div>
  )
}

export default PassBand
