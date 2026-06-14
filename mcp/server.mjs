import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

// Where proofkit is running. Override with PROOFKIT_URL when deployed.
const BASE = (process.env.PROOFKIT_URL || 'http://localhost:3000').replace(/\/$/, '')
const JSON_HEADERS = { 'Content-Type': 'application/json' }

const text = (s) => ({ content: [{ type: 'text', text: s }] })

const server = new McpServer({ name: 'proofkit', version: '0.1.0' })

server.tool(
  'publish_page',
  'Publish (or update) an HTML design to Proofkit and get a shareable live link clients can comment on. Pass an existing slug to update that same page; omit it to create a new one.',
  {
    title: z.string().describe('A human name for the page, e.g. "Summer campaign — landing".'),
    html: z.string().describe('The full HTML of the design.'),
    slug: z
      .string()
      .optional()
      .describe('Existing page slug to update. Omit to create a new page.'),
  },
  async ({ title, html, slug }) => {
    try {
      let s = slug
      if (s) {
        const r = await fetch(`${BASE}/api/pages/${s}`, {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify({ name: title, html }),
        })
        if (!r.ok) throw new Error(`update failed (${r.status})`)
      } else {
        const r = await fetch(`${BASE}/api/pages`, {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ name: title, html }),
        })
        if (!r.ok) throw new Error(`create failed (${r.status})`)
        s = (await r.json()).slug
      }
      const url = `${BASE}/project/${s}`
      return text(
        `Published "${title}".\nLive link (send this to the client): ${url}\nEditor: ${BASE}/edit/${s}\nslug: ${s}\n\nTo update THIS page later, call publish_page again with slug "${s}".`,
      )
    } catch (e) {
      return text(`Could not publish — is Proofkit running at ${BASE}? (${e.message})`)
    }
  },
)

server.tool('list_pages', 'List all Proofkit pages with their live links and open-comment counts.', {}, async () => {
  try {
    const r = await fetch(`${BASE}/api/pages`)
    const { pages } = await r.json()
    if (!pages?.length) return text('No pages yet.')
    return text(
      pages
        .map((p) => `• ${p.name} — ${BASE}/project/${p.slug} — ${p.open} open / ${p.total} total comments (slug: ${p.slug})`)
        .join('\n'),
    )
  } catch (e) {
    return text(`Could not reach Proofkit at ${BASE}. (${e.message})`)
  }
})

server.tool(
  'get_comments',
  "Get the client's pinned feedback for a page, so you can apply the changes.",
  { slug: z.string().describe('The page slug (from publish_page or list_pages).') },
  async ({ slug }) => {
    try {
      const r = await fetch(`${BASE}/api/comments?page=${encodeURIComponent(slug)}`)
      const { comments } = await r.json()
      if (!comments?.length) return text('No comments on this page yet.')
      return text(
        comments
          .map(
            (c, i) =>
              `#${i + 1} [${c.resolved ? 'resolved' : 'open'}] ${c.author} (at ${Math.round(c.x_pct)}%,${Math.round(c.y_pct)}% of page): ${c.body}  (id: ${c.id})`,
          )
          .join('\n'),
      )
    } catch (e) {
      return text(`Could not reach Proofkit at ${BASE}. (${e.message})`)
    }
  },
)

server.tool(
  'resolve_comment',
  'Mark a client comment as resolved once you have applied it.',
  { id: z.string().describe('The comment id (from get_comments).') },
  async ({ id }) => {
    try {
      await fetch(`${BASE}/api/comments/${id}`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ resolved: true }),
      })
      return text(`Marked comment ${id} as resolved.`)
    } catch (e) {
      return text(`Could not reach Proofkit at ${BASE}. (${e.message})`)
    }
  },
)

await server.connect(new StdioServerTransport())
