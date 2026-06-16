import { NextResponse } from 'next/server'

import { createVersion, getCurrentVersion, getPage, setPageEntry, setVersionEntry } from '@/lib/data'
import { isOwner } from '@/lib/owner'
import { appendVersionFiles, clearVersionDir, listVersionFiles, pickEntry } from '@/lib/sites'

export const runtime = 'nodejs'
export const maxDuration = 60

// Receives one batch of a folder upload. The client sends files a few at a time
// (with reset=true on the first batch), which is resilient on flaky networks.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  if (!getPage(id)) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  const form = await req.formData()
  const fileList = form.getAll('files').filter((f): f is File => f instanceof File)
  const paths = JSON.parse(String(form.get('paths') || '[]')) as string[]
  if (fileList.length === 0) return NextResponse.json({ error: 'No files' }, { status: 400 })

  // The first batch (reset=true) targets a version: reuse the current one if it's
  // still empty (a brand-new page's v1), otherwise start a NEW version (re-upload).
  if (form.get('reset') === 'true') {
    const cur = getCurrentVersion(id)
    const empty = cur && !cur.entry && !(cur.html && cur.html.trim())
    const v = empty ? cur : createVersion(id)
    clearVersionDir(id, v.dir)
  }
  const cur = getCurrentVersion(id)
  if (!cur) return NextResponse.json({ error: 'No version' }, { status: 500 })

  const files = await Promise.all(
    fileList.map(async (f, i) => ({
      path: paths[i] || f.name,
      bytes: Buffer.from(await f.arrayBuffer()),
    })),
  )
  appendVersionFiles(id, cur.dir, files)

  // Recompute the entry from everything uploaded into this version so far.
  const entry = pickEntry(listVersionFiles(id, cur.dir))
  if (entry) {
    setVersionEntry(cur.id, entry)
    setPageEntry(id, entry) // keep the page's entry in sync with the live version
  }

  return NextResponse.json({ ok: true, entry, version: cur.n })
}
