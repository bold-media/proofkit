import { getPage } from '@/lib/data'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = getPage(slug)

  if (!page) {
    return new Response('<h1>Page not found</h1>', {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }

  let html =
    page.html?.trim() ||
    `<!doctype html><html><body style="font-family:sans-serif;padding:40px;color:#6b7280">
      <h2>Nothing here yet</h2><p>Add this page's HTML in Proofkit, then refresh.</p></body></html>`

  // Inject the commenting overlay just before </body> (or at the end).
  const inject = `<script>window.__PROOF_SLUG__=${JSON.stringify(slug)};</script><script src="/overlay.js"></script>`
  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${inject}</body>`)
  } else {
    html += inject
  }

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
