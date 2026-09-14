import { useState } from 'react'
import '../shop.css'
import ItemIcon from '../components/ItemIcon.jsx'
import { getPoolItems, createPoolItem, updatePoolItem, deletePoolItem, getAvatarPool, addAvatarToPool, updatePoolAvatar, deletePoolAvatar, getLootChestPool, addLootChestItem, updateLootChestItem, deleteLootChestItem, getVoucherConfig, updateVoucherConfig, getRotatedShopItems, getShopRotationEpoch, RARITY_TIERS } from '../data/store.js'

const POOL_TABS = [
  { key: 'books', label: 'Books', icon: '📚', displayCount: 5 },
  { key: 'tech', label: 'Tech & Novelty', icon: '🎮', displayCount: 3 },
  { key: 'vouchers', label: 'Vouchers', icon: '🎟️' },
  { key: 'avatars', label: 'Avatar Pool', icon: '🥚' },
  { key: 'loot', label: 'Loot Chest', icon: '🎁' },
]

const LOOT_TYPES = ['wallpaper', 'theme', 'decoration']

function ShopAdmin({ orgId, onBack }) {
  const [activeTab, setActiveTab] = useState('books')
  const [refresh, setRefresh] = useState(0)
  const [confirmAction, setConfirmAction] = useState(null)

  // Pool item form (Books/Tech)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [icon, setIcon] = useState('')
  const [iconPreview, setIconPreview] = useState('')
  const [description, setDescription] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [editIconPreview, setEditIconPreview] = useState('')
  const [editDescription, setEditDescription] = useState('')

  // Avatar pool state
  const [newAvatarUrl, setNewAvatarUrl] = useState('')
  const [newAvatarName, setNewAvatarName] = useState('')
  const [newAvatarRarity, setNewAvatarRarity] = useState('common')

  // Loot chest state
  const [newLootUrl, setNewLootUrl] = useState('')
  const [newLootName, setNewLootName] = useState('')
  const [newLootRarity, setNewLootRarity] = useState('common')
  const [newLootType, setNewLootType] = useState('decoration')

  // Sprite sheet slicer (shared between avatar + loot)
  const [sheetSrc, setSheetSrc] = useState(null)
  const [sheetImg, setSheetImg] = useState(null)
  const [tileW, setTileW] = useState(0)
  const [tileH, setTileH] = useState(0)
  const [slicedTiles, setSlicedTiles] = useState([])
  const [selectedTiles, setSelectedTiles] = useState(new Set())
  const [bulkRarity, setBulkRarity] = useState('common')

  const rotated = getRotatedShopItems(orgId)
  const { nextRefreshMs } = getShopRotationEpoch()
  const refreshDate = new Date(nextRefreshMs).toLocaleDateString()

  function readFileAsDataUrl(file, callback) {
    const reader = new FileReader()
    reader.onload = (e) => callback(e.target.result)
    reader.readAsDataURL(file)
  }

  function handleIconFile(e) {
    const file = e.target.files[0]
    if (file) readFileAsDataUrl(file, (url) => { setIcon(url); setIconPreview(url) })
  }

  function handleEditIconFile(e) {
    const file = e.target.files[0]
    if (file) readFileAsDataUrl(file, (url) => { setEditIcon(url); setEditIconPreview(url) })
  }

  // Pool item CRUD (Books/Tech)
  function handleAddPoolItem(e) {
    e.preventDefault()
    if (!name.trim() || !price) return
    createPoolItem(activeTab, name.trim(), parseInt(price, 10), icon || '📦', orgId, description.trim())
    setName(''); setPrice(''); setIcon(''); setIconPreview(''); setDescription('')
    setRefresh(r => r + 1)
  }

  function startEditPoolItem(item) {
    setEditingId(item.id)
    setEditName(item.name)
    setEditPrice(String(item.price))
    setEditIcon(item.icon)
    setEditIconPreview('')
    setEditDescription(item.description || '')
  }

  function handleSaveEdit() {
    if (!editingId) return
    updatePoolItem(editingId, { name: editName.trim(), price: parseInt(editPrice, 10), icon: editIconPreview || editIcon, description: editDescription.trim() })
    setEditingId(null)
    setRefresh(r => r + 1)
  }

  function handleDeletePoolItem(id) {
    setConfirmAction({ message: 'Remove this item from the pool?', onConfirm: () => { deletePoolItem(id); setEditingId(null); setRefresh(r => r + 1) } })
  }

  // Sprite sheet slicer
  function handleSheetUpload(file) {
    if (!file || !file.type.startsWith('image/')) return
    readFileAsDataUrl(file, (url) => {
      setSheetSrc(url)
      const img = new Image()
      img.onload = () => {
        setSheetImg(img)
        if (tileW === 0) setTileW(img.width >= 256 ? 32 : 16)
        if (tileH === 0) setTileH(img.height >= 256 ? 32 : 16)
      }
      img.src = url
    })
  }

  function handleReslice() {
    if (!sheetImg || tileW < 8 || tileH < 8) return
    const tiles = []
    const cols = Math.floor(sheetImg.width / tileW)
    const rows = Math.floor(sheetImg.height / tileH)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const canvas = document.createElement('canvas')
        canvas.width = tileW; canvas.height = tileH
        const ctx = canvas.getContext('2d')
        ctx.drawImage(sheetImg, c * tileW, r * tileH, tileW, tileH, 0, 0, tileW, tileH)
        const id = ctx.getImageData(0, 0, tileW, tileH)
        const hasPixels = id.data.some((v, i) => i % 4 === 3 && v > 10)
        if (hasPixels) tiles.push({ idx: tiles.length, url: canvas.toDataURL('image/png') })
      }
    }
    setSlicedTiles(tiles)
    setSelectedTiles(new Set(tiles.map(t => t.idx)))
  }

  function toggleTile(idx) {
    setSelectedTiles(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  function handleBulkImportAvatars() {
    slicedTiles.filter(t => selectedTiles.has(t.idx)).forEach(t => addAvatarToPool(orgId, t.url, bulkRarity))
    setSlicedTiles([]); setSelectedTiles(new Set()); setSheetSrc(null); setSheetImg(null)
    setRefresh(r => r + 1)
  }

  function handleBulkImportLoot() {
    slicedTiles.filter(t => selectedTiles.has(t.idx)).forEach(t => addLootChestItem(orgId, t.url, bulkRarity, '', newLootType))
    setSlicedTiles([]); setSelectedTiles(new Set()); setSheetSrc(null); setSheetImg(null)
    setRefresh(r => r + 1)
  }

  // Voucher config
  const voucherConfig = getVoucherConfig(orgId)

  function toggleVoucherTier(idx) {
    const updated = { ...voucherConfig, tiers: voucherConfig.tiers.map((t, i) => i === idx ? { ...t, enabled: !t.enabled } : t) }
    updateVoucherConfig(orgId, updated)
    setRefresh(r => r + 1)
  }

  function updateVoucherPrice(idx, newPrice) {
    const updated = { ...voucherConfig, tiers: voucherConfig.tiers.map((t, i) => i === idx ? { ...t, price: parseInt(newPrice, 10) || t.price } : t) }
    updateVoucherConfig(orgId, updated)
    setRefresh(r => r + 1)
  }

  function renderSpriteSheetSlicer(onBulkImport) {
    return (
      <div style={{ marginBottom: 14, padding: 12, border: '1px dashed var(--wood-light)', borderRadius: 4 }}>
        <p style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.4rem', color: 'var(--tavern-glow)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Sprite Sheet Slicer</p>
        <div
          className={`slicer-drop ${sheetSrc ? 'slicer-drop-filled' : ''}`}
          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('slicer-drop-hover') }}
          onDragLeave={e => e.currentTarget.classList.remove('slicer-drop-hover')}
          onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('slicer-drop-hover'); handleSheetUpload(e.dataTransfer.files[0]) }}
          onClick={() => document.getElementById('sheet-upload').click()}
        >
          {sheetSrc
            ? <img src={sheetSrc} alt="Sheet" style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain', imageRendering: 'pixelated' }} />
            : <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.35rem', color: 'var(--wood-plank)' }}>Drop sprite sheet here or click to upload</span>
          }
          <input id="sheet-upload" type="file" accept="image/png" onChange={e => handleSheetUpload(e.target.files[0])} style={{ display: 'none' }} />
        </div>
        {sheetSrc && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.3rem', color: 'var(--tavern-text)' }}>Tile:</span>
              <input type="number" value={tileW} onChange={e => setTileW(parseInt(e.target.value, 10) || 16)} min="8" max="256" className="shop-search" style={{ width: 55, padding: '4px 6px', fontSize: '0.8rem', textAlign: 'center' }} />
              <span style={{ color: 'var(--wood-plank)' }}>×</span>
              <input type="number" value={tileH} onChange={e => setTileH(parseInt(e.target.value, 10) || 16)} min="8" max="256" className="shop-search" style={{ width: 55, padding: '4px 6px', fontSize: '0.8rem', textAlign: 'center' }} />
              <button className="shop-btn-buy" style={{ padding: '4px 10px', fontSize: '0.65rem' }} onClick={handleReslice}>Slice</button>
              <select className="shop-search" value={bulkRarity} onChange={e => setBulkRarity(e.target.value)} style={{ padding: '4px 6px', fontSize: '0.75rem' }}>
                {RARITY_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.3rem', color: 'var(--wood-plank)' }}>
                {selectedTiles.size}/{slicedTiles.length} selected
              </span>
            </div>
            {slicedTiles.length > 0 && (
              <>
                <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
                  <button className="shop-btn-cancel" style={{ padding: '3px 8px', fontSize: '0.6rem' }} onClick={() => setSelectedTiles(new Set(slicedTiles.map(t => t.idx)))}>All</button>
                  <button className="shop-btn-cancel" style={{ padding: '3px 8px', fontSize: '0.6rem' }} onClick={() => setSelectedTiles(new Set())}>None</button>
                </div>
                <div className="slicer-grid">
                  {slicedTiles.map(tile => (
                    <div key={tile.idx} className={`slicer-tile ${selectedTiles.has(tile.idx) ? 'slicer-tile-selected' : ''}`} onClick={() => toggleTile(tile.idx)}>
                      <img src={tile.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }} />
                    </div>
                  ))}
                </div>
                <button className="shop-btn-buy" style={{ marginTop: 8, padding: '8px 16px', fontSize: '0.7rem', width: '100%' }} onClick={onBulkImport}>
                  Import {selectedTiles.size} sprites as {bulkRarity}
                </button>
              </>
            )}
            <button className="shop-btn-cancel" style={{ marginTop: 6, padding: '4px 10px', fontSize: '0.6rem' }} onClick={() => { setSheetSrc(null); setSheetImg(null); setSlicedTiles([]); setSelectedTiles(new Set()) }}>Clear Sheet</button>
          </>
        )}
      </div>
    )
  }

  function renderPoolTab(poolKey, displayCount) {
    const poolItems = getPoolItems(orgId, poolKey)
    const currentlyRotated = poolKey === 'books' ? rotated.books : rotated.tech

    return (
      <>
        <div className="shop-pool-info">
          {displayCount} of {poolItems.length} items rotate every 2 weeks &middot; Next rotation: {refreshDate}
        </div>

        {/* Add item form */}
        <form onSubmit={handleAddPoolItem} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <label className="shop-upload-btn" style={{ width: 48, height: 48, minWidth: 48 }}>
            {iconPreview ? <img src={iconPreview} alt="" style={{ width: 32, height: 32, objectFit: 'contain', imageRendering: 'pixelated' }} /> : 'Icon'}
            <input type="file" accept="image/png,image/gif" onChange={handleIconFile} style={{ display: 'none' }} />
          </label>
          <input className="shop-search" placeholder="Item name" value={name} onChange={e => setName(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
          <input className="shop-search" placeholder="Price" type="number" min="1" value={price} onChange={e => setPrice(e.target.value)} style={{ width: 80 }} />
          <input className="shop-search" placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} style={{ flex: '1 1 100%' }} />
          <button type="submit" className="shop-btn-buy" style={{ padding: '8px 14px' }}>Add to Pool</button>
        </form>

        {/* Full pool grid */}
        {poolItems.length === 0 ? (
          <div className="shop-category-empty">No items in pool yet. Add some above!</div>
        ) : (
          <div className="shop-category-row-grid">
            {poolItems.map(item => (
              <div key={item.id} className="shop-item" onClick={() => startEditPoolItem(item)}>
                <span className="shop-item-icon"><ItemIcon icon={item.icon} size={28} /></span>
                <span className="shop-item-name">{item.name}</span>
                <span className="shop-item-price">{item.price}</span>
              </div>
            ))}
          </div>
        )}

        {/* Current rotation preview */}
        {currentlyRotated.length > 0 && (
          <div className="shop-pool-preview">
            <div className="shop-pool-preview-title">Currently in shop (rotates {refreshDate})</div>
            <div className="shop-category-row-grid">
              {currentlyRotated.map(item => (
                <div key={item.id} className="shop-item" style={{ borderColor: 'var(--tavern-glow)', pointerEvents: 'none' }}>
                  <span className="shop-item-icon"><ItemIcon icon={item.icon} size={28} /></span>
                  <span className="shop-item-name">{item.name}</span>
                  <span className="shop-item-price">{item.price}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    )
  }

  function renderAvatarPool() {
    const pool = getAvatarPool(orgId)
    const rarityOrder = { mythic: 0, legendary: 1, 'super-rare': 2, rare: 3, common: 4 }
    const sorted = [...pool].sort((a, b) => (rarityOrder[a.rarity] ?? 4) - (rarityOrder[b.rarity] ?? 4))

    return (
      <div style={{ padding: 16, background: 'var(--wood-grain)', border: '2px solid var(--wood-mid)', borderRadius: 4 }}>
        <p className="pixel-heading" style={{ color: 'var(--tavern-glow)', marginBottom: 12 }}>Avatar Pool — Egg Draws</p>

        {/* Add avatar form */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div
            className={`td-quick-icon-drop ${newAvatarUrl ? 'td-quick-icon-drop-filled' : ''}`}
            style={{ width: 52, height: 52, border: '2px dashed var(--wood-light)' }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('td-quick-icon-drop-hover') }}
            onDragLeave={e => e.currentTarget.classList.remove('td-quick-icon-drop-hover')}
            onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('td-quick-icon-drop-hover'); const file = e.dataTransfer.files[0]; if (file && file.type.startsWith('image/')) readFileAsDataUrl(file, url => setNewAvatarUrl(url)) }}
            onClick={() => document.getElementById('avatar-pool-upload').click()}
          >
            {newAvatarUrl
              ? <img src={newAvatarUrl} alt="" style={{ width: 40, height: 40, objectFit: 'contain', imageRendering: 'pixelated' }} />
              : <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.25rem', color: 'var(--wood-plank)', textAlign: 'center' }}>Drop PNG</span>
            }
            <input id="avatar-pool-upload" type="file" accept="image/png,image/gif" onChange={e => { const file = e.target.files[0]; if (file) readFileAsDataUrl(file, url => setNewAvatarUrl(url)) }} style={{ display: 'none' }} />
          </div>
          <input className="shop-search" placeholder="Name (optional)" value={newAvatarName} onChange={e => setNewAvatarName(e.target.value)} style={{ flex: 1, minWidth: 100, padding: '6px 10px', fontSize: '0.8rem' }} />
          <select className="shop-search" value={newAvatarRarity} onChange={e => setNewAvatarRarity(e.target.value)} style={{ width: 120, padding: '6px 8px', fontSize: '0.8rem' }}>
            {RARITY_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="shop-btn-buy" style={{ padding: '6px 12px', fontSize: '0.7rem' }} onClick={() => {
            if (!newAvatarUrl) return
            addAvatarToPool(orgId, newAvatarUrl, newAvatarRarity, newAvatarName.trim())
            setNewAvatarUrl(''); setNewAvatarName(''); setNewAvatarRarity('common')
            setRefresh(r => r + 1)
          }}>Add</button>
        </div>

        {renderSpriteSheetSlicer(handleBulkImportAvatars)}

        {/* Pool grid */}
        {sorted.length === 0 ? (
          <p style={{ color: 'var(--wood-plank)', fontSize: '0.8rem', textAlign: 'center', padding: 12 }}>No avatars in pool. Add some above!</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: 8 }}>
            {sorted.map(av => (
              <div key={av.id} className={`avatar-cell avatar-rarity-${av.rarity}`} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 6, gap: 2 }}>
                <img src={av.url} alt="" style={{ width: 36, height: 36, objectFit: 'contain', imageRendering: 'pixelated' }} />
                {av.name && <span style={{ fontSize: '0.6rem', color: 'var(--tavern-text)', textAlign: 'center', lineHeight: 1.2 }}>{av.name}</span>}
                <span className={`rarity-label rarity-${av.rarity}`} style={{ fontSize: '0.25rem' }}>{av.rarity}</span>
                <select
                  value={av.rarity}
                  onChange={e => { updatePoolAvatar(av.id, { rarity: e.target.value }); setRefresh(r => r + 1) }}
                  style={{ fontSize: '0.6rem', padding: '1px 2px', background: 'var(--wood-grain)', color: 'var(--tavern-text)', border: '1px solid var(--wood-mid)', borderRadius: 2, width: '100%' }}
                >
                  {RARITY_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button
                  onClick={() => setConfirmAction({ message: `Remove "${av.name || 'this avatar'}" from the pool?`, onConfirm: () => { deletePoolAvatar(av.id); setRefresh(r => r + 1) } })}
                  style={{ position: 'absolute', top: 2, right: 2, background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.65rem', padding: 0, lineHeight: 1 }}
                >✕</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 10, textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.3rem', color: 'var(--wood-plank)' }}>
            Drop rates: Common 50% · Rare 30% · Super-Rare 12% · Legendary 6% · Mythic 2%
          </span>
        </div>
      </div>
    )
  }

  function renderLootChestPool() {
    const pool = getLootChestPool(orgId)
    const rarityOrder = { mythic: 0, legendary: 1, 'super-rare': 2, rare: 3, common: 4 }
    const sorted = [...pool].sort((a, b) => (rarityOrder[a.rarity] ?? 4) - (rarityOrder[b.rarity] ?? 4))

    return (
      <div style={{ padding: 16, background: 'var(--wood-grain)', border: '2px solid var(--wood-mid)', borderRadius: 4 }}>
        <p className="pixel-heading" style={{ color: 'var(--tavern-glow)', marginBottom: 4 }}>Loot Chest Pool — Treasure Draws</p>
        <p style={{ color: 'var(--wood-plank)', fontSize: '0.75rem', marginBottom: 12 }}>Decorative rewards: wallpapers, themes, decorations for student portals.</p>

        {/* Add loot item form */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div
            className={`td-quick-icon-drop ${newLootUrl ? 'td-quick-icon-drop-filled' : ''}`}
            style={{ width: 52, height: 52, border: '2px dashed var(--wood-light)' }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('td-quick-icon-drop-hover') }}
            onDragLeave={e => e.currentTarget.classList.remove('td-quick-icon-drop-hover')}
            onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('td-quick-icon-drop-hover'); const file = e.dataTransfer.files[0]; if (file && file.type.startsWith('image/')) readFileAsDataUrl(file, url => setNewLootUrl(url)) }}
            onClick={() => document.getElementById('loot-pool-upload').click()}
          >
            {newLootUrl
              ? <img src={newLootUrl} alt="" style={{ width: 40, height: 40, objectFit: 'contain', imageRendering: 'pixelated' }} />
              : <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.25rem', color: 'var(--wood-plank)', textAlign: 'center' }}>Drop PNG</span>
            }
            <input id="loot-pool-upload" type="file" accept="image/png,image/gif" onChange={e => { const file = e.target.files[0]; if (file) readFileAsDataUrl(file, url => setNewLootUrl(url)) }} style={{ display: 'none' }} />
          </div>
          <input className="shop-search" placeholder="Name (optional)" value={newLootName} onChange={e => setNewLootName(e.target.value)} style={{ flex: 1, minWidth: 100, padding: '6px 10px', fontSize: '0.8rem' }} />
          <select className="shop-search" value={newLootRarity} onChange={e => setNewLootRarity(e.target.value)} style={{ width: 120, padding: '6px 8px', fontSize: '0.8rem' }}>
            {RARITY_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="shop-search" value={newLootType} onChange={e => setNewLootType(e.target.value)} style={{ width: 120, padding: '6px 8px', fontSize: '0.8rem' }}>
            {LOOT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="shop-btn-buy" style={{ padding: '6px 12px', fontSize: '0.7rem' }} onClick={() => {
            if (!newLootUrl) return
            addLootChestItem(orgId, newLootUrl, newLootRarity, newLootName.trim(), newLootType)
            setNewLootUrl(''); setNewLootName(''); setNewLootRarity('common'); setNewLootType('decoration')
            setRefresh(r => r + 1)
          }}>Add</button>
        </div>

        {renderSpriteSheetSlicer(handleBulkImportLoot)}

        {/* Pool grid */}
        {sorted.length === 0 ? (
          <p style={{ color: 'var(--wood-plank)', fontSize: '0.8rem', textAlign: 'center', padding: 12 }}>No loot items in pool. Add some above!</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: 8 }}>
            {sorted.map(item => (
              <div key={item.id} className={`avatar-cell avatar-rarity-${item.rarity}`} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 6, gap: 2 }}>
                <img src={item.url} alt="" style={{ width: 36, height: 36, objectFit: 'contain', imageRendering: 'pixelated' }} />
                {item.name && <span style={{ fontSize: '0.6rem', color: 'var(--tavern-text)', textAlign: 'center', lineHeight: 1.2 }}>{item.name}</span>}
                <span className={`rarity-label rarity-${item.rarity}`} style={{ fontSize: '0.25rem' }}>{item.rarity}</span>
                <span style={{ fontSize: '0.5rem', color: 'var(--parchment-dark)' }}>{item.lootType}</span>
                <select
                  value={item.rarity}
                  onChange={e => { updateLootChestItem(item.id, { rarity: e.target.value }); setRefresh(r => r + 1) }}
                  style={{ fontSize: '0.6rem', padding: '1px 2px', background: 'var(--wood-grain)', color: 'var(--tavern-text)', border: '1px solid var(--wood-mid)', borderRadius: 2, width: '100%' }}
                >
                  {RARITY_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button
                  onClick={() => setConfirmAction({ message: `Remove "${item.name || 'this item'}" from the loot pool?`, onConfirm: () => { deleteLootChestItem(item.id); setRefresh(r => r + 1) } })}
                  style={{ position: 'absolute', top: 2, right: 2, background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.65rem', padding: 0, lineHeight: 1 }}
                >✕</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 10, textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.3rem', color: 'var(--wood-plank)' }}>
            Drop rates: Common 50% · Rare 30% · Super-Rare 12% · Legendary 6% · Mythic 2%
          </span>
        </div>
      </div>
    )
  }

  function renderVoucherConfig() {
    return (
      <div style={{ padding: 16, background: 'var(--wood-grain)', border: '2px solid var(--wood-mid)', borderRadius: 4 }}>
        <p className="pixel-heading" style={{ color: 'var(--tavern-glow)', marginBottom: 12 }}>Voucher Settings</p>
        <p style={{ color: 'var(--wood-plank)', fontSize: '0.75rem', marginBottom: 16 }}>Gift vouchers are real rewards fulfilled by the teacher. Toggle tiers on/off and set coin prices.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {voucherConfig.tiers.map((tier, idx) => (
            <div key={tier.amount} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--wood-dark)', border: '2px solid var(--wood-mid)', borderRadius: 4, opacity: tier.enabled ? 1 : 0.5 }}>
              <span style={{ fontSize: '1.4rem' }}>🎟️</span>
              <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.6rem', color: 'var(--tavern-text)', flex: 1 }}>${tier.amount} Gift Voucher</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.35rem', color: 'var(--parchment-dark)' }}>Price:</span>
                <input
                  className="shop-search"
                  type="number"
                  min="1"
                  value={tier.price}
                  onChange={e => updateVoucherPrice(idx, e.target.value)}
                  style={{ width: 80, padding: '4px 8px', fontSize: '0.8rem', textAlign: 'center' }}
                />
                <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '0.35rem', color: 'var(--coin)' }}>coins</span>
              </div>
              <button
                className={tier.enabled ? 'shop-btn-buy' : 'shop-btn-cancel'}
                style={{ padding: '6px 12px', fontSize: '0.6rem' }}
                onClick={() => toggleVoucherTier(idx)}
              >
                {tier.enabled ? 'ON' : 'OFF'}
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="shop-page">
      {/* Header */}
      <div className="shop-sign-row">
        <button className="shop-back" onClick={onBack}>Back</button>
        <div className="shop-sign" style={{ flex: 1, marginBottom: 0 }}>
          <span className="shop-sign-title" style={{ fontSize: '0.6rem' }}>Shop Manager</span>
        </div>
      </div>

      {/* Pool Tabs */}
      <div className="shop-pool-tabs">
        {POOL_TABS.map(tab => (
          <button
            key={tab.key}
            className={`shop-pool-tab ${activeTab === tab.key ? 'shop-pool-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {(activeTab === 'books' || activeTab === 'tech') && renderPoolTab(activeTab, POOL_TABS.find(t => t.key === activeTab).displayCount)}
      {activeTab === 'vouchers' && renderVoucherConfig()}
      {activeTab === 'avatars' && renderAvatarPool()}
      {activeTab === 'loot' && renderLootChestPool()}

      {/* Edit Pool Item Modal */}
      {editingId && (
        <div className="modal-overlay" onClick={() => setEditingId(null)}>
          <div className="shop-modal" onClick={e => e.stopPropagation()}>
            <p className="pixel-heading" style={{ color: 'var(--tavern-glow)', marginBottom: 16 }}>Edit Item</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 48, height: 48, border: '2px solid var(--wood-light)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--wood-grain)' }}>
                  {editIconPreview || editIcon?.startsWith('data:')
                    ? <img src={editIconPreview || editIcon} alt="" style={{ width: 40, height: 40, objectFit: 'contain', imageRendering: 'pixelated' }} />
                    : <span style={{ fontSize: '1.5rem' }}>{editIcon || '📦'}</span>
                  }
                </div>
                <label className="shop-upload-btn" style={{ flex: 1 }}>
                  Upload PNG
                  <input type="file" accept="image/png" onChange={handleEditIconFile} style={{ display: 'none' }} />
                </label>
              </div>
              <input className="shop-search" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name" />
              <input className="shop-search" value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Description" />
              <input className="shop-search" type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} placeholder="Price" />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="shop-btn-buy" onClick={handleSaveEdit} style={{ flex: 1 }}>Save</button>
                <button className="shop-btn-cancel" onClick={() => handleDeletePoolItem(editingId)} style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <p className="modal-text">{confirmAction.message}</p>
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={() => { confirmAction.onConfirm(); setConfirmAction(null) }}>Yes, Delete</button>
              <button className="btn btn-outline" onClick={() => setConfirmAction(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ShopAdmin
