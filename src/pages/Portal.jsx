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
      setScoreError('Please select a test event.')
      return
    }
    addScore(user.id, activeTab, value, selectedEvent)
    setScoreValue('')
    setSelectedEvent('')
    setScoreError('')
    setRefresh((r) => r + 1)
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.greeting}>Hey, {student.name}!</h1>
          <p style={styles.meta}>{org ? org.name : ''}</p>
        </div>
        <button onClick={onLogout} style={styles.logoutBtn}>Switch User</button>
      </header>

      {/* Stats Cards */}
      <div style={styles.statsRow}>
        <div style={{ ...styles.card, background: '#ffeaa7' }}>
          <span style={styles.cardValue}>{student.coins}</span>
          <span style={styles.cardLabel}>Coins</span>
        </div>
        <div style={{ ...styles.card, background: '#a29bfe' }}>
          <span style={styles.cardValue}>{student.tokens}</span>
          <span style={styles.cardLabel}>Tokens</span>
        </div>
      </div>

      {/* Class Tabs */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>My Classes</h2>
        {classes.length === 0 ? (
          <p style={styles.hint}>Your teacher hasn't assigned you to any classes yet.</p>
        ) : (
          <div style={styles.tabRow}>
            {classes.map((cls) => (
              <button
                key={cls.id}
                onClick={() => setActiveTab(activeTab === cls.id ? null : cls.id)}
                style={{
                  ...styles.tab,
                  background: activeTab === cls.id ? '#6c5ce7' : '#dfe6e9',
                  color: activeTab === cls.id ? '#fff' : '#2d3436',
                }}
              >
                {cls.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Active Class: Score Input + Leaderboard */}
      {activeTab && (
        <div style={styles.classPanel}>
          {/* Add Score */}
          <div style={styles.scoreInputCard}>
            <h3 style={styles.panelTitle}>Add Test Score</h3>
            {testEvents.length === 0 ? (
              <p style={styles.hint}>No test events yet. Your teacher will create them.</p>
            ) : (
              <form onSubmit={handleAddScore} style={styles.scoreForm}>
                <select
                  value={selectedEvent}
                  onChange={(e) => { setSelectedEvent(e.target.value); setScoreError('') }}
                  style={styles.eventSelect}
                >
                  <option value="">Select test event...</option>
                  {testEvents.map((ev) => (
                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={scoreValue}
                  onChange={(e) => setScoreValue(e.target.value)}
                  placeholder="Score"
                  style={styles.scoreInput}
                  min="1"
                />
                <button type="submit" style={styles.submitBtn}>Add</button>
              </form>
            )}
            {scoreError && <p style={styles.error}>{scoreError}</p>}
          </div>

          {/* Leaderboard */}
          <div style={styles.leaderboardCard}>
            <h3 style={styles.panelTitle}>
              {classes.find((c) => c.id === activeTab)?.name} — Leaderboard
            </h3>
            {leaderboard.length === 0 ? (
              <p style={styles.hint}>No scores yet. Be the first!</p>
            ) : (
              <div style={styles.leaderboard}>
                {leaderboard.map((entry, i) => {
                  const isMe = entry.id === user.id
                  return (
                    <div
                      key={entry.id}
                      style={{
                        ...styles.lbRow,
                        background: isMe ? '#f0efff' : (i % 2 === 0 ? '#f8f9fa' : '#fff'),
                        borderLeft: isMe ? '4px solid #6c5ce7' : '4px solid transparent',
                      }}
                    >
                      <span style={styles.lbRank}>
                        {i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`}
                      </span>
                      <span style={{
                        ...styles.lbName,
                        fontWeight: isMe ? 'bold' : '500',
                      }}>
                        {entry.name}{isMe ? ' (You)' : ''}
                      </span>
                      <span style={styles.lbPoints}>{entry.points} pts</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* My Progress */}
          <div style={styles.progressCard}>
            <h3 style={styles.panelTitle}>My Progress</h3>
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
        </div>
      )}

      {/* Shop Button */}
      <button style={styles.shopBtn}>
        Shop — Spend Your Coins!
      </button>
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#f8f9fa',
    padding: '24px',
    maxWidth: '600px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
  },
  greeting: {
    fontSize: '1.8rem',
    color: '#2d3436',
  },
  meta: {
    fontSize: '0.85rem',
    color: '#636e72',
    marginTop: '4px',
  },
  logoutBtn: {
    padding: '10px 16px',
    fontSize: '0.9rem',
    borderRadius: '8px',
    border: '2px solid #636e72',
    background: 'transparent',
    cursor: 'pointer',
    color: '#636e72',
  },
  statsRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '32px',
  },
  card: {
    flex: 1,
    padding: '24px',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  cardValue: {
    fontSize: '2.4rem',
    fontWeight: 'bold',
  },
  cardLabel: {
    fontSize: '1rem',
    marginTop: '4px',
    opacity: 0.7,
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '1.3rem',
    marginBottom: '12px',
    color: '#2d3436',
  },
  hint: {
    color: '#636e72',
    fontSize: '0.95rem',
  },
  tabRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  tab: {
    padding: '14px 24px',
    fontSize: '1rem',
    borderRadius: '10px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '600',
  },

  // Class panel
  classPanel: {
    marginBottom: '24px',
  },
  panelTitle: {
    fontSize: '1.1rem',
    marginBottom: '12px',
    color: '#2d3436',
  },

  error: {
    color: '#d63031',
    fontSize: '0.9rem',
    marginTop: '8px',
  },
  eventSelect: {
    flex: 2,
    minWidth: '140px',
    padding: '12px 14px',
    fontSize: '1rem',
    borderRadius: '10px',
    border: '2px solid #dfe6e9',
    outline: 'none',
    background: '#fff',
  },

  // Score input
  scoreInputCard: {
    background: '#fff',
    borderRadius: '14px',
    padding: '20px',
    marginBottom: '16px',
    border: '1px solid #dfe6e9',
  },
  scoreForm: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  scoreInput: {
    flex: 1,
    minWidth: '80px',
    padding: '12px 14px',
    fontSize: '1rem',
    borderRadius: '10px',
    border: '2px solid #dfe6e9',
    outline: 'none',
  },
  submitBtn: {
    padding: '12px 20px',
    fontSize: '1rem',
    fontWeight: 'bold',
    borderRadius: '10px',
    border: 'none',
    background: '#6c5ce7',
    color: '#fff',
    cursor: 'pointer',
  },

  // Leaderboard
  leaderboardCard: {
    background: '#fff',
    borderRadius: '14px',
    padding: '20px',
    border: '1px solid #dfe6e9',
  },
  progressCard: {
    background: '#fff',
    borderRadius: '14px',
    padding: '20px',
    marginTop: '16px',
    border: '1px solid #dfe6e9',
  },
  leaderboard: {
    borderRadius: '10px',
    overflow: 'hidden',
  },
  lbRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 16px',
    gap: '12px',
  },
  lbRank: {
    width: '40px',
    fontWeight: 'bold',
    color: '#636e72',
    fontSize: '0.9rem',
  },
  lbName: {
    flex: 1,
    fontSize: '1rem',
  },
  lbPoints: {
    fontWeight: 'bold',
    fontSize: '1rem',
    color: '#6c5ce7',
  },

  shopBtn: {
    width: '100%',
    padding: '20px',
    fontSize: '1.3rem',
    fontWeight: 'bold',
    borderRadius: '14px',
    border: 'none',
    background: 'linear-gradient(135deg, #00b894, #00cec9)',
    color: '#fff',
    cursor: 'pointer',
  },
}

export default Portal
