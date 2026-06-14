import { bus } from '@/lib/events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Server-Sent Events stream: pushes a "changed" tick whenever a comment on this
// page is created, edited, moved, deleted, or reacted to. Viewers reload their
// comments on each tick — replacing the old polling with instant updates.
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('page')
  if (!slug) return new Response('missing page', { status: 400 })

  const encoder = new TextEncoder()
  const evt = 'change:' + slug
  let onChange: () => void = () => {}
  let heartbeat: ReturnType<typeof setInterval>

  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(encoder.encode(s))
        } catch {
          /* stream already closed */
        }
      }
      send('retry: 3000\n\n')
      onChange = () => send('data: changed\n\n')
      bus.on(evt, onChange)
      // Comment-keep-alive so proxies don't drop an idle connection.
      heartbeat = setInterval(() => send(': hb\n\n'), 25000)
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        bus.off(evt, onChange)
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      })
    },
    cancel() {
      clearInterval(heartbeat)
      bus.off(evt, onChange)
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
    },
  })
}
