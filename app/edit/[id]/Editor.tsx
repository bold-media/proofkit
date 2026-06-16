'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

import type { Approval, ClientPage, Comment, CommentStatus, Version } from '@/lib/data'
import { DEVICE_LABEL, DEVICE_SIZES, type DeviceSize } from '@/lib/devices'
import { REACTION_EMOJI } from '@/lib/reactions'
import FolderDrop, { type PickedFile } from '../../FolderDrop'
import PasswordInput from '../../PasswordInput'
import ClientAccess from './ClientAccess'
import { uploadDesign } from '../../upload'

function clientId(): string {
  if (typeof window === 'undefined') return ''
  let id = ''
  try {
    id = localStorage.getItem('pk_client_id') || ''
  } catch {
    /* ignore */
  }
  if (!id) {
    id = 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    try {
      localStorage.setItem('pk_client_id', id)
    } catch {
      /* ignore */
    }
  }
  return id
}

const STATUS: Record<CommentStatus, { label: string; color: string }> = {
  open: { label: 'Open', color: '#e5484d' },
  progress: { label: 'In progress', color: '#d97706' },
  resolved: { label: 'Resolved', color: '#16a34a' },
}
const STATUS_ORDER: CommentStatus[] = ['open', 'progress', 'resolved']
function statusOf(c: Comment): CommentStatus {
  return (STATUS[c.status as CommentStatus] ? c.status : 'open') as CommentStatus
}
// Render a comment body, highlighting "@Name" tokens that match a known person.
function highlightMentions(text: string, names: string[]): ReactNode {
  if (!names.length || !text.includes('@')) return text
  const sorted = [...names].sort((a, b) => b.length - a.length)
  const out: ReactNode[] = []
  let buf = ''
  let key = 0
  for (let i = 0; i < text.length; ) {
    if (text[i] === '@') {
      const hit = sorted.find(
        (n) =>
          text.substr(i + 1, n.length).toLowerCase() === n.toLowerCase() &&
          !/[A-Za-z0-9_]/.test(text.charAt(i + 1 + n.length)),
      )
      if (hit) {
        if (buf) {
          out.push(buf)
          buf = ''
        }
        out.push(
          <span key={key++} className="mention">
            @{hit}
          </span>,
        )
        i += 1 + hit.length
        continue
      }
    }
    buf += text[i]
    i++
  }
  if (buf) out.push(buf)
  return out
}

const FileIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
)
const ClipIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ verticalAlign: '-1px' }}>
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
)

