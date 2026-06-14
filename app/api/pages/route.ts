import { NextResponse } from 'next/server'

import { createPage, listPages } from '@/lib/data'

export async function GET() {
  return NextResponse.json({ pages: listPages() })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const page = createPage(String(body.name || 'Untitled'), String(body.html || ''))
  return NextResponse.json(page)
}
