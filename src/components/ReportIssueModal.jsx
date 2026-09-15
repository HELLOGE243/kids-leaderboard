import { useEffect, useState } from 'react'

// Issue choices. `ask` shows the option picker; `prompt` guides the text box;
// `chips` are one-tap phrases a student can add instead of typing.
const QUESTION_ISSUES = [
  { key: 'wrong_answer', icon: '❌', label: 'The answer is wrong', hint: 'A different option should be correct', ask: 'Which option should be correct?', prompt: 'Why do you think that option is right? (optional)', chips: ['I checked it twice', 'The explanation says otherwise'] },
  { key: 'typo', icon: '✏️', label: 'Spelling or typo', hint: 'A word is misspelt or missing', prompt: 'Which word looks wrong, and what should it say?', chips: ['A word is misspelt', 'A word is missing', 'Numbers look wrong'] },
  { key: 'image', icon: '🖼️', label: 'Picture problem', hint: "An image is missing or won't load", prompt: 'What’s wrong with the picture? (optional)', chips: ['Image not showing', 'Image is cut off', 'Image is too blurry'] },
  { key: 'options', icon: '🔢', label: 'Answer options broken', hint: 'Options missing, repeated or blank', ask: 'Which option has the problem?', prompt: 'What’s wrong with it? (optional)', chips: ['Option is blank', 'Two options are the same', 'An option is missing'] },
  { key: 'unclear', icon: '🤔', label: "Doesn't make sense", hint: 'The question is confusing', prompt: 'Which part is confusing? (optional)', chips: ['Missing information', 'Instructions unclear', 'Text is jumbled'] },
  { key: 'other', icon: '💬', label: 'Something else', hint: 'Tell us in your own words', prompt: 'Describe the problem', chips: [], required: true },
]

const EXPLANATION_ISSUES = [
  { key: 'incorrect', icon: '❌', label: 'Explanation is wrong', hint: "It doesn't match the right answer", prompt: 'What’s wrong with it? (optional)', chips: ['Explains the wrong option', 'Has a mistake in working'] },
  { key: 'confusing', icon: '🤔', label: 'Hard to understand', hint: 'It didn’t help me get it', prompt: 'Which part lost you? (optional)', chips: ['Too many steps skipped', 'Words are too hard'] },
  { key: 'video', icon: '🎬', label: 'Video problem', hint: "The video won't play or is wrong", prompt: 'What happened? (optional)', chips: ["Video won't play", 'Video is for a different question'] },
  { key: 'offensive', icon: '🚫', label: 'Inappropriate', hint: 'Something that shouldn’t be there', prompt: 'What did you see? (optional)', chips: [] },
  { key: 'other', icon: '💬', label: 'Something else', hint: 'Tell us in your own words', prompt: 'Describe the problem', chips: [], required: true },
]

/**
 * Student error report popup, shared by quizzes, reviews, Revision Dojo and
 * daily revision.
 * @param {'question'|'explanation'} kind
 * @param {object} [question] - used to offer the options as tap targets
 * @param {(report: {type: string, details: string, option: number|null}) => void} onSubmit
 */
function ReportIssueModal({ kind = 'question', question, questionLabel, onSubmit, onClose }) {
  const issues = kind === 'explanation' ? EXPLANATION_ISSUES : QUESTION_ISSUES
  const [type, setType] = useState(null)
  const [option, setOption] = useState(null)
  const [details, setDetails] = useState('')
  const [sent, setSent] = useState(false)
  const issue = issues.find((i) => i.key === type)
  const options = (question?.options || []).map((o, i) => ({ i, text: String(o || '').replace(/<[^>]*>/g, '').trim() })).filter((o) => o.text || type === 'options')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!sent) return
    const t = setTimeout(onClose, 1800)
    return () => clearTimeout(t)
  }, [sent, onClose])

  const canSend = issue && (!issue.required || details.trim().length > 2)
  const addChip = (c) => setDetails((d) => (d.includes(c) ? d : (d.trim() ? `${d.trim()}. ${c}` : c)))

  function send() {
    if (!canSend) return
    onSubmit({ type, details: details.trim(), option })
    setSent(true)
  }

  return (
    <div className="neon-overlay rim-overlay" onClick={onClose}>
      <div className="rim" role="dialog" aria-modal="true" aria-label="Report a problem" onClick={(e) => e.stopPropagation()}>
        <button className="rim-close" onClick={onClose} aria-label="Close">✕</button>

        {sent ? (
          <div className="rim-sent">
            <div className="rim-sent-icon">✅</div>
            <p className="rim-title">Thanks for letting us know!</p>
            <p className="rim-sub">Your teacher will check it and fix it.</p>
          </div>
        ) : (
          <>
            <p className="rim-title">{kind === 'explanation' ? 'What’s wrong with the explanation?' : 'What’s wrong with this question?'}</p>
            {questionLabel && <p className="rim-sub">{questionLabel}</p>}

            <div className="rim-issues">
              {issues.map((i) => (
                <button key={i.key} className={`rim-issue${type === i.key ? ' is-active' : ''}`} onClick={() => { setType(i.key); setOption(null) }}>
                  <span className="rim-issue-icon" aria-hidden="true">{i.icon}</span>
                  <span className="rim-issue-label">{i.label}</span>
                  <span className="rim-issue-hint">{i.hint}</span>
                </button>
              ))}
            </div>

            {issue && (
              <div className="rim-step">
                {issue.ask && options.length > 0 && (
                  <>
                    <p className="rim-step-label">{issue.ask}</p>
                    <div className="rim-options">
                      {options.map((o) => (
                        <button key={o.i} className={`rim-option${option === o.i ? ' is-active' : ''}`} onClick={() => setOption(option === o.i ? null : o.i)} title={o.text}>
                          <b>{String.fromCharCode(65 + o.i)}</b>
                          <span>{o.text || '(blank)'}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <p className="rim-step-label">{issue.prompt}</p>
                {issue.chips.length > 0 && (
                  <div className="rim-chips">
                    {issue.chips.map((c) => <button key={c} className="rim-chip" onClick={() => addChip(c)}>+ {c}</button>)}
                  </div>
                )}
                <textarea className="rim-text" rows={3} value={details} onChange={(e) => setDetails(e.target.value)}
                  placeholder={issue.required ? 'Type here…' : 'Type here, or just press Send'} autoFocus={issue.required} />
              </div>
            )}

            <div className="rim-actions">
              <button className="rim-btn rim-btn-ghost" onClick={onClose}>Cancel</button>
              <button className="rim-btn" disabled={!canSend} onClick={send}>{issue ? 'Send report' : 'Pick a problem above'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ReportIssueModal
