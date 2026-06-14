import { NextResponse } from 'next/server'

import { createComment, getComment, getPage, listComments } from '@/lib/data'

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('page')
  if (!slug) return NextResponse.json({ comments: [] })
  return NextResponse.json({ comments: listComments(slug) })
}

// Public endpoint — clients (and the owner) post feedback and replies here.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const slug = String(body.page_slug || '')
  const text = String(body.body || '').trim()
  if (!slug || !getPage(slug) || !text) {
    return NextResponse.json({ error: 'Invalid comment' }, { status: 400 })
  }

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

  const comment = createComment({
    page_slug: slug,
    x_pct: parentId ? 0 : Number(body.x_pct) || 0,
    y_pct: parentId ? 0 : Number(body.y_pct) || 0,
    author: String(body.author || 'Guest').slice(0, 80),
    body: text.slice(0, 2000),
    parent_id: parentId,
  })
  return NextResponse.json(comment)
}
