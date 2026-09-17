import { useState } from 'react'
import { getPolicy, savePolicy, getPolicyAcceptances } from '../data/store.js'

// The school's refund and credit policy: written here, shown to every student
// when they sign in, and acknowledged with a tick. Raising the version asks
// everyone again, which is what a change of terms needs.

export default function PolicyEditor() {
  const [, bump] = useState(0)
  const policy = getPolicy()
  const [title, setTitle] = useState(policy.title || 'Refunds and credits')
  const [body, setBody] = useState(policy.body || '')
  const [showWho, setShowWho] = useState(false)
  const [saved, setSaved] = useState('')

  const acceptances = showWho ? getPolicyAcceptances() : []
  const dirty = title !== (policy.title || '') || body !== (policy.body || '')

  function save(opts = {}) {
    savePolicy({ title, body, ...opts })
    setSaved(opts.published === true ? 'Published — students will see it next time they sign in.'
      : opts.published === false ? 'Unpublished — nobody will be asked to accept it.'
      : opts.bumpVersion ? 'Saved and everyone will be asked to accept the new version.'
      : 'Saved.')
    bump((n) => n + 1)
    setTimeout(() => setSaved(''), 4000)
  }

  return (
    <div className="pe">
      <p className="td2-muted td2-small">
        Shown to every student when they sign in, and again whenever you raise the version. They cannot continue until they tick it.
        {policy.published
          ? <b className="pe-live"> Live · version {policy.version}</b>
          : <b className="pe-draft"> Not published — nobody sees it yet</b>}
      </p>
      <label className="td2-field pe-field">
        <span className="td2-field-label">Title</span>
        <input className="td2-input td2-grow" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <textarea
        className="pe-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={12}
        placeholder={'Write your refund and credit policy here, in plain language. For example:\n\n- when fees can be refunded, and when they cannot\n- how missed lessons are credited, and how long a credit lasts\n- how much notice you need for a cancellation\n- who to contact and how'}
      />
      <div className="pe-actions">
        <button className="td2-btn td2-btn-sm" onClick={() => save()} disabled={!dirty}>Save draft</button>
        {policy.published ? (
          <>
            <button className="td2-btn td2-btn-sm" onClick={() => save({ bumpVersion: true })} disabled={!body.trim()}>Save &amp; ask everyone again</button>
            <button className="td2-btn-ghost td2-btn-sm" onClick={() => save({ published: false })}>Unpublish</button>
          </>
        ) : (
          <button className="td2-btn td2-btn-sm" onClick={() => save({ published: true, bumpVersion: policy.version === 0 })} disabled={!body.trim()}>Publish to students</button>
        )}
        <button className="td2-btn-ghost td2-btn-sm" onClick={() => setShowWho(!showWho)}>{showWho ? 'Hide' : 'Who has accepted?'}</button>
      </div>
      {saved && <p className="pe-saved">{saved}</p>}
      {showWho && (
        <div className="pe-list">
          {acceptances.length === 0 && <p className="td2-muted td2-small">No students yet.</p>}
          {acceptances.map((a) => (
            <div key={a.id} className="pe-row">
              <span>{a.name}</span>
              {a.acceptedAt && a.version >= policy.version
                ? <span className="pe-yes">Accepted {new Date(a.acceptedAt).toLocaleDateString('en-AU')}{policy.version > 1 ? ` · v${a.version}` : ''}</span>
                : <span className="pe-no">{a.acceptedAt ? `Accepted an older version (v${a.version})` : 'Not yet'}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
