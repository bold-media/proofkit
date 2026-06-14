import { getPage } from '@/lib/data'
import { readSiteFile } from '@/lib/sites'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = getPage(slug)

  if (!page) {
    return new Response('<h1>Page not found</h1>', {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }

  let html: string
  let needsBase = false

  if (page.entry) {
    // Folder-hosted design: read its main HTML file from disk.
    const bytes = readSiteFile(slug, page.entry)
    html = bytes
      ? bytes.toString('utf8')
      : `<!doctype html><html><body style="font-family:sans-serif;padding:40px">Folder is missing its files. Re-upload it in Proofkit.</body></html>`
    needsBase = !!bytes
  } else {
    html =
      page.html?.trim() ||
      `<!doctype html><html><body style="font-family:sans-serif;padding:40px;color:#6b7280">
        <h2>Nothing here yet</h2><p>Add this page's HTML or upload a folder in Proofkit, then refresh.</p></body></html>`
  }

  // For folder designs, a <base> makes the design's relative links (css/js/images)
  // resolve to /project/<slug>/… where the asset route serves them.
  const baseTag = needsBase ? `<base href="/project/${slug}/">` : ''
  const overlay = `<script>window.__PROOF_SLUG__=${JSON.stringify(slug)};</script><script src="/overlay.js"></script>`

  if (baseTag) {
    html = /<head[^>]*>/i.test(html)
      ? html.replace(/<head[^>]*>/i, (m) => `${m}${baseTag}`)
      : `${baseTag}${html}`
  }
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${overlay}</body>`) : html + overlay

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}
