import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'

// Reuse a single connection across hot reloads in dev.
const g = globalThis as unknown as { __proofkitDb?: DatabaseSync }

function init(): DatabaseSync {
  // In production (e.g. Coolify) point PROOFKIT_DB at a persistent volume,
  // e.g. /data/proofkit.db, so data survives redeploys.
  const dbPath = process.env.PROOFKIT_DB || path.join(process.cwd(), 'proofkit.db')
  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      html TEXT NOT NULL DEFAULT '',
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
  `)
  return db
}

const db = g.__proofkitDb ?? init()
if (process.env.NODE_ENV !== 'production') g.__proofkitDb = db

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
