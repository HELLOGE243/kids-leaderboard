import { useState, useMemo } from 'react'
import {
  getStudentById,
  getAvatarPool,
  rollEgg,
  setAvatar,
  RARITY_TIERS,
  RARITY_WEIGHTS,
} from '../data/store.js'

/**
 * Everything a student could collect, and the egg that collects it.
 *
 * Opened from the portrait on the portal. A sprite they hold is shown as it is,
 * with the stars it has earned; one they do not is a silhouette — the shape is
 * the invitation. Tiers are laid out from common up to mythic so the rarest sit
 * where the eye finishes.
 *
 * The egg costs a token and rolls on the real odds; the hatch is the sequence
 * the shop already uses, so a finished animation drops straight into it.
 */
const TIER_LABEL = {
  common: 'Common',
  rare: 'Rare',
  'super-rare': 'Super Rare',
  legendary: 'Legendary',
  mythic: 'Mythical',
}

const HATCH_MS = 1800
const REVEAL_MS = 3800

function AvatarGacha({ user, onClose, onChanged }) {
  const [refresh, setRefresh] = useState(0)
  const [eggState, setEggState] = useState(null)
  const [justEquipped, setJustEquipped] = useState(null)

  const student = getStudentById(user.id)
  const pool = useMemo(() => getAvatarPool(user.orgId), [user.orgId, refresh])
  const owned = student?.unlockedAvatars || []
  // Keyed on the refresh, not on the array: a roll mutates the student's list in
  // place, so its identity never changes and a memo watching it never notices.
  const ownedByUrl = useMemo(() => new Map(owned.map((a) => [a.url, a])), [owned, refresh])

  const tiers = useMemo(() => RARITY_TIERS.map((tier) => {
    const all = pool.filter((a) => a.rarity === tier)
    return { tier, all, held: all.filter((a) => ownedByUrl.has(a.url)).length }
  }).filter((t) => t.all.length > 0), [pool, ownedByUrl, refresh])

  const totalHeld = tiers.reduce((n, t) => n + t.held, 0)
  const totalAll = tiers.reduce((n, t) => n + t.all.length, 0)
  const tokens = student?.tokens || 0
  const canHatch = tokens >= 1 && pool.length > 0 && !eggState

  function hatch() {
    if (!canHatch) return
    setEggState('hatching')
    setTimeout(() => {
      const result = rollEgg(user.id, user.orgId)
      if (!result) { setEggState(null); return }
      setEggState({ phase: 'reveal', ...result })
      setRefresh((r) => r + 1)
      if (onChanged) onChanged()
      setTimeout(() => setEggState(null), REVEAL_MS)
    }, HATCH_MS)
  }

  function equip(url) {
    setAvatar(user.id, url)
    setJustEquipped(url)
    setRefresh((r) => r + 1)
    if (onChanged) onChanged()
  }

  return (
    <div className="modal-overlay gacha-overlay" onClick={() => { if (!eggState) onClose() }}>
      <div className="gacha" onClick={(e) => e.stopPropagation()}>
        <div className="gacha-top">
          <div>
            <p className="gacha-title">Collection</p>
            <p className="gacha-count">{totalHeld} of {totalAll} collected</p>
          </div>
          <div className="gacha-top-right">
            <span className="gacha-tokens">{tokens} 🪙</span>
            <button className="gacha-close" onClick={onClose} disabled={!!eggState}>Close</button>
          </div>
        </div>

        {/* The egg. One token, the real odds, and whatever the tier gives. */}
        <div className="gacha-egg-row">
          {!eggState && (
            <button className="gacha-egg" onClick={hatch} disabled={!canHatch}>
              <img className="gacha-egg-art" src="/sprites/egg.png" alt="" />
              <span className="gacha-egg-text">
                <span className="gacha-egg-label">Hatch an egg</span>
                <span className="gacha-egg-cost">
                  {pool.length === 0 ? 'Nothing to hatch yet' : tokens < 1 ? 'You need 1 token' : '1 token'}
                </span>
              </span>
            </button>
          )}
          {eggState === 'hatching' && (
            <div className="egg-hatching">
              <img className="gacha-egg-art egg-shake" src="/sprites/egg.png" alt="" />
              <span className="mystery-egg-label" style={{ color: 'var(--tavern-glow)' }}>Hatching…</span>
            </div>
          )}
          {eggState && eggState.phase === 'reveal' && (
            <div className="egg-reveal">
              <div className={`egg-reveal-card rarity-glow-${eggState.avatar.rarity}`}>
                <img src={eggState.avatar.url} alt="" className="gacha-reveal-img" />
              </div>
              <span className={`egg-reveal-rarity rarity-${eggState.avatar.rarity}`}>
                {(TIER_LABEL[eggState.avatar.rarity] || eggState.avatar.rarity).toUpperCase()}!
              </span>
              {eggState.avatar.name && <span className="egg-reveal-name">{eggState.avatar.name}</span>}
              {eggState.isDuplicate && <span className="egg-star-up-big">⭐ Star Up! {'★'.repeat(eggState.newStars)}</span>}
            </div>
          )}
        </div>

        {/* The odds, stated. A gacha that hides them is a worse game. */}
        <p className="gacha-odds">
          {RARITY_TIERS.map((t) => `${TIER_LABEL[t]} ${Math.round((RARITY_WEIGHTS[t] / Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0)) * 100)}%`).join(' · ')}
        </p>

        <div className="gacha-body">
          {tiers.length === 0 && (
            <p className="gacha-empty">No sprites have been added yet. Ask your teacher.</p>
          )}
          {tiers.map(({ tier, all, held }) => (
            <section key={tier} className="gacha-tier">
              <header className={`gacha-tier-head rarity-${tier}`}>
                <span className="gacha-tier-name">{TIER_LABEL[tier] || tier}</span>
                <span className="gacha-tier-count">{held}/{all.length}</span>
              </header>
              <div className="gacha-grid">
                {all.map((sprite) => {
                  const mine = ownedByUrl.get(sprite.url)
                  const equipped = student?.avatar === sprite.url
                  return (
                    <button
                      key={sprite.id}
                      className={`gacha-card${mine ? '' : ' gacha-card-locked'}${equipped ? ' gacha-card-equipped' : ''} rarity-glow-${tier}`}
                      onClick={() => mine && equip(sprite.url)}
                      disabled={!mine}
                      title={mine ? (equipped ? 'Wearing this' : `Wear ${sprite.name || 'this sprite'}`) : 'Not collected yet'}
                    >
                      <img src={sprite.url} alt="" className={`gacha-card-img${mine ? '' : ' gacha-card-img-locked'}`} />
                      {mine && mine.stars >= 2 && (
                        <span className="gacha-card-stars">{'★'.repeat(mine.stars)}</span>
                      )}
                      {equipped && <span className="gacha-card-worn">Worn</span>}
                      {mine && sprite.name && <span className="gacha-card-name">{sprite.name}</span>}
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        {justEquipped && <p className="gacha-note">Portrait changed.</p>}
      </div>
    </div>
  )
}

export default AvatarGacha
