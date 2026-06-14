import { NextResponse } from 'next/server'

import { COMMENT_STATUSES, type CommentStatus, deleteComment, setCommentStatus } from '@/lib/data'
import { isOwner } from '@/lib/owner'

export const runtime = 'nodejs'

// Changing a comment's status (and deleting) stays owner-only; replies go
// through the public POST /api/comments so clients can join the thread.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  let status: CommentStatus | undefined
  if (typeof body.status === 'string' && COMMENT_STATUSES.includes(body.status as CommentStatus)) {
    status = body.status as CommentStatus
  } else if (typeof body.resolved === 'boolean') {
    // Back-compat with the old resolve/reopen toggle.
    status = body.resolved ? 'resolved' : 'open'
  }
  if (status) setCommentStatus(id, status)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  deleteComment(id)
  return NextResponse.json({ ok: true })
}
