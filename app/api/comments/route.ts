import { NextResponse } from 'next/server'

import { createComment, getPage, listComments } from '@/lib/data'

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('page')
  if (!slug) return NextResponse.json({ comments: [] })
  return NextResponse.json({ comments: listComments(slug) })
}

// Public endpoint — clients post feedback here (no auth).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const slug = String(body.page_slug || '')
  const text = String(body.body || '').trim()
  if (!slug || !getPage(slug) || !text) {
    return NextResponse.json({ error: 'Invalid comment' }, { status: 400 })
  }
  const comment = createComment({
    page_slug: slug,
    x_pct: Number(body.x_pct) || 0,
    y_pct: Number(body.y_pct) || 0,
    author: String(body.author || 'Guest').slice(0, 80),
    body: text.slice(0, 2000),
  })
  return NextResponse.json(comment)
}
