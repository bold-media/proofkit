'use client'

import { useEffect, useState } from 'react'

type Member = { id: string; email: string; name: string }

export default function ClientAccess({ slug }: { slug: string }) {
  const [members, setMembers] = useState<Member[]>([])
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [share, setShare] = useState<{ email: string; password: string } | null>(null)

  async function load() {
    try {
      const r = await fetch(`/api/pages/${slug}/members`)
      if (r.ok) setMembers((await r.json()).members || [])
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function add() {
    setBusy(true)
    setErr('')
    setShare(null)
    const r = await fetch(`/api/pages/${slug}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), name: name.trim() }),
    })
    const j = await r.json()
    setBusy(false)
    if (!r.ok) {
      setErr(j.error || 'Could not add')
      return
    }
    setMembers(j.members || [])
    if (j.sharePassword) setShare({ email: email.trim(), password: j.sharePassword })
    setEmail('')
    setName('')
  }

  async function remove(id: string) {
    setMembers((m) => m.filter((x) => x.id !== id))
    await fetch(`/api/pages/${slug}/members`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: id }),
    })
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14 }}>
      <label className="field-label">Client access (instead of the password)</label>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 10px' }}>
        Invite a client to log in — they skip the password and comment under their name. They set their own name on
        first login, and only see projects you add them to.
      </p>
      <div className="row">
        <input
          className="input"
          type="email"
          placeholder="client@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="input"
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn" onClick={add} disabled={busy || !email.trim()}>
          {busy ? '…' : 'Add'}
        </button>
      </div>
      {err && <p style={{ color: 'var(--danger)', fontSize: 13, margin: '8px 0 0' }}>{err}</p>}
      {share && (
        <div className="snippet" style={{ marginTop: 10 }}>
          Account created — share these with {share.email}: <strong>email</strong> {share.email} ·{' '}
          <strong>password</strong> {share.password}
        </div>
      )}
      {members.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {members.map((m) => (
            <div
              key={m.id}
              className="row"
              style={{ justifyContent: 'space-between', fontSize: 14, padding: '6px 0' }}
            >
              <span>
                <strong style={{ fontWeight: 600 }}>{m.name}</strong>{' '}
                <span className="muted">· {m.email}</span>
              </span>
              <button
                onClick={() => remove(m.id)}
                style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
