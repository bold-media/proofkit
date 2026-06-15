import { NextResponse } from 'next/server'

import { createComment, getComment, getPage, listComments } from '@/lib/data'
import { DEVICE_SIZES, DEVICE_LABEL, type DeviceSize } from '@/lib/devices'
import { emitCommentChange } from '@/lib/events'
import { notify } from '@/lib/notify'
import { isOwner } from '@/lib/owner'

function reqOrigin(req: Request): string {
  const h = req.headers
  const host = h.get('x-forwarded-host') || h.get('host')
  const proto = h.get('x-forwarded-proto') || 'https'
  return host ? `${proto}://${host}` : ''
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const slug = url.searchParams.get('page')
  if (!slug) return NextResponse.json({ comments: [] })
  const client = url.searchParams.get('client') || undefined
  return NextResponse.json({ comments: listComments(slug, client) })
}

// Public endpoint — clients (and the owner) post feedback and replies here.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const slug = String(body.page_slug || '')
  const text = String(body.body || '').trim()
  const page = getPage(slug)
  if (!slug || !page || !text) {
    return NextResponse.json({ error: 'Invalid comment' }, { status: 400 })
  }
  const owner = await isOwner()

  // A reply threads under an existing top-level comment on the same page and
  // carries no pin coordinates of its own.
  let parentId: string | null = null
  if (body.parent_id) {
    const parent = getComment(String(body.parent_id))
    if (!parent || parent.page_slug !== slug || parent.parent_id) {
      return NextResponse.json({ error: 'Invalid parent' }, { status: 400 })
    }
    parentId = parent.id
  }

  const device = DEVICE_SIZES.includes(body.device as DeviceSize) ? (body.device as string) : 'desktop'
  const comment = createComment({
    page_slug: slug,
    x_pct: parentId ? 0 : Number(body.x_pct) || 0,
    y_pct: parentId ? 0 : Number(body.y_pct) || 0,
    author: String(body.author || 'Guest').slice(0, 80),
    body: text.slice(0, 2000),
    parent_id: parentId,
    device,
  })
  emitCommentChange(slug)

  // Notify the owner of new client feedback (never their own comments). Fire and
  // forget — a failed/slow notification must not affect the comment response.
  if (!owner) {
    const url = `${reqOrigin(req)}/edit/${slug}`
    const who = comment.author
    let msg: string
    if (parentId) {
      msg = `↩️ ${who} replied on “${page.name}”\n\n“${text}”\n\n${url}`
    } else {
      const dev = DEVICE_LABEL[device] || 'Desktop'
      msg = `💬 New comment on “${page.name}” from ${who} (${dev})\n\n“${text}”\n\n${url}`
    }
    void notify(msg)
  }
  return NextResponse.json(comment)
}
