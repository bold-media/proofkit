import crypto from 'node:crypto'

import db, { makeId } from './db'
import { removeSite } from './sites'

export type Page = {
  slug: string
  name: string
  html: string
  entry: string | null
  source_url: string | null
  view_password: string | null
  created_at: string
  updated_at: string
}

// Page shape sent to the OWNER's editor (behind login). The client view-password
// is a shared door-code the owner must be able to see, so it's included here in
// readable form — never sent to public client pages.
export type ClientPage = Omit<Page, 'view_password'> & {
  hasPassword: boolean
  viewPassword: string | null
}
export function toClientPage(p: Page): ClientPage {
  const { view_password, ...rest } = p
  // Old passwords were stored scrambled (salt:hash) — show those as empty so the
  // owner just retypes a readable one.
  const looksHashed = !!view_password && /^[0-9a-f]{32}:[0-9a-f]{64}$/.test(view_password)
  return {
    ...rest,
    hasPassword: !!view_password,
    viewPassword: looksHashed ? null : view_password,
  }
}

export const COMMENT_STATUSES = ['open', 'progress', 'resolved'] as const
export type CommentStatus = (typeof COMMENT_STATUSES)[number]

// A small fixed palette of reactions clients/owner can add to a comment.
// Defined in a dependency-free module so client components can import it too.
export { REACTION_EMOJI } from './reactions'

export type Reaction = { emoji: string; count: number; mine: boolean }

export type Comment = {
  id: string
  page_slug: string
  x_pct: number
  y_pct: number
  author: string
  body: string
  resolved: number
  status: CommentStatus
  parent_id: string | null
  device: string
  created_at: string
  anchor: string | null
  reactions?: Reaction[]
}

export function listPages(): (Page & { open: number; total: number })[] {
  const pages = db.prepare('SELECT * FROM pages ORDER BY updated_at DESC').all() as Page[]
  return pages.map((p) => {
    const row = db
      .prepare(
        'SELECT COUNT(*) AS total, SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) AS open FROM comments WHERE page_slug = ?',
      )
      .get(p.slug) as { total: number; open: number | null }
    return { ...p, total: row.total ?? 0, open: row.open ?? 0 }
  })
}

// node:sqlite returns rows with a null prototype, which can't cross the
// server→client boundary; spread into a plain object.
function plain<T>(row: unknown): T {
  return { ...(row as object) } as T
}

export function getPage(slug: string): Page | undefined {
  const row = db.prepare('SELECT * FROM pages WHERE slug = ?').get(slug)
  return row ? plain<Page>(row) : undefined
}

