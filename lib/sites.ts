import fs from 'node:fs'
import path from 'node:path'

// Uploaded design folders live next to the database (on the persistent volume
// in production, e.g. /data/sites/<slug>/...).
const DB = process.env.PROOFKIT_DB || path.join(process.cwd(), 'proofkit.db')
export const SITES_DIR = path.join(path.dirname(DB), 'sites')
fs.mkdirSync(SITES_DIR, { recursive: true })

export function siteDir(slug: string): string {
  return path.join(SITES_DIR, slug)
}

// Join a relative path onto a base dir, refusing anything that escapes it.
export function safeJoin(base: string, rel: string): string {
  const target = path.normalize(path.join(base, rel))
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error('Invalid path')
  }
  return target
}

export function removeSite(slug: string): void {
  fs.rmSync(siteDir(slug), { recursive: true, force: true })
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.pdf': 'application/pdf',
}

export function contentType(file: string): string {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
}

// Empty a site folder (used before the first file of a fresh upload).
export function clearSite(slug: string): void {
  const base = siteDir(slug)
  fs.rmSync(base, { recursive: true, force: true })
  fs.mkdirSync(base, { recursive: true })
}

// Write (append) files into a site folder without clearing it.
export function appendSiteFiles(slug: string, files: { path: string; bytes: Buffer }[]): void {
  const base = siteDir(slug)
  fs.mkdirSync(base, { recursive: true })
  for (const f of files) {
    const rel = f.path.replace(/^\/+/, '')
    if (!rel || rel.includes('..')) continue
    const dest = safeJoin(base, rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, f.bytes)
  }
}

// All file paths currently in a site folder (to recompute the entry).
export function listSiteFiles(slug: string): string[] {
  const base = siteDir(slug)
  const out: string[] = []
  const walk = (dir: string, prefix: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name
      if (e.isDirectory()) walk(path.join(dir, e.name), rel)
      else out.push(rel)
    }
  }
  if (fs.existsSync(base)) walk(base, '')
  return out
}

// Choose which HTML file is the page to show: prefer the shallowest index.html,
// otherwise the shallowest .html file.
export function pickEntry(paths: string[]): string | null {
  const htmls = paths.filter((p) => /\.html?$/i.test(p))
  if (htmls.length === 0) return null
  const depth = (p: string) => p.split('/').length
  const indexes = htmls
    .filter((p) => /(^|\/)index\.html?$/i.test(p))
    .sort((a, b) => depth(a) - depth(b))
  if (indexes[0]) return indexes[0]
  return htmls.sort((a, b) => depth(a) - depth(b))[0]
}

export function readSiteFile(slug: string, rel: string): Buffer | null {
  try {
    const p = safeJoin(siteDir(slug), rel)
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) return null
    return fs.readFileSync(p)
  } catch {
    return null
  }
}
