import { useState } from 'react'

/**
 * The three-step help a student works through on a question they got wrong:
 *
 *   1. Why did I get this wrong?   - the explanation for the answer they chose
 *   2. Explain this question       - the explanation for the right answer
 *   3. their own turn              - locked until 1 and 2 have been read
 *
 * Step 3 is left to the caller (`renderMine`), because what earns the token
 * differs by question type: a multiple-choice question asks for an explanation
 * in the student's own words, a cloze gap asks for a definition of every word
 * that was offered for it.
 *
 * All state lives in the `chat` object the caller stores and persists, so a
 * student who leaves the review and comes back finds their progress intact.
 */
function ReviewHelp({
  chat,
  onChange,
  wrongLabel = 'Why did I get this wrong?',
  conceptLabel = 'Explain this question',
  mineLabel = 'I’ll explain it myself',
  mineDoneLabel = 'Your explanation ✓',
  bountyLabel = '+1 token',
  fetchWrong,
  fetchConcept,
  renderMine,
  isDone = false,
  onAskTeacher,
  asked = false,
  compact = false,
}) {
  const open = chat.panel || null
  const help = chat.help || {}
  const stepsRead = !!help.wrong && !!help.concept
  const mineLocked = !stepsRead && !isDone

  async function openHelp(kind) {
    if (open === kind) { onChange({ ...chat, panel: null }); return }
    if (help[kind]) { onChange({ ...chat, panel: kind }); return }
    onChange({ ...chat, panel: kind, loading: kind })
    const text = kind === 'wrong' ? await fetchWrong() : await fetchConcept()
    onChange({
      ...chat,
      panel: kind,
      loading: null,
      help: { ...help, [kind]: text || 'No explanation is available for this one yet — try Ask Teacher.' },
    })
  }

  return (
    <div className={`qt-help${compact ? ' qt-help-compact' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="qt-help-row">
        <button className={`qt-help-btn qt-click-flash${open === 'wrong' ? ' is-open' : ''}`} onClick={() => openHelp('wrong')}>
          <span className="qt-help-step" aria-hidden="true">1</span>{wrongLabel}
        </button>
        <button className={`qt-help-btn qt-click-flash${open === 'concept' ? ' is-open' : ''}`} onClick={() => openHelp('concept')}>
          <span className="qt-help-step" aria-hidden="true">2</span>{conceptLabel}
        </button>
        <button
          className={`qt-help-btn qt-help-btn-mine qt-click-flash${open === 'mine' ? ' is-open' : ''}${isDone ? ' is-done' : ''}${mineLocked ? ' is-locked' : ''}`}
          disabled={mineLocked}
          title={mineLocked ? 'Read 1 and 2 first' : ''}
          onClick={() => onChange({ ...chat, panel: open === 'mine' ? null : 'mine' })}
        >
          <span className="qt-help-step" aria-hidden="true">3</span>
          {isDone ? mineDoneLabel : mineLabel}
          {!isDone && <span className="qt-help-bounty">{mineLocked ? 'Read 1 & 2 first' : bountyLabel}</span>}
        </button>
      </div>

      {open && open !== 'mine' && (
        <div className="qt-help-panel">
          {chat.loading === open
            ? <div className="qt-help-loading">Working it out…</div>
            : <div className="qt-help-text" dangerouslySetInnerHTML={{ __html: help[open] || '' }} />}
        </div>
      )}

      {open === 'mine' && <div className="qt-help-panel">{renderMine()}</div>}

      {(open || isDone) && (
        <div className="qt-help-follow">
          <span className="qt-help-follow-label">What happened?</span>
          {['Hard to understand', 'Silly mistake', 'Ran out of time', 'I guessed'].map((reason) => (
            <button
              key={reason}
              className={`qt-help-follow-btn${chat.reason === reason ? ' is-picked' : ''}`}
              onClick={() => onChange({ ...chat, reason })}
            >{reason}</button>
          ))}
          {onAskTeacher && (
            <button
              className={`qt-help-follow-btn qt-help-follow-ask${asked ? ' is-sent' : ''}`}
              disabled={asked}
              onClick={onAskTeacher}
            >{asked ? 'Sent to your teacher ✓' : 'I still don’t get it — ask my teacher'}</button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * A text box that refuses pasted text. Definitions only count when the student
 * writes them, so paste, drop and autofill are all turned off.
 */
export function NoPasteInput({ value, onChange, placeholder, disabled, onEnter }) {
  const [warned, setWarned] = useState(false)
  return (
    <>
      <input
        className="qt-help-input qt-nopaste"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter() } }}
        onPaste={(e) => { e.preventDefault(); setWarned(true) }}
        onDrop={(e) => { e.preventDefault(); setWarned(true) }}
      />
      {warned && <span className="qt-nopaste-note">Type it in your own words — pasting is off here.</span>}
    </>
  )
}

export default ReviewHelp
