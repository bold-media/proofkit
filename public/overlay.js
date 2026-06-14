(function () {
  // Read the page id from this script tag's data attribute (works even when a
  // site's Content-Security-Policy blocks inline scripts).
  var me = document.currentScript || document.querySelector('script[data-proof-slug]')
  var slug = (me && me.getAttribute('data-proof-slug')) || window.__PROOF_SLUG__
  if (!slug) return
  var API = location.origin
  var NAME_KEY = 'proofkit_name'
  var comments = []
  var mode = false

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
  function ensureCss() {
    if (document.querySelector('link[data-proof-css]')) return
    var link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = API + '/overlay.css'
    link.setAttribute('data-proof-css', '1')
    ;(document.head || document.documentElement).appendChild(link)
  }
  ensureCss()

  // The owner (logged in) gets extra controls: changing a comment's status and
  // deleting. The server still enforces this — the flag only gates the UI.
  var OWNER = !!(me && me.getAttribute('data-proof-owner'))

  var STATUS = {
    open: { label: 'Open', color: '#dc2626' },
    progress: { label: 'In progress', color: '#d97706' },
    resolved: { label: 'Resolved', color: '#16a34a' },
  }
  var STATUS_ORDER = ['open', 'progress', 'resolved']
  function statusOf(c) { return STATUS[c.status] ? c.status : 'open' }

  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n }
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
  var layer = el('div', 'pk-layer')
  document.body.appendChild(layer)

  var bar = el('div', 'pk-bar')
  var listBtn = el('button', 'pk-btn pk-ghost')
  var btn = el('button', 'pk-btn')
  bar.appendChild(listBtn)
  bar.appendChild(btn)
  document.body.appendChild(bar)

  var panel = el('div', 'pk-panel')
  document.body.appendChild(panel)
  var panelOpen = false
  var panelFilter = 'all'

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
    var n = document.querySelector('.pk-intro')
    if (n) n.remove()
    try { localStorage.setItem('pk_intro_seen', '1') } catch (e) {}
  }
  function maybeShowIntro() {
    try { if (localStorage.getItem('pk_intro_seen')) return } catch (e) {}
    var tip = el('div', 'pk-intro')
    tip.innerHTML = '<b>Leave feedback here</b><br>Click “Leave feedback”, then click anywhere on the design to drop a comment.'
    document.body.appendChild(tip)
    setTimeout(dismissIntro, 9000)
  }

  function sizeLayer() {
    layer.style.width = document.documentElement.scrollWidth + 'px'
    layer.style.height = document.documentElement.scrollHeight + 'px'
  }
  window.addEventListener('resize', function () { render() })

  function closePopovers() {
    document.querySelectorAll('.pk-pop,.pk-hint').forEach(function (p) { p.remove() })
  }

  function load() {
    fetch(API + '/api/comments?page=' + encodeURIComponent(slug))
      .then(function (r) { return r.json() })
      .then(function (j) { comments = j.comments || []; render() })
      .catch(function () {})
  }

  function render() {
    sizeLayer()
    layer.innerHTML = ''
    tops().forEach(function (c, i) {
      var pin = el('button', 'pk-pin')
      pin.textContent = i + 1
      pin.setAttribute('data-id', c.id)
      pin.style.left = c.x_pct + '%'
      pin.style.top = c.y_pct + '%'
      pin.style.background = STATUS[statusOf(c)].color
      pin.addEventListener('click', function (e) {
        e.stopPropagation()
        showThread(c, pin)
      })
      layer.appendChild(pin)
    })
    updateBtn()
    if (panelOpen) renderPanel()
  }

  // ---- comment mode (persistent: stays on until you click "Done") ----
  function setMode(on) {
    mode = on
    document.body.style.cursor = mode ? 'crosshair' : ''
    var hint = document.querySelector('.pk-hint')
    if (mode && !hint) {
      hint = el('div', 'pk-hint')
      hint.textContent = 'Click anywhere on the design to drop a comment · click “Done” when finished'
      document.body.appendChild(hint)
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
    document.body.appendChild(pop)
    var w = pop.offsetWidth, h = pop.offsetHeight
    pop.style.left = clamp(clientX, window.innerWidth - w - 12) + 'px'
    pop.style.top = clamp(clientY, window.innerHeight - h - 12) + 'px'
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
        body: JSON.stringify({ page_slug: slug, x_pct: xPct, y_pct: yPct, author: name, body: text }),
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
    var h = '<div class="pk-meta"><b>#' + numberOf(c) + '</b> · ' + escapeHtml(c.author) +
      ' <span class="pk-pill" style="background:' + STATUS[s].color + '">' + STATUS[s].label + '</span></div>' +
      '<div class="pk-cbody">' + escapeHtml(c.body) + '</div>'
    var rs = repliesOf(c.id)
    if (rs.length) {
      h += '<div class="pk-replies">'
      rs.forEach(function (r) {
        h += '<div class="pk-reply"><b>' + escapeHtml(r.author) + '</b><span>' + escapeHtml(r.body) + '</span></div>'
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
    var pop = el('div', 'pk-pop pk-thread')
    fillThread(pop, c)
    var rect = pin.getBoundingClientRect()
    positionPop(pop, rect.left, rect.bottom + 8)
  }

  // Render the thread's contents into an existing popover and wire its buttons.
  // Status changes and replies re-fill IN PLACE so the popover stays put — it
  // used to reopen against the (now-detached) pin and jump to the top-left.
  function fillThread(pop, c) {
    pop.innerHTML = threadHtml(c)
    var savedName = localStorage.getItem(NAME_KEY) || ''
    var ta = pop.querySelector('.pk-text')
    pop.querySelector('.pk-cancel').addEventListener('click', closePopovers)

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
          (nr ? '<div class="pk-item-meta">' + nr + (nr > 1 ? ' replies' : ' reply') + '</div>' : '') +
          '</button>'
      })
    }
    h += '</div>'

    panel.innerHTML = h
    panel.querySelector('.pk-panel-close').addEventListener('click', togglePanel)
    panel.querySelectorAll('.pk-pf').forEach(function (b) {
      b.addEventListener('click', function () { panelFilter = b.getAttribute('data-f'); renderPanel() })
    })
    panel.querySelectorAll('.pk-item').forEach(function (it) {
      it.addEventListener('click', function () {
        var c = byId(it.getAttribute('data-id'))
        if (!c) return
        var pin = layer.querySelector('.pk-pin[data-id="' + c.id + '"]')
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

  load()
  maybeShowIntro()
  // Reflect comments/replies left by others without a manual refresh.
  setInterval(load, 6000)

  // Some designs re-render or replace the whole document after they boot,
  // which wipes our injected DOM and the stylesheet link — re-add whatever
  // is missing and re-apply the inline styles so the UI never comes back broken.
  setInterval(function () {
    ensureCss()
    if (!document.body.contains(bar)) document.body.appendChild(bar)
    if (!document.body.contains(panel)) document.body.appendChild(panel)
    if (!document.body.contains(layer)) {
      document.body.appendChild(layer)
      render()
    }
    styleBar()
    stylePanel()
  }, 1500)
})()
