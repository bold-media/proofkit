import { NextResponse } from 'next/server'

import { completeClientSetup } from '@/lib/data'
import { currentClient } from '@/lib/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

function safeNext(v: string | null): string {
  return v && v.startsWith('/') ? v : '/'
}

function formHtml(name: string, next: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Set your name</title>
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;background:#f6f7f9;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:20px}
.box{background:#fff;border:1px solid #e6e8ec;border-radius:14px;padding:28px;max-width:340px;width:100%}
h1{font-size:18px;margin:0 0 6px}p{color:#6b7280;font-size:14px;margin:0 0 16px}
input{width:100%;padding:10px 12px;border:1px solid #e6e8ec;border-radius:9px;font:inherit;box-sizing:border-box}
button{width:100%;margin-top:12px;padding:11px;border:none;border-radius:9px;background:#4f46e5;color:#fff;font:inherit;font-weight:600;cursor:pointer}</style></head>
<body><form class="box" method="post" action="/client/setup">
<h1>What should we call you?</h1><p>This is the name shown on your comments.</p>
<input type="hidden" name="next" value="${esc(next)}" />
<input name="name" autofocus placeholder="Your name" value="${esc(name)}" />
<button type="submit">Continue</button></form></body></html>`
}

export async function GET(req: Request) {
  const client = await currentClient()
  const next = safeNext(new URL(req.url).searchParams.get('next'))
  if (!client) return NextResponse.redirect(new URL(next, req.url))
  return new Response(formHtml(client.name, next), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export async function POST(req: Request) {
  const client = await currentClient()
  const form = await req.formData()
  const next = safeNext(String(form.get('next') || '/'))
  if (client) completeClientSetup(client.id, String(form.get('name') || ''))
  return new NextResponse(null, { status: 303, headers: { Location: next } })
}
