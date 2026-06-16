import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'

// Reuse a single connection across hot reloads in dev.
const g = globalThis as unknown as { __proofkitDb?: DatabaseSync }

function init(): DatabaseSync {
  // In production (e.g. Coolify) point PROOFKIT_DB at a persistent volume,
  // e.g. /data/proofkit.db, so data survives redeploys.
  const dbPath = process.env.PROOFKIT_DB || path.join(process.cwd(), 'proofkit.db')
  const db = new DatabaseSync(dbPath)
  // WAL + a busy timeout keep things smooth under concurrent access.
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      html TEXT NOT NULL DEFAULT '',
      entry TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      page_slug TEXT NOT NULL,
      x_pct REAL NOT NULL,
      y_pct REAL NOT NULL,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS comments_page_idx ON comments (page_slug);
    CREATE TABLE IF NOT EXISTS reactions (
      comment_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      client_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (comment_id, emoji, client_id)
    );
    CREATE INDEX IF NOT EXISTS reactions_comment_idx ON reactions (comment_id);
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      session_token TEXT,
      must_setup INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_members (
      page_slug TEXT NOT NULL,
      client_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'commenter',
      created_at TEXT NOT NULL,
      PRIMARY KEY (page_slug, client_id)
    );
    CREATE INDEX IF NOT EXISTS members_client_idx ON project_members (client_id);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      page_slug TEXT NOT NULL,
      name TEXT NOT NULL,
      client_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS approvals_page_idx ON approvals (page_slug);
  `)
  // Add columns introduced after the first release (no-op if already present).
  const cols = (db.prepare('PRAGMA table_info(pages)').all() as { name: string }[]).map((c) => c.name)
  if (!cols.includes('entry')) db.exec('ALTER TABLE pages ADD COLUMN entry TEXT')
  if (!cols.includes('source_url')) db.exec('ALTER TABLE pages ADD COLUMN source_url TEXT')
  if (!cols.includes('view_password')) db.exec('ALTER TABLE pages ADD COLUMN view_password TEXT')

  // Comment status (open/progress/resolved) replaces the old binary
  // `resolved` flag, and `parent_id` threads replies under a top-level comment.
  const ccols = (db.prepare('PRAGMA table_info(comments)').all() as { name: string }[]).map((c) => c.name)
  if (!ccols.includes('status')) {
    db.exec("ALTER TABLE comments ADD COLUMN status TEXT NOT NULL DEFAULT 'open'")
    // Backfill from the legacy flag so already-resolved comments stay resolved.
    db.exec("UPDATE comments SET status = 'resolved' WHERE resolved = 1")
  }
  if (!ccols.includes('parent_id')) db.exec('ALTER TABLE comments ADD COLUMN parent_id TEXT')
  // Which preview width a comment was placed in. Existing rows default to
  // 'desktop' (they were placed on the full-width design).
  if (!ccols.includes('device')) {
    db.exec("ALTER TABLE comments ADD COLUMN device TEXT NOT NULL DEFAULT 'desktop'")
  }
  // Ties a comment to a logged-in client account (null for the owner/guests).
  if (!ccols.includes('client_id')) db.exec('ALTER TABLE comments ADD COLUMN client_id TEXT')
  // Optional DOM anchor (JSON: structural path + intra-element fraction) so a pin
  // rides with the element it was placed on — e.g. a comment inside a burger menu
  // hides/relocates when the menu closes. Null = legacy coordinate-only pin.
  if (!ccols.includes('anchor')) db.exec('ALTER TABLE comments ADD COLUMN anchor TEXT')
  // Marks the owner's own comments so they re-label when the owner renames. Backfill
  // existing "Owner" comments (the old default) so a first rename updates them too.
  if (!ccols.includes('is_owner')) {
    db.exec('ALTER TABLE comments ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0')
    db.exec("UPDATE comments SET is_owner = 1 WHERE author = 'Owner' AND client_id IS NULL")
  }
  // Optional image attachment (stored file name under /uploads, served via the
  // attachments route).
  if (!ccols.includes('image')) db.exec('ALTER TABLE comments ADD COLUMN image TEXT')
  // Whether a client still needs to set their own name + password (first login).
  const clcols = (db.prepare('PRAGMA table_info(clients)').all() as { name: string }[]).map((c) => c.name)
  if (clcols.length && !clcols.includes('must_setup')) {
    db.exec('ALTER TABLE clients ADD COLUMN must_setup INTEGER NOT NULL DEFAULT 0')
  }
  return db
}

function getDb(): DatabaseSync {
  if (!g.__proofkitDb) g.__proofkitDb = init()
  return g.__proofkitDb
}

// Lazy proxy: the database is opened on first real use (a request), NOT when
// modules are imported. This keeps `next build` from opening (and locking) it.
const db = new Proxy({} as DatabaseSync, {
  get(_target, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const real = getDb() as any
    const value = real[prop]
    return typeof value === 'function' ? value.bind(real) : value
  },
})

export default db

// Short, URL-friendly random id (no external dep).
export function makeId(len = 8): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}
