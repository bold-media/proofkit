import { cookies } from 'next/headers'

import { getPage, isProjectMember, pageHasPassword, pageUnlockToken } from '@/lib/data'
import { currentClient } from '@/lib/client'
import { isOwner } from '@/lib/owner'
import { readSiteFile } from '@/lib/sites'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function gateHtml(slug: string, bad: boolean, loginBad: boolean, signedInName: string | null): string {
  const next = `/project/${slug}`
  // Client already signed in (just not a member here) → only the password path.
  const loginBlock = signedInName
    ? `<p>Signed in as <b>${esc(signedInName)}</b>, but you don't have access to this design yet. Enter the access password, or ask the owner to invite you.</p>`
    : `<form method="post" action="/api/client/login">
<input type="hidden" name="next" value="${next}" />
<input type="email" name="email" placeholder="Email" autocomplete="username" />
<input type="password" name="password" placeholder="Password" autocomplete="current-password" style="margin-top:8px" />
${loginBad ? '<div class="err">Wrong email or password.</div>' : ''}
<button type="submit">Log in</button></form>
<div class="sep">or use the access password</div>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Protected design</title>
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;background:#f6f7f9;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:20px}
.box{background:#fff;border:1px solid #e6e8ec;border-radius:14px;padding:28px;max-width:340px;width:100%}
h1{font-size:18px;margin:0 0 6px}p{color:#6b7280;font-size:14px;margin:0 0 16px}
input{width:100%;padding:10px 12px;border:1px solid #e6e8ec;border-radius:9px;font:inherit;box-sizing:border-box}
button{width:100%;margin-top:12px;padding:11px;border:none;border-radius:9px;background:#4f46e5;color:#fff;font:inherit;font-weight:600;cursor:pointer}
.err{color:#dc2626;font-size:13px;margin-top:8px}
.sep{display:flex;align-items:center;gap:10px;color:#9aa1a9;font-size:12px;margin:18px 0}
.sep::before,.sep::after{content:"";flex:1;height:1px;background:#e6e8ec}</style></head>
<body><div class="box">
<h1>This design is private</h1><p>Log in if you've been invited, or enter the access password.</p>
${loginBlock}
<form method="post" action="/api/project/${slug}/unlock">
<input type="password" name="password" placeholder="Access password" />
${bad ? '<div class="err">Wrong password — try again.</div>' : ''}
<button type="submit">View design</button></form>
</div></body></html>`
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

// The live page wraps the design in a resizable device frame so viewers can
// preview it at desktop / tablet / mobile widths. The design itself (with the
// comment overlay) is loaded inside the iframe via ?raw=1, so its own
// responsive CSS reacts to the real frame width.
function frameHtml(slug: string, name: string): string {
  const s = JSON.stringify(slug)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(name)}</title>
<style>
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{display:flex;flex-direction:column;background:#eceef1;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.pk-dev-bar{flex:none;display:flex;align-items:center;justify-content:center;gap:6px;height:46px;background:#fff;border-bottom:1px solid #e6e8ec;box-shadow:0 1px 3px rgba(16,24,40,.04);z-index:2}
.pk-dev-bar button{border:1px solid transparent;background:none;color:#5f5e5a;font:600 13px/1 inherit;padding:8px 14px;border-radius:8px;cursor:pointer}
.pk-dev-bar button:hover{background:#f1f2f4}
.pk-dev-bar button.on{background:#eef2ff;color:#4f46e5}
.pk-dev-stage{flex:1;min-height:0;overflow:auto;display:flex;justify-content:center;align-items:stretch}
.pk-dev-stage.framed{padding:20px}
#pk-frame{flex:none;width:100%;border:0;background:#fff}
#pk-frame.framed{border:1px solid #d7dae0;border-radius:14px;box-shadow:0 8px 30px rgba(16,24,40,.14)}
</style>
<link rel="stylesheet" href="/overlay.css" data-proof-css="1"></head>
<body>
<div class="pk-dev-bar">
<button data-w="full" class="on">Desktop</button>
<button data-w="768">Tablet</button>
<button data-w="390">Mobile</button>
</div>
<div class="pk-dev-stage" id="pk-stage">
<iframe id="pk-frame" title="Design preview" src="/project/${slug}?raw=1&framed=1" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"></iframe>
</div>
<script>
(function(){
var stage=document.getElementById('pk-stage'),frame=document.getElementById('pk-frame'),btns=document.querySelectorAll('.pk-dev-bar button');
var current='full';
function deviceOf(w){return w==='768'?'tablet':w==='390'?'mobile':'desktop'}
function widthOf(d){return d==='tablet'?'768':d==='mobile'?'390':'full'}
function postDevice(){try{frame.contentWindow.postMessage({pk:'device',device:deviceOf(current)},'*')}catch(e){}}
function apply(w){
current=w;
btns.forEach(function(b){b.classList.toggle('on',b.getAttribute('data-w')===w)});
if(w==='full'){frame.style.width='100%';frame.classList.remove('framed');stage.classList.remove('framed');}
else{frame.style.width=w+'px';frame.classList.add('framed');stage.classList.add('framed');}
try{localStorage.setItem('pk_device_'+${s},w)}catch(e){}
postDevice();
}
btns.forEach(function(b){b.addEventListener('click',function(){apply(b.getAttribute('data-w'))})});
// Re-announce the active device whenever the design (re)loads in the frame.
frame.addEventListener('load',postDevice);
// The overlay can ask to switch device (clicking a comment from another size).
window.addEventListener('message',function(e){if(e.data&&e.data.pk==='switch-device'&&e.data.device){apply(widthOf(e.data.device))}});
var saved='full';try{saved=localStorage.getItem('pk_device_'+${s})||'full'}catch(e){}
apply(saved);
})();
</script>
</body></html>`
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

  // Access: the owner always gets in; a logged-in client who's a member of this
  // project skips the gate; everyone else hits the password screen (when the
  // page has a password) which also offers a client login.
  const owner = await isOwner()
  const client = owner ? null : await currentClient()
  const member = client ? isProjectMember(slug, client.id) : false
  if (!owner && !member && pageHasPassword(slug)) {
    const c = await cookies()
    const unlocked = c.get(`pk_unlock_${slug}`)?.value === pageUnlockToken(slug)
    if (!unlocked) {
      const url = new URL(req.url)
      const bad = url.searchParams.get('bad') === '1'
      const loginBad = url.searchParams.get('login') === 'bad'
      return new Response(gateHtml(slug, bad, loginBad, client?.name || null), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      })
    }
  }

  // Normal visits get the device-frame wrapper; the wrapper's iframe (and the
  // editor preview) request the bare design + overlay with ?raw=1.
  const raw = new URL(req.url).searchParams.get('raw') === '1'
  if (!raw) {
    return new Response(frameHtml(slug, page.name), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
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
  // Tell the overlay whether the viewer is the owner, so it can show owner-only
  // controls (status changes, delete). The API still enforces this server-side.
  const ownerAttr = (await isOwner()) ? ' data-proof-owner="1"' : ''
  // In framed mode the overlay renders its chrome into the host (wrapper) page.
  const framedAttr = new URL(req.url).searchParams.get('framed') === '1' ? ' data-proof-framed="1"' : ''
  const overlay = `<link rel="stylesheet" href="/overlay.css" data-proof-css="1"><script src="/overlay.js" data-proof-slug="${slug}"${ownerAttr}${framedAttr}></script>`

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
