import fs from 'node:fs'
import path from 'node:path'

import { makeId } from './db'

// Comment image attachments live next to the database (persistent volume in
// production), separate from the hosted design folders.
const DB = process.env.PROOFKIT_DB || path.join(process.cwd(), 'proofkit.db')
export const UPLOADS_DIR = path.join(path.dirname(DB), 'uploads')
fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024 // 8 MB

// Save an uploaded image; returns the public-relative name (e.g. "ab12cd34.png").
export function saveUpload(buf: Buffer, mime: string): string | null {
  const ext = EXT_BY_MIME[mime]
  if (!ext) return null
  if (buf.length > MAX_UPLOAD_BYTES) return null
  const name = `${makeId(16)}.${ext}`
  fs.writeFileSync(path.join(UPLOADS_DIR, name), buf)
  return name
}

const CONTENT_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

// Read an attachment by its (validated) file name. Returns null if missing or if
// the name tries to escape the uploads dir.
export function readUpload(name: string): { bytes: Buffer; type: string } | null {
  if (!/^[a-z0-9]+\.(png|jpg|gif|webp)$/i.test(name)) return null
  const file = path.join(UPLOADS_DIR, name)
  if (!file.startsWith(UPLOADS_DIR + path.sep)) return null
  if (!fs.existsSync(file)) return null
  const ext = name.split('.').pop()!.toLowerCase()
  return { bytes: fs.readFileSync(file), type: CONTENT_TYPE[ext] || 'application/octet-stream' }
}
