/**
 * The writing coach, until there is a drawing of them.
 *
 * Drawn here rather than left as a coloured disc, because a character a child
 * is meant to warm to cannot be a placeholder for long - and because the three
 * expressions are what the screen uses to show that it is listening, thinking
 * or pleased. Drop coach-idle.png, coach-thinking.png and coach-cheering.png
 * into /public and the painted art takes over; this stays as the fallback.
 *
 * @param {object} props
 * @param {'idle'|'thinking'|'pleased'} [props.mood]
 * @param {number} [props.size]
 */
function CoachFace({ mood = 'idle', size = 64 }) {
  const skin = mood === 'pleased' ? '#66bb6a' : '#42a5f5'
  const dark = mood === 'pleased' ? '#2e7d32' : '#1565c0'

  return (
    <svg
      className={`coach-face coach-face-${mood}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={mood === 'thinking' ? 'Your coach is thinking' : 'Your writing coach'}
    >
      <defs>
        <linearGradient id="coachSkin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={skin} />
          <stop offset="100%" stopColor={dark} />
        </linearGradient>
      </defs>

      <circle cx="32" cy="32" r="30" fill="url(#coachSkin)" />

      {/* A scholar's cap, so the character reads as a reader. */}
      <path d="M12 22 L32 13 L52 22 L32 31 Z" fill="#102a43" />
      <path d="M44 26 v8 a12 6 0 0 1 -24 0 v-8" fill="#17395e" />
      <circle cx="52" cy="22" r="2" fill="#ffd54f" />
      <path d="M52 22 v7" stroke="#ffd54f" strokeWidth="1.6" strokeLinecap="round" />

      {/* Eyes: open, or looking up and away while thinking. */}
      {mood === 'thinking' ? (
        <>
          <circle cx="25" cy="39" r="3.4" fill="#fff" />
          <circle cx="39" cy="39" r="3.4" fill="#fff" />
          <circle cx="26.4" cy="37.6" r="1.7" fill="#102a43" />
          <circle cx="40.4" cy="37.6" r="1.7" fill="#102a43" />
        </>
      ) : (
        <>
          <circle cx="25" cy="40" r="3.4" fill="#fff" />
          <circle cx="39" cy="40" r="3.4" fill="#fff" />
          <circle cx="25" cy="40.4" r="1.8" fill="#102a43" />
          <circle cx="39" cy="40.4" r="1.8" fill="#102a43" />
        </>
      )}

      {/* Mouth: a small smile, a wide one when pleased, a line when thinking. */}
      {mood === 'thinking' ? (
        <path d="M27 49 h10" stroke="#102a43" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      ) : (
        <path
          d={mood === 'pleased' ? 'M24 47 q8 9 16 0' : 'M26 48 q6 5 12 0'}
          stroke="#102a43"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />
      )}

      {mood === 'thinking' && (
        <g className="coach-face-dots" fill="#fff">
          <circle cx="52" cy="46" r="2" opacity="0.9" />
          <circle cx="57" cy="42" r="1.4" opacity="0.7" />
        </g>
      )}
    </svg>
  )
}

export default CoachFace
