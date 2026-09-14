// Detects whether Chrome (or any browser) is compositing on the GPU.
//
// When "Use graphics acceleration when available" is turned off, Chrome falls
// back to a software rasteriser (SwiftShader) for WebGL and paints everything
// on the CPU. The app leans on blur, backdrop-filter, shadows and CSS
// animations, all of which get dramatically slower in that mode - which is
// what makes the site feel laggy while the same build is smooth elsewhere.
//
// The WebGL renderer string is the reliable tell: software fallbacks report
// SwiftShader / llvmpipe / "software" rather than a real GPU.

const SOFTWARE_RENDERERS = ['swiftshader', 'llvmpipe', 'software', 'microsoft basic render']

let _cached = null

/**
 * @returns {{ accelerated: boolean, renderer: string, reason: string }}
 *   accelerated - false only when we are confident the GPU is not in use.
 *   Detection is deliberately conservative: anything ambiguous counts as
 *   accelerated so we never nag a user whose setup is fine.
 */
export function detectGraphicsAcceleration() {
  if (_cached) return _cached

  let result

  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')

    if (!gl) {
      // No WebGL at all - usually means acceleration is disabled or blocked.
      result = { accelerated: false, renderer: 'none', reason: 'no-webgl-context' }
    } else {
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      const renderer = String(
        (ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || ''
      )
      const lower = renderer.toLowerCase()
      const isSoftware = SOFTWARE_RENDERERS.some((s) => lower.includes(s))
      result = {
        accelerated: !isSoftware,
        renderer: renderer || 'unknown',
        reason: isSoftware ? 'software-renderer' : 'gpu-renderer',
      }
      const lose = gl.getExtension('WEBGL_lose_context')
      if (lose) lose.loseContext()
    }
  } catch {
    // Detection itself failed - assume fine rather than show a false warning.
    result = { accelerated: true, renderer: 'unknown', reason: 'detection-failed' }
  }

  _cached = result
  return result
}

/** True only for Chrome/Edge, where we can give exact settings instructions. */
export function isChromiumBrowser() {
  const ua = navigator.userAgent
  return /Chrome|Chromium|Edg/.test(ua) && !/OPR|Firefox/.test(ua)
}
