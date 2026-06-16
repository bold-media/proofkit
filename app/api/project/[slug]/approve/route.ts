import { NextResponse } from 'next/server'

import { addApproval, getOwnerName, getPage, listApprovals } from '@/lib/data'
import { currentClient } from '@/lib/client'
import { notify } from '@/lib/notify'
import { isOwner } from '@/lib/owner'

export const runtime = 'nodejs'

function reqOrigin(req: Request): string {
  const h = req.headers
  const host = h.get('x-forwarded-host') || h.get('host')
  const proto = h.get('x-forwarded-proto') || 'https'
  return host ? `${proto}://${host}` : ''
}

// A viewer signs off on the design. The approver's name comes from their account
// (or the gate name), falling back to whatever they type in the overlay.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!getPage(slug)) return NextResponse.json({ error: 'No such page' }, { status: 404 })

  const owner = await isOwner()
  const client = owner ? null : await currentClient()
  const body = await req.json().catch(() => ({}))
  const name = owner
    ? getOwnerName()
    : client
      ? client.name
      : String(body.name || '').trim().slice(0, 80) || 'Guest'

  const approval = addApproval(slug, name, client ? client.id : null)
  if (!owner) {
    const page = getPage(slug)
    void notify(`✅ ${name} approved “${page?.name || slug}”\n\n${reqOrigin(req)}/edit/${slug}`)
  }
  return NextResponse.json({ ok: true, approval, approvals: listApprovals(slug) })
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return NextResponse.json({ approvals: listApprovals(slug) })
}
