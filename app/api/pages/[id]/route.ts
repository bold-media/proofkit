import { NextResponse } from 'next/server'

import { deletePage, setPageViewPassword, updatePage } from '@/lib/data'
import { isOwner } from '@/lib/owner'

export const runtime = 'nodejs'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  updatePage(id, {
    name: body.name !== undefined ? String(body.name) : undefined,
    html: body.html !== undefined ? String(body.html) : undefined,
  })
  // viewPassword: a string sets/changes the client password, null clears it.
  if (body.viewPassword !== undefined) {
    setPageViewPassword(id, body.viewPassword === null ? null : String(body.viewPassword))
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  deletePage(id)
  return NextResponse.json({ ok: true })
}
