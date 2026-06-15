import { NextResponse } from 'next/server'

import { loginClient } from '@/lib/data'
import { CLIENT_COOKIE } from '@/lib/client'

export const runtime = 'nodejs'

// Accepts JSON (returns ok/error) or a form POST (redirects to `next`), so it
// works both from the in-app login UI and the password-gate screen's form.
export async function POST(req: Request) {
  const ct = req.headers.get('content-type') || ''
  let email = '',
    password = '',
    next = '/',
    isForm = false
  if (ct.includes('application/json')) {
    const b = await req.json().catch(() => ({}))
    email = String(b.email || '')
    password = String(b.password || '')
    next = String(b.next || '/')
  } else {
    isForm = true
    const f = await req.formData()
    email = String(f.get('email') || '')
    password = String(f.get('password') || '')
    next = String(f.get('next') || '/')
  }
  if (!next.startsWith('/')) next = '/'

  const result = loginClient(email, password)
  if (!result) {
    if (isForm) {
      return new NextResponse(null, { status: 303, headers: { Location: `${next}?login=bad` } })
    }
    return NextResponse.json({ error: 'Wrong email or password' }, { status: 401 })
  }

  const res = isForm
    ? new NextResponse(null, { status: 303, headers: { Location: next } })
    : NextResponse.json({ ok: true, name: result.client.name })
  res.cookies.set(CLIENT_COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
