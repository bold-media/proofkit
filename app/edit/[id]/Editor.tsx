'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import type { ClientPage, Comment, CommentStatus } from '@/lib/data'
import FolderDrop, { type PickedFile } from '../../FolderDrop'
import PasswordInput from '../../PasswordInput'
import { uploadDesign } from '../../upload'

const STATUS: Record<CommentStatus, { label: string; color: string }> = {
  open: { label: 'Open', color: '#dc2626' },
  progress: { label: 'In progress', color: '#d97706' },
  resolved: { label: 'Resolved', color: '#16a34a' },
}
const STATUS_ORDER: CommentStatus[] = ['open', 'progress', 'resolved']
function statusOf(c: Comment): CommentStatus {
  return (STATUS[c.status as CommentStatus] ? c.status : 'open') as CommentStatus
}

export default function Editor({
  page,
  initialComments,
}: {
  page: ClientPage
  initialComments: Comment[]
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
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const isFolder = !!page.entry

  useEffect(() => {
    setPublicUrl(`${window.location.origin}/project/${page.slug}`)
  }, [page.slug])

  // Poll for new client comments.
  async function loadComments() {
    try {
      const res = await fetch(`/api/comments?page=${page.slug}`)
      const json = await res.json()
      setComments(json.comments || [])
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    const t = setInterval(loadComments, 4000)
    return () => clearInterval(t)
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
    if (frame.current) frame.current.src = `/project/${page.slug}?t=${Date.now()}`
    router.refresh()
  }

  async function replaceFolder(files: PickedFile[]) {
    setUploading(true)
    try {
      await uploadDesign(page.slug, files)
      if (frame.current) frame.current.src = `/project/${page.slug}?t=${Date.now()}`
      router.refresh()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setUploading(false)
    }
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
  const openCount = tops.filter((c) => {
    const s = statusOf(c)
    return s === 'open' || s === 'progress'
  }).length

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <input
          className="input"
          style={{ maxWidth: 380, fontWeight: 600 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="row">
          <button className="btn ghost" onClick={() => setConfirmDel(true)} style={{ color: 'var(--danger)' }}>
            Delete
          </button>
          <button className="btn" onClick={save}>
            {saved ? 'Saved ✓' : 'Save'}
          </button>
        </div>
      </div>

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
          Anyone with this link can view the page and leave pinned comments — no login needed.
        </p>

        <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14 }}>
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
        </div>
      </div>

      <div className="editor-grid">
        <div>
          {isFolder ? (
            <>
              <label className="field-label">Design folder</label>
              <p className="muted" style={{ fontSize: 13, margin: '0 0 8px' }}>
                Hosted folder (main file: <code>{page.entry}</code>). Drop a folder again to replace it —
                comments are kept.
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
          {tops.length === 0 ? (
            <p className="muted" style={{ fontSize: 14 }}>
              No comments yet. Share the live link and feedback shows up here.
            </p>
          ) : (
            tops.map((c, i) => (
              <CommentCard
                key={c.id}
                comment={c}
                number={i + 1}
                replies={repliesByParent[c.id] || []}
                onStatus={(s) => setStatus(c.id, s)}
                onReply={(body) => reply(c.id, body)}
                onDelete={() => removeComment(c.id)}
              />
            ))
          )}
        </div>
      </div>

      <label className="field-label" style={{ marginTop: 22 }}>
        Preview — exactly what your client sees
      </label>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 8px' }}>
        Your client clicks <strong>“Leave feedback”</strong> (bottom-right) to drop pins, and{' '}
        <strong>“Comments”</strong> to open the list. Everything shows up here too — set a status or reply
        from either place.
      </p>
      <iframe ref={frame} className="preview-frame" src={`/project/${page.slug}`} title="Preview" />

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

function CommentCard({
  comment,
  number,
  replies,
  onStatus,
  onReply,
  onDelete,
}: {
  comment: Comment
  number: number
  replies: Comment[]
  onStatus: (s: CommentStatus) => void
  onReply: (body: string) => void
  onDelete: () => void
}) {
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
    <div className={dim ? 'comment dim' : 'comment'}>
      <div className="comment-head">
        <span className="comment-pin" style={{ background: STATUS[status].color }}>
          {number}
        </span>
        <strong style={{ fontWeight: 600 }}>{comment.author}</strong>
        <span className="cbadge" style={{ background: STATUS[status].color }}>
          {STATUS[status].label}
        </span>
      </div>
      <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{comment.body}</div>

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
              <div className="creply-author">{r.author}</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{r.body}</div>
            </div>
          ))}
        </div>
      )}

      <div className="reply-form">
        <input
          className="input"
          placeholder="Reply…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
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
    </div>
  )
}
