import { NextResponse } from 'next/server'

import { getPage, setPageEntry } from '@/lib/data'
import { appendSiteFiles, clearSite, listSiteFiles, pickEntry } from '@/lib/sites'

export const runtime = 'nodejs'
export const maxDuration = 60

// Receives one batch of a folder upload. The client sends files a few at a time
// (with reset=true on the first batch), which is resilient on flaky networks.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!getPage(id)) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  const form = await req.formData()
  const fileList = form.getAll('files').filter((f): f is File => f instanceof File)
  const paths = JSON.parse(String(form.get('paths') || '[]')) as string[]
  if (fileList.length === 0) return NextResponse.json({ error: 'No files' }, { status: 400 })

  if (form.get('reset') === 'true') clearSite(id)

  const files = await Promise.all(
    fileList.map(async (f, i) => ({
      path: paths[i] || f.name,
      bytes: Buffer.from(await f.arrayBuffer()),
    })),
  )
  appendSiteFiles(id, files)

  // Recompute the entry from everything uploaded so far.
  const entry = pickEntry(listSiteFiles(id))
  if (entry) setPageEntry(id, entry)

  return NextResponse.json({ ok: true, entry })
}
