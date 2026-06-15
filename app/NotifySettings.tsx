'use client'

import { useEffect, useState } from 'react'

type Status = { kind: 'ok' | 'err' | 'info'; text: string }

export default function NotifySettings() {
  const [open, setOpen] = useState(false)
  const [hasToken, setHasToken] = useState(false)
  const [token, setToken] = useState('')
  const [chat, setChat] = useState('')
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch('/api/owner/notify')
      .then((r) => r.json())
      .then((j) => {
        setHasToken(!!j.hasToken)
        setChat(j.chat || '')
      })
      .catch(() => {})
  }, [open])

  async function post(url: string, body: Record<string, unknown>) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return r.json()
  }

  async function save() {
    setBusy(true)
    setStatus(null)
    const j = await post('/api/owner/notify', { chat, ...(token.trim() ? { token: token.trim() } : {}) })
    setHasToken(!!j.hasToken)
    setToken('')
    setBusy(false)
    setStatus({ kind: 'ok', text: 'Saved.' })
  }

  async function detect() {
    setBusy(true)
    setStatus({ kind: 'info', text: 'Looking for a message to your bot…' })
    const j = await post('/api/owner/notify/test', { action: 'detect', token: token.trim() || undefined })
    setBusy(false)
    if (j.ok && j.chat) {
      setChat(j.chat)
      setStatus({ kind: 'ok', text: `Found your chat${j.name ? ` (${j.name})` : ''}. Click Save, then Send test.` })
    } else {
      setStatus({ kind: 'err', text: j.error || 'Could not detect a chat.' })
    }
  }

  async function test() {
    setBusy(true)
    setStatus({ kind: 'info', text: 'Sending…' })
    const j = await post('/api/owner/notify/test', {
      action: 'send',
      token: token.trim() || undefined,
      chat,
    })
    setBusy(false)
    setStatus(j.ok ? { kind: 'ok', text: 'Sent — check Telegram.' } : { kind: 'err', text: j.error || 'Failed to send.' })
  }

  if (!open) {
    return (
      <button className="btn ghost" onClick={() => setOpen(true)}>
        Notifications
      </button>
    )
  }

  const statusColor =
    status?.kind === 'err' ? 'var(--danger)' : status?.kind === 'ok' ? 'var(--success)' : 'var(--muted)'

  return (
    <div className="card" style={{ marginTop: 12, maxWidth: 520 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>Telegram notifications</h1>
        <button className="btn ghost btn-sm" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>
        Get a Telegram message whenever a client leaves a comment or reply.
      </p>

      <label className="field-label" style={{ marginTop: 12 }}>
        Bot token
      </label>
      <input
        className="input"
        value={token}
        placeholder={hasToken ? '•••••• saved — leave blank to keep' : '123456789:ABCdef…'}
        onChange={(e) => setToken(e.target.value)}
      />

      <label className="field-label" style={{ marginTop: 12 }}>
        Chat id
      </label>
      <div className="row">
        <input className="input" value={chat} placeholder="e.g. 123456789" onChange={(e) => setChat(e.target.value)} />
        <button className="btn ghost" onClick={detect} disabled={busy}>
          Detect
        </button>
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn" onClick={save} disabled={busy}>
          Save
        </button>
        <button className="btn ghost" onClick={test} disabled={busy}>
          Send test
        </button>
      </div>

      {status && (
        <p style={{ color: statusColor, fontSize: 13, margin: '10px 0 0' }}>{status.text}</p>
      )}

      <details style={{ marginTop: 14 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--muted)' }}>How to set this up</summary>
        <ol className="muted" style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 18, marginTop: 8 }}>
          <li>
            In Telegram, open <strong>@BotFather</strong>, send <code>/newbot</code>, and copy the token it gives you.
          </li>
          <li>Paste the token above and click <strong>Save</strong>.</li>
          <li>Open your new bot and send it any message (e.g. “hi”).</li>
          <li>
            Click <strong>Detect</strong> to grab your chat id, then <strong>Save</strong> and <strong>Send test</strong>.
          </li>
        </ol>
      </details>
    </div>
  )
}
