import { useState } from 'react'
import DailyQuest from './DailyQuest.jsx'
import DailyReadings from './DailyReadings.jsx'
import Library from './Library.jsx'
import { getReadingStreak } from '../data/store.js'

/**
 * Daily Readings and the Library behind one door.
 *
 * They were two cards on the portal, next to each other, both of them about
 * reading - one the piece set for today, the other everything else worth
 * reading. A student deciding between them was being asked to make a
 * distinction that only matters once they are already inside.
 *
 * Each page keeps its own screen whole; this draws the header and the Back
 * button once, and tells the page not to draw its own.
 *
 * @param {object} props
 * @param {object} props.student
 * @param {number} props.due how many readings are outstanding, for the badge
 * @param {() => void} props.onBack
 */
function ReadingRoom({ student, due = 0, onBack }) {
  // The quest first, because it is the thing with a deadline on it.
  const [tab, setTab] = useState('quest')
  const streak = getReadingStreak(student?.id)

  return (
    <div className="rr-page">
      <header className="rr-top">
        <button className="btn btn-outline" onClick={onBack}>&larr; Back</button>
        <div className="rr-top-mid">
          <h2 className="rr-title">Reading</h2>
          <span className="rr-sub">Today&rsquo;s three, what is still owed, and the shelf</span>
        </div>
        <div className={`dr-streak${streak > 0 ? ' is-on' : ''}`} title="Days in a row">
          <span className="dr-streak-num">{streak}</span>
          <span className="dr-streak-label">day{streak === 1 ? '' : 's'} in a row</span>
        </div>
      </header>

      <nav className="rr-tabs">
        <button
          className={`rr-tab${tab === 'quest' ? ' rr-tab-on' : ''}`}
          onClick={() => setTab('quest')}
        >
          Today&rsquo;s Quest
        </button>
        <button
          className={`rr-tab${tab === 'today' ? ' rr-tab-on' : ''}`}
          onClick={() => setTab('today')}
        >
          Set Readings
          {due > 0 && <span className="rr-tab-badge">{due}</span>}
        </button>
        <button
          className={`rr-tab${tab === 'library' ? ' rr-tab-on' : ''}`}
          onClick={() => setTab('library')}
        >
          Library
        </button>
      </nav>

      <div className="rr-body">
        {tab === 'quest' && <DailyQuest student={student} onBack={onBack} embedded />}
        {tab === 'today' && <DailyReadings student={student} onBack={onBack} embedded />}
        {tab === 'library' && <Library student={student} onBack={onBack} embedded />}
      </div>
    </div>
  )
}

export default ReadingRoom
