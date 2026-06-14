import db, { makeId } from './db'
import { removeSite } from './sites'

export type Page = {
  slug: string
  name: string
  html: string
  entry: string | null
  created_at: string
  updated_at: string
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

export function createPage(name: string, html: string): Page {
  const slug = makeId()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO pages (slug, name, html, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(slug, name || 'Untitled', html || '', now, now)
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
