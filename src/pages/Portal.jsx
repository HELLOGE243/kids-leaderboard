import { useState } from 'react'
import ProgressGraph from '../components/ProgressGraph.jsx'
import { getClassesForStudent, getOrganisation, getStudentById, getLeaderboard, addScore, getTestEventsForClass, getScoresForStudentInClass } from '../data/store.js'

function Portal({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState(null)
  const [scoreValue, setScoreValue] = useState('')
  const [selectedEvent, setSelectedEvent] = useState('')
  const [scoreError, setScoreError] = useState('')
  const [refresh, setRefresh] = useState(0)

  const student = getStudentById(user.id)
  const classes = getClassesForStudent(user.id)
  const org = getOrganisation(user.orgId)
  const leaderboard = activeTab ? getLeaderboard(activeTab) : []
  const testEvents = activeTab ? getTestEventsForClass(activeTab) : []

  function handleAddScore(e) {
    e.preventDefault()
    const value = parseInt(scoreValue, 10)
    if (isNaN(value) || value <= 0) return
    if (!selectedEvent) {
      setScoreError('Select a test event first.')
      return
    }
    addScore(user.id, activeTab, value, selectedEvent)
    setScoreValue('')
    setSelectedEvent('')
    setScoreError('')
    setRefresh((r) => r + 1)
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="header">
        <div>
          <h1 className="pixel-title">Hey, {student.name}!</h1>
          <p className="text-dim" style={{ fontSize: '0.8rem' }}>{org ? org.name : ''}</p>
        </div>
        <button className="btn btn-outline btn-small" onClick={onLogout}>Switch</button>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value text-coin">{student.coins}</span>
          <span className="stat-label">Coins</span>
        </div>
        <div className="stat-card">
          <span className="stat-value text-token">{student.tokens}</span>
          <span className="stat-label">Tokens</span>
        </div>
      </div>

      {/* Class Tabs */}
      <p className="pixel-heading">My Classes</p>
      {classes.length === 0 ? (
        <p className="text-dim">No classes assigned yet.</p>
      ) : (
        <div className="tab-row">
          {classes.map((cls) => (
            <button
              key={cls.id}
              className={`tab ${activeTab === cls.id ? 'tab-active' : ''}`}
              onClick={() => setActiveTab(activeTab === cls.id ? null : cls.id)}
            >
              {cls.name}
            </button>
          ))}
        </div>
      )}

      {/* Active Class */}
      {activeTab && (
        <>
          {/* Score Input */}
          <div className="card">
            <p className="pixel-heading">Add Test Score</p>
            {testEvents.length === 0 ? (
              <p className="text-dim">No test events yet. Your teacher will create them.</p>
            ) : (
              <form onSubmit={handleAddScore} className="form-row">
                <select
                  value={selectedEvent}
                  onChange={(e) => { setSelectedEvent(e.target.value); setScoreError('') }}
                  className="select flex-1"
                >
                  <option value="">Select event...</option>
                  {testEvents.map((ev) => (
                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={scoreValue}
                  onChange={(e) => setScoreValue(e.target.value)}
                  placeholder="Score"
                  className="input"
                  style={{ width: '80px', flex: 'none' }}
                  min="1"
                />
                <button type="submit" className="btn btn-small">Add</button>
              </form>
            )}
            {scoreError && <p className="error-text">{scoreError}</p>}
          </div>

          {/* Leaderboard */}
          <div className="card">
            <p className="pixel-heading">
              {classes.find((c) => c.id === activeTab)?.name} Leaderboard
            </p>
            {leaderboard.length === 0 ? (
              <p className="text-dim">No scores yet. Be the first!</p>
            ) : (
              <div>
                {leaderboard.map((entry, i) => {
                  const isMe = entry.id === user.id
                  return (
                    <div key={entry.id} className={`lb-row ${isMe ? 'lb-row-me' : ''}`}>
                      <span className="lb-rank">
                        {i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`}
                      </span>
                      <span className={`lb-name ${isMe ? 'bold' : ''}`}>
                        {entry.name}{isMe ? ' (You)' : ''}
                      </span>
                      <span className="lb-points">{entry.points}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Progress Graph */}
          <div className="card">
            <p className="pixel-heading">My Progress</p>
            <ProgressGraph
              dataPoints={getScoresForStudentInClass(user.id, activeTab)
                .slice()
                .sort((a, b) => new Date(a.date) - new Date(b.date))
                .map((sc) => {
                  const ev = testEvents.find((e) => e.id === sc.testEventId)
                  return { date: sc.date, value: sc.value, label: ev ? ev.name : '' }
                })
              }
            />
          </div>
        </>
      )}

      {/* Shop Button */}
      <button className="btn btn-coin w-full mt-16">
        Shop — Spend Coins!
      </button>
    </div>
  )
}

export default Portal
