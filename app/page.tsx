import { listPages } from '@/lib/data'
import NewPage from './NewPage'
import PageList from './PageList'

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
        Upload a design folder (or paste HTML), get a live link, and collect pinned feedback from clients — no login required for them.
      </p>

      <NewPage />

      <div style={{ marginTop: 24 }}>
        <PageList pages={pages.map((p) => ({ slug: p.slug, name: p.name, open: p.open, total: p.total }))} />
      </div>
    </div>
  )
}
