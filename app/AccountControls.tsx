'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import PasswordInput from './PasswordInput'

export default function AccountControls({ name: initialName = 'Owner' }: { name?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [nameOpen, setNameOpen] = useState(false)
  const [name, setName] = useState(initialName)
  const [nameBusy, setNameBusy] = useState(false)
  const [nameMsg, setNameMsg] = useState('')

  async function saveName() {
    const n = name.trim()
    if (!n) {
      setNameMsg('Enter a name.')
      return
    }
    setNameBusy(true)
    setNameMsg('')
    const res = await fetch('/api/owner/name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: n }),
    })
    setNameBusy(false)
    if (res.ok) {
      setNameMsg('Saved ✓')
      setTimeout(() => {
        setNameOpen(false)
        setNameMsg('')
        router.refresh()
      }, 900)
    } else {
      setNameMsg((await res.json().catch(() => ({}))).error || 'Something went wrong')
    }
  }

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
      <button className="btn ghost" style={{ padding: '6px 12px' }} onClick={() => setNameOpen(true)}>
        {initialName === 'Owner' ? 'Set your name' : initialName}
      </button>
      <button className="btn ghost" style={{ padding: '6px 12px' }} onClick={() => setOpen(true)}>
        Change password
      </button>
      <button className="btn ghost" style={{ padding: '6px 12px' }} onClick={logout}>
        Log out
      </button>

      {nameOpen && (
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
          onMouseDown={(e) => {
            // Only close on a press that STARTS on the backdrop — otherwise
            // selecting text in the input and releasing here would close it.
            if (e.target === e.currentTarget && !nameBusy) setNameOpen(false)
          }}
        >
          <div className="card" style={{ maxWidth: 380, width: '100%' }} onMouseDown={(e) => e.stopPropagation()}>
            <h1 style={{ fontSize: 18, marginTop: 0 }}>Your display name</h1>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              Shown on the comments and replies you leave (instead of “Owner”).
            </p>
            <input
              className="input"
              autoFocus
              placeholder="e.g. Alex Morgan"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName()
              }}
            />
            {nameMsg && (
              <p style={{ fontSize: 13, margin: '8px 0 0', color: nameMsg.includes('✓') ? 'var(--success)' : 'var(--danger)' }}>
                {nameMsg}
              </p>
            )}
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn ghost" disabled={nameBusy} onClick={() => setNameOpen(false)}>
                Cancel
              </button>
              <button className="btn" disabled={nameBusy} onClick={saveName}>
                {nameBusy ? '…' : 'Save name'}
              </button>
            </div>
          </div>
        </div>
      )}

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
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setOpen(false)
          }}
        >
          <div className="card" style={{ maxWidth: 380, width: '100%' }} onMouseDown={(e) => e.stopPropagation()}>
            <h1 style={{ fontSize: 18, marginTop: 0 }}>Change your password</h1>
            <PasswordInput value={pw} onChange={setPw} placeholder="New password" autoFocus onEnter={change} />
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
