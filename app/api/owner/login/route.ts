import { NextResponse } from 'next/server'

import { ownerConfigured, ownerSession, setOwnerPassword, verifyOwner } from '@/lib/data'
import { OWNER_COOKIE } from '@/lib/owner'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const password = String(body.password || '')
  if (password.length < 4) {
    return NextResponse.json({ error: 'Password must be at least 4 characters.' }, { status: 400 })
  }

  if (!ownerConfigured()) {
    // First time: this becomes your password.
    setOwnerPassword(password)
  } else if (!verifyOwner(password)) {
    return NextResponse.json({ error: 'Wrong password.' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(OWNER_COOKIE, ownerSession() || '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
