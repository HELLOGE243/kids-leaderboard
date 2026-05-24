import { useState } from 'react'
import ProgressGraph from '../components/ProgressGraph.jsx'
import RankGraph from '../components/RankGraph.jsx'
import { getClassesForStudent, getOrganisation, getStudentById, getLeaderboard, addScore, getTestEventsForClass, getScoresForStudentInClass, getRankingForStudentInClass } from '../data/store.js'

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
          <img src="/coin.png" alt="Coin" className="stat-icon" />
          <span className="stat-value text-coin">{student.coins}</span>
          <span className="stat-label">Coins</span>
        </div>
        <div className="stat-card">
          <img src="/token.png" alt="Token" className="stat-icon" />
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
              <form onSubmit={handleAddScore} className="score-form">
                <div className="event-btn-row">
                  {testEvents.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      className={`event-btn ${selectedEvent === ev.id ? 'event-btn-active' : ''}`}
                      onClick={() => { setSelectedEvent(selectedEvent === ev.id ? '' : ev.id); setScoreError('') }}
                    >
                      {ev.name}
                    </button>
                  ))}
                </div>
                <div className="score-input-row">
                  <input
                    type="number"
                    value={scoreValue}
                    onChange={(e) => setScoreValue(e.target.value)}
                    placeholder="Enter score"
                    className="score-number-input"
                    min="1"
                  />
                  <button type="submit" className="btn">Add</button>
                </div>
              </form>
            )}
            {scoreError && <p className="error-text">{scoreError}</p>}
          </div>

          {/* Leaderboard */}
          <div className="card card-glow leaderboard-card">
            <p className="lb-title">
              {classes.find((c) => c.id === activeTab)?.name} Leaderboard
            </p>
            {leaderboard.length === 0 ? (
              <p className="text-dim">No scores yet. Be the first!</p>
            ) : (
              <div className="lb-list">
                {leaderboard.map((entry, i) => {
                  const isMe = entry.id === user.id
                  return (
                    <div key={entry.id} className={`lb-row ${isMe ? 'lb-row-me' : ''} ${i < 3 ? 'lb-row-top3' : ''}`}>
                      <span className={`lb-rank ${i === 0 ? 'lb-rank-1st' : i === 1 ? 'lb-rank-2nd' : i === 2 ? 'lb-rank-3rd' : ''}`}>
                        {i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`}
                      </span>
                      <span className="lb-name">
                        {entry.name}{isMe ? ' (You)' : ''}
                      </span>
                      <span className="lb-points">{entry.points} pts</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Score Progress */}
          <div className="card">
            <p className="pixel-heading">Score Progress</p>
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

          {/* Class Ranking */}
          <div className="card">
            <p className="pixel-heading">My Ranking — This Class</p>
            <RankGraph
              dataPoints={getRankingForStudentInClass(user.id, activeTab)
                .map((r) => ({
                  date: r.date,
                  rank: r.rank,
                  totalStudents: r.totalStudents,
                  eventName: r.eventName,
                  score: r.score,
                }))
              }
            />
            <p className="text-dim mt-8" style={{ fontSize: '0.7rem' }}>
              Rank based on this class. When templates are linked, rankings include all cohorts.
            </p>
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
