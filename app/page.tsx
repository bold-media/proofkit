import Link from 'next/link'

import { listPages } from '@/lib/data'
import NewPage from './NewPage'

export const dynamic = 'force-dynamic'

export default function Home() {
  const pages = listPages()

  return (
    <div className="wrap">
      <div className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          Proofkit
        </div>
      </div>

      <h1>Your pages</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Paste a design&apos;s HTML, get a live link, and collect pinned feedback from clients.
      </p>

      <NewPage />

      <div style={{ marginTop: 24 }}>
        {pages.length === 0 ? (
          <div className="empty">No pages yet. Create your first one above.</div>
        ) : (
          pages.map((p) => (
            <Link key={p.slug} href={`/edit/${p.slug}`} className="page-row">
              <div>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  /p/{p.slug}
                </div>
              </div>
              <div className="row">
                {p.open > 0 ? (
                  <span className="badge open">{p.open} open</span>
                ) : (
                  <span className="badge">{p.total} comments</span>
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
