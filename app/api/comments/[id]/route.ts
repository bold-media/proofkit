import { NextResponse } from 'next/server'

import { deleteComment, setCommentResolved } from '@/lib/data'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  if (typeof body.resolved === 'boolean') setCommentResolved(id, body.resolved)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  deleteComment(id)
  return NextResponse.json({ ok: true })
}
