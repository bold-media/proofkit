# Proofkit

Host a design's HTML at a live link and collect **pinned comments** from clients (no login for them). Built to replace the Claude → export HTML → GitHub Pages → feedback loop.

## Run it

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

- Dashboard: http://localhost:3000 — create a page, paste/edit HTML, copy the live link.
- Live page (send to client): `http://localhost:3000/p/<slug>` — they click anywhere to leave pinned comments.
- Comments show up in the editor at `/edit/<slug>` (resolve / delete there).

Data is stored in `proofkit.db` (Node's built-in `node:sqlite`).

## Claude connection (MCP)

So you can publish from Claude and read comments back instead of pasting HTML.
The server is `mcp/server.mjs`; it talks to the running Proofkit app.

**Claude Desktop** — add this to your config
(`~/Library/Application Support/Claude/claude_desktop_config.json`), then restart Claude:

```json
{
  "mcpServers": {
    "proofkit": {
      "command": "node",
      "args": ["/Users/daria/dev/boldmedia/proofkit/mcp/server.mjs"],
      "env": { "PROOFKIT_URL": "http://localhost:3000" }
    }
  }
}
```

**Claude Code** — already configured via `.mcp.json` in this folder; run `claude` here and approve it.

Keep `pnpm dev` running so the connector can reach the app.

### What you can say to Claude
- "Publish this design to proofkit" → returns a live link to send the client.
- "Get the proofkit comments for &lt;slug&gt;" → reads the client's feedback.
- "Apply that feedback and re-publish to the same page."

Tools: `publish_page`, `list_pages`, `get_comments`, `resolve_comment`.

> Note: this is a **local** connector (works in Claude Desktop / Claude Code with no deploy).
> To use it from **claude.ai in the browser**, Proofkit needs to be deployed online with a
> remote connector — a later step.