// Build a readable URL slug from the page name (e.g. "Summer Campaign" -> "summer-campaign").
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function createPage(name: string, html: string, sourceUrl?: string): Page {
  const base = slugify(name) || makeId()
  let slug = base
  // Keep slugs unique; append a short suffix if this one is taken.
  while (getPage(slug)) slug = `${base}-${makeId(4)}`
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO pages (slug, name, html, source_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(slug, name || 'Untitled', html || '', sourceUrl || null, now, now)
  return getPage(slug)!
}

export function updatePage(slug: string, fields: { name?: string; html?: string }): void {
  const page = getPage(slug)
  if (!page) return
  const name = fields.name ?? page.name
  const html = fields.html ?? page.html
  db.prepare('UPDATE pages SET name = ?, html = ?, updated_at = ? WHERE slug = ?').run(
    name,
    html,
    new Date().toISOString(),
    slug,
  )
}

// Mark a page as folder-hosted (entry = the main HTML file inside the folder),
// or pass null to clear it back to a pasted-HTML page.
export function setPageEntry(slug: string, entry: string | null): void {
  db.prepare('UPDATE pages SET entry = ?, updated_at = ? WHERE slug = ?').run(
    entry,
    new Date().toISOString(),
    slug,
  )
}

export function deletePage(slug: string): void {
  db.prepare('DELETE FROM comments WHERE page_slug = ?').run(slug)
  db.prepare('DELETE FROM pages WHERE slug = ?').run(slug)
  removeSite(slug)
}

export function listComments(slug: string, clientId?: string): Comment[] {
  const comments = db
    .prepare('SELECT * FROM comments WHERE page_slug = ? ORDER BY created_at ASC')
    .all(slug)
    .map((r) => plain<Comment>(r))

  // Attach aggregated reactions (count per emoji, and whether this client added it).
  const rows = db
    .prepare(
      `SELECT r.comment_id AS id, r.emoji AS emoji, COUNT(*) AS count,
              SUM(CASE WHEN r.client_id = ? THEN 1 ELSE 0 END) AS mine
         FROM reactions r JOIN comments c ON c.id = r.comment_id
        WHERE c.page_slug = ?
        GROUP BY r.comment_id, r.emoji`,
    )
    .all(clientId || '', slug) as { id: string; emoji: string; count: number; mine: number }[]
  if (rows.length) {
    const byComment: Record<string, Reaction[]> = {}
    for (const r of rows) {
      ;(byComment[r.id] ||= []).push({ emoji: r.emoji, count: r.count, mine: r.mine > 0 })
    }
    for (const c of comments) if (byComment[c.id]) c.reactions = byComment[c.id]
  }
  return comments
}

// Toggle a reaction for a client. Returns true if it was added, false if removed.
export function toggleReaction(commentId: string, emoji: string, clientId: string): boolean {
  const exists = db
    .prepare('SELECT 1 FROM reactions WHERE comment_id = ? AND emoji = ? AND client_id = ?')
    .get(commentId, emoji, clientId)
  if (exists) {
    db.prepare('DELETE FROM reactions WHERE comment_id = ? AND emoji = ? AND client_id = ?').run(
      commentId,
      emoji,
      clientId,
    )
    return false
  }
  db.prepare(
    'INSERT INTO reactions (comment_id, emoji, client_id, created_at) VALUES (?, ?, ?, ?)',
  ).run(commentId, emoji, clientId, new Date().toISOString())
  return true
}

export function getComment(id: string): Comment | undefined {
  const row = db.prepare('SELECT * FROM comments WHERE id = ?').get(id)
  return row ? plain<Comment>(row) : undefined
}

export function createComment(c: {
  page_slug: string
  x_pct: number
  y_pct: number
  author: string
  body: string
  parent_id?: string | null
  device?: string
  client_id?: string | null
  anchor?: string | null
  is_owner?: boolean
}): Comment {
  const id = makeId(10)
  const now = new Date().toISOString()
  db.prepare(
    "INSERT INTO comments (id, page_slug, x_pct, y_pct, author, body, resolved, status, parent_id, device, client_id, anchor, is_owner, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, 'open', ?, ?, ?, ?, ?, ?)",
  ).run(id, c.page_slug, c.x_pct, c.y_pct, c.author, c.body, c.parent_id || null, c.device || 'desktop', c.client_id || null, c.anchor || null, c.is_owner ? 1 : 0, now)
  return plain<Comment>(db.prepare('SELECT * FROM comments WHERE id = ?').get(id))
}

export function setCommentPosition(id: string, x: number, y: number): void {
  const cx = Math.max(0, Math.min(100, x))
  const cy = Math.max(0, Math.min(100, y))
  // Only top-level comments carry a pin; replies have no position.
  db.prepare('UPDATE comments SET x_pct = ?, y_pct = ? WHERE id = ? AND parent_id IS NULL').run(cx, cy, id)
}

// Re-anchor (or clear) a pin's DOM anchor — used when a pin is dragged onto a
// different element. Pass null to drop back to coordinate-only positioning.
export function setCommentAnchor(id: string, anchor: string | null): void {
  db.prepare('UPDATE comments SET anchor = ? WHERE id = ? AND parent_id IS NULL').run(anchor, id)
}

export function setCommentStatus(id: string, status: CommentStatus): void {
  db.prepare('UPDATE comments SET status = ?, resolved = ? WHERE id = ?').run(
    status,
    status === 'resolved' ? 1 : 0,
    id,
  )
}

export function deleteComment(id: string): void {
  // Deleting a top-level comment removes its replies and all their reactions.
  db.prepare(
    'DELETE FROM reactions WHERE comment_id = ? OR comment_id IN (SELECT id FROM comments WHERE parent_id = ?)',
  ).run(id, id)
  db.prepare('DELETE FROM comments WHERE id = ? OR parent_id = ?').run(id, id)
}

// ---- Settings (key/value) ----
export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}
export function setSetting(key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value)
}

// The owner's display name, shown on their comments/replies (falls back to
// "Owner" when unset).
export function getOwnerName(): string {
  return getSetting('owner_name') || 'Owner'
}
export function setOwnerName(name: string): void {
  const n = name.slice(0, 80)
  setSetting('owner_name', n)
  // Re-label the owner's existing comments/replies so the new name shows there too.
  db.prepare('UPDATE comments SET author = ? WHERE is_owner = 1').run(n)
}

// Pages that carry an owner comment — so a rename can ping their live streams.
export function ownerCommentPages(): string[] {
  const rows = db
    .prepare('SELECT DISTINCT page_slug FROM comments WHERE is_owner = 1')
    .all() as { page_slug: string }[]
  return rows.map((r) => r.page_slug)
}

