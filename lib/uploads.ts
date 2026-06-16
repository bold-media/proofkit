import fs from 'node:fs'
import path from 'node:path'

import { makeId } from './db'

// Comment file attachments live next to the database (persistent volume in
// production), separate from the hosted design folders.
const DB = process.env.PROOFKIT_DB || path.join(process.cwd(), 'proofkit.db')
export const UPLOADS_DIR = path.join(path.dirname(DB), 'uploads')
fs.mkdirSync(UPLOADS_DIR, { recursive: true })

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024 // 25 MB

// Allow-listed types only. `inline` files (images, pdf, video) render in the
// browser; everything else is served as a download. Script-y types (svg, html,
// js…) are deliberately excluded to avoid serving executable content.
type Kind = { ct: string; inline: boolean; image: boolean }
const TYPES: Record<string, Kind> = {
  png: { ct: 'image/png', inline: true, image: true },
  jpg: { ct: 'image/jpeg', inline: true, image: true },
  jpeg: { ct: 'image/jpeg', inline: true, image: true },
  gif: { ct: 'image/gif', inline: true, image: true },
  webp: { ct: 'image/webp', inline: true, image: true },
  pdf: { ct: 'application/pdf', inline: true, image: false },
  mp4: { ct: 'video/mp4', inline: true, image: false },
  mov: { ct: 'video/quicktime', inline: true, image: false },
  doc: { ct: 'application/msword', inline: false, image: false },
  docx: { ct: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', inline: false, image: false },
  xls: { ct: 'application/vnd.ms-excel', inline: false, image: false },
  xlsx: { ct: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', inline: false, image: false },
  ppt: { ct: 'application/vnd.ms-powerpoint', inline: false, image: false },
  pptx: { ct: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', inline: false, image: false },
  txt: { ct: 'text/plain', inline: false, image: false },
  csv: { ct: 'text/csv', inline: false, image: false },
  rtf: { ct: 'application/rtf', inline: false, image: false },
  zip: { ct: 'application/zip', inline: false, image: false },
  key: { ct: 'application/octet-stream', inline: false, image: false },
  pages: { ct: 'application/octet-stream', inline: false, image: false },
  numbers: { ct: 'application/octet-stream', inline: false, image: false },
  sketch: { ct: 'application/octet-stream', inline: false, image: false },
  fig: { ct: 'application/octet-stream', inline: false, image: false },
}

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name || '')
  return m ? m[1].toLowerCase() : ''
}

// Save an upload. The stored name is "<id>-<sanitized original base>.<ext>" so we
// can show the real filename later, all in one column. Returns null if the type
// isn't allowed or the file is too big.
export function saveUpload(buf: Buffer, originalName: string): string | null {
  const ext = extOf(originalName)
  if (!TYPES[ext]) return null
  if (buf.length > MAX_UPLOAD_BYTES) return null
  const base = (originalName.replace(/\.[a-z0-9]+$/i, '') || 'file')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'file'
  const name = `${makeId(10)}-${base}.${ext}`
  fs.writeFileSync(path.join(UPLOADS_DIR, name), buf)
  return name
}

const NAME_RE = /^[a-z2-9]+-[a-z0-9_-]*\.([a-z0-9]+)$/i

export type StoredFile = { bytes: Buffer; type: string; inline: boolean; image: boolean; filename: string }

export function readUpload(name: string): StoredFile | null {
  if (!NAME_RE.test(name)) return null
  const ext = extOf(name)
  const kind = TYPES[ext]
  if (!kind) return null
  const file = path.join(UPLOADS_DIR, name)
  if (!file.startsWith(UPLOADS_DIR + path.sep)) return null
  if (!fs.existsSync(file)) return null
  return {
    bytes: fs.readFileSync(file),
    type: kind.ct,
    inline: kind.inline,
    image: kind.image,
    filename: name.replace(/^[a-z2-9]+-/i, ''),
  }
}
