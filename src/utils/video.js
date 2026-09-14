// Video links for question explanations.
//
// Used in two places: the CleverSpace JSON importer (to find a question's
// solution video and put it in the question's "Solution video" field), and the
// review screen (to embed it). Keeping one parser means anything the importer
// accepts is guaranteed to play.

const YOUTUBE = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([a-zA-Z0-9_-]{11})/
const YOUTUBE_ID_ONLY = /^[a-zA-Z0-9_-]{11}$/
const VIMEO = /vimeo\.com\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/|manage\/videos\/)?(\d+)(?:\/([a-f0-9]+))?/
const LOOM = /loom\.com\/(?:share|embed)\/([a-f0-9]{32})/
const DRIVE = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([a-zA-Z0-9_-]{20,})/
const DIRECT = /\.(mp4|webm|ogg|mov|m4v)(?:[?#].*)?$/i

/**
 * @param {string} raw a URL, an embed URL, or a bare 11-character YouTube id
 * @returns {null | { kind: 'youtube'|'vimeo'|'loom'|'drive'|'file'|'link', url: string, embedUrl?: string }}
 */
export function parseVideoUrl(raw) {
  const value = String(raw || '').trim()
  if (!value) return null

  if (YOUTUBE_ID_ONLY.test(value)) {
    return { kind: 'youtube', url: `https://www.youtube.com/watch?v=${value}`, embedUrl: `https://www.youtube.com/embed/${value}` }
  }

  let m = value.match(YOUTUBE)
  if (m) return { kind: 'youtube', url: `https://www.youtube.com/watch?v=${m[1]}`, embedUrl: `https://www.youtube.com/embed/${m[1]}` }

  m = value.match(VIMEO)
  if (m) {
    const hash = m[2] ? `?h=${m[2]}` : ''
    return { kind: 'vimeo', url: value, embedUrl: `https://player.vimeo.com/video/${m[1]}${hash}` }
  }

  m = value.match(LOOM)
  if (m) return { kind: 'loom', url: value, embedUrl: `https://www.loom.com/embed/${m[1]}` }

  m = value.match(DRIVE)
  if (m) return { kind: 'drive', url: value, embedUrl: `https://drive.google.com/file/d/${m[1]}/preview` }

  if (/^https?:\/\//i.test(value)) {
    if (DIRECT.test(value)) return { kind: 'file', url: value, embedUrl: value }
    // Unknown host: still usable as a link, just not embeddable.
    return { kind: 'link', url: value }
  }
  return null
}

/**
 * The solution video for a scraped CleverSpace question.
 *
 * Only CleverSpace's dedicated solution video field counts. Video links that
 * appear in the question or worked-solution text are deliberately left as
 * ordinary text there, not promoted to the explanation video.
 * @returns {string} a normalised URL, or '' when there is none
 */
export function pickSolutionVideo(q) {
  const direct = parseVideoUrl(q?.solutionVideo)
  return direct ? direct.url : ''
}
