import { useState, useEffect, useRef, useCallback } from 'react'
import '../shop.css'
import ItemIcon from '../components/ItemIcon.jsx'
import { getStudentById, purchasePoolItem, getPurchasesForStudent, setAvatar, rollEgg, rollLootChest, getAvatarPool, getLootChestPool, getRotatedShopItems, getShopRotationEpoch, getPurchasedTracks, purchaseTrack, getRotatedTracks, RARITY_TIERS } from '../data/store.js'
import { MUSIC_TRACKS, previewTrack, playCoinSound } from '../utils/soundManager.js'

function Shop({ user, onBack }) {
  const [tab, setTab] = useState('shop')
  const [confirmItem, setConfirmItem] = useState(null)
  const [confirmStep, setConfirmStep] = useState('view')
  const [purchaseResult, setPurchaseResult] = useState(null)
  const [notification, setNotification] = useState(null)
  const [showCelebration, setShowCelebration] = useState(false)
  const [showAvatarPopup, setShowAvatarPopup] = useState(false)
  const [selectedAvatar, setSelectedAvatar] = useState(null)
  const [eggState, setEggState] = useState(null)
  const [chestState, setChestState] = useState(null)
  const [refresh, setRefresh] = useState(0)
  const [countdown, setCountdown] = useState('')
  const [showDoors, setShowDoors] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setShowDoors(false), 2800)
    return () => clearTimeout(timer)
  }, [])

  const student = getStudentById(user.id)
  const purchases = getPurchasesForStudent(user.id)
  const rotated = getRotatedShopItems(user.orgId)

  // Refresh countdown timer
  useEffect(() => {
    function update() {
      const { nextRefreshMs } = getShopRotationEpoch()
      const diff = nextRefreshMs - Date.now()
      if (diff <= 0) { setCountdown('Refreshing...'); return }
      const days = Math.floor(diff / (86400000))
      const hours = Math.floor((diff % 86400000) / 3600000)
      const mins = Math.floor((diff % 3600000) / 60000)
      if (days > 0) setCountdown(`${days}d ${hours}h`)
      else setCountdown(`${hours}h ${mins}m`)
    }
    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [])

  function handleBuy() {
    if (!confirmItem) return
    const result = purchasePoolItem(user.id, confirmItem)
    if (result) {
      setPurchaseResult('success')
      setShowCelebration(true)
      setNotification(`"${confirmItem.name}" was bought!`)
      setTimeout(() => setShowCelebration(false), 3500)
      setTimeout(() => setNotification(null), 5500)
    } else {
      setPurchaseResult('fail')
    }
    setTimeout(() => {
      setConfirmItem(null)
      setPurchaseResult(null)
      setConfirmStep('view')
      setRefresh(r => r + 1)
    }, 2000)
  }

  function handleSaveAvatar() {
    if (!selectedAvatar) return
    setAvatar(user.id, selectedAvatar)
    setShowAvatarPopup(false)
    setSelectedAvatar(null)
    setRefresh(r => r + 1)
  }

  function handleMysteryEgg() {
    if (eggState) return
    const pool = getAvatarPool(user.orgId)
    if (pool.length === 0) return
    setEggState('hatching')
    setTimeout(() => {
      const result = rollEgg(user.id, user.orgId)
      if (!result) { setEggState(null); return }
      setEggState({ phase: 'reveal', avatar: result.avatar, isDuplicate: result.isDuplicate, newStars: result.newStars })
      setTimeout(() => { setEggState(null); setRefresh(r => r + 1) }, 3500)
    }, 1800)
  }

  function handleLootChest() {
    if (chestState) return
    const pool = getLootChestPool(user.orgId)
    if (pool.length === 0) return
    setChestState('opening')
    setTimeout(() => {
      const result = rollLootChest(user.id, user.orgId)
      if (!result) { setChestState(null); return }
      setChestState({ phase: 'reveal', loot: result.loot, isDuplicate: result.isDuplicate })
      setTimeout(() => { setChestState(null); setRefresh(r => r + 1) }, 3500)
    }, 1800)
  }

  const handleTilt = useCallback((e) => {
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    el.style.transform = `perspective(400px) rotateY(${x * 25}deg) rotateX(${-y * 25}deg) scale(1.08)`
  }, [])
  const handleTiltLeave = useCallback((e) => {
    e.currentTarget.style.transform = ''
  }, [])

  const rarityOrder = { mythic: 0, legendary: 1, 'super-rare': 2, rare: 3, common: 4 }
  const sortedAvatars = [...(student.unlockedAvatars || [])].sort((a, b) => (rarityOrder[a.rarity] ?? 4) - (rarityOrder[b.rarity] ?? 4))

  function renderCategoryRow(title, icon, items, currencyOverride) {
    return (
      <div className="shop-category-row">
        <div className="shop-category-row-header">
          <span>{icon}</span> {title}
        </div>
        {items.length === 0 ? (
          <div className="shop-category-empty">No items available</div>
        ) : (
          <div className="shop-category-row-grid">
            {items.map(item => (
              <div key={item.id} className="shop-item shop-item-tilt" onClick={() => { setConfirmItem({ ...item, currency: currencyOverride || item.currency }); setConfirmStep('view') }} onMouseMove={handleTilt} onMouseLeave={handleTiltLeave}>
                <span className="shop-item-icon"><ItemIcon icon={item.icon} size={52} /></span>
                <div className="shop-item-pedestal" />
                <span className="shop-item-name">{item.name}</span>
                <span className="shop-item-price" style={item.currency === 'tokens' || currencyOverride === 'tokens' ? { color: 'var(--token)', textShadow: '0 0 4px rgba(0,255,245,0.4)' } : {}}>
                  {item.price} {item.currency === 'tokens' || currencyOverride === 'tokens' ? 'T' : '$'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
    {showDoors && (
      <div className="shop-door-overlay">
        <div className="shop-door-left"><span className="shop-door-text">Academy</span></div>
        <div className="shop-door-right"><span className="shop-door-text">Store</span></div>
      </div>
    )}
    <div className="shop-backdrop" style={{ background: 'url("/wallpapers/shop-bg.webp") center / cover no-repeat' }}>
    <div className="shop-page">
      {/* Notification Banner */}
      {notification && <div className="shop-notification">{notification}</div>}

      {/* Celebration Particles */}
      {showCelebration && (
        <div className="shop-celebration">
          {Array.from({ length: 50 }).map((_, i) => (
            <div key={i} className="shop-particle" style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 0.8}s`,
              animationDuration: `${1.5 + Math.random() * 2}s`,
              width: `${10 + Math.random() * 12}px`,
              height: `${10 + Math.random() * 12}px`,
              background: ['#ffd700', '#ff9d2e', '#00fff5', '#e94560', '#00e676', '#fff', '#c0c0c0'][i % 7],
              borderRadius: i % 3 === 0 ? '50%' : '2px',
            }} />
          ))}
        </div>
      )}

      {/* Back Button */}
      <div style={{ marginBottom: 12 }}>
        <button className="shop-back" onClick={onBack}>Back</button>
      </div>

      {/* Banner */}
      <div className="shop-sign">
        <div className="shop-sign-title">Academy Store</div>
      </div>

      {/* Balance + Avatar */}
      <div className="shop-balance-header">
        <div className="shop-balance-coin">
          <img src="/coin.png" alt="" style={{ width: 20, height: 20 }} />
          {student.coins}
        </div>
        <div className="shop-balance-token">
          <img src="/token.png" alt="" style={{ width: 20, height: 20 }} />
          {student.tokens}
        </div>
        <div className="shop-refresh-timer">Refreshes in: {countdown}</div>
        <div className="shop-balance-avatar" onClick={() => setShowAvatarPopup(true)}>
          {student.avatar ? (
            <img src={student.avatar} alt="Avatar" className="shop-balance-avatar-img" />
          ) : (
            <span className="shop-balance-avatar-empty">?</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="shop-tabs">
        <button className={`shop-tab ${tab === 'shop' ? 'shop-tab-active' : ''}`} onClick={() => setTab('shop')}>Shop</button>
        <button className={`shop-tab ${tab === 'history' ? 'shop-tab-active' : ''}`} onClick={() => setTab('history')}>Purchases</button>
      </div>

      {tab === 'shop' && (
        <div className="shop-fixed-categories">
          {/* Books */}
          {renderCategoryRow('Books', '📚', rotated.books)}

          {/* Tech & Novelty */}
          {renderCategoryRow('Tech & Novelty', '🎮', rotated.tech)}

          {/* Vouchers */}
          {renderCategoryRow('Vouchers', '🎟️', rotated.vouchers)}

          {/* Cosmetics */}
          <div className="shop-category-row">
            <div className="shop-category-row-header">
              <span>✨</span> Cosmetics
            </div>
            <div className="shop-category-row-grid">
              {/* Avatar Sprite Egg */}
              <div className="shop-item shop-item-tilt" onClick={student.tokens >= 1 ? handleMysteryEgg : undefined} onMouseMove={handleTilt} onMouseLeave={handleTiltLeave} style={{ opacity: student.tokens < 1 || getAvatarPool(user.orgId).length === 0 ? 0.4 : 1, cursor: student.tokens >= 1 && getAvatarPool(user.orgId).length > 0 ? 'pointer' : 'not-allowed' }}>
                {eggState === 'hatching' ? (
                  <span className="shop-item-icon egg-shake">🥚</span>
                ) : eggState && eggState.phase === 'reveal' ? (
                  <>
                    <div className={`egg-reveal-card rarity-glow-${eggState.avatar.rarity}`} style={{ width: 48, height: 48 }}>
                      <img src={eggState.avatar.url} alt="" style={{ width: 44, height: 44, objectFit: 'contain', imageRendering: 'pixelated' }} />
                    </div>
                    <span className={`rarity-label rarity-${eggState.avatar.rarity}`} style={{ fontSize: '0.3rem' }}>{eggState.avatar.rarity}</span>
                    {eggState.isDuplicate && <span className="egg-star-up">⭐ Star Up! {'★'.repeat(eggState.newStars)}</span>}
                  </>
                ) : (
                  <span className="shop-item-icon">🥚</span>
                )}
                <div className="shop-item-pedestal" />
                <span className="shop-item-name">Sprite Egg</span>
                <span className="shop-item-price" style={{ color: 'var(--token)', textShadow: '0 0 4px rgba(0,255,245,0.4)' }}>1 T</span>
              </div>

              {/* Treasure Loot Chest */}
              <div className="shop-item shop-item-tilt" onClick={student.tokens >= 1 ? handleLootChest : undefined} onMouseMove={handleTilt} onMouseLeave={handleTiltLeave} style={{ opacity: student.tokens < 1 || getLootChestPool(user.orgId).length === 0 ? 0.4 : 1, cursor: student.tokens >= 1 && getLootChestPool(user.orgId).length > 0 ? 'pointer' : 'not-allowed' }}>
                {chestState === 'opening' ? (
                  <span className="shop-item-icon loot-chest-hatching">🎁</span>
                ) : chestState && chestState.phase === 'reveal' ? (
                  <>
                    <div className={`loot-chest-reveal rarity-glow-${chestState.loot.rarity}`} style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={chestState.loot.url} alt="" style={{ width: 44, height: 44, objectFit: 'contain', imageRendering: 'pixelated' }} />
                    </div>
                    <span className={`rarity-label rarity-${chestState.loot.rarity}`} style={{ fontSize: '0.3rem' }}>{chestState.loot.rarity}</span>
                    {chestState.isDuplicate && <span style={{ fontSize: '0.5rem', color: 'var(--wood-plank)' }}>Dupe</span>}
                  </>
                ) : (
                  <span className="shop-item-icon">🎁</span>
                )}
                <div className="shop-item-pedestal" />
                <span className="shop-item-name">Loot Chest</span>
                <span className="shop-item-price" style={{ color: 'var(--token)', textShadow: '0 0 4px rgba(0,255,245,0.4)' }}>1 T</span>
              </div>
            </div>
          </div>

          {/* Jukebox */}
          {(() => {
            const { onSale, ownedOffSale } = getRotatedTracks(MUSIC_TRACKS, user.id)
            const ownedIds = getPurchasedTracks(user.id)
            const renderTrack = (track, isSale) => {
              const owned = ownedIds.includes(track.id)
              return (
                <div key={track.id} className={`shop-item shop-item-tilt shop-jukebox-item ${owned ? 'shop-jukebox-owned' : ''}`} onMouseMove={handleTilt} onMouseLeave={handleTiltLeave}>
                  {isSale && !owned && <span className="shop-on-sale-badge">On Sale</span>}
                  <span className="shop-item-icon">{track.emoji}</span>
                  <div className="shop-item-pedestal" />
                  <span className="shop-item-name">{track.name}</span>
                  <button className="shop-jukebox-preview" onClick={(e) => { e.stopPropagation(); previewTrack(track.id) }}>{'\u{25B6}'} Preview</button>
                  {owned ? (
                    <span className="shop-jukebox-owned-label">Owned</span>
                  ) : (
                    <button className="shop-jukebox-buy" onClick={(e) => {
                      e.stopPropagation()
                      const ok = purchaseTrack(user.id, track.id, track.price)
                      if (ok) {
                        playCoinSound()
                        setNotification(`"${track.name}" unlocked!`)
                        setTimeout(() => setNotification(null), 4000)
                        setRefresh(r => r + 1)
                      } else {
                        setNotification('Not enough coins!')
                        setTimeout(() => setNotification(null), 3000)
                      }
                    }}>{track.price} $</button>
                  )}
                </div>
              )
            }
            return (
              <div className="shop-category-row">
                <div className="shop-category-row-header">
                  <span>{'\u{1F3B5}'}</span> Jukebox — This Rotation
                </div>
                <div className="shop-category-row-grid">
                  {onSale.map(t => renderTrack(t, true))}
                </div>
                {ownedOffSale.length > 0 && <>
                  <div className="shop-category-row-header shop-owned-sub-header">
                    <span>{'\u{1F3B6}'}</span> Your Collection
                  </div>
                  <div className="shop-category-row-grid">
                    {ownedOffSale.map(t => renderTrack(t, false))}
                  </div>
                </>}
              </div>
            )
          })()}
        </div>
      )}

      {tab === 'history' && (
        <div className="purchase-list">
          {purchases.length === 0 ? (
            <div className="shop-empty">No purchases yet. Go spend some coins!</div>
          ) : (
            purchases.map(p => (
              <div key={p.id} className="purchase-row">
                <span className="purchase-icon"><ItemIcon icon={p.icon} size={24} /></span>
                <div className="purchase-info">
                  <div className="purchase-name">{p.itemName}</div>
                  <div className="purchase-date">{new Date(p.date).toLocaleDateString()}</div>
                </div>
                <span className="purchase-cost" style={p.currency === 'tokens' ? { color: 'var(--token)' } : {}}>-{p.price} {p.currency === 'tokens' ? 'T' : '$'}</span>
                <span className={`purchase-status purchase-status-${p.status || 'pending'}`}>
                  {p.status === 'fulfilled' ? 'Fulfilled' : p.status === 'on-hold' ? 'On Hold' : p.status === 'cancelled' ? 'Cancelled' : 'Pending'}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Purchase Modal */}
      {confirmItem && !confirmItem.type && (
        <div className="modal-overlay" onClick={() => { if (!purchaseResult) setConfirmItem(null) }}>
          <div className="shop-modal" onClick={e => e.stopPropagation()}>
            {!purchaseResult && confirmStep === 'view' && (
              <>
                <div className="shop-modal-icon"><ItemIcon icon={confirmItem.icon} size={48} /></div>
                <div className="shop-modal-name">{confirmItem.name}</div>
                {confirmItem.description && (
                  <p style={{ fontStyle: 'italic', color: 'var(--tavern-text)', fontSize: '0.8rem', marginBottom: 12, opacity: 0.8 }}>
                    {confirmItem.description}
                  </p>
                )}
                <div className="shop-modal-price" style={confirmItem.currency === 'tokens' ? { color: 'var(--token)' } : {}}>
                  {confirmItem.price} {confirmItem.currency === 'tokens' ? 'tokens' : 'coins'}
                </div>
                <div className="shop-modal-actions">
                  {((confirmItem.currency === 'tokens' && student.tokens >= confirmItem.price) || (confirmItem.currency !== 'tokens' && student.coins >= confirmItem.price)) ? (
                    <button className="shop-btn-buy" onClick={() => setConfirmStep('confirm')}>Buy Item</button>
                  ) : (
                    <button className="shop-btn-buy" style={{ opacity: 0.4, cursor: 'not-allowed', background: 'var(--wood-plank)', borderColor: 'var(--wood-plank)' }} disabled>
                      Not Enough {confirmItem.currency === 'tokens' ? 'Tokens' : 'Coins'}
                    </button>
                  )}
                  <button className="shop-btn-cancel" onClick={() => setConfirmItem(null)}>Close</button>
                </div>
              </>
            )}
            {!purchaseResult && confirmStep === 'confirm' && (
              <>
                <div className="shop-modal-icon"><ItemIcon icon={confirmItem.icon} size={48} /></div>
                <div className="shop-modal-name">Confirm Purchase?</div>
                <p style={{ color: 'var(--tavern-text)', fontSize: '0.8rem', marginBottom: 16 }}>
                  Spend <span style={{ color: confirmItem.currency === 'tokens' ? 'var(--token)' : 'var(--coin)', fontWeight: 'bold' }}>{confirmItem.price} {confirmItem.currency === 'tokens' ? 'tokens' : 'coins'}</span> on {confirmItem.name}?
                </p>
                <div className="shop-modal-actions">
                  <button className="shop-btn-buy" onClick={handleBuy}>Confirm</button>
                  <button className="shop-btn-cancel" onClick={() => setConfirmStep('view')}>Back</button>
                </div>
              </>
            )}
            {purchaseResult === 'success' && (
              <>
                <div className="shop-modal-icon" style={{ fontSize: '4rem' }}>✅</div>
                <div className="shop-modal-name" style={{ color: 'var(--success)' }}>Purchased!</div>
              </>
            )}
            {purchaseResult === 'fail' && (
              <>
                <div className="shop-modal-icon" style={{ fontSize: '4rem' }}>❌</div>
                <div className="shop-modal-name" style={{ color: 'var(--danger)' }}>Failed!</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Avatar Popup */}
      {showAvatarPopup && (
        <div className="modal-overlay" onClick={() => { if (!eggState) setShowAvatarPopup(false) }}>
          <div className="shop-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <p className="shop-sign-title" style={{ fontSize: '0.7rem', marginBottom: 16 }}>Choose Avatar</p>

            <div style={{ marginBottom: 16 }}>
              <div className="shop-avatar-current">
                {student.avatar ? (
                  <img src={student.avatar} alt="Current" style={{ width: 64, height: 64, objectFit: 'contain', imageRendering: 'pixelated' }} />
                ) : (
                  <span className="shop-avatar-current-empty">?</span>
                )}
              </div>
              <span className="shop-avatar-label" style={{ display: 'block', textAlign: 'center', marginTop: 6 }}>Current</span>
            </div>

            <div className="avatar-grid">
              {sortedAvatars.length === 0 ? (
                <p style={{ color: 'var(--wood-plank)', fontSize: '0.8rem', gridColumn: '1/-1', textAlign: 'center', padding: 20 }}>
                  No avatars unlocked yet. Hatch a Sprite Egg!
                </p>
              ) : (
                sortedAvatars.map((a, i) => (
                  <div key={i} className={`avatar-cell avatar-rarity-${a.rarity} ${selectedAvatar === a.url ? 'avatar-cell-selected' : ''} ${a.stars >= 2 ? 'avatar-starred' : ''}`} onClick={() => setSelectedAvatar(a.url)}>
                    {a.stars >= 2 && <div className={`avatar-particles avatar-particles-${a.rarity}`} />}
                    <img src={a.url} alt="" style={{ width: 40, height: 40, objectFit: 'contain', imageRendering: 'pixelated' }} />
                    <span className={`avatar-rarity-badge rarity-${a.rarity}`}>{a.rarity[0].toUpperCase()}</span>
                    <span className="avatar-stars">{'★'.repeat(a.stars || 1)}</span>
                  </div>
                ))
              )}
            </div>

            <div className="rarity-legend">
              {RARITY_TIERS.map(t => (
                <span key={t} className={`rarity-label rarity-${t}`}>{t}</span>
              ))}
            </div>

            {/* Mystery Egg inside popup too */}
            <div className="mystery-egg-row">
              {!eggState && (
                <div className="mystery-egg" onClick={student.tokens >= 1 ? handleMysteryEgg : undefined} style={{ opacity: student.tokens < 1 ? 0.4 : 1, cursor: student.tokens >= 1 ? 'pointer' : 'not-allowed' }}>
                  <span style={{ fontSize: '2.5rem' }}>🥚</span>
                  <span className="mystery-egg-label">Mystery Egg</span>
                  <span className="mystery-egg-cost">1 Token</span>
                </div>
              )}
              {eggState === 'hatching' && (
                <div className="egg-hatching">
                  <span className="egg-shake">🥚</span>
                  <span className="mystery-egg-label" style={{ color: 'var(--tavern-glow)' }}>Hatching...</span>
                </div>
              )}
              {eggState && eggState.phase === 'reveal' && (
                <div className="egg-reveal">
                  <div className={`egg-reveal-card rarity-glow-${eggState.avatar.rarity}`}>
                    <img src={eggState.avatar.url} alt="" style={{ width: 64, height: 64, objectFit: 'contain', imageRendering: 'pixelated' }} />
                  </div>
                  <span className={`egg-reveal-rarity rarity-${eggState.avatar.rarity}`}>{eggState.avatar.rarity.toUpperCase()}!</span>
                  {eggState.avatar.name && <span className="egg-reveal-name">{eggState.avatar.name}</span>}
                  {eggState.isDuplicate && <span className="egg-star-up-big">⭐ Star Up! {'★'.repeat(eggState.newStars)}</span>}
                </div>
              )}
              {!eggState && student.tokens < 1 && (
                <span style={{ fontSize: '0.7rem', color: 'var(--wood-plank)' }}>Not enough tokens</span>
              )}
            </div>

            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <span className="font-pixel-sm text-token">{student.tokens} tokens</span>
            </div>

            <div className="shop-modal-actions" style={{ marginTop: 12 }}>
              {selectedAvatar && <button className="shop-btn-buy" onClick={handleSaveAvatar}>Save Avatar</button>}
              <button className="shop-btn-cancel" onClick={() => { setShowAvatarPopup(false); setSelectedAvatar(null); setEggState(null) }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
    </>
  )
}

export default Shop
