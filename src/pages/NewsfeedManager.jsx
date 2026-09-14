import { useState, useMemo, useEffect } from 'react'
import { getSchoolNewsfeed, createNewsfeedPost, updateNewsfeedPost, deleteNewsfeedPost, onDataChange } from '../data/store.js'

const COLORS = ['#42a5f5', '#66bb6a', '#ab47bc', '#ffab00', '#ff7043', '#26c6da', '#ec407a', '#8d6e63']
const ICONS = ['📢', '🎓', '💡', '🥷', '🪙', '🏆', '📚', '⚡', '🎯', '🔔', '✨', '🎉']

function NewsfeedManager({ orgId, onBack }) {
  const [refresh, setRefresh] = useState(0)
  const [editing, setEditing] = useState(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [icon, setIcon] = useState(ICONS[0])
  const [error, setError] = useState('')

  useEffect(() => {
    const unsub = onDataChange(() => setRefresh(r => r + 1))
    return unsub
  }, [])

  const posts = useMemo(() => getSchoolNewsfeed(orgId), [orgId, refresh])
  const isDefault = posts.length > 0 && posts[0].id === 'welcome'

  function resetForm() {
    setEditing(null)
    setTitle('')
    setBody('')
    setColor(COLORS[0])
    setIcon(ICONS[0])
    setError('')
  }

  function startEdit(post) {
    setEditing(post.id)
    setTitle(post.title)
    setBody(post.body)
    setColor(post.color || COLORS[0])
    setIcon(post.icon || ICONS[0])
    setError('')
  }

  function handleSave(e) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required.'); return }
    if (!body.trim()) { setError('Body is required.'); return }
    if (editing && editing !== 'new') {
      updateNewsfeedPost(editing, { title: title.trim(), body: body.trim(), color, icon })
    } else {
      createNewsfeedPost(orgId, { title: title.trim(), body: body.trim(), color, icon })
    }
    resetForm()
  }

  function handleDelete(postId) {
    deleteNewsfeedPost(postId)
  }

  return (
    <div className="td-page" style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="header">
        <h1 className="pixel-title">School Newsfeed</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => { resetForm(); setEditing('new') }}>+ New Post</button>
          <button className="btn btn-outline" onClick={onBack}>Back</button>
        </div>
      </div>

      {editing && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p className="pixel-heading" style={{ marginBottom: 12 }}>{editing === 'new' ? 'New Post' : 'Edit Post'}</p>
          <form onSubmit={handleSave}>
            <input
              value={title}
              onChange={e => { setTitle(e.target.value); setError('') }}
              placeholder="Post title"
              className="input"
              style={{ width: '100%', marginBottom: 10 }}
              autoFocus
            />
            <textarea
              value={body}
              onChange={e => { setBody(e.target.value); setError('') }}
              placeholder="Post body"
              className="input"
              style={{ width: '100%', minHeight: 80, marginBottom: 10, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <div>
                <span className="text-dim" style={{ fontSize: '0.72rem', marginRight: 8 }}>Color:</span>
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    style={{ width: 24, height: 24, borderRadius: 6, background: c, border: c === color ? '2px solid #fff' : '2px solid transparent', margin: 2, cursor: 'pointer' }} />
                ))}
              </div>
              <div>
                <span className="text-dim" style={{ fontSize: '0.72rem', marginRight: 8 }}>Icon:</span>
                {ICONS.map(ic => (
                  <button key={ic} type="button" onClick={() => setIcon(ic)}
                    style={{ fontSize: '1.1rem', padding: '2px 4px', borderRadius: 4, background: ic === icon ? 'rgba(255,255,255,0.12)' : 'transparent', border: 'none', cursor: 'pointer' }}>{ic}</button>
                ))}
              </div>
            </div>
            {error && <p className="error-text" style={{ marginBottom: 8 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn">{editing === 'new' ? 'Publish' : 'Save'}</button>
              <button type="button" className="btn btn-outline" onClick={resetForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {isDefault && (
        <div className="card" style={{ marginBottom: 16, textAlign: 'center' }}>
          <p className="text-dim" style={{ fontSize: '0.8rem' }}>These are default placeholder posts. Add your own to replace them.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {posts.map(post => (
          <div key={post.id} className="card" style={{ borderLeft: `4px solid ${post.color || '#42a5f5'}`, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <span style={{ fontSize: '1.6rem', flexShrink: 0 }}>{post.icon || '📢'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 4 }}>{post.title}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>{post.body}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 6 }}>
                {new Date(post.date).toLocaleDateString()}
              </div>
            </div>
            {!isDefault && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '0.68rem' }} onClick={() => startEdit(post)}>Edit</button>
                <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '0.68rem', borderColor: '#ff5252', color: '#ff5252' }} onClick={() => handleDelete(post.id)}>Delete</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default NewsfeedManager
