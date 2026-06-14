'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import PasswordInput from '../PasswordInput'

export default function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter()
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const res = await fetch('/api/owner/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    })
    if (res.ok) {
      const next = new URLSearchParams(window.location.search).get('next') || '/'
      router.push(next)
      router.refresh()
    } else {
      setErr((await res.json().catch(() => ({}))).error || 'Something went wrong')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <PasswordInput value={pw} onChange={setPw} placeholder="Password" autoFocus />
      {err && (
        <p style={{ color: 'var(--danger)', fontSize: 13, margin: '8px 0 0' }}>{err}</p>
      )}
      <button className="btn" type="submit" disabled={busy} style={{ marginTop: 14, width: '100%' }}>
        {busy ? '…' : configured ? 'Log in' : 'Create password'}
      </button>
    </form>
  )
}
