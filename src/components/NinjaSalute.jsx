import { useId } from 'react'

/**
 * The ninja who lands on the Training Dojo's completion screen, gets up, and
 * shines his sword.
 *
 * Inline SVG driven by CSS keyframes, rather than a GIF, a sprite sheet or
 * Lottie. The reasons, in order of how much they mattered:
 *
 *  - A ninja is a silhouette. The one character that is genuinely easy to draw
 *    convincingly in flat vector is the one that is meant to be a dark shape,
 *    so the hardest part of doing this without an illustrator disappears.
 *  - It is about 4 KB in the bundle and loads nothing. Lottie would add a
 *    runtime of roughly 250 KB plus a JSON file somebody has to author in
 *    After Effects, for one screen.
 *  - It stays sharp at any size and takes its colours from the theme, which a
 *    raster sprite cannot.
 *  - Every part is addressable, so the landing, the draw and the shine are
 *    separate animations that can be retimed one at a time.
 *
 * The timeline, once, not looping - a celebration that repeats becomes
 * wallpaper. Percentages are of one run, so --ninja-run retimes all of it:
 *   0-30%    falls in from above, tilted, accelerating
 *   30-44%   lands: squash, dust ring, the shadow spreads
 *   44-56%   settles to standing
 *   56-87%   draws the sword across on an arc
 *   82-97%   a glint sweeps the blade, then a spark pops at the tip
 * Afterwards the scarf keeps moving, so the pose is not a freeze-frame.
 *
 * Anyone who has asked their system not to animate gets the final pose with
 * nothing moving. That is handled in CSS, not here, so there is no second
 * code path to keep in step.
 */
function NinjaSalute({ className = '' }) {
  // Two ninjas on one page would otherwise share gradient and clip ids, and
  // the second would silently take the first one's definitions.
  const uid = useId().replace(/:/g, '')
  const blade = `ninja-blade-${uid}`
  const glint = `ninja-glint-${uid}`
  const clip = `ninja-clip-${uid}`

  // The viewBox is padded on every side rather than being 0 0 160 160: the
  // spark at the sword's tip reaches x=165, and on a tight box it lost half a
  // point. Kept square so the 160px the CSS gives it does not squash anything.
  return (
    <svg
      className={`ninja ${className}`}
      viewBox="-8 -8 176 176"
      role="img"
      aria-label="A ninja lands and shines his sword"
    >
      <defs>
        <linearGradient id={blade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e9e6f5" />
          <stop offset="55%" stopColor="#c9c4de" />
          <stop offset="100%" stopColor="#9b94bd" />
        </linearGradient>
        {/* The glint is a soft band on a small rectangle that slides across the
            blade, clipped to it. The obvious alternative - a gradient on a copy
            of the blade, translated - does not work: an objectBoundingBox
            gradient travels with the shape it fills, so the band stays in the
            middle of the copy and the copy just slides off the sword. */}
        <linearGradient id={glint} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clip}>
          <path d="M128 67 h23 q4 3 0 6 h-23 z" />
        </clipPath>
      </defs>

      {/* The ground he lands on, and the dust it throws up. */}
      <ellipse className="ninja-shadow" cx="80" cy="140" rx="30" ry="6" />
      <g className="ninja-dust">
        <ellipse cx="80" cy="140" rx="18" ry="5" />
        <circle cx="54" cy="136" r="3.4" />
        <circle cx="106" cy="137" r="3" />
        <circle cx="62" cy="128" r="2.2" />
        <circle cx="99" cy="129" r="2.6" />
      </g>

      <g className="ninja-body">
        {/* The scarf is behind the body and keeps moving after the landing, so
            the finished pose still reads as alive rather than as a still. */}
        <path className="ninja-scarf" d="M92 54 q22 -4 30 10 q-14 -4 -22 2 q-6 4 -10 -2 z" />

        <path className="ninja-leg" d="M68 104 l-6 30 h11 l5 -30 z" />
        <path className="ninja-leg ninja-leg-back" d="M86 104 l10 28 h-11 l-8 -28 z" />

        {/* Torso and hood in one shape: a ninja has no visible neck. */}
        <path
          className="ninja-torso"
          d="M80 36 q16 0 16 15 q0 7 -4 11 q12 6 12 20 v22 q0 5 -5 5 h-38 q-5 0 -5 -5 v-22 q0 -14 12 -20 q-4 -4 -4 -11 q0 -15 16 -15 z"
        />
        {/* The eye band, the one piece of a ninja that is not the silhouette. */}
        <rect className="ninja-band" x="66" y="45" width="28" height="7" rx="3.5" />
        <circle className="ninja-eye" cx="74" cy="48.5" r="1.9" />
        <circle className="ninja-eye" cx="86" cy="48.5" r="1.9" />

        {/* Arm, sword, glint and spark all turn together about the shoulder, so
            the glint stays on the blade and the spark stays on the tip
            whatever angle the sword is held at. */}
        <g className="ninja-arm">
          <path className="ninja-limb" d="M96 76 q13 2 19 -6 l5 6 q-8 12 -24 8 z" />
          {/* The sword ends at x=155, inside the 160-wide viewBox. A blade that
              overran the box looked right until it met a container that clips,
              and then lost its tip. */}
          <rect className="ninja-grip" x="112" y="68" width="13" height="5" rx="2.5" />
          <rect className="ninja-guard" x="124" y="63" width="4" height="15" rx="1.5" />
          <path className="ninja-blade" d={'M128 67 h23 q4 3 0 6 h-23 z'} fill={`url(#${blade})`} />
          <g clipPath={`url(#${clip})`}>
            <rect className="ninja-glint" x="120" y="60" width="13" height="20" fill={`url(#${glint})`} />
          </g>
          {/* Two stars, not one. The completion card is white, so a white
              spark - the obvious colour for a glint - is invisible on it. The
              pale outer star reads as the glow and the purple core reads as
              the spark, and both survive on a light background. */}
          <g className="ninja-spark">
            <path className="ninja-spark-glow" d="M0 -11 L2.9 -2.9 L11 0 L2.9 2.9 L0 11 L-2.9 2.9 L-11 0 L-2.9 -2.9 Z" />
            <path className="ninja-spark-core" d="M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6 Z" />
          </g>
        </g>

        <path className="ninja-limb" d="M64 76 q-14 4 -16 16 l-6 -2 q3 -16 20 -20 z" />
      </g>
    </svg>
  )
}

export default NinjaSalute
