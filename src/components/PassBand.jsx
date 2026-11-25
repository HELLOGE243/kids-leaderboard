import { useEffect, useRef, useState } from 'react'
import SpriteAnimation from './SpriteAnimation.jsx'
import {
  pickCelebration, pickPassWord, runLength, bandTier, STREAK_WORDS, PASS_WORDS,
} from '../data/celebrations.js'

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
 * @param {number} [streak] right answers in a row; drives the colour
 * @param {() => void} [onDone]
 */
function PassBand({ nonce, streak = 0, onDone }) {
  const lastWord = useRef(null)
  const lastSheet = useRef(null)
  const [shown, setShown] = useState(null)
  const doneCb = useRef(onDone)
  // Held in a ref for the same reason as onDone: the band replays on the
  // nonce alone, and depending on the streak would restart the animation
  // every time it moved. Written in an effect that runs before the one
  // below, so the tier is the one the answer arrived with.
  const streakRef = useRef(streak)

  useEffect(() => { doneCb.current = onDone; streakRef.current = streak })

  useEffect(() => {
    if (nonce == null) return undefined
    // Read here rather than taken as a rendered prop, so the tier is the one
    // that belonged to the answer that fired the band.
    const tier = bandTier(streakRef.current)
    const word = pickPassWord(lastWord.current, Math.random,
      tier === 'prism' ? STREAK_WORDS : PASS_WORDS)
    const sheet = pickCelebration('pass', lastSheet.current)
    lastWord.current = word
    lastSheet.current = sheet?.id || null
    setShown({ word, sheet, tier, key: nonce })
    // The band's own animation runs 1.6s; a sprite may run longer, and
    // whichever is longer decides when the screen is handed back.
    const ms = Math.max(1600, sheet ? runLength(sheet) + 250 : 0)
    const t = setTimeout(() => { setShown(null); doneCb.current?.() }, ms)
    return () => clearTimeout(t)
  }, [nonce])

  if (!shown) return null

  return (
    <div className={`td-pass-burst td-pass-${shown.tier}`} key={shown.key}>
      <div className="td-pass-strip">
        {/* Arcade arrows, only once the band has gone prismatic. Six of them
            rather than a repeating background, so each can carry its own
            delay and speed and the row does not read as one sliding image. */}
        {shown.tier === 'prism' && (
          <span className="td-pass-arrows" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={`td-pass-arrow td-pass-arrow-${i}`} />
            ))}
          </span>
        )}
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
