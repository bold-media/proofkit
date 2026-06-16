(function () {
  // Read the page id from this script tag's data attribute (works even when a
  // site's Content-Security-Policy blocks inline scripts).
  var me = document.currentScript || document.querySelector('script[data-proof-slug]')
  var slug = (me && me.getAttribute('data-proof-slug')) || window.__PROOF_SLUG__
  if (!slug) return
  var API = location.origin
  var NAME_KEY = 'proofkit_name'
  var REACTIONS = ['👍', '❤️', '✅', '🎉']
  var comments = []
  var mode = false

  // When the design is shown inside the device-frame wrapper, the overlay's
  // chrome (bar, panel, popovers) renders into the HOST page so it's full-size
  // and consistent across device widths — only the pins stay in the frame.
  // The wrapper marks the injected script with data-proof-framed. Same-origin
  // lets us reach the parent document and our own iframe's offset directly.
  var FRAMED = !!(me && me.getAttribute('data-proof-framed'))
  var chromeDoc, chromeWin
  try {
    chromeDoc = FRAMED ? window.parent.document : document
    chromeWin = FRAMED ? window.parent : window
  } catch (e) {
    FRAMED = false
    chromeDoc = document
    chromeWin = window
  }
  function frameRect() {
    if (FRAMED && window.frameElement) {
      var r = window.frameElement.getBoundingClientRect()
      return { left: r.left, top: r.top }
    }
    return { left: 0, top: 0 }
  }

  // A stable per-browser id so each person toggles their own reactions.
  var CID = (function () {
    var id = ''
    try { id = localStorage.getItem('pk_client_id') || '' } catch (e) {}
    if (!id) {
      id = 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36)
      try { localStorage.setItem('pk_client_id', id) } catch (e) {}
    }
    return id
  })()

  // Keep the visitor on the design. Hosted designs share this origin with the
  // Proofkit app, so a design that's a client-side-routed SPA can try to
  // navigate the top window to an absolute path (its "home" /, a nav link,
  // etc.). That path is a Proofkit route, so the visitor gets bounced to
  // /login instead of seeing the design. Block navigations that would leave
  // this design for another app route. Internal design routing (anything under
  // /project/<slug>) and links to other sites still work.
  ;(function () {
    var DESIGN_BASE = '/project/' + slug
    function leavesDesign(target) {
      try {
        var u = new URL(target, location.href)
        if (u.origin !== location.origin) return false // external link — allow
        var p = u.pathname
        return p !== DESIGN_BASE && p.indexOf(DESIGN_BASE + '/') !== 0
      } catch (e) {
        return false
      }
    }
    function selfTarget(t) {
      return !t || t === '_self' || t === '_top' || t === '_parent'
    }
    try {
      var _assign = window.location.assign.bind(window.location)
      window.location.assign = function (u) { if (leavesDesign(u)) return; return _assign(u) }
    } catch (e) {}
    try {
      var _replace = window.location.replace.bind(window.location)
      window.location.replace = function (u) { if (leavesDesign(u)) return; return _replace(u) }
    } catch (e) {}
    var _ps = history.pushState
    history.pushState = function (s, t, u) { if (u != null && leavesDesign(u)) return; return _ps.apply(this, arguments) }
    var _rs = history.replaceState
    history.replaceState = function (s, t, u) { if (u != null && leavesDesign(u)) return; return _rs.apply(this, arguments) }
    try {
      var _open = window.open
      window.open = function (u, name) {
        if (u && selfTarget(name) && leavesDesign(u)) return null
        return _open.apply(window, arguments)
      }
    } catch (e) {}
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest && e.target.closest('a')
      if (a && a.href && selfTarget(a.getAttribute('target')) && leavesDesign(a.href)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }, true)
    document.addEventListener('submit', function (e) {
      if (e.target && leavesDesign(e.target.action || location.href)) e.preventDefault()
    }, true)
  })()

  // Styles live in /overlay.css (external file, so a site's CSP that blocks
  // inline <style> can't strip our UI). Some designs replace the whole
  // <html> element after they boot (SPA/bundler hydration), which wipes this
  // link — so ensureCss() is also called from the self-heal loop below.
  function ensureCssIn(doc) {
    if (doc.querySelector('link[data-proof-css]')) return
    var link = doc.createElement('link')
    link.rel = 'stylesheet'
    link.href = API + '/overlay.css'
    link.setAttribute('data-proof-css', '1')
    ;(doc.head || doc.documentElement).appendChild(link)
  }
  function ensureCss() {
    // Pins live in this frame's document; the chrome may live in the host page.
    ensureCssIn(document)
    if (FRAMED) ensureCssIn(chromeDoc)
  }
  ensureCss()

  // The owner (logged in) gets extra controls: changing a comment's status and
  // deleting. The server still enforces this — the flag only gates the UI.
  var OWNER = !!(me && me.getAttribute('data-proof-owner'))
  // The viewer's known name (owner / logged-in client / password-gate name), used
  // to attribute their comments and to power the "Tagged me" filter.
  var VIEWER_NAME = (me && me.getAttribute('data-proof-name')) || ''

  var STATUS = {
    open: { label: 'Open', color: '#e5484d' },
    progress: { label: 'In progress', color: '#d97706' },
    resolved: { label: 'Resolved', color: '#16a34a' },
  }
  var STATUS_ORDER = ['open', 'progress', 'resolved']
  function statusOf(c) { return STATUS[c.status] ? c.status : 'open' }

  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n }
  function timeAgo(iso) {
    var ms = Date.now() - new Date(iso).getTime()
    if (isNaN(ms)) return ''
    var m = Math.floor(ms / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return m + 'm ago'
    var h = Math.floor(m / 60)
    if (h < 24) return h + 'h ago'
    var d = Math.floor(h / 24)
    if (d < 30) return d + 'd ago'
    return new Date(iso).toLocaleDateString()
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
    })
  }

  // ---- @mentions ----
  // Taggable people = the owner plus everyone who has commented on this design.
  function mentionNames() {
    var set = { owner: 'Owner' }
    comments.forEach(function (c) { if (c.author) set[c.author.toLowerCase()] = c.author })
    return Object.keys(set)
      .map(function (k) { return set[k] })
      .sort(function (a, b) { return b.length - a.length }) // longest first so "@John Doe" wins over "@John"
  }
  // Escape a comment body, highlighting any "@Name" that matches a known person.
  function renderBody(text) {
    var names = mentionNames()
    var s = String(text)
    var out = ''
    for (var i = 0; i < s.length; ) {
      if (s.charAt(i) === '@') {
        var hit = null
        for (var j = 0; j < names.length; j++) {
          var n = names[j]
          if (s.substr(i + 1, n.length).toLowerCase() === n.toLowerCase()) {
            var after = s.charAt(i + 1 + n.length)
            if (!/[A-Za-z0-9_]/.test(after)) { hit = n; break }
          }
        }
        if (hit) {
          out += '<span class="pk-mention">@' + escapeHtml(hit) + '</span>'
          i += 1 + hit.length
          continue
        }
      }
      out += escapeHtml(s.charAt(i))
      i++
    }
    return out
  }
  // Whether a body tags a specific person by name (word-bounded "@Name").
  function mentionsName(text, name) {
    if (!name) return false
    var s = String(text), nl = name.toLowerCase()
    for (var i = s.indexOf('@'); i !== -1; i = s.indexOf('@', i + 1)) {
      if (s.substr(i + 1, name.length).toLowerCase() === nl && !/[A-Za-z0-9_]/.test(s.charAt(i + 1 + name.length))) {
        return true
      }
    }
    return false
  }
  // A top-level comment "tags the viewer" if it — or any of its replies — @mentions them.
  function taggedViewer(c) {
    if (mentionsName(c.body, VIEWER_NAME)) return true
    var rs = repliesOf(c.id)
    for (var i = 0; i < rs.length; i++) if (mentionsName(rs[i].body, VIEWER_NAME)) return true
    return false
  }

  // The "@" the caret is currently typing, if any (allows spaces for full names).
  function mentionQuery(input) {
    var pos = input.selectionStart
    var val = input.value.slice(0, pos)
    var at = val.lastIndexOf('@')
    if (at < 0) return null
    if (at > 0 && !/\s/.test(val.charAt(at - 1))) return null // must start a token
    var q = val.slice(at + 1)
    if (/[\n@]/.test(q) || q.length > 30) return null
    return { at: at, query: q }
  }
  // Attach an @mention autocomplete dropdown to a textarea/input.
  function attachMentions(input) {
    var box = null, items = [], active = 0, curAt = 0
    function close() { if (box) { box.parentNode && box.parentNode.removeChild(box); box = null } }
    function pick(name) {
      var pos = input.selectionStart
      var val = input.value
      var insert = '@' + name + ' '
      var before = val.slice(0, curAt)
      input.value = before + insert + val.slice(pos)
      var caret = before.length + insert.length
      input.selectionStart = input.selectionEnd = caret
      close(); input.focus()
    }
    function highlight() {
      if (!box) return
      for (var i = 0; i < box.children.length; i++) {
        box.children[i].className = 'pk-mention-item' + (i === active ? ' on' : '')
      }
    }
    function refresh() {
      var q = mentionQuery(input)
      if (!q) return close()
      var ql = q.query.toLowerCase()
      var matches = mentionNames().filter(function (n) { return n.toLowerCase().indexOf(ql) !== -1 })
      if (!matches.length) return close()
      matches = matches.slice(0, 6)
      close()
      curAt = q.at; items = matches; active = 0
      box = el('div', 'pk-mention-menu')
      matches.forEach(function (n) {
        var it = el('div', 'pk-mention-item')
        it.textContent = n
        it.addEventListener('mousedown', function (e) { e.preventDefault(); pick(n) })
        box.appendChild(it)
      })
      chromeDoc.body.appendChild(box)
      var r = input.getBoundingClientRect()
      box.style.minWidth = Math.min(r.width, 240) + 'px'
      // Flip above the input when there isn't room below (e.g. the reply box sits
      // near the bottom of the screen), and clamp to the viewport either way.
      var mh = box.offsetHeight, mw = box.offsetWidth
      var vh = chromeWin.innerHeight, vw = chromeWin.innerWidth
      var top = r.bottom + 4
      if (top + mh > vh - 8 && r.top - 4 - mh > 8) top = r.top - 4 - mh
      box.style.top = Math.max(8, Math.min(top, vh - mh - 8)) + 'px'
      box.style.left = Math.max(8, Math.min(r.left, vw - mw - 8)) + 'px'
      highlight()
    }
    input.addEventListener('input', refresh)
    input.addEventListener('keydown', function (e) {
      if (!box) return
      if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; highlight() }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; highlight() }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(items[active]) }
      else if (e.key === 'Escape') { e.preventDefault(); close() }
    })
    input.addEventListener('blur', function () { setTimeout(close, 150) })
  }

  // ---- comment data helpers ----
  function tops() { return comments.filter(function (c) { return !c.parent_id }) }
  function repliesOf(id) { return comments.filter(function (c) { return c.parent_id === id }) }
  function byId(id) { for (var i = 0; i < comments.length; i++) if (comments[i].id === id) return comments[i]; return null }
  function activeCount() {
    return tops().filter(function (c) { var s = statusOf(c); return s === 'open' || s === 'progress' }).length
  }
  function numberOf(c) { var t = tops(); for (var i = 0; i < t.length; i++) if (t[i].id === c.id) return i + 1; return '?' }

  // ---- elements ----
  // Pins overlay the design (this frame's document); the bar/panel are chrome
  // and go in the host document (the page itself when not framed).
  var layer = el('div', 'pk-layer')
  document.body.appendChild(layer)
  // A second, position:fixed layer for element-anchored pins. Their position is
  // a live element rect (viewport coords), recomputed on scroll/resize — so a pin
  // rides with its element, and collapses onto the menu button when hidden.
  var fixedLayer = el('div', 'pk-layer pk-fixed-layer')
  document.body.appendChild(fixedLayer)

  var bar = el('div', 'pk-bar')
  var approveBtn = el('button', 'pk-btn pk-ghost')
  approveBtn.textContent = '✓ Approve'
  var listBtn = el('button', 'pk-btn pk-ghost')
  var btn = el('button', 'pk-btn')
  // Sign-off is the client's action — the owner sees the record in the editor.
  if (!OWNER) bar.appendChild(approveBtn)
  bar.appendChild(listBtn)
  bar.appendChild(btn)
  chromeDoc.body.appendChild(bar)
  var approved = false
  function updateApproveBtn() {
    approveBtn.textContent = approved ? '✓ Approved' : '✓ Approve'
    approveBtn.disabled = approved
    styleBar()
  }
  // Reflect a prior sign-off from this viewer so the button reads "Approved".
  if (!OWNER) {
    fetch(API + '/api/project/' + slug + '/approve')
      .then(function (r) { return r.json() })
      .then(function (j) {
        var nm = VIEWER_NAME || localStorage.getItem(NAME_KEY) || ''
        if (nm && (j.approvals || []).some(function (a) { return a.name === nm })) {
          approved = true
          updateApproveBtn()
        }
      })
      .catch(function () {})
  }

  var panel = el('div', 'pk-panel')
  chromeDoc.body.appendChild(panel)
  var panelOpen = false
  var panelFilter = 'all'
  var panelDevice = 'all' // which device's comments the panel lists
  var panelName = '' // free-text author filter for the panel list
  var panelTagged = false // show only comments that @mention the current viewer
  var showResolved = false // resolved pins are hidden on the design until toggled on
  var currentId = null // the comment whose thread is open (for prev/next stepping)
  var currentDevice = 'desktop' // which device view this frame is showing
  var DEVICE_LABEL = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' }
  function deviceOf(c) { return c.device || 'desktop' }

  // The device-frame wrapper tells us which size is shown; pins are scoped to it.
  window.addEventListener('message', function (e) {
    if (e.data && e.data.pk === 'device' && e.data.device && e.data.device !== currentDevice) {
      currentDevice = e.data.device
      render()
    }
  })

  // Core look is also set inline via the CSSOM (not subject to CSP style-src),
  // so the always-visible bar stays styled even if overlay.css was stripped by
  // a design that replaced the document.
  function styleBar() {
    bar.style.cssText =
      'position:fixed;bottom:20px;right:20px;left:auto;top:auto;z-index:2147483600;' +
      'display:flex;gap:10px;align-items:center;margin:0;font-family:sans-serif'
    var base = 'font:600 14px sans-serif;padding:11px 18px;border-radius:24px;cursor:pointer;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.22);white-space:nowrap'
    btn.style.cssText = 'border:none;color:#fff;background:' + (mode ? '#dc2626' : '#4f46e5') + ';' + base
    listBtn.style.cssText = 'background:#fff;color:#1c2024;border:1px solid #e6e8ec;' + base
    approveBtn.style.cssText = 'background:#fff;color:#16a34a;border:1px solid #e6e8ec;' + base +
      (approved ? ';opacity:.6;cursor:default' : '')
  }
  styleBar()

  function stylePanel() {
    panel.style.cssText =
      'position:fixed;top:0;right:0;height:100vh;width:320px;max-width:86vw;z-index:2147483500;' +
      'background:#fff;border-left:1px solid #e6e8ec;box-shadow:-8px 0 30px rgba(0,0,0,.12);' +
      'font-family:sans-serif;display:flex;flex-direction:column;overflow:hidden;' +
      'transition:transform .22s ease;transform:translateX(' + (panelOpen ? '0' : '100%') + ')'
  }
  stylePanel()

  function updateBtn() {
    btn.textContent = mode ? 'Done' : 'Leave feedback'
    var n = activeCount()
    listBtn.textContent = 'Comments' + (n ? ' · ' + n : '')
    styleBar()
  }

  // ---- intro tip ----
  function dismissIntro() {
    var n = chromeDoc.querySelector('.pk-intro')
    if (n) n.remove()
    try { localStorage.setItem('pk_intro_seen', '1') } catch (e) {}
  }
  function maybeShowIntro() {
    try { if (localStorage.getItem('pk_intro_seen')) return } catch (e) {}
    var tip = el('div', 'pk-intro')
    tip.innerHTML = '<b>Leave feedback here</b><br>Click “Leave feedback”, then click anywhere on the design to drop a comment.'
    chromeDoc.body.appendChild(tip)
    setTimeout(dismissIntro, 9000)
  }

  function sizeLayer() {
    // The layer is absolutely positioned, so its own size counts toward the
    // document's scrollWidth/scrollHeight. Collapse it to zero before measuring,
    // otherwise it can only ever grow — leaving big white space below a design
    // that got shorter after a tall transient (e.g. an SPA settling on load).
    layer.style.width = '0'
    layer.style.height = '0'
    var de = document.documentElement
    layer.style.width = de.scrollWidth + 'px'
    layer.style.height = de.scrollHeight + 'px'
  }
  window.addEventListener('resize', function () { render() })

  function closePopovers() {
    chromeDoc.querySelectorAll('.pk-pop,.pk-hint').forEach(function (p) { p.remove() })
  }

  function load() {
    fetch(API + '/api/comments?page=' + encodeURIComponent(slug) + '&client=' + encodeURIComponent(CID))
      .then(function (r) { return r.json() })
      .then(function (j) { comments = j.comments || []; render() })
      .catch(function () {})
  }

  // Optimistically flip this client's reaction so the thread updates instantly.
  function toggleLocalReaction(c, em) {
    c.reactions = c.reactions || []
    var found = null
    for (var i = 0; i < c.reactions.length; i++) if (c.reactions[i].emoji === em) found = c.reactions[i]
    if (found) {
      if (found.mine) {
        found.count--
        found.mine = false
        if (found.count <= 0) c.reactions = c.reactions.filter(function (x) { return x.emoji !== em })
      } else {
        found.count++
        found.mine = true
      }
    } else {
      c.reactions.push({ emoji: em, count: 1, mine: true })
    }
  }

  function clamp01(v) { return Math.max(0, Math.min(100, v)) }

  function initials(name) {
    var p = String(name || '').trim().split(/\s+/)
    return (((p[0] ? p[0][0] : '') + (p[1] ? p[1][0] : '')).toUpperCase() || '?').slice(0, 2)
  }

  // Figma-style link: hovering a pin or its list item lights up the other one.
  function highlight(id, on) {
    var pin = layer.querySelector('.pk-pin[data-id="' + id + '"]')
    if (pin) pin.classList.toggle('pk-hi', on)
    var item = panel.querySelector('.pk-item[data-id="' + id + '"]')
    if (item) item.classList.toggle('pk-hi', on)
  }

  // Lightweight read-only peek of a comment when hovering its pin.
  function hidePreview() {
    var p = chromeDoc.querySelector('.pk-preview')
    if (p) p.remove()
  }
  function showPreview(c, pin) {
    hidePreview()
    if (mode) return // don't get in the way while placing comments
    var pv = el('div', 'pk-preview')
    var rs = repliesOf(c.id)
    var st = STATUS[statusOf(c)]
    pv.innerHTML =
      '<div class="pk-pv-head"><span class="pk-dot" style="background:' + st.color + '"></span>' +
      escapeHtml(c.author) + ' <span class="pk-time">· ' + timeAgo(c.created_at) + '</span></div>' +
      '<div class="pk-pv-body">' + renderBody(c.body) + '</div>' + imgHtml(c) +
      (rs.length ? '<div class="pk-pv-meta">' + rs.length + (rs.length > 1 ? ' replies' : ' reply') + '</div>' : '')
    chromeDoc.body.appendChild(pv)
    var r = pin.getBoundingClientRect()
    var off = frameRect()
    var w = pv.offsetWidth, h = pv.offsetHeight
    pv.style.left = Math.min(r.right + off.left + 10, chromeWin.innerWidth - w - 12) + 'px'
    pv.style.top = Math.min(Math.max(r.top + off.top - 6, 12), chromeWin.innerHeight - h - 12) + 'px'
  }

  // Click a pin to open its thread. The owner can also drag it to reposition
  // the pin; the new spot is saved. A small movement threshold keeps a normal
  // click from being treated as a drag.
  // ---- element anchoring ----
  // A pin can ride with the DOM element it was placed on (so a comment inside a
  // burger menu hides/relocates when the menu closes). We store a structural path
  // (child indices from <html>) plus the click's fraction within the element.
  function clamp01f(v) { return Math.max(0, Math.min(1, v || 0)) }
  // Our own injected elements (layers, pins, chrome) must NOT count toward a
  // path's child indices — they're appended to <body> alongside design content
  // (and dynamic widgets like a burger drawer), so counting them would make the
  // path shift between sessions and resolve to the wrong element.
  function isOurNode(el) {
    if (!el || el.nodeType !== 1) return false
    var cn = el.className
    if (typeof cn === 'string') {
      var t = cn.split(/\s+/)
      for (var j = 0; j < t.length; j++) if (t[j].indexOf('pk-') === 0) return true
    }
    return false
  }
  function designChildren(parent) {
    var out = []
    var ch = parent.children
    for (var i = 0; i < ch.length; i++) if (!isOurNode(ch[i])) out.push(ch[i])
    return out
  }
  function elPath(node) {
    var path = []
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      var parent = node.parentNode
      if (!parent || parent.nodeType !== 1) break
      if (isOurNode(node)) return [] // never anchor to our own UI
      path.unshift(designChildren(parent).indexOf(node))
      node = parent
    }
    return path
  }
  function resolvePath(path) {
    var node = document.documentElement
    for (var i = 0; i < path.length; i++) {
      if (!node) return null
      node = designChildren(node)[path[i]]
    }
    return node || null
  }
  function isElVisible(el) {
    if (!el) return false
    var r = el.getBoundingClientRect()
    if (r.width < 1 && r.height < 1) return false
    var node = el
    while (node && node.nodeType === 1) {
      var st = chromeWin.getComputedStyle ? getComputedStyle(node) : null
      if (st) {
        if (st.display === 'none' || st.visibility === 'hidden' || st.visibility === 'collapse') return false
        if (parseFloat(st.opacity) === 0) return false
      }
      node = node.parentElement
    }
    return true
  }
  // True when something the design stacks above `elt` (an open drawer/modal) is
  // covering the point (px,py) — so a pin there would float over the overlay and
  // should hide. We look at the real elements under the point (ignoring our own
  // pins/layers) and check the topmost one is unrelated to the pin's element.
  function occludedAt(elt, px, py) {
    if (px < 0 || py < 0 || px > window.innerWidth || py > window.innerHeight) return false
    var stack
    try { stack = document.elementsFromPoint(px, py) } catch (e) { return false }
    for (var k = 0; k < stack.length; k++) {
      var s = stack[k]
      if (s === layer || s === fixedLayer || layer.contains(s) || fixedLayer.contains(s)) continue
      return !(s === elt || elt.contains(s) || s.contains(elt))
    }
    return false
  }
  // For coordinate (un-anchored) pins we have no element to compare, so hide them
  // when the point is covered by a fixed/sticky overlay (an open drawer, a sticky
  // header) — i.e. the topmost real element there is taken out of normal flow.
  function overlayAt(px, py) {
    if (px < 0 || py < 0 || px > window.innerWidth || py > window.innerHeight) return false
    var stack
    try { stack = document.elementsFromPoint(px, py) } catch (e) { return false }
    for (var k = 0; k < stack.length; k++) {
      var s = stack[k]
      if (s === layer || s === fixedLayer || layer.contains(s) || fixedLayer.contains(s)) continue
      return !!fixedAncestor(s)
    }
    return false
  }
  // The nearest ancestor that's taken out of normal scroll flow. A pin on such
  // an element must live in the fixed layer (viewport-tracked); everything else
  // goes in the document layer so it scrolls natively with zero lag.
  function fixedAncestor(el) {
    var node = el
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      var pos = getComputedStyle(node).position
      if (pos === 'fixed' || pos === 'sticky') return node
      node = node.parentElement
    }
    return null
  }
  // Menu/disclosure trigger to collapse hidden pins onto (the burger).
  var TRIGGER_SEL = '.burger,.hamburger,.menu-toggle,.menu-icon,.nav-toggle,.navbar-toggler,' +
    '[class*="burger"],[class*="hamburger"],[aria-label="Menu"],[aria-label="menu"]'
  function findTrigger() {
    var els
    try { els = document.querySelectorAll(TRIGGER_SEL) } catch (e) { return null }
    for (var i = 0; i < els.length; i++) if (isElVisible(els[i])) return els[i]
    return null
  }
  function makeAnchor(target, clientX, clientY) {
    try {
      if (!target || target.nodeType !== 1) return null
      if (target === document.body || target === document.documentElement) return null
      if (layer.contains(target) || fixedLayer.contains(target)) return null // never our own pins
      var r = target.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return null
      return { path: elPath(target), fx: clamp01f((clientX - r.left) / r.width), fy: clamp01f((clientY - r.top) / r.height) }
    } catch (e) { return null }
  }
  function anchorOf(c) {
    if (c._anchor !== undefined) return c._anchor
    var a = null
    if (c.anchor) {
      try { a = typeof c.anchor === 'string' ? JSON.parse(c.anchor) : c.anchor } catch (e) { a = null }
      if (a && (!a.path || !a.path.length)) a = null
    }
    c._anchor = a
    return a
  }
  var anchoredPins = []
  var coordPins = []
  function moveToLayer(pin, target) { if (pin.parentNode !== target) target.appendChild(pin) }
  // When several comments collapse onto the same trigger (burger), we show ONE
  // badge with the count instead of stacking pins. Clicking it opens the list.
  var collapsedBadge = el('button', 'pk-pin pk-collapsed pk-collapsed-count')
  collapsedBadge.addEventListener('click', function (e) { e.stopPropagation(); if (!panelOpen) togglePanel() })
  function renderCollapsed(list) {
    var trig = list.length ? findTrigger() : null
    if (!trig) {
      collapsedBadge.style.display = 'none'
      list.forEach(function (p) { p.style.display = 'none' })
      return
    }
    var tr = trig.getBoundingClientRect()
    var x = Math.min(tr.right, window.innerWidth - 13)
    var y = Math.max(tr.top, 13)
    if (list.length === 1) {
      // A single hidden comment keeps its own pin (click opens its thread).
      collapsedBadge.style.display = 'none'
      var pin = list[0]
      moveToLayer(pin, fixedLayer)
      pin.classList.add('pk-collapsed')
      pin.style.display = ''
      pin.style.left = x + 'px'
      pin.style.top = y + 'px'
    } else {
      list.forEach(function (p) { p.style.display = 'none' })
      if (collapsedBadge.parentNode !== fixedLayer) fixedLayer.appendChild(collapsedBadge)
      collapsedBadge.style.display = ''
      collapsedBadge.textContent = list.length > 99 ? '99+' : String(list.length)
      collapsedBadge.title = list.length + ' comments inside the menu — open Comments to view'
      collapsedBadge.style.left = x + 'px'
      collapsedBadge.style.top = y + 'px'
    }
  }
  // Place every element-anchored pin. Normal-flow elements → document layer at
  // DOCUMENT coords (scroll-invariant, so they scroll natively with zero lag).
  // Fixed/sticky elements, hidden→collapsed, and unresolvable pins → fixed layer.
  function positionAnchored() {
    var toCollapse = []
    // Pins live in THIS document (the design frame), so all geometry is in this
    // window's viewport — not chromeWin, which is the parent page when framed.
    var vw = window.innerWidth
    var de = document.documentElement
    var sx = window.pageXOffset || 0
    var sy = window.pageYOffset || 0
    for (var i = 0; i < anchoredPins.length; i++) {
      var pin = anchoredPins[i]
      var c = pin.__c
      if (!c || pin === draggingPin) continue
      var a = anchorOf(c)
      var elt = a ? resolvePath(a.path) : null
      var r = elt && isElVisible(elt) ? elt.getBoundingClientRect() : null
      // A panel slid off-screen horizontally (a closed drawer using transform,
      // not display:none) counts as hidden too. Only test horizontally: vertical
      // off-screen is normal scroll, and those pins stay anchored.
      var offscreenH = r && (r.right <= 8 || r.left >= vw - 8)
      if (r && !offscreenH) {
        var px = r.left + clamp01f(a.fx) * r.width
        var py = r.top + clamp01f(a.fy) * r.height
        // An open overlay (drawer/modal) covering this spot hides the pin, so a
        // comment on the page doesn't float over the menu.
        if (occludedAt(elt, px, py)) {
          pin.style.display = 'none'
          continue
        }
        pin.classList.remove('pk-collapsed')
        pin.style.display = ''
        if (fixedAncestor(elt)) {
          // Element is fixed/sticky → track the viewport (fixed layer).
          moveToLayer(pin, fixedLayer)
          pin.style.left = px + 'px'
          pin.style.top = py + 'px'
        } else {
          // Normal flow → document coords in the absolute layer (no scroll lag).
          moveToLayer(pin, layer)
          pin.style.left = (px + sx) + 'px'
          pin.style.top = (py + sy) + 'px'
        }
      } else if (elt) {
        // Element exists but is hidden/slid away (e.g. closed drawer) — collect it
        // to collapse onto the menu trigger (rendered after the loop, as a single
        // counted badge when there's more than one).
        moveToLayer(pin, fixedLayer)
        pin.style.display = 'none'
        toCollapse.push(pin)
      } else {
        // Anchor can't be resolved (design changed) — fall back to the stored
        // document coordinate (absolute layer) so it still shows where it was.
        moveToLayer(pin, layer)
        pin.classList.remove('pk-collapsed')
        pin.style.display = ''
        pin.style.left = ((c.x_pct / 100) * de.scrollWidth) + 'px'
        pin.style.top = ((c.y_pct / 100) * de.scrollHeight) + 'px'
      }
    }
    renderCollapsed(toCollapse)
    // Coordinate (un-anchored) pins scroll natively in the document layer; we only
    // toggle their visibility so they don't float over an open drawer/sticky bar.
    for (var ci = 0; ci < coordPins.length; ci++) {
      var cp = coordPins[ci]
      var cc = cp.__c
      if (!cc || cp === draggingPin) continue
      var cpx = (cc.x_pct / 100) * de.scrollWidth - sx
      var cpy = (cc.y_pct / 100) * de.scrollHeight - sy
      cp.style.display = overlayAt(cpx, cpy) ? 'none' : ''
    }
  }
  var draggingPin = null
  var rafPending = false
  var trackUntil = 0
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now() }
  function tick() {
    rafPending = false
    positionAnchored()
    if (now() < trackUntil) { rafPending = true; requestAnimationFrame(tick) }
  }
  // Reposition now, then keep tracking for a short window. A menu/drawer that
  // opens or closes does so with a CSS transition (e.g. translateX over ~300ms),
  // which fires no scroll/mutation events as it animates — so we follow the
  // element across the whole animation and let the pin land collapsed (or on it).
  function repositionSoon() {
    if (!anchoredPins.length && !coordPins.length) return
    trackUntil = now() + 500
    if (!rafPending) { rafPending = true; requestAnimationFrame(tick) }
  }
  // Re-track on scroll (capture, to catch scroll inside the design's own
  // menus/drawers), on layout/class changes, and at the end of any transition.
  window.addEventListener('scroll', repositionSoon, true)
  window.addEventListener('transitionend', repositionSoon, true)
  window.addEventListener('animationend', repositionSoon, true)
  try {
    new MutationObserver(repositionSoon).observe(document.documentElement, {
      attributes: true, attributeFilter: ['class', 'style', 'aria-expanded', 'hidden'],
      subtree: true, childList: true,
    })
  } catch (e) {}

  function attachPin(pin, c) {
    var start = null
    var moved = false
    pin.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return
      start = { x: e.clientX, y: e.clientY }
      moved = false
      try { pin.setPointerCapture(e.pointerId) } catch (err) {}
      pin.style.cursor = 'grabbing'
      hidePreview()
      e.preventDefault()
      e.stopPropagation()
    })
    pin.addEventListener('pointermove', function (e) {
      if (!start) return
      if (!moved && Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) < 4) return
      moved = true
      var de = document.documentElement
      c._x = clamp01((e.pageX / de.scrollWidth) * 100)
      c._y = clamp01((e.pageY / de.scrollHeight) * 100)
      pin.style.left = c._x + '%'
      pin.style.top = c._y + '%'
      e.preventDefault()
    })
    pin.addEventListener('pointerup', function (e) {
      var wasDrag = moved
      if (start) {
        try { pin.releasePointerCapture(e.pointerId) } catch (err) {}
        pin.style.cursor = 'grab'
      }
      start = null
      moved = false
      if (wasDrag) {
        c.x_pct = c._x
        c.y_pct = c._y
        fetch(API + '/api/comments/' + c.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x_pct: c.x_pct, y_pct: c.y_pct }),
        }).catch(function () {})
        if (panelOpen) renderPanel()
        e.preventDefault()
        e.stopPropagation()
        return
      }
      showThread(c, pin)
    })
    // Swallow the click the browser fires after a drag so nothing else reacts.
    pin.addEventListener('click', function (e) { e.stopPropagation() })
    pin.addEventListener('mouseenter', function () { highlight(c.id, true); showPreview(c, pin) })
    pin.addEventListener('mouseleave', function () { highlight(c.id, false); hidePreview() })
  }

  // Element-anchored pins live in the fixed layer. They're still draggable: a drag
  // re-anchors the pin to whatever element it's dropped on (or clears the anchor
  // if dropped on bare page), mirroring the coordinate-pin drag behaviour.
  function attachAnchoredPin(pin, c) {
    var start = null, moved = false
    pin.style.cursor = 'grab'
    pin.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return
      start = { x: e.clientX, y: e.clientY }; moved = false
      try { pin.setPointerCapture(e.pointerId) } catch (err) {}
      pin.style.cursor = 'grabbing'; hidePreview()
      e.preventDefault(); e.stopPropagation()
    })
    pin.addEventListener('pointermove', function (e) {
      if (!start) return
      if (!moved && Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) < 4) return
      moved = true; draggingPin = pin
      pin.classList.remove('pk-collapsed')
      pin.style.left = e.clientX + 'px'
      pin.style.top = e.clientY + 'px'
      e.preventDefault()
    })
    pin.addEventListener('pointerup', function (e) {
      var wasDrag = moved
      if (start) { try { pin.releasePointerCapture(e.pointerId) } catch (err) {} pin.style.cursor = 'grab' }
      start = null; moved = false; draggingPin = null
      if (wasDrag) {
        // Find the element under the drop point (ignoring the pin itself).
        pin.style.pointerEvents = 'none'
        var tgt = document.elementFromPoint(e.clientX, e.clientY)
        pin.style.pointerEvents = ''
        var a = makeAnchor(tgt, e.clientX, e.clientY)
        var de = document.documentElement
        c.x_pct = clamp01((e.pageX / de.scrollWidth) * 100)
        c.y_pct = clamp01((e.pageY / de.scrollHeight) * 100)
        c.anchor = a ? JSON.stringify(a) : null
        c._anchor = a
        fetch(API + '/api/comments/' + c.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x_pct: c.x_pct, y_pct: c.y_pct, anchor: a }),
        }).catch(function () {})
        render() // a may now be null → pin moves to the coordinate layer
        e.preventDefault(); e.stopPropagation()
        return
      }
      showThread(c, pin)
    })
    pin.addEventListener('click', function (e) { e.stopPropagation() })
    pin.addEventListener('mouseenter', function () { highlight(c.id, true); showPreview(c, pin) })
    pin.addEventListener('mouseleave', function () { highlight(c.id, false); hidePreview() })
  }

  // Build the pin button (label + reply badge) shared by both layers.
  function buildPin(c, s, i) {
    var pin = el('button', 'pk-pin' + (s === 'resolved' ? ' resolved' : ''))
    pin.setAttribute('data-id', c.id)
    pin.style.background = STATUS[s].color
    pin.title = '#' + (i + 1) + ' · ' + c.author + ' · ' + STATUS[s].label
    var label = el('span', 'pk-pin-label')
    label.textContent = s === 'resolved' ? '✓' : initials(c.author)
    pin.appendChild(label)
    var nr = repliesOf(c.id).length
    if (nr > 0) {
      var badge = el('span', 'pk-pin-badge')
      badge.textContent = nr > 9 ? '9+' : nr
      pin.appendChild(badge)
    }
    pin.__c = c
    return pin
  }

  function render() {
    sizeLayer()
    layer.innerHTML = ''
    fixedLayer.innerHTML = ''
    anchoredPins = []
    coordPins = []
    tops().forEach(function (c, i) {
      var s = statusOf(c)
      // Only show pins placed in the device size currently being viewed.
      if (deviceOf(c) !== currentDevice) return
      // Resolved pins stay off the design (decluttered) until the toggle is on.
      if (s === 'resolved' && !showResolved) return
      var pin = buildPin(c, s, i)
      if (anchorOf(c)) {
        // Element-anchored: positionAnchored routes it to the right layer.
        attachAnchoredPin(pin, c)
        anchoredPins.push(pin)
        fixedLayer.appendChild(pin)
      } else {
        // Legacy coordinate pin: percentage of the document, scrolls with the page.
        pin.style.left = c.x_pct + '%'
        pin.style.top = c.y_pct + '%'
        pin.style.cursor = 'grab'
        pin.title += ' — drag to move, click to open'
        attachPin(pin, c)
        layer.appendChild(pin)
        coordPins.push(pin)
      }
    })
    positionAnchored()
    updateBtn()
    if (panelOpen) renderPanel()
  }

  // ---- comment mode (persistent: stays on until you click "Done") ----
  function setMode(on) {
    mode = on
    // Crosshair goes on the design (this frame); the hint banner is chrome.
    document.body.style.cursor = mode ? 'crosshair' : ''
    var hint = chromeDoc.querySelector('.pk-hint')
    if (mode && !hint) {
      hint = el('div', 'pk-hint')
      hint.textContent = 'Click anywhere on the design to drop a comment · click “Done” when finished'
      chromeDoc.body.appendChild(hint)
    } else if (!mode && hint) {
      hint.remove()
    }
    updateBtn()
  }

  btn.addEventListener('click', function (e) {
    e.stopPropagation()
    dismissIntro()
    closePopovers()
    setMode(!mode)
  })
  listBtn.addEventListener('click', function (e) {
    e.stopPropagation()
    togglePanel()
  })
  approveBtn.addEventListener('click', function (e) {
    e.stopPropagation()
    if (approved) return
    openApprove()
  })

  // ---- sign-off popover ----
  function openApprove() {
    closePopovers()
    var savedName = VIEWER_NAME || localStorage.getItem(NAME_KEY) || ''
    var pop = el('div', 'pk-pop pk-approve-pop')
    pop.innerHTML =
      '<div class="pk-approve-title">Approve this design?</div>' +
      '<p class="pk-approve-sub">Lets the owner know you’ve signed off.</p>' +
      (savedName ? '' : '<input class="pk-name" placeholder="Your name" />') +
      '<div class="pk-row"><button class="pk-cancel">Cancel</button><button class="pk-send">Approve</button></div>'
    chromeDoc.body.appendChild(pop)
    pop.style.left = 'auto'
    pop.style.top = 'auto'
    pop.style.right = '20px'
    pop.style.bottom = '74px'
    var nameInput = pop.querySelector('.pk-name')
    if (nameInput) nameInput.focus()
    pop.querySelector('.pk-cancel').addEventListener('click', closePopovers)
    pop.querySelector('.pk-send').addEventListener('click', function () {
      var name = savedName || (nameInput ? nameInput.value.trim() : '')
      if (!name) name = 'Guest'
      localStorage.setItem(NAME_KEY, name)
      fetch(API + '/api/project/' + slug + '/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name }),
      }).catch(function () {})
      approved = true
      updateApproveBtn()
      closePopovers()
    })
  }

  function clamp(v, max) { return Math.max(12, Math.min(v, max)) }
  function positionPop(pop, clientX, clientY) {
    // clientX/Y are in this frame's viewport; shift by the frame's offset in the
    // host so popovers land over the pin even when chrome lives in the host.
    chromeDoc.body.appendChild(pop)
    var w = pop.offsetWidth, h = pop.offsetHeight
    var off = frameRect()
    pop.style.left = clamp(clientX + off.left, chromeWin.innerWidth - w - 12) + 'px'
    pop.style.top = clamp(clientY + off.top, chromeWin.innerHeight - h - 12) + 'px'
  }

  // ---- new comment composer ----
  // ---- file attachments ----
  var CLIP_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>'
  var FILE_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
  function attIsImg(n) { return /\.(png|jpg|jpeg|gif|webp)$/i.test(n || '') }
  function attName(n) { return String(n || '').replace(/^[a-z2-9]+-/i, '') }
  var ATTACH_HTML = '<div class="pk-attach"><label class="pk-attach-btn">' + CLIP_SVG + ' Attach' +
    '<input type="file" hidden></label>' +
    '<div class="pk-attach-preview"></div></div>'
  // Wire a popover's image picker; returns a {name} holder set once an image
  // uploads (the comment POST sends name as `image`).
  function wireAttach(pop) {
    var input = pop.querySelector('.pk-attach input[type=file]')
    var preview = pop.querySelector('.pk-attach-preview')
    var state = { name: null }
    if (!input) return state
    input.addEventListener('change', function () {
      var file = input.files && input.files[0]
      if (!file) return
      var fd = new FormData()
      fd.append('file', file)
      preview.textContent = 'Uploading…'
      fetch(API + '/api/attachments', { method: 'POST', body: fd })
        .then(function (r) { return r.json() })
        .then(function (j) {
          if (j && j.name) {
            state.name = j.name
            var thumb = attIsImg(j.name)
              ? '<img src="' + API + j.url + '" alt="">'
              : '<span class="pk-attach-fico">' + FILE_SVG + '</span>'
            preview.innerHTML = '<span class="pk-attach-thumb">' + thumb +
              '<button class="pk-attach-rm" type="button" aria-label="Remove">×</button></span>' +
              (attIsImg(j.name) ? '' : '<span class="pk-attach-name">' + escapeHtml(attName(j.name)) + '</span>')
            preview.querySelector('.pk-attach-rm').addEventListener('click', function () {
              state.name = null; preview.innerHTML = ''; input.value = ''
            })
          } else {
            preview.textContent = (j && j.error) || 'Upload failed'
          }
        })
        .catch(function () { preview.textContent = 'Upload failed' })
    })
    return state
  }

  // Rendered attachment for a comment/reply: images inline (click to enlarge),
  // other files as a labelled chip that opens/downloads.
  function imgHtml(c) {
    if (!c.image) return ''
    var u = API + '/api/attachments/' + escapeHtml(c.image)
    if (attIsImg(c.image)) {
      return '<a class="pk-cimg" href="' + u + '" target="_blank" rel="noreferrer"><img src="' + u + '" alt="attachment"></a>'
    }
    return '<a class="pk-cfile" href="' + u + '" target="_blank" rel="noreferrer">' + FILE_SVG +
      '<span>' + escapeHtml(attName(c.image)) + '</span></a>'
  }

  function openComposer(xPct, yPct, clientX, clientY, anchor) {
    closePopovers()
    var savedName = VIEWER_NAME || localStorage.getItem(NAME_KEY) || ''
    var pop = el('div', 'pk-pop')
    pop.innerHTML =
      (savedName ? '' : '<input class="pk-name" placeholder="Your name" />') +
      '<textarea class="pk-text" placeholder="Leave your feedback…"></textarea>' +
      ATTACH_HTML +
      '<div class="pk-row"><button class="pk-cancel">Cancel</button><button class="pk-send">Send</button></div>'
    positionPop(pop, clientX, clientY)
    var ta = pop.querySelector('.pk-text')
    ta.focus()
    attachMentions(ta)
    var att = wireAttach(pop)
    pop.querySelector('.pk-cancel').addEventListener('click', closePopovers)
    pop.querySelector('.pk-send').addEventListener('click', function () {
      var name = savedName || (pop.querySelector('.pk-name') ? pop.querySelector('.pk-name').value.trim() : '')
      var text = ta.value.trim()
      if (!text && !att.name) return
      if (!name) name = OWNER ? 'Owner' : 'Guest'
      localStorage.setItem(NAME_KEY, name)
      fetch(API + '/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_slug: slug, x_pct: xPct, y_pct: yPct, author: name, body: text, device: currentDevice, anchor: anchor || null, image: att.name }),
      })
        .then(function (r) { return r.json() })
        .then(function (c) { if (c && c.id) comments.push(c); render() })
      closePopovers()
      // Stay in comment mode so the client can drop several pins in a row.
    })
  }

  // ---- thread popover (comment + replies + reply box + owner controls) ----
  function threadHtml(c) {
    var s = statusOf(c)
    var list = visibleTops()
    var idx = -1
    for (var i = 0; i < list.length; i++) if (list[i].id === c.id) idx = i
    var h = ''
    if (list.length > 1 && idx !== -1) {
      h += '<div class="pk-thread-nav">' +
        '<button class="pk-nav-prev"' + (idx <= 0 ? ' disabled' : '') + ' aria-label="Previous comment">‹</button>' +
        '<span class="pk-nav-count">' + (idx + 1) + ' / ' + list.length + '</span>' +
        '<button class="pk-nav-next"' + (idx >= list.length - 1 ? ' disabled' : '') + ' aria-label="Next comment">›</button>' +
        '</div>'
    }
    h += '<div class="pk-meta"><b>#' + numberOf(c) + '</b> · ' + escapeHtml(c.author) +
      ' · <span class="pk-time">' + timeAgo(c.created_at) + '</span>' +
      ' <span class="pk-dev-tag">' + DEVICE_LABEL[deviceOf(c)] + '</span>' +
      ' <span class="pk-pill" style="background:' + STATUS[s].color + '">' + STATUS[s].label + '</span></div>' +
      '<div class="pk-cbody">' + renderBody(c.body) + '</div>' + imgHtml(c)

    var rmap = {}
    ;(c.reactions || []).forEach(function (r) { rmap[r.emoji] = r })
    h += '<div class="pk-reactions">'
    REACTIONS.forEach(function (em) {
      var r = rmap[em]
      h += '<button class="pk-react' + (r && r.mine ? ' mine' : '') + '" data-emoji="' + em + '">' +
        em + (r && r.count ? ' <span>' + r.count + '</span>' : '') + '</button>'
    })
    h += '</div>'

    var rs = repliesOf(c.id)
    if (rs.length) {
      h += '<div class="pk-replies">'
      rs.forEach(function (r) {
        h += '<div class="pk-reply"><b>' + escapeHtml(r.author) +
          ' <span class="pk-time">· ' + timeAgo(r.created_at) + '</span></b>' +
          '<span>' + renderBody(r.body) + '</span>' + imgHtml(r) + '</div>'
      })
      h += '</div>'
    }
    if (OWNER) {
      h += '<div class="pk-statusrow">'
      STATUS_ORDER.forEach(function (k) {
        h += '<button class="pk-st' + (k === s ? ' on' : '') + '" data-st="' + k + '" style="--c:' + STATUS[k].color + '">' + STATUS[k].label + '</button>'
      })
      h += '</div>'
    }
    var savedName = VIEWER_NAME || localStorage.getItem(NAME_KEY) || ''
    h += '<div class="pk-replybox">' +
      (savedName ? '' : '<input class="pk-name" placeholder="Your name" />') +
      '<textarea class="pk-text" placeholder="Reply…"></textarea>' +
      ATTACH_HTML +
      '<div class="pk-row">' +
      (OWNER ? '<button class="pk-del">Delete</button>' : '') +
      '<button class="pk-cancel">Close</button><button class="pk-send">Reply</button></div>' +
      '</div>'
    return h
  }

  function showThread(c, pin) {
    closePopovers()
    hidePreview()
    currentId = c.id
    var pop = el('div', 'pk-pop pk-thread')
    fillThread(pop, c)
    var rect = pin.getBoundingClientRect()
    positionPop(pop, rect.left, rect.bottom + 8)
  }

  // ---- walk-through stepper ----
  function visibleTops() {
    return tops().filter(function (c) {
      return deviceOf(c) === currentDevice && (showResolved || statusOf(c) !== 'resolved')
    })
  }
  function openStep(c) {
    var pin = layer.querySelector('.pk-pin[data-id="' + c.id + '"]')
    if (!pin) return
    try { pin.scrollIntoView({ block: 'center', inline: 'center' }) } catch (e) {}
    showThread(c, pin)
  }
  function step(dir) {
    var list = visibleTops()
    if (!list.length) return
    var idx = -1
    for (var i = 0; i < list.length; i++) if (list[i].id === currentId) idx = i
    var ni = idx === -1 ? (dir > 0 ? 0 : list.length - 1) : idx + dir
    if (ni < 0 || ni >= list.length) return
    openStep(list[ni])
  }

  // Render the thread's contents into an existing popover and wire its buttons.
  // Status changes and replies re-fill IN PLACE so the popover stays put — it
  // used to reopen against the (now-detached) pin and jump to the top-left.
  function fillThread(pop, c) {
    pop.innerHTML = threadHtml(c)
    var savedName = localStorage.getItem(NAME_KEY) || ''
    var ta = pop.querySelector('.pk-text')
    if (ta) attachMentions(ta)
    var att = wireAttach(pop)
    pop.querySelector('.pk-cancel').addEventListener('click', closePopovers)

    var navList = visibleTops()
    var nidx = -1
    for (var ni = 0; ni < navList.length; ni++) if (navList[ni].id === c.id) nidx = ni
    var prevBtn = pop.querySelector('.pk-nav-prev')
    if (prevBtn) prevBtn.addEventListener('click', function () { if (nidx > 0) openStep(navList[nidx - 1]) })
    var nextBtn = pop.querySelector('.pk-nav-next')
    if (nextBtn) nextBtn.addEventListener('click', function () { if (nidx < navList.length - 1) openStep(navList[nidx + 1]) })

    pop.querySelectorAll('.pk-react').forEach(function (b) {
      b.addEventListener('click', function () {
        var em = b.getAttribute('data-emoji')
        toggleLocalReaction(c, em)
        fillThread(pop, c)
        fetch(API + '/api/reactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comment_id: c.id, emoji: em, client_id: CID }),
        }).catch(function () {})
      })
    })

    pop.querySelectorAll('.pk-st').forEach(function (sb) {
      sb.addEventListener('click', function () {
        var st = sb.getAttribute('data-st')
        c.status = st
        fetch(API + '/api/comments/' + c.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: st }),
        }).catch(function () {})
        render()
        fillThread(pop, c)
      })
    })

    var del = pop.querySelector('.pk-del')
    if (del) del.addEventListener('click', function () {
      fetch(API + '/api/comments/' + c.id, { method: 'DELETE' }).catch(function () {})
      comments = comments.filter(function (x) { return x.id !== c.id && x.parent_id !== c.id })
      closePopovers()
      render()
    })

    pop.querySelector('.pk-send').addEventListener('click', function () {
      var name = savedName || (pop.querySelector('.pk-name') ? pop.querySelector('.pk-name').value.trim() : '')
      var text = ta.value.trim()
      if (!text && !att.name) return
      if (!name) name = OWNER ? 'Owner' : 'Guest'
      localStorage.setItem(NAME_KEY, name)
      fetch(API + '/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_slug: slug, parent_id: c.id, author: name, body: text, image: att.name }),
      })
        .then(function (r) { return r.json() })
        .then(function (rep) {
          if (rep && rep.id) comments.push(rep)
          render()
          fillThread(pop, c) // refresh in place with the new reply
        })
        .catch(function () {})
    })
  }

  // ---- slide-out list panel ----
  function togglePanel() {
    panelOpen = !panelOpen
    if (panelOpen) renderPanel()
    stylePanel()
  }

  function renderPanel() {
    var t = tops()
    // Stable pin numbers (creation order), kept even when the list is filtered.
    var num = {}
    t.forEach(function (c, i) { num[c.id] = i + 1 })

    var h = '<div class="pk-panel-head"><b>Comments</b><button class="pk-panel-close" aria-label="Close">✕</button></div>'
    if (!t.length) {
      h += '<div class="pk-empty">No comments yet. Click “Leave feedback” to add one.</div>'
      panel.innerHTML = h
      panel.querySelector('.pk-panel-close').addEventListener('click', togglePanel)
      return
    }

    h += '<div class="pk-search-wrap"><input class="pk-search" placeholder="Filter by name…" /></div>'

    // Device tabs: group comments by the size they were placed in. Picking a
    // size also switches the design frame to it so the pins line up.
    var dcounts = { all: t.length, desktop: 0, tablet: 0, mobile: 0 }
    t.forEach(function (c) { dcounts[deviceOf(c)]++ })
    var dtabs = [
      { k: 'all', label: 'All' },
      { k: 'desktop', label: 'Desktop' },
      { k: 'tablet', label: 'Tablet' },
      { k: 'mobile', label: 'Mobile' },
    ]
    h += '<div class="pk-dtabs">'
    dtabs.forEach(function (d) {
      h += '<button class="pk-dtab' + (panelDevice === d.k ? ' on' : '') + '" data-d="' + d.k + '">' +
        d.label + ' <span>' + dcounts[d.k] + '</span></button>'
    })
    h += '</div>'

    // Status filter chips with counts (within the chosen device).
    var inDevice = panelDevice === 'all' ? t : t.filter(function (c) { return deviceOf(c) === panelDevice })
    var counts = { all: inDevice.length, open: 0, progress: 0, resolved: 0 }
    inDevice.forEach(function (c) { counts[statusOf(c)]++ })
    var chips = [
      { k: 'all', label: 'All' },
      { k: 'open', label: 'Open' },
      { k: 'progress', label: 'In progress' },
      { k: 'resolved', label: 'Resolved' },
    ]
    h += '<div class="pk-pfilters">'
    chips.forEach(function (ch) {
      h += '<button class="pk-pf' + (panelFilter === ch.k ? ' on' : '') + '" data-f="' + ch.k + '">' +
        ch.label + ' <span>' + counts[ch.k] + '</span></button>'
    })
    h += '</div>'

    // "Tagged me": a viewer with a known name can narrow to comments that @mention
    // them (or whose replies do). Hidden for anonymous visitors who have no name.
    if (VIEWER_NAME) {
      var taggedCount = inDevice.filter(taggedViewer).length
      h += '<button class="pk-tagged-toggle' + (panelTagged ? ' on' : '') + '" data-tagged="1">' +
        '<span class="pk-at">@</span> Tagged me <span class="pk-tc">' + taggedCount + '</span></button>'
    }

    // Resolved pins are hidden on the design by default; let the viewer show them.
    if (counts.resolved > 0) {
      h += '<label class="pk-resolved-toggle"><input type="checkbox"' + (showResolved ? ' checked' : '') +
        '/> Show resolved pins on the design</label>'
    }

    // Open + In progress first, then resolved.
    var list = inDevice.slice().sort(function (a, b) {
      return (statusOf(a) === 'resolved' ? 1 : 0) - (statusOf(b) === 'resolved' ? 1 : 0)
    })
    if (panelFilter !== 'all') list = list.filter(function (c) { return statusOf(c) === panelFilter })
    if (panelTagged) list = list.filter(taggedViewer)

    h += '<div class="pk-panel-list">'
    if (!list.length) {
      h += '<div class="pk-empty">' + (panelTagged ? 'No comments tag you here yet.' : 'No comments with this status.') + '</div>'
    } else {
      list.forEach(function (c) {
        var s = statusOf(c)
        var nr = repliesOf(c.id).length
        h += '<button class="pk-item" data-id="' + c.id + '" data-author="' + escapeHtml(c.author) + '">' +
          '<div class="pk-item-head"><span class="pk-dot" style="background:' + STATUS[s].color + '"></span>' +
          '<b>#' + num[c.id] + '</b> ' + escapeHtml(c.author) +
          '<span class="pk-pill sm" style="background:' + STATUS[s].color + '">' + STATUS[s].label + '</span></div>' +
          '<div class="pk-item-body">' + renderBody(c.body) + '</div>' +
          (c.image ? (attIsImg(c.image)
            ? '<img class="pk-item-thumb" src="' + API + '/api/attachments/' + escapeHtml(c.image) + '" alt="">'
            : '<span class="pk-item-file">' + FILE_SVG + '<span>' + escapeHtml(attName(c.image)) + '</span></span>') : '') +
          '<div class="pk-item-meta"><span class="pk-dev-tag">' + DEVICE_LABEL[deviceOf(c)] + '</span> · ' +
          timeAgo(c.created_at) + (nr ? ' · ' + nr + (nr > 1 ? ' replies' : ' reply') : '') + '</div>' +
          '</button>'
      })
    }
    h += '</div>'

    panel.innerHTML = h
    panel.querySelector('.pk-panel-close').addEventListener('click', togglePanel)

    // Author filter: hide non-matching items live (no re-render → keeps focus).
    function applyNameFilter() {
      var q = panelName.trim().toLowerCase()
      panel.querySelectorAll('.pk-item').forEach(function (it) {
        var a = (it.getAttribute('data-author') || '').toLowerCase()
        it.style.display = !q || a.indexOf(q) !== -1 ? '' : 'none'
      })
    }
    var search = panel.querySelector('.pk-search')
    if (search) {
      search.value = panelName
      search.addEventListener('input', function () { panelName = search.value; applyNameFilter() })
    }
    applyNameFilter()

    var rt = panel.querySelector('.pk-resolved-toggle input')
    if (rt) rt.addEventListener('change', function () { showResolved = rt.checked; render() })
    var tagBtn = panel.querySelector('.pk-tagged-toggle')
    if (tagBtn) tagBtn.addEventListener('click', function () { panelTagged = !panelTagged; renderPanel() })
    panel.querySelectorAll('.pk-dtab').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = b.getAttribute('data-d')
        panelDevice = d
        // Picking a specific size switches the design frame to match its pins.
        if (d !== 'all' && d !== currentDevice) {
          currentDevice = d
          try { parent.postMessage({ pk: 'switch-device', device: d }, '*') } catch (e) {}
          render()
        }
        renderPanel()
      })
    })
    panel.querySelectorAll('.pk-pf').forEach(function (b) {
      b.addEventListener('click', function () { panelFilter = b.getAttribute('data-f'); renderPanel() })
    })
    panel.querySelectorAll('.pk-item').forEach(function (it) {
      it.addEventListener('mouseenter', function () { highlight(it.getAttribute('data-id'), true) })
      it.addEventListener('mouseleave', function () { highlight(it.getAttribute('data-id'), false) })
      it.addEventListener('click', function () {
        var c = byId(it.getAttribute('data-id'))
        if (!c) return
        // Jumping to a comment from another device size switches the frame to it.
        if (deviceOf(c) !== currentDevice) {
          currentDevice = deviceOf(c)
          try { parent.postMessage({ pk: 'switch-device', device: currentDevice }, '*') } catch (e) {}
          render()
        }
        var pin = layer.querySelector('.pk-pin[data-id="' + c.id + '"]')
        // The pin may be hidden (resolved) — reveal it so we can jump to it.
        if (!pin && statusOf(c) === 'resolved') {
          showResolved = true
          render()
          pin = layer.querySelector('.pk-pin[data-id="' + c.id + '"]')
        }
        if (pin) {
          try { pin.scrollIntoView({ block: 'center', inline: 'center' }) } catch (e) {}
          showThread(c, pin)
        }
      })
    })
  }

  // ---- placing interactions (persistent while in comment mode) ----
  // While leaving feedback, the whole design is a comment canvas: a click drops
  // a pin instead of doing what it normally would. Our own UI is excluded.
  function placingOn(e) {
    if (!mode) return false
    var t = e.target
    if (bar.contains(t) || panel.contains(t)) return false
    if (t.closest && (t.closest('.pk-pop') || t.closest('.pk-pin'))) return false
    return true
  }
  // Swallow the pointer/mouse sequence so links and SPA cards (which often
  // navigate on pointerdown/mousedown, before click) can't fire. Listen on
  // window in the capture phase — the very first point in event flow, before
  // the design's own router — and use stopImmediatePropagation so even a
  // listener the design attached to the same node can't run.
  ;['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'auxclick'].forEach(function (type) {
    window.addEventListener(
      type,
      function (e) {
        if (placingOn(e)) {
          e.preventDefault()
          e.stopImmediatePropagation()
        }
      },
      true,
    )
  })
  window.addEventListener(
    'click',
    function (e) {
      if (!placingOn(e)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      var x = (e.pageX / document.documentElement.scrollWidth) * 100
      var y = (e.pageY / document.documentElement.scrollHeight) * 100
      // Anchor the pin to the element under the click so it rides with it.
      var anchor = makeAnchor(e.target, e.clientX, e.clientY)
      openComposer(x, y, e.clientX, e.clientY, anchor)
    },
    true,
  )

  // ---- click outside to close ----
  // Clicking the design or empty host area closes an open popover and the panel.
  // Our own controls (bar, device toolbar, a pin, the panel, a list item) don't.
  function closeOnOutside(e) {
    var t = e.target
    if (!t || !t.closest) return
    // A control inside the panel (device tab, status chip, resolved toggle) may
    // have re-rendered the panel and detached this element — that's not an
    // "outside" click, so leave the panel/popovers open.
    if (t.isConnected === false) return
    if (t.closest('.pk-bar') || t.closest('.pk-dev-bar')) return
    var inPanel = t.closest('.pk-panel')
    var inPop = t.closest('.pk-pop')
    var keepPop = inPop || t.closest('.pk-pin') || t.closest('.pk-item')
    // Close one layer per click: an open comment first, then the drawer.
    if (!keepPop && chromeDoc.querySelector('.pk-pop')) {
      closePopovers()
      return
    }
    if (panelOpen && !inPanel) togglePanel()
  }
  // Placing clicks are stopped earlier (capture + stopImmediatePropagation), so
  // this bubble-phase handler never fires while dropping a pin.
  document.addEventListener('click', closeOnOutside)
  if (FRAMED) chromeDoc.addEventListener('click', closeOnOutside)

  // ---- keyboard shortcuts ----
  // C: toggle comment mode · N/P: next/previous comment · Esc: close / exit.
  function onKey(e) {
    var t = e.target
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    var k = e.key
    if (k === 'Escape') {
      hidePreview()
      // Same layering: close an open comment first, then the drawer, then exit.
      if (chromeDoc.querySelector('.pk-pop')) closePopovers()
      else if (panelOpen) togglePanel()
      else if (mode) setMode(false)
    } else if (k === 'c' || k === 'C') {
      dismissIntro()
      closePopovers()
      setMode(!mode)
    } else if (k === 'n' || k === 'N') {
      e.preventDefault()
      step(1)
    } else if (k === 'p' || k === 'P') {
      e.preventDefault()
      step(-1)
    }
  }
  // Listen in both documents so shortcuts work whether focus is on the design
  // (this frame) or the chrome (host).
  document.addEventListener('keydown', onKey)
  if (FRAMED) chromeDoc.addEventListener('keydown', onKey)

  load()
  maybeShowIntro()
  // Live updates: an SSE stream pushes a tick whenever anyone changes a comment
  // on this page, so feedback appears instantly. A slow poll stays as a safety
  // net (and the only path if EventSource is unavailable).
  ;(function connectLive() {
    if (typeof EventSource === 'undefined') {
      setInterval(load, 6000)
      return
    }
    try {
      var es = new EventSource(API + '/api/comments/stream?page=' + encodeURIComponent(slug))
      es.onmessage = function () { load() }
      // EventSource reconnects on its own; keep a slow safety poll regardless.
      setInterval(load, 30000)
    } catch (e) {
      setInterval(load, 6000)
    }
  })()

  // Some designs re-render or replace the whole document after they boot,
  // which wipes our injected DOM and the stylesheet link — re-add whatever
  // is missing and re-apply the inline styles so the UI never comes back broken.
  setInterval(function () {
    ensureCss()
    if (!chromeDoc.body.contains(bar)) chromeDoc.body.appendChild(bar)
    if (!chromeDoc.body.contains(panel)) chromeDoc.body.appendChild(panel)
    if (!document.body.contains(layer) || !document.body.contains(fixedLayer)) {
      if (!document.body.contains(layer)) document.body.appendChild(layer)
      if (!document.body.contains(fixedLayer)) document.body.appendChild(fixedLayer)
      render()
    }
    styleBar()
    stylePanel()
  }, 1500)
})()
