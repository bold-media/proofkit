import { NextResponse } from 'next/server'

import { getVersion, setCurrentVersion, setPageEntry } from '@/lib/data'
import { isOwner } from '@/lib/owner'

export const runtime = 'nodejs'

// Publish a version as the live one (owner only).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const v = getVersion(String(body.version_id || ''))
  if (!v || v.page_slug !== id) return NextResponse.json({ error: 'No such version' }, { status: 404 })
  setCurrentVersion(id, v.id)
  if (v.entry) setPageEntry(id, v.entry) // keep page.entry in sync with the live version
  return NextResponse.json({ ok: true })
}
