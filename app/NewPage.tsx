'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewPage() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'folder' | 'html'>('folder')
  const [name, setName] = useState('')
  const [html, setHtml] = useState('')
  const [folderInfo, setFolderInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const folderRef = useRef<HTMLInputElement>(null)

  async function uploadFolder(slug: string, files: FileList) {
    const fd = new FormData()
    const paths: string[] = []
    for (const f of Array.from(files)) {
      // webkitRelativePath looks like "MyDesign/index.html" — drop the top folder.
      const rel = (f.webkitRelativePath || f.name).split('/').slice(1).join('/') || f.name
      fd.append('files', f)
      paths.push(rel)
    }
    fd.append('paths', JSON.stringify(paths))
    const res = await fetch(`/api/pages/${slug}/files`, { method: 'POST', body: fd })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.error || 'Upload failed')
    }
  }

  async function create() {
    const files = folderRef.current?.files
    if (mode === 'folder' && !(files && files.length)) return
    if (mode === 'html' && !name.trim() && !html.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || 'Untitled', html: mode === 'html' ? html : '' }),
      })
      const page = await res.json()
      if (mode === 'folder' && files && files.length) {
        await uploadFolder(page.slug, files)
      }
      router.push(`/edit/${page.slug}`)
    } catch (e) {
      alert((e as Error).message)
      setBusy(false)
    }
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

      <div className="row" style={{ marginTop: 16, gap: 8 }}>
        <button
          className={mode === 'folder' ? 'btn' : 'btn ghost'}
          onClick={() => setMode('folder')}
          type="button"
        >
          Upload a folder
        </button>
        <button
          className={mode === 'html' ? 'btn' : 'btn ghost'}
          onClick={() => setMode('html')}
          type="button"
        >
          Paste HTML
        </button>
      </div>

      {mode === 'folder' ? (
        <div style={{ marginTop: 14 }}>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            Pick the whole design folder (the HTML plus its CSS, JS and images). Everything is hosted together.
          </p>
          <input
            ref={folderRef}
            type="file"
            // @ts-expect-error non-standard but supported by browsers
            webkitdirectory=""
            directory=""
            multiple
            onChange={(e) => {
              const n = e.target.files?.length || 0
              setFolderInfo(n ? `${n} files selected` : '')
            }}
          />
          {folderInfo && (
            <p className="muted" style={{ fontSize: 13 }}>
              {folderInfo}
            </p>
          )}
        </div>
      ) : (
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