// ---- Password hashing (scrypt) ----
function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(pw, salt, 32).toString('hex')
  return `${salt}:${hash}`
}
function verifyPassword(pw: string, stored: string | null): boolean {
  if (!stored || !stored.includes(':')) return false
  const [salt, hash] = stored.split(':')
  const test = crypto.scryptSync(pw, salt, 32).toString('hex')
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(test, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// ---- Owner login ----
export function ownerConfigured(): boolean {
  return !!getSetting('owner_pw')
}
export function setOwnerPassword(pw: string): void {
  setSetting('owner_pw', hashPassword(pw))
  setSetting('owner_session', crypto.randomBytes(24).toString('hex'))
}
export function verifyOwner(pw: string): boolean {
  return verifyPassword(pw, getSetting('owner_pw'))
}
export function ownerSession(): string | null {
  return getSetting('owner_session')
}

// ---- Client accounts & per-project membership ----
export type Client = { id: string; email: string; name: string; must_setup: boolean; created_at: string }

function toClient(row: unknown): Client {
  const r = plain<{ id: string; email: string; name: string; created_at: string; must_setup?: number }>(row)
  return { id: r.id, email: r.email, name: r.name, must_setup: !!r.must_setup, created_at: r.created_at }
}

export function getClientByEmail(email: string): Client | undefined {
  const row = db.prepare('SELECT * FROM clients WHERE email = ?').get(email.trim().toLowerCase())
  return row ? toClient(row) : undefined
}
export function getClientBySession(token: string): Client | undefined {
  if (!token) return undefined
  const row = db.prepare('SELECT * FROM clients WHERE session_token = ?').get(token)
  return row ? toClient(row) : undefined
}

// Owner invites a client: create the account, or reset an existing one's
// password. Flags must_setup so the client is prompted to choose their own
// name + password on first login.
export function upsertClient(email: string, name: string, password: string): Client {
  const e = email.trim().toLowerCase()
  const existing = db.prepare('SELECT id FROM clients WHERE email = ?').get(e) as { id: string } | undefined
  if (existing) {
    db.prepare('UPDATE clients SET name = ?, password_hash = ?, must_setup = 1 WHERE id = ?').run(
      name.trim() || e,
      hashPassword(password),
      existing.id,
    )
    return toClient(db.prepare('SELECT * FROM clients WHERE id = ?').get(existing.id))
  }
  const id = makeId(10)
  db.prepare(
    'INSERT INTO clients (id, email, name, password_hash, must_setup, created_at) VALUES (?, ?, ?, ?, 1, ?)',
  ).run(id, e, name.trim() || e, hashPassword(password), new Date().toISOString())
  return toClient(db.prepare('SELECT * FROM clients WHERE id = ?').get(id))
}

// First-login: the client sets their own display name; clears the setup flag.
export function completeClientSetup(id: string, name: string): void {
  const n = name.trim().slice(0, 80)
  if (n) db.prepare('UPDATE clients SET name = ?, must_setup = 0 WHERE id = ?').run(n, id)
  else db.prepare('UPDATE clients SET must_setup = 0 WHERE id = ?').run(id)
}

// Verify credentials and rotate the session token; returns it for the cookie.
export function loginClient(email: string, password: string): { client: Client; token: string } | null {
  const row = db.prepare('SELECT * FROM clients WHERE email = ?').get(email.trim().toLowerCase()) as
    | { id: string; password_hash: string }
    | undefined
  if (!row || !verifyPassword(password, row.password_hash)) return null
  const token = crypto.randomBytes(24).toString('hex')
  db.prepare('UPDATE clients SET session_token = ? WHERE id = ?').run(token, row.id)
  return { client: toClient(db.prepare('SELECT * FROM clients WHERE id = ?').get(row.id)), token }
}
export function logoutClient(id: string): void {
  db.prepare('UPDATE clients SET session_token = NULL WHERE id = ?').run(id)
}

export function addProjectMember(slug: string, clientId: string): void {
  db.prepare(
    "INSERT OR IGNORE INTO project_members (page_slug, client_id, role, created_at) VALUES (?, ?, 'commenter', ?)",
  ).run(slug, clientId, new Date().toISOString())
}
export function removeProjectMember(slug: string, clientId: string): void {
  db.prepare('DELETE FROM project_members WHERE page_slug = ? AND client_id = ?').run(slug, clientId)
}
export function isProjectMember(slug: string, clientId: string): boolean {
  return !!db
    .prepare('SELECT 1 FROM project_members WHERE page_slug = ? AND client_id = ?')
    .get(slug, clientId)
}
// A project with any invited client is private — non-members must log in.
export function pageHasMembers(slug: string): boolean {
  return !!db.prepare('SELECT 1 FROM project_members WHERE page_slug = ? LIMIT 1').get(slug)
}
export function listProjectMembers(slug: string): Client[] {
  return db
    .prepare(
      `SELECT c.* FROM project_members m JOIN clients c ON c.id = m.client_id
        WHERE m.page_slug = ? ORDER BY c.name ASC`,
    )
    .all(slug)
    .map(toClient)
}

// ---- Per-page (client) view password ----
// Stored as plain text on purpose: it's a shared code the owner gives clients,
// not a secret login, and the owner needs to look it up to share it.
export function setPageViewPassword(slug: string, pw: string | null): void {
  const value = pw && pw.trim() ? pw.trim() : null
  db.prepare('UPDATE pages SET view_password = ?, updated_at = ? WHERE slug = ?').run(
    value,
    new Date().toISOString(),
    slug,
  )
}
export function pageHasPassword(slug: string): boolean {
  return !!getPage(slug)?.view_password
}
export function verifyPageViewPassword(slug: string, pw: string): boolean {
  const stored = getPage(slug)?.view_password
  return !!stored && pw === stored
}
// Token stored in the visitor's unlock cookie (derived so the cookie isn't the password).
export function pageUnlockToken(slug: string): string | null {
  const stored = getPage(slug)?.view_password
  if (!stored) return null
  return crypto.createHash('sha256').update('unlock:' + stored).digest('hex')
}
