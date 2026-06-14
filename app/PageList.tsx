'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Row = { slug: string; name: string; open: number; total: number }

export default function PageList({ pages }: { pages: Row[] }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function del(slug: string) {
    setBusy(true)
    await fetch(`/api/pages/${slug}`, { method: 'DELETE' })
    setConfirm(null)
    setBusy(false)
    router.refresh()
  }

  if (pages.length === 0) {
    return <div className="empty">No pages yet. Create your first one above.</div>
  }

  return (
    <>
      {pages.map((p) => (
        <div key={p.slug} className="page-row">
          <Link href={`/edit/${p.slug}`} style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{p.name}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              /project/{p.slug}
            </div>
          </Link>
          <div className="row">
            {p.open > 0 ? (
              <span className="badge open">{p.open} open</span>
            ) : (
              <span className="badge">{p.total} comments</span>
            )}
            {confirm === p.slug ? (
              <>
                <button
                  className="btn danger"
                  style={{ padding: '6px 12px' }}
                  disabled={busy}
                  onClick={() => del(p.slug)}
                >
                  {busy ? 'Deleting…' : 'Delete'}
                </button>
                <button className="btn ghost" style={{ padding: '6px 12px' }} onClick={() => setConfirm(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <button
                className="btn ghost"
                style={{ padding: '6px 12px', color: 'var(--danger)' }}
                onClick={() => setConfirm(p.slug)}
                title="Delete this page"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      ))}
    </>
  )
}
