'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Row = {
  slug: string
  name: string
  open: number
  total: number
  updated_at: string
  entry: string | null
}

const THUMB_COLORS = ['#4f46e5', '#0ea5e9', '#16a34a', '#d97706', '#db2777', '#7c3aed', '#0891b2']
function colorFor(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return THUMB_COLORS[h % THUMB_COLORS.length]
}
function monogram(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '#').slice(0, 2)
}
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function PageList({ pages }: { pages: Row[] }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  async function del(slug: string) {
    setBusy(true)
    await fetch(`/api/pages/${slug}`, { method: 'DELETE' })
    setConfirm(null)
    setBusy(false)
    router.refresh()
  }

  function copy(slug: string) {
    navigator.clipboard.writeText(`${window.location.origin}/project/${slug}`)
    setCopied(slug)
    setTimeout(() => setCopied((c) => (c === slug ? null : c)), 1500)
  }

  if (pages.length === 0) {
    return (
      <div className="empty-card">
        <div className="empty-icon">✦</div>
        <div style={{ fontWeight: 600, fontSize: 16 }}>No pages yet</div>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
          Click <strong>+ New page</strong> above to upload a design and get a shareable link.
        </p>
      </div>
    )
  }

  return (
    <div className="page-grid">
      {pages.map((p) => (
        <div
          key={p.slug}
          className="page-card"
          role="button"
          tabIndex={0}
          onClick={() => router.push(`/edit/${p.slug}`)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              router.push(`/edit/${p.slug}`)
            }
          }}
        >
          <div className="page-thumb" style={{ background: colorFor(p.slug) }} aria-hidden>
            {monogram(p.name)}
          </div>

          <div className="page-main">
            <div className="page-name">{p.name}</div>
            <div className="page-slug">/project/{p.slug}</div>
            <div className="page-meta">
              {p.open > 0 ? (
                <span className="meta-open">
                  <span className="meta-dot" /> {p.open} open
                </span>
              ) : (
                <span className="muted">No open comments</span>
              )}
              <span className="meta-sep">·</span>
              <span className="muted">{p.total} total</span>
              <span className="meta-sep">·</span>
              <span className="muted">Updated {timeAgo(p.updated_at)}</span>
              {!p.entry && (
                <>
                  <span className="meta-sep">·</span>
                  <span className="muted">HTML</span>
                </>
              )}
            </div>
          </div>

          <div className="page-actions" onClick={(e) => e.stopPropagation()}>
            <button className="btn ghost btn-sm" onClick={() => copy(p.slug)}>
              {copied === p.slug ? 'Copied ✓' : 'Copy link'}
            </button>
            <a className="btn ghost btn-sm" href={`/project/${p.slug}`} target="_blank" rel="noreferrer">
              Open ↗
            </a>
            {confirm === p.slug ? (
              <>
                <button className="btn danger btn-sm" disabled={busy} onClick={() => del(p.slug)}>
                  {busy ? 'Deleting…' : 'Confirm'}
                </button>
                <button className="btn ghost btn-sm" onClick={() => setConfirm(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <button
                className="btn ghost btn-sm"
                style={{ color: 'var(--danger)' }}
                onClick={() => setConfirm(p.slug)}
                title="Delete this page"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
