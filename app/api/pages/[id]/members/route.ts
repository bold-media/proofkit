import { NextResponse } from 'next/server'

import {
  addProjectMember,
  getClientByEmail,
  getPage,
  listProjectMembers,
  removeProjectMember,
  upsertClient,
} from '@/lib/data'
import { makeId } from '@/lib/db'
import { isOwner } from '@/lib/owner'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  return NextResponse.json({ members: listProjectMembers(id) })
}

// Add a client to this project. Creates the account if the email is new (and
// returns a generated password to share); grants access to an existing one.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  if (!getPage(id)) return NextResponse.json({ error: 'No such page' }, { status: 404 })

  const b = await req.json().catch(() => ({}))
  const email = String(b.email || '').trim().toLowerCase()
  const name = String(b.name || '').trim()
  const givenPw = String(b.password || '').trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email' }, { status: 400 })
  }

  const existing = getClientByEmail(email)
  let sharePassword: string | null = null
  let clientId: string
  if (existing && !givenPw) {
    clientId = existing.id
  } else {
    const pw = givenPw || makeId(10)
    const client = upsertClient(email, name || email, pw)
    clientId = client.id
    if (!givenPw) sharePassword = pw // generated — surface it so the owner can share
  }
  addProjectMember(id, clientId)
  return NextResponse.json({ ok: true, members: listProjectMembers(id), sharePassword })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const b = await req.json().catch(() => ({}))
  if (b.client_id) removeProjectMember(id, String(b.client_id))
  return NextResponse.json({ ok: true, members: listProjectMembers(id) })
}
