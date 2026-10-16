/**
 * Reading things aloud.
 *
 * Hearing a sentence is how a primary writer catches the run-on their eye
 * slides over, and how a child who reads slowly gets at an explanation written
 * for a stronger reader. One place owns the browser's speech so two parts of
 * the app can never talk over each other: asking for anything stops whatever
 * was already speaking.
 *
 * The browser does the speaking - no network, no cost, nothing sent anywhere.
 */

let currentKey = null
let listeners = new Set()
let preferredVoice = null
let voicesReady = false

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null

/** Whether this browser can speak at all. */
export function speechSupported() {
  return !!synth && typeof window.SpeechSynthesisUtterance === 'function'
}

/**
 * An English voice that sounds local, preferring the ones a child here hears
 * every day. Voices arrive asynchronously in most browsers, so this is run
 * again when they land.
 */
function pickVoice() {
  if (!synth) return null
  const voices = synth.getVoices() || []
  if (!voices.length) return null
  voicesReady = true
  const byLang = (prefix) => voices.filter((v) => (v.lang || '').toLowerCase().startsWith(prefix))
  const naturalFirst = (list) => list.find((v) => /natural|neural|premium|enhanced/i.test(v.name)) || list[0]
  return naturalFirst(byLang('en-au'))
    || naturalFirst(byLang('en-gb'))
    || naturalFirst(byLang('en'))
    || voices[0]
    || null
}

if (synth) {
  preferredVoice = pickVoice()
  // Chrome fills the list after the first paint; Safari after a first speak.
  if (typeof synth.addEventListener === 'function') {
    synth.addEventListener('voiceschanged', () => { preferredVoice = pickVoice() })
  }
}

/** Tells the buttons which passage is speaking, so they can show a stop. */
function notify() {
  for (const fn of listeners) {
    try { fn(currentKey) } catch { /* a broken listener is not worth a crash */ }
  }
}

/**
 * Subscribe to what is speaking.
 * @param {(key: string|null) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onSpeechChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** What is speaking now, by the key it was started with. */
export function speakingKey() {
  return currentKey
}

/**
 * Plain words from markup.
 *
 * Explanations carry HTML and rendered maths; a screen reader voice saying
 * "less than em greater than" helps nobody. Entities become spaces, and the
 * maths delimiters are dropped so the symbols inside are read as text.
 */
export function speakableText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '. ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '. ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\\\(|\\\)|\\\[|\\\]|\$\$?/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, ' and ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s*\.\s*(\.\s*)+/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Stops whatever is being read. */
export function stopSpeaking() {
  if (!synth) return
  try { synth.cancel() } catch { /* already quiet */ }
  if (currentKey !== null) {
    currentKey = null
    notify()
  }
}

/**
 * Reads a passage aloud, stopping anything already speaking.
 *
 * @param {string} html the passage, markup and all
 * @param {object} [opts]
 * @param {string} [opts.key] names this passage, so a button knows it is the
 *   one speaking; asking for the key that is already speaking stops it
 * @param {number} [opts.rate] 1 is the browser's normal pace; slower suits
 *   younger readers and is the default here
 * @returns {boolean} whether anything was said
 */
export function speak(html, { key = 'default', rate = 0.92 } = {}) {
  if (!speechSupported()) return false
  if (currentKey === key) { stopSpeaking(); return false }

  const text = speakableText(html)
  if (!text) { stopSpeaking(); return false }

  stopSpeaking()
  if (!voicesReady) preferredVoice = pickVoice()

  const utter = new window.SpeechSynthesisUtterance(text)
  utter.rate = rate
  utter.pitch = 1
  if (preferredVoice) utter.voice = preferredVoice
  utter.onend = () => { if (currentKey === key) { currentKey = null; notify() } }
  utter.onerror = () => { if (currentKey === key) { currentKey = null; notify() } }

  currentKey = key
  notify()
  try {
    synth.speak(utter)
  } catch {
    currentKey = null
    notify()
    return false
  }
  return true
}

/**
 * Reads several passages one after another, as a coach reads a sentence and
 * then says what it thinks of it.
 * @param {string[]} parts
 */
export function speakSequence(parts, { key = 'default', rate = 0.92 } = {}) {
  const text = (parts || []).map(speakableText).filter(Boolean).join('. ')
  return speak(text, { key, rate })
}
