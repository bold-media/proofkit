import { NextResponse } from 'next/server'

import { ownerCommentPages, setOwnerName } from '@/lib/data'
import { emitCommentChange } from '@/lib/events'
import { isOwner } from '@/lib/owner'

export const runtime = 'nodejs'

// Set the owner's display name (used as the author on their comments/replies).
export async function POST(req: Request) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'Enter a name' }, { status: 400 })
  // Capture affected pages BEFORE the rename clears nothing (is_owner stays set),
  // then re-label and ping each page's live stream so open views update.
  const pages = ownerCommentPages()
  setOwnerName(name)
  for (const slug of pages) emitCommentChange(slug)
  return NextResponse.json({ ok: true, name: name.slice(0, 80) })
}
