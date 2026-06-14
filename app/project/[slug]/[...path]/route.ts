import { cookies } from 'next/headers'

import { pageHasPassword, pageUnlockToken } from '@/lib/data'
import { isOwner } from '@/lib/owner'
import { contentType, readSiteFile } from '@/lib/sites'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Serves the assets (css/js/images/fonts) of a folder-hosted design.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; path: string[] }> },
) {
  const { slug, path } = await params

  // Don't serve assets of a password-protected page until it's unlocked
  // (the owner always bypasses this).
  if (pageHasPassword(slug) && !(await isOwner())) {
    const c = await cookies()
    if (c.get(`pk_unlock_${slug}`)?.value !== pageUnlockToken(slug)) {
      return new Response('Locked', { status: 403 })
    }
  }

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
