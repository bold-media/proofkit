import { NextResponse } from 'next/server'

import { detectChat, notifyTest, saveNotifyConfig } from '@/lib/notify'
import { isOwner } from '@/lib/owner'

export const runtime = 'nodejs'

// action 'detect' reads the bot's recent messages to find (and save) the chat id;
// action 'send' fires a test message to the configured chat.
export async function POST(req: Request) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const token = typeof body.token === 'string' ? body.token : undefined

  if (body.action === 'detect') {
    const r = await detectChat(token || '')
    if (r.ok && r.chat) saveNotifyConfig({ chat: r.chat })
    return NextResponse.json(r)
  }

  const r = await notifyTest(token, typeof body.chat === 'string' ? body.chat : undefined)
  return NextResponse.json(r)
}
