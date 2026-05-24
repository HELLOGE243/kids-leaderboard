import { useState } from 'react'

const MOCK_CLASSES = ['Maths', 'English', 'Science']

function Portal({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState(null)

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.greeting}>Hey, {user.name}!</h1>
        <button onClick={onLogout} style={styles.logoutBtn}>
          Switch User
        </button>
      </header>

      {/* Stats Cards */}
      <div style={styles.statsRow}>
        <div style={{ ...styles.card, background: '#ffeaa7' }}>
          <span style={styles.cardValue}>{user.coins}</span>
          <span style={styles.cardLabel}>Coins</span>
        </div>
        <div style={{ ...styles.card, background: '#a29bfe' }}>
          <span style={styles.cardValue}>{user.rewardPoints}</span>
          <span style={styles.cardLabel}>Reward Points</span>
        </div>
      </div>

      {/* Class Tabs */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>My Classes</h2>
        <div style={styles.tabRow}>
          {MOCK_CLASSES.map((cls) => (
            <button
              key={cls}
              onClick={() => setActiveTab(activeTab === cls ? null : cls)}
              style={{
                ...styles.tab,
                background: activeTab === cls ? '#6c5ce7' : '#dfe6e9',
                color: activeTab === cls ? '#fff' : '#2d3436',
              }}
            >
              {cls}
            </button>
          ))}
        </div>

        {activeTab && (
          <div style={styles.tabContent}>
            <p>Scores for <strong>{activeTab}</strong> will appear here.</p>
          </div>
        )}
      </div>

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
    alignItems: 'center',
    marginBottom: '24px',
  },
  greeting: {
    fontSize: '1.8rem',
    color: '#2d3436',
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
    marginBottom: '32px',
  },
  sectionTitle: {
    fontSize: '1.3rem',
    marginBottom: '12px',
    color: '#2d3436',
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
  tabContent: {
    marginTop: '16px',
    padding: '20px',
    background: '#fff',
    borderRadius: '12px',
    border: '1px solid #dfe6e9',
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
