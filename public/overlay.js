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

  var layer = document.createElement('div')
  layer.className = 'pk-layer'
  document.body.appendChild(layer)

  var bar = document.createElement('div')
  bar.className = 'pk-bar'
  var btn = document.createElement('button')
  btn.className = 'pk-btn'
  bar.appendChild(btn)
  document.body.appendChild(bar)

  // The button's core look is also set inline via the CSSOM. Setting .style
  // properties is NOT subject to CSP style-src, so the button stays styled
  // and correctly positioned even when overlay.css hasn't loaded yet or was
  // stripped by a design that replaced the document.
  function styleBar() {
    bar.style.cssText =
      'position:fixed;bottom:20px;right:20px;left:auto;top:auto;z-index:2147483600;' +
      'margin:0;font-family:sans-serif'
    btn.style.cssText =
      'border:none;background:' + (mode ? '#dc2626' : '#4f46e5') + ';color:#fff;' +
      'font:600 14px sans-serif;padding:11px 18px;border-radius:24px;cursor:pointer;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.22);white-space:nowrap'
  }
  styleBar()

  function updateBtn() {
    var open = comments.filter(function (c) { return !c.resolved }).length
    btn.textContent = mode ? '✕ Cancel' : '💬 Leave feedback' + (open ? ' · ' + open : '')
    btn.classList.toggle('active', mode)
    styleBar()
  }

  function dismissIntro() {
    var el = document.querySelector('.pk-intro')
    if (el) el.remove()
    try { localStorage.setItem('pk_intro_seen', '1') } catch (e) {}
  }

  function maybeShowIntro() {
    try { if (localStorage.getItem('pk_intro_seen')) return } catch (e) {}
    var tip = document.createElement('div')
    tip.className = 'pk-intro'
    tip.innerHTML = '<b>Leave feedback here 👇</b><br>Click this button, then click anywhere on the design to drop a comment.'
    document.body.appendChild(tip)
    setTimeout(dismissIntro, 9000)
  }

  function sizeLayer() {
    layer.style.width = document.documentElement.scrollWidth + 'px'
    layer.style.height = document.documentElement.scrollHeight + 'px'
  }
  window.addEventListener('resize', function () { render() })

  function closePopovers() {
    var ps = document.querySelectorAll('.pk-pop,.pk-hint')
    ps.forEach(function (p) { p.remove() })
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
    comments.forEach(function (c, i) {
      var pin = document.createElement('button')
      pin.className = 'pk-pin' + (c.resolved ? ' resolved' : '')
      pin.textContent = i + 1
      pin.style.left = c.x_pct + '%'
      pin.style.top = c.y_pct + '%'
      pin.addEventListener('click', function (e) {
        e.stopPropagation()
        showView(c, i + 1, pin)
      })
      layer.appendChild(pin)
    })
    updateBtn()
  }

  function toggleMode() {
    mode = !mode
    document.body.style.cursor = mode ? 'crosshair' : ''
    closePopovers()
    updateBtn()
    if (mode) {
      var hint = document.createElement('div')
      hint.className = 'pk-hint'
      hint.textContent = 'Click anywhere on the page to leave a comment'
      document.body.appendChild(hint)
    }
  }

  btn.addEventListener('click', function (e) {
    e.stopPropagation()
    dismissIntro()
    toggleMode()
  })

  function clamp(v, max) { return Math.max(12, Math.min(v, max)) }

  function positionPop(pop, clientX, clientY) {
    document.body.appendChild(pop)
    var w = pop.offsetWidth, h = pop.offsetHeight
    pop.style.left = clamp(clientX, window.innerWidth - w - 12) + 'px'
    pop.style.top = clamp(clientY, window.innerHeight - h - 12) + 'px'
  }

  function openComposer(xPct, yPct, clientX, clientY) {
    closePopovers()
    var savedName = localStorage.getItem(NAME_KEY) || ''
    var pop = document.createElement('div')
    pop.className = 'pk-pop'
    var nameField = savedName
      ? ''
      : '<input class="pk-name" placeholder="Your name" />'
    pop.innerHTML =
      nameField +
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
      if (!name) name = 'Guest'
      localStorage.setItem(NAME_KEY, name)
      fetch(API + '/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_slug: slug, x_pct: xPct, y_pct: yPct, author: name, body: text }),
      })
        .then(function (r) { return r.json() })
        .then(function (c) {
          if (c && c.id) comments.push(c)
          render()
        })
      closePopovers()
    })
  }

  function showView(c, num, pin) {
    closePopovers()
    var rect = pin.getBoundingClientRect()
    var pop = document.createElement('div')
    pop.className = 'pk-pop'
    pop.innerHTML =
      '<div class="pk-meta"><b>#' + num + '</b> · ' + escapeHtml(c.author) +
      (c.resolved ? ' · resolved' : '') + '</div>' +
      '<div>' + escapeHtml(c.body) + '</div>' +
      '<div class="pk-row" style="margin-top:8px"><button class="pk-cancel">Close</button></div>'
    positionPop(pop, rect.left, rect.bottom + 8)
    pop.querySelector('.pk-cancel').addEventListener('click', closePopovers)
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
    })
  }

  document.addEventListener(
    'click',
    function (e) {
      if (!mode) return
      if (bar.contains(e.target)) return
      if (e.target.closest && e.target.closest('.pk-pop')) return
      e.preventDefault()
      e.stopPropagation()
      var x = (e.pageX / document.documentElement.scrollWidth) * 100
      var y = (e.pageY / document.documentElement.scrollHeight) * 100
      mode = false
      document.body.style.cursor = ''
      updateBtn()
      var hint = document.querySelector('.pk-hint')
      if (hint) hint.remove()
      openComposer(x, y, e.clientX, e.clientY)
    },
    true,
  )

  load()
  maybeShowIntro()

  // Some designs re-render or replace the whole document after they boot,
  // which wipes our injected DOM and the stylesheet link — re-add whatever
  // is missing and re-apply the inline button styles so it never comes back
  // unstyled.
  setInterval(function () {
    ensureCss()
    if (!document.body.contains(bar)) document.body.appendChild(bar)
    if (!document.body.contains(layer)) {
      document.body.appendChild(layer)
      render()
    }
    styleBar()
  }, 1500)
})()
