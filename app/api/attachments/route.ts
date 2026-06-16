import { NextResponse } from 'next/server'

import { MAX_UPLOAD_BYTES, saveUpload } from '@/lib/uploads'

export const runtime = 'nodejs'

// Public image upload for comment attachments (clients use this too). Returns the
// stored file name; the comment then references it. Images only, size-capped.
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file' }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Image is too large (max 8 MB)' }, { status: 413 })
  }
  const buf = Buffer.from(await file.arrayBuffer())
  const name = saveUpload(buf, file.type)
  if (!name) {
    return NextResponse.json({ error: 'Unsupported image type' }, { status: 415 })
  }
  return NextResponse.json({ ok: true, name, url: `/api/attachments/${name}` })
}
