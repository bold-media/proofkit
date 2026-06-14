'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewPage() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [html, setHtml] = useState('')
  const [busy, setBusy] = useState(false)

  async function create() {
    if (!name.trim() && !html.trim()) return
    setBusy(true)
    const res = await fetch('/api/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() || 'Untitled', html }),
    })
    const page = await res.json()
    setBusy(false)
    if (page.slug) router.push(`/edit/${page.slug}`)
  }

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + New page
      </button>
    )
  }

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <label className="field-label">Page name</label>
      <input
        className="input"
        autoFocus
        value={name}
        placeholder="e.g. Summer campaign — landing"
        onChange={(e) => setName(e.target.value)}
      />
      <label className="field-label" style={{ marginTop: 14 }}>
        Paste your design&apos;s HTML (you can also do this later)
      </label>
      <textarea
        className="textarea"
        rows={8}
        value={html}
        placeholder="<!doctype html> …"
        onChange={(e) => setHtml(e.target.value)}
      />
      <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
        <button className="btn" onClick={create} disabled={busy}>
          {busy ? 'Creating…' : 'Create page'}
        </button>
      </div>
    </div>
  )
}
