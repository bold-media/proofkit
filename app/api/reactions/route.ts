import { NextResponse } from 'next/server'

import { getComment, REACTION_EMOJI, toggleReaction } from '@/lib/data'
import { emitCommentChange } from '@/lib/events'

export const runtime = 'nodejs'

// Public: anyone (clients + owner) can add/remove a reaction on a comment.
// Identity is a per-browser client id, so each person toggles their own.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const commentId = String(body.comment_id || '')
  const emoji = String(body.emoji || '')
  const clientId = String(body.client_id || '').slice(0, 64)

  if (!clientId || !REACTION_EMOJI.includes(emoji as (typeof REACTION_EMOJI)[number])) {
    return NextResponse.json({ error: 'Invalid reaction' }, { status: 400 })
  }
  const comment = getComment(commentId)
  if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const added = toggleReaction(commentId, emoji, clientId)
  emitCommentChange(comment.page_slug)
  return NextResponse.json({ ok: true, added })
}
