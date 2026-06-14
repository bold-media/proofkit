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

export type Comment = {
  id: string
  page_slug: string
  x_pct: number
  y_pct: number
  author: string
  body: string
  resolved: number
  created_at: string
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

export function listComments(slug: string): Comment[] {
  return db
    .prepare('SELECT * FROM comments WHERE page_slug = ? ORDER BY created_at ASC')
    .all(slug)
    .map((r) => plain<Comment>(r))
}

export function createComment(c: {
  page_slug: string
  x_pct: number
  y_pct: number
  author: string
  body: string
}): Comment {
  const id = makeId(10)
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO comments (id, page_slug, x_pct, y_pct, author, body, resolved, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
  ).run(id, c.page_slug, c.x_pct, c.y_pct, c.author, c.body, now)
  return db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as Comment
}

export function setCommentResolved(id: string, resolved: boolean): void {
  db.prepare('UPDATE comments SET resolved = ? WHERE id = ?').run(resolved ? 1 : 0, id)
}

export function deleteComment(id: string): void {
  db.prepare('DELETE FROM comments WHERE id = ?').run(id)
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
