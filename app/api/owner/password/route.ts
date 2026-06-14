import { NextResponse } from 'next/server'

import { ownerSession, setOwnerPassword } from '@/lib/data'
import { isOwner, OWNER_COOKIE } from '@/lib/owner'

export const runtime = 'nodejs'

// Change the owner password (must already be logged in). Re-issues the session
// cookie so you stay logged in afterward.
export async function POST(req: Request) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const password = String(body.password || '')
  if (password.length < 4) {
    return NextResponse.json({ error: 'Password must be at least 4 characters.' }, { status: 400 })
  }
  setOwnerPassword(password)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(OWNER_COOKIE, ownerSession() || '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
