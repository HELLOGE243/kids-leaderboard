import { useEffect, useState } from 'react'
import { speak, stopSpeaking, speechSupported, onSpeechChange, speakingKey } from '../utils/speech.js'

/**
 * A button that reads something aloud, and stops it.
 *
 * Wherever a child meets words written for a stronger reader - an explanation,
 * a worked solution, their own sentence read back to them - this sits beside
 * them. It hides itself on a browser that cannot speak rather than offering a
 * button that does nothing.
 *
 * @param {object} props
 * @param {string} props.text the passage, markup and all
 * @param {string} props.speechKey names this passage so only one reads at once
 * @param {string} [props.label] what the button says next to its icon
 * @param {string} [props.title] the tooltip
 * @param {string} [props.className] extra classes for the host screen's styling
 * @param {number} [props.rate] 1 is normal pace; the default is gentler
 */
function SpeakButton({ text, speechKey, label = '', title = 'Read aloud', className = '', rate }) {
  const [speaking, setSpeaking] = useState(() => speakingKey() === speechKey)

  useEffect(() => onSpeechChange((key) => setSpeaking(key === speechKey)), [speechKey])

  // Leaving the screen should not leave a voice talking to an empty room.
  useEffect(() => () => { if (speakingKey() === speechKey) stopSpeaking() }, [speechKey])

  if (!speechSupported() || !String(text || '').trim()) return null

  return (
    <button
      type="button"
      className={`speak-btn${speaking ? ' is-speaking' : ''}${className ? ` ${className}` : ''}`}
      title={speaking ? 'Stop' : title}
      aria-label={speaking ? 'Stop reading' : title}
      onClick={(e) => { e.stopPropagation(); speak(text, { key: speechKey, ...(rate ? { rate } : {}) }) }}
    >
      <span className="speak-btn-icon" aria-hidden="true">{speaking ? '⏹' : '🔊'}</span>
      {label && <span className="speak-btn-label">{speaking ? 'Stop' : label}</span>}
    </button>
  )
}

export default SpeakButton
