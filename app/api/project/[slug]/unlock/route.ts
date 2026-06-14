import { NextResponse } from 'next/server'

import { pageUnlockToken, verifyPageViewPassword } from '@/lib/data'

export const runtime = 'nodejs'

// A client submits the per-link password here; on success we set an unlock
// cookie and send them to the design.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const form = await req.formData()
  const password = String(form.get('password') || '')

  if (!verifyPageViewPassword(slug, password)) {
    return NextResponse.redirect(new URL(`/project/${slug}?bad=1`, req.url), 303)
  }

  const res = NextResponse.redirect(new URL(`/project/${slug}`, req.url), 303)
  res.cookies.set(`pk_unlock_${slug}`, pageUnlockToken(slug) || '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return res
}
