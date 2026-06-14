import { NextResponse } from 'next/server'

import { getPage, setPageEntry } from '@/lib/data'
import { saveSiteFiles } from '@/lib/sites'

export const runtime = 'nodejs'
// Design folders can be large; allow a big request body.
export const maxDuration = 60

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!getPage(id)) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  const form = await req.formData()
  const fileList = form.getAll('files').filter((f): f is File => f instanceof File)
  const paths = JSON.parse(String(form.get('paths') || '[]')) as string[]
  if (fileList.length === 0) return NextResponse.json({ error: 'No files' }, { status: 400 })

  const files = await Promise.all(
    fileList.map(async (f, i) => ({
      path: paths[i] || f.name,
      bytes: Buffer.from(await f.arrayBuffer()),
    })),
  )

  const entry = await saveSiteFiles(id, files)
  if (!entry) {
    return NextResponse.json({ error: 'No HTML file found in the folder' }, { status: 400 })
  }
  setPageEntry(id, entry)
  return NextResponse.json({ ok: true, entry, count: files.length })
}
