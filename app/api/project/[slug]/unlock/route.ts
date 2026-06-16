import { NextResponse } from 'next/server'

import { pageUnlockToken, verifyPageViewPassword } from '@/lib/data'

export const runtime = 'nodejs'

// Redirect with a RELATIVE Location so the browser keeps whatever scheme/host
// it actually used. Building an absolute URL from req.url can leak an internal
// http:// origin (behind a TLS-terminating proxy) or a forced https:// (Chrome
// HTTPS-First on localhost), which lands the visitor on an unreachable URL.
function redirect(location: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: location } })
}

// A client submits the per-link password here; on success we set an unlock
// cookie and send them to the design.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const form = await req.formData()
  const password = String(form.get('password') || '')
  const name = String(form.get('name') || '').trim().slice(0, 80)

  if (!verifyPageViewPassword(slug, password)) {
    return redirect(`/project/${slug}?bad=1`)
  }

  const res = redirect(`/project/${slug}`)
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  }
  res.cookies.set(`pk_unlock_${slug}`, pageUnlockToken(slug) || '', cookieOpts)
  // Remember the name they gave at the gate so their comments are attributed to
  // it (instead of "Guest") without re-typing in the composer each time.
  if (name) res.cookies.set(`pk_name_${slug}`, name, cookieOpts)
  return res
}
