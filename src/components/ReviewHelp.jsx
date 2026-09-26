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
// What a student says went wrong, in their own terms. Kept short enough to read
// at a glance and specific enough to be worth reporting back to a teacher.
const REASONS = [
  'I didn’t understand the question',
  'I understood it but didn’t know the strategy',
  'Silly mistake',
  'I ran out of time or guessed',
]

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
    // Step 1 asks the student to say what happened first; the explanation of
    // their own answer follows once they have. Step 2 explains straight away.
    if (kind === 'wrong' && !chat.reason) { onChange({ ...chat, panel: 'wrong' }); return }
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

  // Picking a reason opens the explanation of the answer they gave.
  async function pickReason(reason) {
    const next = { ...chat, reason, panel: 'wrong' }
    if (help.wrong) { onChange(next); return }
    onChange({ ...next, loading: 'wrong' })
    const text = await fetchWrong()
    onChange({
      ...next,
      loading: null,
      help: { ...help, wrong: text || 'No explanation is available for this one yet — try Ask Teacher.' },
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

      {open === 'wrong' && (
        <div className="qt-help-panel">
          <div className="qt-help-lead">What happened on this one?</div>
          <div className="qt-help-reasons">
            {REASONS.map((reason) => (
              <button
                key={reason}
                className={`qt-help-reason${chat.reason === reason ? ' is-picked' : ''}`}
                onClick={() => pickReason(reason)}
              >{reason}</button>
            ))}
          </div>
          {chat.loading === 'wrong'
            ? <div className="qt-help-loading">Working it out…</div>
            : help.wrong
              ? <div className="qt-help-text qt-help-text-after" dangerouslySetInnerHTML={{ __html: help.wrong }} />
              : null}
        </div>
      )}

      {open && open !== 'mine' && open !== 'wrong' && (
        <div className="qt-help-panel">
          {chat.loading === open
            ? <div className="qt-help-loading">Working it out…</div>
            : <div className="qt-help-text" dangerouslySetInnerHTML={{ __html: help[open] || '' }} />}
        </div>
      )}

      {open === 'mine' && <div className="qt-help-panel">{renderMine()}</div>}

      {(open || isDone) && onAskTeacher && (
        <div className="qt-help-follow">
          <button
            className={`qt-help-follow-btn qt-help-follow-ask${asked ? ' is-sent' : ''}`}
            disabled={asked}
            onClick={onAskTeacher}
          >{asked ? 'Sent to your teacher ✓' : 'I still don’t get it — ask my teacher'}</button>
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
