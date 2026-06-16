import { readUpload } from '@/lib/uploads'

export const runtime = 'nodejs'

// Serve a stored attachment. The name is validated against an allow-list pattern
// in readUpload, so it can't escape the uploads directory.
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const file = readUpload(name)
  if (!file) return new Response('Not found', { status: 404 })
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'content-type': file.type,
      'cache-control': 'public, max-age=31536000, immutable',
    },
  })
}
