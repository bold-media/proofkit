import { EventEmitter } from 'node:events'

// A process-wide pub/sub bus so the SSE endpoint can push comment changes to
// connected viewers the instant a write happens. Kept on globalThis so it
// survives dev hot-reloads, and shared across the single production process.
const g = globalThis as unknown as { __pkBus?: EventEmitter }
export const bus: EventEmitter = g.__pkBus || (g.__pkBus = new EventEmitter())
// Many viewers can subscribe to a popular page — don't warn about listeners.
bus.setMaxListeners(0)

export function emitCommentChange(slug: string): void {
  bus.emit('change:' + slug)
}
