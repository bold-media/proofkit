import { cookies } from 'next/headers'

import { getPage, pageHasPassword, pageUnlockToken } from '@/lib/data'
import { isOwner } from '@/lib/owner'
import { readSiteFile } from '@/lib/sites'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function gateHtml(slug: string, bad: boolean): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Protected design</title>
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;background:#f6f7f9;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.box{background:#fff;border:1px solid #e6e8ec;border-radius:14px;padding:28px;max-width:340px;width:90%}
h1{font-size:18px;margin:0 0 6px}p{color:#6b7280;font-size:14px;margin:0 0 16px}
input{width:100%;padding:10px 12px;border:1px solid #e6e8ec;border-radius:9px;font:inherit;box-sizing:border-box}
button{width:100%;margin-top:12px;padding:11px;border:none;border-radius:9px;background:#4f46e5;color:#fff;font:inherit;font-weight:600;cursor:pointer}
.err{color:#dc2626;font-size:13px;margin-top:8px}</style></head>
<body><form class="box" method="post" action="/api/project/${slug}/unlock">
<h1>This design is password-protected</h1><p>Enter the password to view it.</p>
<input type="password" name="password" autofocus placeholder="Password" />
${bad ? '<div class="err">Wrong password — try again.</div>' : ''}
<button type="submit">View design</button></form></body></html>`
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = getPage(slug)

  if (!page) {
    return new Response('<h1>Page not found</h1>', {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }

  // Per-link password gate: show a password screen until the visitor unlocks it.
  // The owner (logged in) always bypasses it — including in the editor preview.
  if (pageHasPassword(slug) && !(await isOwner())) {
    const c = await cookies()
    const unlocked = c.get(`pk_unlock_${slug}`)?.value === pageUnlockToken(slug)
    if (!unlocked) {
      const bad = new URL(req.url).searchParams.get('bad') === '1'
      return new Response(gateHtml(slug, bad), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      })
    }
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
  // Tell the overlay whether the viewer is the owner, so it can show owner-only
  // controls (status changes, delete). The API still enforces this server-side.
  const ownerAttr = (await isOwner()) ? ' data-proof-owner="1"' : ''
  const overlay = `<link rel="stylesheet" href="/overlay.css" data-proof-css="1"><script src="/overlay.js" data-proof-slug="${slug}"${ownerAttr}></script>`

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
