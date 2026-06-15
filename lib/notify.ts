import { getSetting, setSetting } from './data'

// ---- Telegram notification transport ----
// The owner creates a bot via @BotFather (token) and we send to a chat id.
// Both are stored in the settings table.

export type NotifyConfig = { hasToken: boolean; chat: string | null }

export function getNotifyConfig(): NotifyConfig {
  return { hasToken: !!getSetting('notify_tg_token'), chat: getSetting('notify_tg_chat') }
}

export function saveNotifyConfig(fields: { token?: string; chat?: string | null }): void {
  if (typeof fields.token === 'string') setSetting('notify_tg_token', fields.token.trim())
  if (fields.chat !== undefined) setSetting('notify_tg_chat', (fields.chat || '').trim())
}

type Result = { ok: boolean; error?: string }

async function sendTelegram(token: string, chat: string, text: string): Promise<Result> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    })
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string }
    return json.ok ? { ok: true } : { ok: false, error: json.description || `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Network error' }
  }
}

// Fire-and-forget send used when new feedback arrives. Never throws.
export async function notify(text: string): Promise<void> {
  const token = getSetting('notify_tg_token')
  const chat = getSetting('notify_tg_chat')
  if (!token || !chat) return
  await sendTelegram(token, chat, text).catch(() => {})
}

// Send a test message (uses a passed token/chat if given, else the saved ones).
export async function notifyTest(token?: string, chat?: string): Promise<Result> {
  const t = (token || getSetting('notify_tg_token') || '').trim()
  const c = (chat || getSetting('notify_tg_chat') || '').trim()
  if (!t) return { ok: false, error: 'Add your bot token first.' }
  if (!c) return { ok: false, error: 'No chat id — detect or paste one first.' }
  return sendTelegram(t, c, '✅ Proofkit notifications are connected. New client feedback will land here.')
}

// Find the chat id from the bot's recent messages (the owner messages the bot,
// then we read getUpdates to grab the chat). Avoids hunting for the id by hand.
export async function detectChat(token: string): Promise<{ ok: boolean; chat?: string; name?: string; error?: string }> {
  const t = (token || getSetting('notify_tg_token') || '').trim()
  if (!t) return { ok: false, error: 'Add your bot token first.' }
  try {
    const res = await fetch(`https://api.telegram.org/bot${t}/getUpdates`)
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      description?: string
      result?: Array<{ message?: TgMsg; channel_post?: TgMsg }>
    }
    if (!json.ok) return { ok: false, error: json.description || 'Could not reach Telegram.' }
    const updates = json.result || []
    for (let i = updates.length - 1; i >= 0; i--) {
      const m = updates[i].message || updates[i].channel_post
      if (m && m.chat && m.chat.id != null) {
        return { ok: true, chat: String(m.chat.id), name: m.chat.title || m.chat.first_name || '' }
      }
    }
    return { ok: false, error: 'No recent message found — send your bot a message, then try again.' }
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'Network error' }
  }
}

type TgMsg = { chat?: { id?: number | string; title?: string; first_name?: string } }
