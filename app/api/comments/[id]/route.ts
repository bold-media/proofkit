import { NextResponse } from 'next/server'

import {
  COMMENT_STATUSES,
  type CommentStatus,
  deleteComment,
  getComment,
  setCommentPosition,
  setCommentStatus,
} from '@/lib/data'
import { emitCommentChange } from '@/lib/events'
import { isOwner } from '@/lib/owner'

export const runtime = 'nodejs'

// Changing a comment's status (and deleting) stays owner-only. Moving a pin is
// allowed for anyone — like Figma, repositioning isn't destructive — so clients
// can tidy up their own pins.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const owner = await isOwner()

  let status: CommentStatus | undefined
  if (typeof body.status === 'string' && COMMENT_STATUSES.includes(body.status as CommentStatus)) {
    status = body.status as CommentStatus
  } else if (typeof body.resolved === 'boolean') {
    // Back-compat with the old resolve/reopen toggle.
    status = body.resolved ? 'resolved' : 'open'
  }
  if (status) {
    if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    setCommentStatus(id, status)
  }

  if (typeof body.x_pct === 'number' && typeof body.y_pct === 'number') {
    setCommentPosition(id, body.x_pct, body.y_pct)
  }
  const slug = getComment(id)?.page_slug
  if (slug) emitCommentChange(slug)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const slug = getComment(id)?.page_slug
  deleteComment(id)
  if (slug) emitCommentChange(slug)
  return NextResponse.json({ ok: true })
}
