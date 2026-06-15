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

  var bar = el('div', 'pk-bar')
  var listBtn = el('button', 'pk-btn pk-ghost')
  var btn = el('button', 'pk-btn')
  bar.appendChild(listBtn)
  bar.appendChild(btn)
  chromeDoc.body.appendChild(bar)

  var panel = el('div', 'pk-panel')
  chromeDoc.body.appendChild(panel)
  var panelOpen = false
  var panelFilter = 'all'
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
      '<div class="pk-pv-body">' + escapeHtml(c.body) + '</div>' +
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

  function render() {
    sizeLayer()
    layer.innerHTML = ''
    tops().forEach(function (c, i) {
      var s = statusOf(c)
      // Only show pins placed in the device size currently being viewed.
      if (deviceOf(c) !== currentDevice) return
      // Resolved pins stay off the design (decluttered) until the toggle is on.
      if (s === 'resolved' && !showResolved) return
      var pin = el('button', 'pk-pin' + (s === 'resolved' ? ' resolved' : ''))
      pin.setAttribute('data-id', c.id)
      pin.style.left = c.x_pct + '%'
      pin.style.top = c.y_pct + '%'
      pin.style.background = STATUS[s].color
      pin.style.cursor = 'grab'
      pin.title = '#' + (i + 1) + ' · ' + c.author + ' · ' + STATUS[s].label + ' — drag to move, click to open'
      // Avatar: author initials (a check once resolved).
      var label = el('span', 'pk-pin-label')
      label.textContent = s === 'resolved' ? '✓' : initials(c.author)
      pin.appendChild(label)
      var nr = repliesOf(c.id).length
      if (nr > 0) {
        var badge = el('span', 'pk-pin-badge')
        badge.textContent = nr > 9 ? '9+' : nr
        pin.appendChild(badge)
      }
      attachPin(pin, c)
      layer.appendChild(pin)
    })
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
  function openComposer(xPct, yPct, clientX, clientY) {
    closePopovers()
    var savedName = localStorage.getItem(NAME_KEY) || ''
    var pop = el('div', 'pk-pop')
    pop.innerHTML =
      (savedName ? '' : '<input class="pk-name" placeholder="Your name" />') +
      '<textarea class="pk-text" placeholder="Leave your feedback…"></textarea>' +
      '<div class="pk-row"><button class="pk-cancel">Cancel</button><button class="pk-send">Send</button></div>'
    positionPop(pop, clientX, clientY)
    var ta = pop.querySelector('.pk-text')
    ta.focus()
    pop.querySelector('.pk-cancel').addEventListener('click', closePopovers)
    pop.querySelector('.pk-send').addEventListener('click', function () {
      var name = savedName || (pop.querySelector('.pk-name') ? pop.querySelector('.pk-name').value.trim() : '')
      var text = ta.value.trim()
      if (!text) return
      if (!name) name = OWNER ? 'Owner' : 'Guest'
      localStorage.setItem(NAME_KEY, name)
      fetch(API + '/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_slug: slug, x_pct: xPct, y_pct: yPct, author: name, body: text, device: currentDevice }),
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
      '<div class="pk-cbody">' + escapeHtml(c.body) + '</div>'

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
          '<span>' + escapeHtml(r.body) + '</span></div>'
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
    var savedName = localStorage.getItem(NAME_KEY) || ''
    h += '<div class="pk-replybox">' +
      (savedName ? '' : '<input class="pk-name" placeholder="Your name" />') +
      '<textarea class="pk-text" placeholder="Reply…"></textarea>' +
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
      if (!text) return
      if (!name) name = OWNER ? 'Owner' : 'Guest'
      localStorage.setItem(NAME_KEY, name)
      fetch(API + '/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_slug: slug, parent_id: c.id, author: name, body: text }),
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

    // Filter chips with counts, so a long list (100+) stays manageable.
    var counts = { all: t.length, open: 0, progress: 0, resolved: 0 }
    t.forEach(function (c) { counts[statusOf(c)]++ })
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

    // Resolved pins are hidden on the design by default; let the viewer show them.
    if (counts.resolved > 0) {
      h += '<label class="pk-resolved-toggle"><input type="checkbox"' + (showResolved ? ' checked' : '') +
        '/> Show resolved pins on the design</label>'
    }

    // Open + In progress first, then resolved.
    var list = t.slice().sort(function (a, b) {
      return (statusOf(a) === 'resolved' ? 1 : 0) - (statusOf(b) === 'resolved' ? 1 : 0)
    })
    if (panelFilter !== 'all') list = list.filter(function (c) { return statusOf(c) === panelFilter })

    h += '<div class="pk-panel-list">'
    if (!list.length) {
      h += '<div class="pk-empty">No comments with this status.</div>'
    } else {
      list.forEach(function (c) {
        var s = statusOf(c)
        var nr = repliesOf(c.id).length
        h += '<button class="pk-item" data-id="' + c.id + '">' +
          '<div class="pk-item-head"><span class="pk-dot" style="background:' + STATUS[s].color + '"></span>' +
          '<b>#' + num[c.id] + '</b> ' + escapeHtml(c.author) +
          '<span class="pk-pill sm" style="background:' + STATUS[s].color + '">' + STATUS[s].label + '</span></div>' +
          '<div class="pk-item-body">' + escapeHtml(c.body) + '</div>' +
          '<div class="pk-item-meta"><span class="pk-dev-tag">' + DEVICE_LABEL[deviceOf(c)] + '</span> · ' +
          timeAgo(c.created_at) + (nr ? ' · ' + nr + (nr > 1 ? ' replies' : ' reply') : '') + '</div>' +
          '</button>'
      })
    }
    h += '</div>'

    panel.innerHTML = h
    panel.querySelector('.pk-panel-close').addEventListener('click', togglePanel)
    var rt = panel.querySelector('.pk-resolved-toggle input')
    if (rt) rt.addEventListener('change', function () { showResolved = rt.checked; render() })
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
      openComposer(x, y, e.clientX, e.clientY)
    },
    true,
  )

  // ---- keyboard shortcuts ----
  // C: toggle comment mode · N/P: next/previous comment · Esc: close / exit.
  function onKey(e) {
    var t = e.target
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    var k = e.key
    if (k === 'Escape') {
      hidePreview()
      if (chromeDoc.querySelector('.pk-pop')) closePopovers()
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
    if (!document.body.contains(layer)) {
      document.body.appendChild(layer)
      render()
    }
    styleBar()
    stylePanel()
  }, 1500)
})()
