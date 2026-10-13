import { useState } from 'react'
import { RichText } from './RichTextEditor.jsx'
import { renderMath } from '../utils/renderMath.js'
import { prepareMath } from '../utils/mathify.js'
import { isWritingType, getWritingMark } from '../data/store.js'
import MarkedWriting from './MarkedWriting.jsx'
import { parseExplanation } from '../utils/aiChat.js'

/**
 * One question of a paper that has been sat, with what the student answered.
 *
 * The same question, the same options, the same marking the student sees on
 * their own review screen - it wears the same classes, so it reads the same -
 * and none of what that screen also carries: no explaining themselves, no
 * asking for help, no revision, no coins. A parent is reading, not sitting.
 *
 * @param {object} props
 * @param {object} props.question as it stands in the quiz set
 * @param {*} props.answer what the student put, in whatever shape the type uses
 * @param {number} props.index its place in the paper, counting from zero
 */
/** Seconds, as the student's own review screen writes them. */
function formatTime(s) {
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

function letterOf(i) {
  return String.fromCharCode(65 + i)
}

/** Did they get it right? Mirrors scoreOneQuestion, for a badge. */
function verdict(question, answer) {
  const type = question.type || 'multiple-choice'
  if (isWritingType(type)) return 'written'
  if (type === 'free-response') {
    if (answer?.needsMarking) return 'pending'
    const marks = Number(question.marks) > 0 ? Math.round(Number(question.marks)) : 1
    const got = Number(answer?.score) || 0
    return got >= marks ? 'right' : got > 0 ? 'part' : 'wrong'
  }
  if (type === 'multiple-choice' || type === 'multi-description') {
    if (answer === -1 || answer == null) return 'skipped'
    return answer === question.correctIndex ? 'right' : 'wrong'
  }
  if (type === 'dropdown-cloze') {
    if (!Array.isArray(answer)) return 'skipped'
    const got = (question.blanks || []).filter((b, i) => answer[i] === b.correctIndex).length
    return got === (question.blanks || []).length ? 'right' : got > 0 ? 'part' : 'wrong'
  }
  if (type === 'drag-drop' || type === 'drag-sentence' || type === 'drag-summary') {
    if (!Array.isArray(answer)) return 'skipped'
    const got = (question.correctOrder || []).filter((c, i) => answer[i] === c).length
    return got === (question.correctOrder || []).length ? 'right' : got > 0 ? 'part' : 'wrong'
  }
  if (type === 'multi-matching') {
    if (!Array.isArray(answer)) return 'skipped'
    const got = (question.matchQuestions || []).filter((m, i) => answer[i] === m.correctExtract).length
    return got === (question.matchQuestions || []).length ? 'right' : got > 0 ? 'part' : 'wrong'
  }
  return 'written'
}

const VERDICT_LABEL = {
  right: 'Correct',
  wrong: 'Not correct',
  part: 'Partly correct',
  skipped: 'Left blank',
  written: 'Written answer',
  pending: 'Waiting to be marked',
}

function ReviewedQuestion({ question, answer, index, seconds, attemptId }) {
  const type = question.type || 'multiple-choice'
  const [tab, setTab] = useState(0)
  const hasExtracts = (type === 'multi-description' || type === 'multi-matching')
    && (question.descriptions || []).length > 0
  const mark = verdict(question, answer)
  // Stored as JSON - a general explanation and one per option - so it has to be
  // read the same way the student's review reads it, not printed as it stands.
  const explain = parseExplanation(question.explanation)
  const wide = isWritingType(type) || type === 'free-response'

  // A row saying what the key is and what they put, for the types answered by
  // ordering or matching rather than by choosing.
  const keyRows = (rows) => (
    <div className="rq-key">
      {rows.map(({ label, theirs, right }, i) => (
        <div key={i} className={`rq-key-row${theirs === right ? ' is-right' : ''}`}>
          <span className="rq-key-label">{label}</span>
          <span className="rq-key-theirs">{theirs ?? <em>blank</em>}</span>
          {theirs !== right && <span className="rq-key-answer">{right}</span>}
        </div>
      ))}
    </div>
  )

  const answerBlock = () => {
    if (type === 'multiple-choice' || type === 'multi-description') {
      return (
        <div className="qt-options">
          {(question.options || []).map((opt, oi) => {
            if (!opt) return null
            let cls = 'qt-option qt-option-review'
            if (oi === question.correctIndex) cls += ' qt-option-correct'
            if (oi === answer && oi !== question.correctIndex) cls += ' qt-option-wrong'
            const why = explain.options?.[letterOf(oi)]
            return (
              <div key={oi}>
              <div className={cls} style={{ cursor: 'default' }}>
                <span className={`qt-option-radio ${oi === question.correctIndex ? 'qt-radio-correct' : oi === answer ? 'qt-radio-wrong' : ''}`} />
                <span className="qt-option-text" dangerouslySetInnerHTML={{ __html: renderMath(prepareMath(opt)) }} />
                {oi === answer && <span className="rq-chose">their answer</span>}
              </div>
              {why && <div className="qt-option-explanation" dangerouslySetInnerHTML={{ __html: why }} />}
              </div>
            )
          })}
        </div>
      )
    }

    if (type === 'dropdown-cloze') {
      return keyRows((question.blanks || []).map((b, i) => ({
        label: `Blank ${i + 1}`,
        theirs: Array.isArray(answer) && answer[i] >= 0 ? (b.options?.[answer[i]] ?? letterOf(answer[i])) : null,
        right: b.options?.[b.correctIndex] ?? letterOf(b.correctIndex),
      })))
    }

    if (type === 'drag-drop' || type === 'drag-sentence' || type === 'drag-summary') {
      return keyRows((question.correctOrder || []).map((c, i) => ({
        label: `Gap ${question.gapNumbers?.[i] ?? i + 1}`,
        theirs: Array.isArray(answer) && answer[i] >= 0 ? (question.summaryOptions?.[answer[i]] || letterOf(answer[i])) : null,
        right: question.summaryOptions?.[c] || letterOf(c),
      })))
    }

    if (type === 'multi-matching') {
      return keyRows((question.matchQuestions || []).map((m, i) => ({
        label: m.question ? String(m.question).replace(/<[^>]*>/g, '').slice(0, 60) : `Item ${i + 1}`,
        theirs: Array.isArray(answer) && answer[i] >= 0 ? letterOf(answer[i]) : null,
        right: letterOf(m.correctExtract),
      })))
    }

    if (type === 'free-response') {
      const marks = Number(question.marks) > 0 ? Math.round(Number(question.marks)) : 1
      return (
        <div className="rq-written">
          <div className="rq-written-label">What they wrote</div>
          <div className="rq-written-body">{String(answer?.text || '') || <em>Nothing written</em>}</div>
          {answer?.needsMarking ? (
            <div className="rq-written-note">Waiting to be marked by a teacher.</div>
          ) : (
            <div className="rq-written-note">
              <b>{Number(answer?.score) || 0} out of {marks}</b>
              {answer?.comment ? ` — ${answer.comment}` : ''}
            </div>
          )}
          {question.modelAnswer && (
            <>
              <div className="rq-written-label" style={{ marginTop: 12 }}>What it was looking for</div>
              <RichText html={question.modelAnswer} />
            </>
          )}
        </div>
      )
    }

    if (isWritingType(type)) {
      // The teacher's marking is the paper, for writing - the piece on its own
      // tells a parent nothing about how it was judged.
      return (
        <div className="rq-written">
          <MarkedWriting
            html={String(answer || '')}
            mark={attemptId ? getWritingMark(attemptId, index) : null}
          />
        </div>
      )
    }

    return null
  }

  // The passage on the left and the question on the right, as the student sat
  // it and as they review it. Stacking them would repeat a whole reading
  // passage above all thirty-eight questions, which no parent would read.
  const passage = hasExtracts ? (
    <>
      <div className="qt-desc-tabs">
        {question.descriptions.map((d, di) => (
          <button
            key={di}
            className={`qt-desc-tab${tab === di ? ' qt-desc-tab-active' : ''}`}
            onClick={() => setTab(di)}
          >{d.title || letterOf(di)}</button>
        ))}
      </div>
      <div className="qt-desc-content">
        <RichText html={question.descriptions[tab]?.content || ''} />
      </div>
    </>
  ) : question.text ? (
    <div className="qt-question-text"><RichText html={question.text} /></div>
  ) : null

  const asked = (
    <>
      {hasExtracts && !question.prompt && question.text && (
        <div className="qt-question-text"><RichText html={question.text} /></div>
      )}
      {question.prompt && <div className="qt-prompt-display" dangerouslySetInnerHTML={{ __html: question.prompt }} />}
      {answerBlock()}
      {explain.general && (
        <div className="rq-explanation">
          <div className="rq-written-label">Explanation</div>
          <RichText html={explain.general} />
        </div>
      )}
    </>
  )

  return (
    <article className="rq">
      <header className="rq-head">
        <span className="rq-num">Question {index + 1}</span>
        <div className="rq-head-right">
          {seconds > 0 && <span className="rq-time">{formatTime(seconds)}</span>}
          <span className={`rq-verdict is-${mark}`}>{VERDICT_LABEL[mark]}</span>
        </div>
      </header>

      {passage && !wide ? (
        <div className="qt-split rq-split">
          <div className="qt-split-left">{passage}</div>
          <div className="qt-split-divider" />
          <div className="qt-split-right">{asked}</div>
        </div>
      ) : (
        <div className="rq-single">{passage}{asked}</div>
      )}
    </article>
  )
}

export default ReviewedQuestion
