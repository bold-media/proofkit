import { readUpload } from '@/lib/uploads'

export const runtime = 'nodejs'

// Serve a stored attachment. The name is validated against an allow-list pattern
// in readUpload, so it can't escape the uploads directory.
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const file = readUpload(name)
  if (!file) return new Response('Not found', { status: 404 })
  // Inline types (images, pdf, video) render in the browser; everything else is
  // forced to download. nosniff stops the browser second-guessing the type.
  const disposition = file.inline
    ? 'inline'
    : `attachment; filename="${file.filename.replace(/[^a-z0-9._-]/gi, '_')}"`
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'content-type': file.type,
      'content-disposition': disposition,
      'x-content-type-options': 'nosniff',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  })
}
