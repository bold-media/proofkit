import { NextResponse } from 'next/server'

import { logoutClient } from '@/lib/data'
import { CLIENT_COOKIE, currentClient } from '@/lib/client'

export const runtime = 'nodejs'

export async function POST() {
  const client = await currentClient()
  if (client) logoutClient(client.id)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(CLIENT_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
