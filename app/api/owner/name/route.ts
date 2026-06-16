import { NextResponse } from 'next/server'

import { setOwnerName } from '@/lib/data'
import { isOwner } from '@/lib/owner'

export const runtime = 'nodejs'

// Set the owner's display name (used as the author on their comments/replies).
export async function POST(req: Request) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'Enter a name' }, { status: 400 })
  setOwnerName(name)
  return NextResponse.json({ ok: true, name: name.slice(0, 80) })
}
