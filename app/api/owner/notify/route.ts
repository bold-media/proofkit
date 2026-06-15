import { NextResponse } from 'next/server'

import { getNotifyConfig, saveNotifyConfig } from '@/lib/notify'
import { isOwner } from '@/lib/owner'

export const runtime = 'nodejs'

export async function GET() {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(getNotifyConfig())
}

export async function POST(req: Request) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  saveNotifyConfig({
    token: typeof body.token === 'string' ? body.token : undefined,
    chat: typeof body.chat === 'string' ? body.chat : undefined,
  })
  return NextResponse.json({ ok: true, ...getNotifyConfig() })
}
