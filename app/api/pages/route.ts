import { NextResponse } from 'next/server'

import { createPage, listPages } from '@/lib/data'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json({ pages: listPages() })
}

// Fetch a design from a URL and rewrite it so relative assets still load
// from the original site.
async function fetchFromUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (proofkit importer)' },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`The link returned ${res.status}`)
  let html = await res.text()
  const baseTag = `<base href="${url}">`
  html = /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (m) => `${m}${baseTag}`)
    : `${baseTag}${html}`
  return html
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const name = String(body.name || 'Untitled')

  if (body.url) {
    try {
      const html = await fetchFromUrl(String(body.url))
      const page = createPage(name, html, String(body.url))
      return NextResponse.json(page)
    } catch (e) {
      return NextResponse.json(
        { error: `Couldn't fetch that link from the server (${(e as Error).message}).` },
        { status: 400 },
      )
    }
  }

  const page = createPage(name, String(body.html || ''))
  return NextResponse.json(page)
}
