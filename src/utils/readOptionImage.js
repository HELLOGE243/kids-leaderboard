// Reads the lettered option list (A-H sentences or paragraph summaries) out of
// the image CleverSpace stores inside Drag Sentences / Drag Summaries passages.
// CleverSpace keeps only the letters as answers, so this image is the sole
// source of the option text.
//
// Goes through the app's existing /api/claude proxy. Structured output
// (output_config.format) guarantees parseable JSON; the teacher still reviews
// every result before anything is saved.

const MODEL = 'claude-opus-5'

const OPTIONS_SCHEMA = {
  type: 'object',
  properties: {
    options: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          letter: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['letter', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['options'],
  additionalProperties: false,
}

const PROMPT = `This image is from a reading test. It contains a list of options labelled with capital letters (for example A to G) - sentences or paragraph summaries that students choose from to fill gaps in a passage.

Transcribe every labelled option exactly as written, in letter order: keep the original wording, punctuation and capitalisation, and do not include the letter label itself in the text. If an option's text is unreadable, give your best reading rather than skipping it. If the image contains no lettered options, return an empty list.`

function splitDataUri(dataUri) {
  const m = String(dataUri || '').match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i)
  if (!m) return null
  // The API accepts these image types.
  const mediaType = m[1].toLowerCase().replace('image/jpg', 'image/jpeg')
  if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mediaType)) return null
  return { mediaType, data: m[2] }
}

/**
 * @param {string} dataUri the embedded option-list image
 * @returns {Promise<{ok: true, options: string[]} | {ok: false, error: string}>}
 *   options are in letter order (index 0 = A).
 */
export async function readOptionImage(dataUri) {
  const img = splitDataUri(dataUri)
  if (!img) return { ok: false, error: 'Unsupported image format' }

  let res
  try {
    res = await fetch('/api/claude/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        // Straight transcription: low effort is enough and keeps it fast.
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: OPTIONS_SCHEMA },
        },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
    })
  } catch {
    return { ok: false, error: 'Could not reach the AI service' }
  }

  let body
  try { body = await res.json() } catch { body = null }
  if (!res.ok) return { ok: false, error: body?.error?.message || `AI service error (${res.status})` }
  if (body?.stop_reason === 'refusal') return { ok: false, error: 'The AI declined to read this image' }
  if (body?.stop_reason === 'max_tokens') return { ok: false, error: 'The option list was too long to read in one go' }

  const textBlock = (body?.content || []).find((b) => b.type === 'text')
  let parsed
  try { parsed = JSON.parse(textBlock?.text || '') } catch { return { ok: false, error: 'The AI returned an unreadable result' } }

  const byLetter = new Map()
  for (const o of parsed.options || []) {
    const letter = String(o.letter || '').trim().toUpperCase().replace(/[^A-Z]/g, '')
    const text = String(o.text || '').trim()
    if (letter.length === 1 && text) byLetter.set(letter, text)
  }
  if (byLetter.size === 0) return { ok: false, error: 'No lettered options found in the image' }

  // Contiguous from A; a gap in the lettering means a misread, surfaced as ''.
  const last = Math.max(...[...byLetter.keys()].map((l) => l.charCodeAt(0) - 65))
  const options = Array.from({ length: last + 1 }, (_, i) => byLetter.get(String.fromCharCode(65 + i)) || '')
  return { ok: true, options }
}