function CommentImage({ image }: { image?: string | null }) {
  if (!image) return null
  const u = `/api/attachments/${image}`
  if (/\.(png|jpg|jpeg|gif|webp)$/i.test(image)) {
    return (
      <a href={u} target="_blank" rel="noreferrer" className="comment-img">
        <img src={u} alt="attachment" />
      </a>
    )
  }
  return (
    <a href={u} target="_blank" rel="noreferrer" className="comment-file">
      <FileIcon />
      <span>{image.replace(/^[a-z2-9]+-/i, '')}</span>
    </a>
  )
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function Editor({
  page,
  initialComments,
  approvals = [],
  versions = [],
  currentVersion = null,
}: {
  page: ClientPage
  initialComments: Comment[]
  approvals?: Approval[]
  versions?: Version[]
  currentVersion?: string | null
}) {
  const router = useRouter()
  const [name, setName] = useState(page.name)
  const [html, setHtml] = useState(page.html)
  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [publicUrl, setPublicUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [requirePw, setRequirePw] = useState(page.hasPassword)
  const [pwValue, setPwValue] = useState(page.viewPassword || '')
  const [memberCount, setMemberCount] = useState(0)
  const [memberNames, setMemberNames] = useState<string[]>([])
  const [accessOpen, setAccessOpen] = useState(false)
  // Which version the preview is showing (defaults to the live one).
  const [viewVersion, setViewVersion] = useState<string | null>(currentVersion)
  const [publishing, setPublishing] = useState(false)
  const [previewNonce, setPreviewNonce] = useState(0)
  // Side-by-side compare: A vs B at a shared width.
  const [compareMode, setCompareMode] = useState(false)
  const [compareA, setCompareA] = useState<string>(versions[versions.length - 2]?.id || versions[0]?.id || '')
  const [compareB, setCompareB] = useState<string>(versions[versions.length - 1]?.id || '')
  const [compareWidth, setCompareWidth] = useState<'full' | 768 | 390>('full')
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [filter, setFilter] = useState<'all' | CommentStatus>('all')
  const [deviceFilter, setDeviceFilter] = useState<'all' | DeviceSize>('all')
  const [nameFilter, setNameFilter] = useState('')
  const frame = useRef<HTMLIFrameElement>(null)
  const isFolder = !!page.entry

  useEffect(() => {
    setPublicUrl(`${window.location.origin}/project/${page.slug}`)
  }, [page.slug])

  // Seed the access badge with the invited-client count so it's accurate even
  // before the "Access & privacy" section (which mounts ClientAccess) is opened.
  useEffect(() => {
    fetch(`/api/pages/${page.slug}/members`)
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((j) => {
        const m = j.members || []
        setMemberCount(m.length)
        setMemberNames(m.map((x: { name: string }) => x.name).filter(Boolean))
      })
      .catch(() => {})
  }, [page.slug])

  async function loadComments() {
    try {
      const res = await fetch(`/api/comments?page=${page.slug}&client=${encodeURIComponent(clientId())}`)
      const json = await res.json()
      setComments(json.comments || [])
    } catch {
      /* ignore */
    }
  }

  function react(id: string, emoji: string) {
    // Optimistic toggle of this browser's reaction; the POST + SSE reconcile it.
    setComments((cs) =>
      cs.map((c) => {
        if (c.id !== id) return c
        const reactions = [...(c.reactions || [])]
        const i = reactions.findIndex((r) => r.emoji === emoji)
        if (i >= 0) {
          const r = reactions[i]
          if (r.mine) {
            if (r.count <= 1) reactions.splice(i, 1)
            else reactions[i] = { ...r, count: r.count - 1, mine: false }
          } else {
            reactions[i] = { ...r, count: r.count + 1, mine: true }
          }
        } else {
          reactions.push({ emoji, count: 1, mine: true })
        }
        return { ...c, reactions }
      }),
    )
    fetch('/api/reactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment_id: id, emoji, client_id: clientId() }),
    }).catch(() => {})
  }
  // Live updates via SSE — new client feedback shows up instantly. A slow poll
  // stays as a safety net (and the sole path if EventSource isn't available).
  useEffect(() => {
    let es: EventSource | null = null
    let poll: ReturnType<typeof setInterval>
    try {
      es = new EventSource(`/api/comments/stream?page=${page.slug}`)
      es.onmessage = () => loadComments()
      poll = setInterval(loadComments, 30000)
    } catch {
      poll = setInterval(loadComments, 4000)
    }
    return () => {
      es?.close()
      clearInterval(poll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    const body: Record<string, unknown> = { name, html }
    // Per-link client password: the field shows the current code; save what's there.
    body.viewPassword = requirePw ? pwValue.trim() : null
    await fetch(`/api/pages/${page.slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
    setPreviewNonce((n) => n + 1)
    router.refresh()
  }

  async function replaceFolder(files: PickedFile[]) {
    setUploading(true)
    try {
      await uploadDesign(page.slug, files)
      // The upload created a new live version — follow it and reload the preview.
      setViewVersion(null)
      setPreviewNonce((n) => n + 1)
      router.refresh()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  async function publishVersion(versionId: string) {
    setPublishing(true)
    await fetch(`/api/pages/${page.slug}/version`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version_id: versionId }),
    })
    setPublishing(false)
    router.refresh()
  }

  async function removeVersion(versionId: string) {
    if (!confirm('Delete this version? Its files are removed (comments are kept). This can’t be undone.')) return
    setPublishing(true)
    await fetch(`/api/pages/${page.slug}/version`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version_id: versionId }),
    })
    setPublishing(false)
    setViewVersion(null) // the live version may have changed; follow it
    setPreviewNonce((n) => n + 1)
    router.refresh()
  }

  function copyLink() {
    navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function setStatus(id: string, status: CommentStatus) {
    setComments((cs) =>
      cs.map((c) => (c.id === id ? { ...c, status, resolved: status === 'resolved' ? 1 : 0 } : c)),
    )
    await fetch(`/api/comments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  }

  async function reply(parentId: string, body: string) {
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page_slug: page.slug, parent_id: parentId, author: 'Owner', body }),
    })
    const created = await res.json()
    if (created && created.id) setComments((cs) => [...cs, created])
  }

  async function removeComment(id: string) {
    // Removing a top-level comment removes its replies too.
    setComments((cs) => cs.filter((c) => c.id !== id && c.parent_id !== id))
    await fetch(`/api/comments/${id}`, { method: 'DELETE' })
  }

  async function deletePage() {
    setDeleting(true)
    await fetch(`/api/pages/${page.slug}`, { method: 'DELETE' })
    router.push('/')
  }

  const tops = comments.filter((c) => !c.parent_id)
  const repliesByParent = comments.reduce<Record<string, Comment[]>>((acc, c) => {
    if (c.parent_id) (acc[c.parent_id] ||= []).push(c)
    return acc
  }, {})
  const counts = { open: 0, progress: 0, resolved: 0 } as Record<CommentStatus, number>
  tops.forEach((c) => (counts[statusOf(c)] += 1))
  const openCount = counts.open + counts.progress
  // "What changed" for the live version: how much prior feedback it addressed.
  const versionLabel = (id: string | null) => (id ? versions.find((v) => v.id === id)?.label : undefined)
  const liveLabel = versionLabel(currentVersion)
  const addressedHere = tops.filter((c) => c.fixed_in === currentVersion && currentVersion).length
  // Open + In progress first so the work-to-do floats to the top of a long list.
  const sortedTops = [...tops].sort((a, b) => {
    const rank = (c: Comment) => (statusOf(c) === 'resolved' ? 1 : 0)
    return rank(a) - rank(b)
  })
  const deviceOf = (c: Comment) => (DEVICE_SIZES.includes(c.device as DeviceSize) ? c.device : 'desktop')
  // Status chip counts are scoped to the selected device tab.
  const deviceTops = deviceFilter === 'all' ? tops : tops.filter((c) => deviceOf(c) === deviceFilter)
  const statusCounts = { open: 0, progress: 0, resolved: 0 } as Record<CommentStatus, number>
  deviceTops.forEach((c) => (statusCounts[statusOf(c)] += 1))
  const nameQ = nameFilter.trim().toLowerCase()
  const visibleTops = sortedTops
    .filter((c) => deviceFilter === 'all' || deviceOf(c) === deviceFilter)
    .filter((c) => filter === 'all' || statusOf(c) === filter)
    .filter((c) => !nameQ || c.author.toLowerCase().includes(nameQ))
  // Pin numbers follow creation order (matching the pins on the design), so they
  // stay stable when the list is sorted or filtered.
  const numberById = new Map(tops.map((c, i) => [c.id, i + 1]))
  const FILTERS: { key: 'all' | CommentStatus; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: deviceTops.length },
    { key: 'open', label: 'Open', n: statusCounts.open },
    { key: 'progress', label: 'In progress', n: statusCounts.progress },
    { key: 'resolved', label: 'Resolved', n: statusCounts.resolved },
  ]
  const deviceCounts = { desktop: 0, tablet: 0, mobile: 0 } as Record<DeviceSize, number>
  tops.forEach((c) => (deviceCounts[deviceOf(c) as DeviceSize] += 1))
  const DEVICE_TABS: { key: 'all' | DeviceSize; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: tops.length },
    { key: 'desktop', label: 'Desktop', n: deviceCounts.desktop },
    { key: 'tablet', label: 'Tablet', n: deviceCounts.tablet },
    { key: 'mobile', label: 'Mobile', n: deviceCounts.mobile },
  ]

  // Taggable people: the owner, invited clients, and anyone who has commented.
  const peopleNames = Array.from(
    new Map(
      ['Owner', ...memberNames, ...comments.map((c) => c.author)]
        .filter(Boolean)
        .map((n) => [n.toLowerCase(), n]),
    ).values(),
  )

  const isPrivate = requirePw || memberCount > 0
  // Compact summary of who can open the link, shown on the badge + collapsed header.
  const accessParts: string[] = []
  if (requirePw) accessParts.push('password')
  if (memberCount > 0) accessParts.push(`${memberCount} client${memberCount > 1 ? 's' : ''}`)
  const accessSummary = isPrivate ? accessParts.join(' + ') : 'Anyone with the link'

  return (
    <div>
      <a href="/" className="back-link">
        ← Pages
      </a>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div className="row" style={{ flex: 1, minWidth: 0, gap: 10 }}>
          <input
            className="input"
            style={{ maxWidth: 340, fontWeight: 600 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <span className={isPrivate ? 'access-badge private' : 'access-badge'}>
            {isPrivate ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Private
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                Public
              </>
            )}
          </span>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={() => setConfirmDel(true)} style={{ color: 'var(--danger)' }}>
            Delete
          </button>
          <button className="btn" onClick={save}>
            {saved ? 'Saved ✓' : 'Save'}
          </button>
        </div>
      </div>

      {approvals.length > 0 ? (
        <div className="approve-banner ok">
          <span className="approve-ico" aria-hidden>
            ✓
          </span>
          <span>
            Approved by <strong>{approvals[0].name}</strong> · {timeAgo(approvals[0].created_at)}
            {approvals.length > 1 && ` (and ${approvals.length - 1} more)`}
          </span>
        </div>
      ) : (
        <div className="approve-banner pending">
          <span className="approve-ico" aria-hidden>
            ◷
          </span>
          <span>Awaiting client sign-off — clients see an “Approve” button on the live page.</span>
        </div>
      )}

      <div className="card" style={{ marginBottom: 18 }}>
        <label className="field-label">Live link to send your client</label>
        <div className="row">
          <input className="input" readOnly value={publicUrl} />
          <button className="btn ghost" onClick={copyLink}>
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
          <a className="btn ghost" href={publicUrl} target="_blank" rel="noreferrer">
            Open
          </a>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>
          {isPrivate
            ? 'This design is private — only people with the password or an invited client can open it.'
            : 'Anyone with this link can view the page and leave pinned comments — no login needed.'}
        </p>

        <button
          type="button"
          className={accessOpen ? 'access-toggle open' : 'access-toggle'}
          onClick={() => setAccessOpen((o) => !o)}
        >
          <span className="chev" aria-hidden>
            ▸
          </span>
          <span style={{ fontWeight: 600 }}>Access &amp; privacy</span>
          <span className="muted" style={{ fontSize: 13 }}>
            {accessSummary}
          </span>
        </button>

        {accessOpen && (
          <div className="access-body">
            <label className="toggle">
              <input
                type="checkbox"
                checked={requirePw}
                onChange={(e) => setRequirePw(e.target.checked)}
              />
              <span className="track" />
              Require a password to view this link
            </label>
            {requirePw && (
              <div style={{ marginTop: 12 }}>
                <PasswordInput
                  value={pwValue}
                  onChange={setPwValue}
                  placeholder="Password clients will enter"
                  initialVisible
                  maxWidth={320}
                />
              </div>
            )}
            <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
              {requirePw
                ? 'Clients must enter this to view the design — it stays visible here so you can copy and share it. Click Save to apply.'
                : 'The link is open to anyone who has it. Click Save after changing this.'}
            </p>

            <ClientAccess slug={page.slug} onCountChange={setMemberCount} />
          </div>
        )}
      </div>

      <div className="editor-grid">
        <div>
          {isFolder ? (
            <>
              <label className="field-label">Design folder</label>
              <p className="muted" style={{ fontSize: 13, margin: '0 0 8px' }}>
                Hosted folder (main file: <code>{page.entry}</code>). Drop a folder again to upload a new
                version{versions.length > 1 ? ` (you have ${versions.length})` : ''} — comments are kept.
              </p>
              <FolderDrop busy={uploading} onPick={replaceFolder} />
            </>
          ) : (
            <>
              <label className="field-label">Design HTML</label>
              <textarea
                className="textarea"
                rows={16}
                value={html}
                placeholder="<!doctype html> …"
                onChange={(e) => setHtml(e.target.value)}
              />
            </>
          )}
        </div>

        <div>
          <label className="field-label">
            Comments {openCount > 0 && <span className="badge open">{openCount} open</span>}
          </label>
          {versions.length > 1 && tops.length > 0 && (
            <p className="muted" style={{ fontSize: 13, margin: '0 0 10px' }}>
              <strong style={{ color: 'var(--text)' }}>{liveLabel}</strong> —{' '}
              <strong style={{ color: 'var(--success)' }}>{addressedHere} addressed</strong> · {openCount}{' '}
              outstanding. Resolve a comment to mark it fixed in {liveLabel}.
            </p>
          )}
          {tops.length === 0 ? (
            <p className="muted" style={{ fontSize: 14 }}>
              No comments yet. Share the live link and feedback shows up here.
            </p>
          ) : (
            <>
              <div className="device-tabs">
                {DEVICE_TABS.map((d) => (
                  <button
                    key={d.key}
                    className={deviceFilter === d.key ? 'dtab on' : 'dtab'}
                    onClick={() => setDeviceFilter(d.key)}
                  >
                    {d.label} <span className="count">{d.n}</span>
                  </button>
                ))}
              </div>
              <input
                className="input"
                style={{ marginBottom: 10 }}
                placeholder="Filter by name…"
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
              />
              <div className="comments-filter">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    className={filter === f.key ? 'cfilter on' : 'cfilter'}
                    onClick={() => setFilter(f.key)}
                  >
                    {f.label}
                    <span className="count">{f.n}</span>
                  </button>
                ))}
              </div>
              {visibleTops.length === 0 ? (
                <p className="muted" style={{ fontSize: 14 }}>
                  {nameQ ? `No comments from “${nameFilter.trim()}”.` : 'No comments match these filters.'}
                </p>
              ) : (
                <div className="comments-scroll">
                  {visibleTops.map((c) => (
                    <CommentCard
                      key={c.id}
                      comment={c}
                      number={numberById.get(c.id) || 0}
                      replies={repliesByParent[c.id] || []}
                      names={peopleNames}
                      fixedLabel={versionLabel(c.fixed_in)}
                      defaultOpen={false}
                      onStatus={(s) => setStatus(c.id, s)}
                      onReply={(body) => reply(c.id, body)}
                      onReact={(emoji) => react(c.id, emoji)}
                      onDelete={() => removeComment(c.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 22, gap: 12, flexWrap: 'wrap' }}>
        <label className="field-label" style={{ margin: 0 }}>
          Preview — exactly what your client sees
        </label>
        {versions.length > 1 && (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div className="version-pills">
              {versions.map((v) => {
                const shown = (viewVersion ?? currentVersion) === v.id
                const live = currentVersion === v.id
                return (
                  <button
                    key={v.id}
                    className={shown ? 'vpill on' : 'vpill'}
                    onClick={() => setViewVersion(v.id)}
                    title={new Date(v.created_at).toLocaleString()}
                  >
                    {v.label}
                    {live && <span className="vlive">live</span>}
                  </button>
                )
              })}
            </div>
            {(viewVersion ?? currentVersion) !== currentVersion && (
              <button className="btn btn-sm" disabled={publishing} onClick={() => publishVersion(viewVersion!)}>
                {publishing ? '…' : 'Make this version live'}
              </button>
            )}
            {versions.length > 1 && (viewVersion ?? currentVersion) && (
              <button
                className="btn btn-sm ghost"
                disabled={publishing}
                style={{ color: 'var(--danger)' }}
                onClick={() => removeVersion((viewVersion ?? currentVersion)!)}
              >
                Delete version
              </button>
            )}
            <button className={compareMode ? 'btn btn-sm' : 'btn btn-sm ghost'} onClick={() => setCompareMode((c) => !c)}>
              {compareMode ? 'Exit compare' : 'Compare'}
            </button>
          </div>
        )}
      </div>
      {compareMode ? (
        <>
          <div className="row" style={{ gap: 8, margin: '6px 0 10px' }}>
            <span className="muted" style={{ fontSize: 13 }}>
              Width:
            </span>
            {(['full', 768, 390] as const).map((w) => (
              <button
                key={w}
                className={compareWidth === w ? 'dtab on' : 'dtab'}
                onClick={() => setCompareWidth(w)}
              >
                {w === 'full' ? 'Desktop' : w === 768 ? 'Tablet' : 'Mobile'}
              </button>
            ))}
          </div>
          <div className="compare-grid">
            {[
              { v: compareA, set: setCompareA },
              { v: compareB, set: setCompareB },
            ].map((side, i) => (
              <div key={i} className="compare-col">
                <select className="input" value={side.v} onChange={(e) => side.set(e.target.value)}>
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                      {v.id === currentVersion ? ' (live)' : ''}
                    </option>
                  ))}
                </select>
                <div className="compare-stage">
                  <iframe
                    key={`${side.v}-${compareWidth}`}
                    className="compare-frame"
                    style={{ width: compareWidth === 'full' ? '100%' : `${compareWidth}px` }}
                    src={`/project/${page.slug}?raw=1&bare=1&v=${side.v}`}
                    title={`Compare ${i === 0 ? 'A' : 'B'}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 8px' }}>
            {(viewVersion ?? currentVersion) === currentVersion
              ? 'This is the live design your client sees. Drop a folder above to upload a new version.'
              : 'Previewing an older version — clients still see the live one until you publish it.'}
          </p>
          <iframe
            key={`${viewVersion ?? currentVersion ?? 'cur'}-${previewNonce}`}
            ref={frame}
            className="preview-frame"
            src={`/project/${page.slug}?raw=1${(viewVersion ?? currentVersion) ? `&v=${viewVersion ?? currentVersion}` : ''}`}
            title="Preview"
          />
        </>
      )}

      {confirmDel && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(16,24,40,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 20,
          }}
          onClick={() => !deleting && setConfirmDel(false)}
        >
          <div className="card" style={{ maxWidth: 380, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <h1 style={{ fontSize: 18, marginTop: 0 }}>Delete this page?</h1>
            <p className="muted" style={{ marginTop: 0 }}>
              This permanently removes the design and all its comments. It can&apos;t be undone.
            </p>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn ghost" disabled={deleting} onClick={() => setConfirmDel(false)}>
                Cancel
              </button>
              <button className="btn danger" disabled={deleting} onClick={deletePage}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// A reply input with an @mention autocomplete. Enter submits (Shift+Enter for a
// newline); when the suggestion menu is open, Enter/Tab pick the highlighted name.
function MentionInput({
  value,
  onChange,
  onEnter,
  names,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  onEnter: () => void
  names: string[]
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [matches, setMatches] = useState<string[]>([])
  const [active, setActive] = useState(0)
  const [at, setAt] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Position the dropdown next to the input, flipping above it when there isn't
  // room below (the input may sit low inside the scrollable comments list).
  useLayoutEffect(() => {
    if (!open || !ref.current || !menuRef.current) return
    const r = ref.current.getBoundingClientRect()
    const mh = menuRef.current.offsetHeight
    const mw = menuRef.current.offsetWidth
    const vh = window.innerHeight
    const vw = window.innerWidth
    let top = r.bottom + 4
    if (top + mh > vh - 8 && r.top - 4 - mh > 8) top = r.top - 4 - mh
    top = Math.max(8, Math.min(top, vh - mh - 8))
    const left = Math.max(8, Math.min(r.left, vw - mw - 8))
    setPos({ top, left, width: r.width })
  }, [open, matches])

  function refresh(val: string, caret: number) {
    const upto = val.slice(0, caret)
    const a = upto.lastIndexOf('@')
    if (a < 0 || (a > 0 && !/\s/.test(upto.charAt(a - 1)))) return setOpen(false)
    const q = upto.slice(a + 1)
    if (/[\n@]/.test(q) || q.length > 30) return setOpen(false)
    const ms = names.filter((n) => n.toLowerCase().includes(q.toLowerCase())).slice(0, 6)
    if (!ms.length) return setOpen(false)
    setMatches(ms)
    setActive(0)
    setAt(a)
    setOpen(true)
  }

  function pick(name: string) {
    const el = ref.current
    const caret = el?.selectionStart ?? value.length
    const before = value.slice(0, at)
    const insert = '@' + name + ' '
    onChange(before + insert + value.slice(caret))
    setOpen(false)
    requestAnimationFrame(() => {
      const p = (before + insert).length
      el?.focus()
      el?.setSelectionRange(p, p)
    })
  }

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <input
        ref={ref}
        className="input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          refresh(e.target.value, e.target.selectionStart || 0)
        }}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              return setActive((a) => (a + 1) % matches.length)
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              return setActive((a) => (a - 1 + matches.length) % matches.length)
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault()
              return pick(matches[active])
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              return setOpen(false)
            }
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onEnter()
          }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div
          ref={menuRef}
          className="mention-menu"
          style={{
            top: pos ? pos.top : -9999,
            left: pos ? pos.left : -9999,
            minWidth: Math.min(pos?.width ?? 180, 240),
            visibility: pos ? 'visible' : 'hidden',
          }}
        >
          {matches.map((n, i) => (
            <div
              key={n}
              className={i === active ? 'mention-item on' : 'mention-item'}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(n)
              }}
            >
              {n}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CommentCard({
  comment,
  number,
  replies,
  names,
  fixedLabel,
  defaultOpen,
  onStatus,
  onReply,
  onReact,
  onDelete,
}: {
  comment: Comment
  number: number
  replies: Comment[]
  names: string[]
  fixedLabel?: string
  defaultOpen: boolean
  onStatus: (s: CommentStatus) => void
  onReply: (body: string) => void
  onReact: (emoji: string) => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [text, setText] = useState('')
  const status = statusOf(comment)
  const dim = status === 'resolved'

  function send() {
    const body = text.trim()
    if (!body) return
    onReply(body)
    setText('')
  }

  return (
    <div className={`comment${dim ? ' dim' : ''}${open ? ' open' : ''}`}>
      <button className="comment-head comment-toggle" onClick={() => setOpen((o) => !o)}>
        <span className="chev" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
        <span className="comment-pin" style={{ background: STATUS[status].color }}>
          {number}
        </span>
        <strong style={{ fontWeight: 600 }}>{comment.author}</strong>
        <span className="ctime" title={new Date(comment.created_at).toLocaleString()}>
          {timeAgo(comment.created_at)}
        </span>
        <span className="cdev">{DEVICE_LABEL[comment.device] || 'Desktop'}</span>
        <span className="cbadge" style={{ background: STATUS[status].color }}>
          {status === 'resolved' && fixedLabel ? `Fixed in ${fixedLabel}` : STATUS[status].label}
        </span>
      </button>

      {!open ? (
        <div className="comment-snippet">
          {comment.image && (
            <span style={{ marginRight: 5, color: 'var(--muted)' }}>
              <ClipIcon />
            </span>
          )}
          {highlightMentions(comment.body, names)}
          {replies.length > 0 && ` · ${replies.length} ${replies.length > 1 ? 'replies' : 'reply'}`}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', marginTop: 6 }}>
            {highlightMentions(comment.body, names)}
          </div>
          <CommentImage image={comment.image} />

          <div className="creactions">
            {REACTION_EMOJI.map((em) => {
              const r = (comment.reactions || []).find((x) => x.emoji === em)
              return (
                <button
                  key={em}
                  className={r?.mine ? 'creact mine' : 'creact'}
                  onClick={() => onReact(em)}
                >
                  {em}
                  {r?.count ? <span>{r.count}</span> : null}
                </button>
              )
            })}
          </div>

          <div className="cstatus">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                className={s === status ? 'cstatus-btn on' : 'cstatus-btn'}
                style={{ ['--c' as string]: STATUS[s].color }}
                onClick={() => onStatus(s)}
              >
                {STATUS[s].label}
              </button>
            ))}
          </div>

          {replies.length > 0 && (
            <div className="creplies">
              {replies.map((r) => (
                <div key={r.id} style={{ fontSize: 13 }}>
                  <div className="creply-author">
                    {r.author} <span className="ctime">· {timeAgo(r.created_at)}</span>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{highlightMentions(r.body, names)}</div>
                  <CommentImage image={r.image} />
                </div>
              ))}
            </div>
          )}

          <div className="reply-form">
            <MentionInput value={text} onChange={setText} onEnter={send} names={names} placeholder="Reply…" />
            <button className="btn ghost" onClick={send} disabled={!text.trim()}>
              Reply
            </button>
          </div>

          <div className="row" style={{ marginTop: 8 }}>
            <button
              onClick={onDelete}
              style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, padding: 0 }}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  )
}
