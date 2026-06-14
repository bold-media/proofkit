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

  // Styles live in /overlay.css (external file, so a site's CSP that blocks
  // inline <style> can't strip our UI). Make sure it's loaded.
  if (!document.querySelector('link[data-proof-css]')) {
    var link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = API + '/overlay.css'
    link.setAttribute('data-proof-css', '1')
    document.head.appendChild(link)
  }

  var layer = document.createElement('div')
  layer.className = 'pk-layer'
  document.body.appendChild(layer)

  var bar = document.createElement('div')
  bar.className = 'pk-bar'
  var btn = document.createElement('button')
  btn.className = 'pk-btn'
  bar.appendChild(btn)
  document.body.appendChild(bar)

  function updateBtn() {
    var open = comments.filter(function (c) { return !c.resolved }).length
    btn.textContent = mode ? '✕ Cancel' : '💬 Leave feedback' + (open ? ' · ' + open : '')
    btn.classList.toggle('active', mode)
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

  // Some designs re-render and wipe injected DOM — keep our UI present.
  setInterval(function () {
    if (!document.body.contains(bar)) document.body.appendChild(bar)
    if (!document.body.contains(layer)) {
      document.body.appendChild(layer)
      render()
    }
  }, 1500)
})()
