import { contentType, readSiteFile } from '@/lib/sites'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Serves the assets (css/js/images/fonts) of a folder-hosted design.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; path: string[] }> },
) {
  const { slug, path } = await params
  const rel = (path || []).join('/')
  const bytes = readSiteFile(slug, rel)
  if (!bytes) {
    return new Response('Not found', { status: 404 })
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': contentType(rel),
      'cache-control': 'no-store',
    },
  })
}
