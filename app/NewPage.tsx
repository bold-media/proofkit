'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import FolderDrop, { type PickedFile } from './FolderDrop'
import { uploadDesign } from './upload'

export default function NewPage() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'folder' | 'html' | 'link'>('folder')
  const [name, setName] = useState('')
  const [html, setHtml] = useState('')
  const [url, setUrl] = useState('')
  const [picked, setPicked] = useState<PickedFile[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')

  const canCreate =
    !!name.trim() &&
    ((mode === 'folder' && picked.length > 0) ||
      (mode === 'link' && !!url.trim()) ||
      (mode === 'html' && !!html.trim()))

  async function create() {
    if (!canCreate) return
    setBusy(true)
    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          html: mode === 'html' ? html : '',
          url: mode === 'link' ? url.trim() : undefined,
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not create page')
      const page = await res.json()
      if (mode === 'folder') {
        await uploadDesign(page.slug, picked, (d, t) => setProgress(`Uploading ${d}/${t}…`))
      }
      router.push(`/edit/${page.slug}`)
    } catch (e) {
      alert((e as Error).message)
      setBusy(false)
      setProgress('')
    }
  }

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + New page
      </button>
    )
  }

  const tab = (key: typeof mode, label: string) => (
    <button className={mode === key ? 'btn' : 'btn ghost'} onClick={() => setMode(key)} type="button">
      {label}
    </button>
  )

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <label className="field-label">Page name (this becomes part of the link)</label>
      <input
        className="input"
        autoFocus
        value={name}
        placeholder="e.g. Summer campaign — landing"
        onChange={(e) => setName(e.target.value)}
      />

      <div className="row" style={{ marginTop: 16, gap: 8 }}>
        {tab('folder', 'Upload a folder')}
        {tab('link', 'Import from link')}
        {tab('html', 'Paste HTML')}
      </div>

      {mode === 'folder' && (
        <div style={{ marginTop: 14 }}>
          <FolderDrop busy={busy} onPick={setPicked} />
        </div>
      )}

      {mode === 'link' && (
        <div style={{ marginTop: 14 }}>
          <label className="field-label">Link to your design (a published page / standalone file)</label>
          <input
            className="input"
            value={url}
            placeholder="https://…"
            onChange={(e) => setUrl(e.target.value)}
          />
          <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            proofkit fetches the page from this link and hosts a copy. Works for public links your server
            can reach (not private Claude links).
          </p>
        </div>
      )}

      {mode === 'html' && (
        <div style={{ marginTop: 14 }}>
          <label className="field-label">Paste your design&apos;s HTML</label>
          <textarea
            className="textarea"
            rows={8}
            value={html}
            placeholder="<!doctype html> …"
            onChange={(e) => setHtml(e.target.value)}
          />
        </div>
      )}

      <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end', alignItems: 'center' }}>
        {progress && <span className="muted" style={{ fontSize: 13, marginRight: 'auto' }}>{progress}</span>}
        {!name.trim() && (
          <span className="muted" style={{ fontSize: 13, marginRight: 'auto' }}>
            Give it a name first ↑
          </span>
        )}
        <button className="btn ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
        <button className="btn" onClick={create} disabled={busy || !canCreate}>
          {busy ? 'Creating…' : 'Create page'}
        </button>
      </div>
    </div>
  )
}
