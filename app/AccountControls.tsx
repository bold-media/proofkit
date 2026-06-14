'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AccountControls() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function logout() {
    await fetch('/api/owner/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  async function change() {
    if (pw.length < 4) {
      setMsg('Password must be at least 4 characters.')
      return
    }
    setBusy(true)
    setMsg('')
    const res = await fetch('/api/owner/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    })
    setBusy(false)
    if (res.ok) {
      setMsg('Password changed ✓')
      setPw('')
      setTimeout(() => {
        setOpen(false)
        setMsg('')
      }, 1100)
    } else {
      setMsg((await res.json().catch(() => ({}))).error || 'Something went wrong')
    }
  }

  return (
    <div className="row">
      <button className="btn ghost" style={{ padding: '6px 12px' }} onClick={() => setOpen(true)}>
        Change password
      </button>
      <button className="btn ghost" style={{ padding: '6px 12px' }} onClick={logout}>
        Log out
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16,24,40,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 20,
          }}
          onClick={() => !busy && setOpen(false)}
        >
          <div className="card" style={{ maxWidth: 380, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h1 style={{ fontSize: 18, marginTop: 0 }}>Change your password</h1>
            <input
              className="input"
              type="password"
              autoFocus
              value={pw}
              placeholder="New password"
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && change()}
            />
            {msg && (
              <p style={{ fontSize: 13, margin: '8px 0 0', color: msg.includes('✓') ? 'var(--success)' : 'var(--danger)' }}>
                {msg}
              </p>
            )}
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn ghost" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn" disabled={busy} onClick={change}>
                {busy ? '…' : 'Save password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
