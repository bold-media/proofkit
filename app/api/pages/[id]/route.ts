import { NextResponse } from 'next/server'

import { deletePage, updatePage } from '@/lib/data'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  updatePage(id, {
    name: body.name !== undefined ? String(body.name) : undefined,
    html: body.html !== undefined ? String(body.html) : undefined,
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  deletePage(id)
  return NextResponse.json({ ok: true })
}
