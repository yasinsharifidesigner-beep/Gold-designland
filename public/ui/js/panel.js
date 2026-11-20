(function () {
  var timerId = null;
  var cache = Object.create(null);
  var inflight = Object.create(null);
  var cacheGen = 0;
  var navSeq = 0;
  var currentKey = location.pathname + location.search;
  var drawerQuery = window.matchMedia('(max-width: 1100px)');
  var drawerBound = false;

  function setDrawer(open) {
    var side = document.getElementById('side');
    var backdrop = document.getElementById('side-backdrop');
    var menu = document.getElementById('menu-btn');
    if (!side) return;
    var mobile = drawerQuery.matches;
    var show = !!open && mobile;
    side.classList.toggle('open', show);
    if (backdrop) backdrop.hidden = !show;
    document.documentElement.classList.toggle('side-open', show);
    document.body.classList.toggle('side-open', show);
    if (menu) menu.setAttribute('aria-expanded', show ? 'true' : 'false');
    if (mobile && !show) {
      side.setAttribute('aria-hidden', 'true');
      setTimeout(function () {
        if (!side.classList.contains('open') && drawerQuery.matches) side.setAttribute('inert', '');
      }, 0);
    } else {
      side.removeAttribute('inert');
      side.removeAttribute('aria-hidden');
    }
  }
  function closeDrawer() { setDrawer(false); }
  function toggleDrawer() {
    var side = document.getElementById('side');
    setDrawer(!(side && side.classList.contains('open')));
  }
  function bindDrawer() {
    if (drawerBound) return;
    var menu = document.getElementById('menu-btn');
    var side = document.getElementById('side');
    if (!menu || !side) return;
    drawerBound = true;
    menu.addEventListener('click', function () { toggleDrawer(); });
    var backdrop = document.getElementById('side-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      var panel = document.getElementById('side');
      if (!panel || !panel.classList.contains('open')) return;
      event.preventDefault();
      closeDrawer();
      menu.focus();
    });
    side.addEventListener('click', function (event) {
      var anchor = event.target && event.target.closest ? event.target.closest('a') : null;
      if (anchor) closeDrawer();
    });
    function onDrawerMode() { setDrawer(false); }
    if (drawerQuery.addEventListener) drawerQuery.addEventListener('change', onDrawerMode);
    else if (drawerQuery.addListener) drawerQuery.addListener(onDrawerMode);
  }

  function showSettings() {
    var panes = document.querySelectorAll('[data-tab]');
    if (!panes.length) return;
    var tab = (location.hash || '#account').slice(1);
    if (tab === 'logout') {
      var modal = document.getElementById('logout');
      if (modal) modal.hidden = false;
      tab = 'account';
    }
    panes.forEach(function (el) { el.hidden = el.getAttribute('data-tab') !== tab; });
    document.querySelectorAll('.tabs .tab').forEach(function (a) {
      a.classList.toggle('on', (a.getAttribute('href') || '') === '#' + (location.hash === '#logout' ? 'logout' : tab));
    });
  }

  function bootPage() {
    bindDrawer();
    closeDrawer();
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    var stream = document.getElementById('stream');
    if (stream) stream.scrollTop = stream.scrollHeight;
    var otp = document.getElementById('otp');
    if (otp) {
      var boxes = otp.querySelectorAll('input');
      boxes.forEach(function (box, i) {
        box.addEventListener('input', function () {
          box.value = box.value.replace(/\D/g, '').slice(-1);
          if (box.value && boxes[i + 1]) boxes[i + 1].focus();
          boxes.forEach(function (b, j) { b.classList.toggle('on', j === (box.value && boxes[i + 1] ? i + 1 : i)); });
        });
      });
    }
    var timer = document.getElementById('timer');
    if (timer) {
      var left = 58;
      timerId = setInterval(function () {
        left -= 1;
        if (left <= 0) {
          clearInterval(timerId);
          timerId = null;
          timer.innerHTML = '<a href="' + location.pathname + '?resend=1">ارسال دوبارهٔ کد</a>';
          return;
        }
        var m = Math.floor(left / 60);
        var s = String(left % 60).padStart(2, '0');
        var fa = s.replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[d]; });
        timer.querySelector('span').textContent = '۰:' + fa;
      }, 1000);
    }
    var share = document.getElementById('share');
    if (share) {
      share.addEventListener('click', function () {
        var link = share.getAttribute('data-link');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).catch(function () {});
        var toast = document.getElementById('copied');
        if (toast) { toast.hidden = false; setTimeout(function () { toast.hidden = true; }, 1800); }
      });
    }
    showSettings();
    var play = document.getElementById('play');
    var vid = document.getElementById('vid');
    if (play && vid) {
      play.addEventListener('click', function () {
        play.hidden = true;
        delete cache['/panel/courses'];
        delete cache[location.pathname + location.search];
        fetch(vid.getAttribute('data-end'), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: '_csrf=' + encodeURIComponent((document.querySelector('[name=_csrf]') || {}).value || '') });
      });
    }
    var full = document.getElementById('full');
    if (full) full.addEventListener('click', function () {
      var p = document.querySelector('.player');
      if (p.requestFullscreen) p.requestFullscreen();
    });
  }

  var cancel = document.getElementById('logout-cancel');
  var logoutModal = document.getElementById('logout');
  if (cancel && logoutModal) cancel.addEventListener('click', function () { logoutModal.hidden = true; location.hash = 'account'; });
  window.addEventListener('hashchange', showSettings);

  var shell = document.querySelector('.app main.main');
  if (!shell) {
    bootPage();
    return;
  }

  if (history.scrollRestoration) history.scrollRestoration = 'manual';

  function isPanelPath(pathname) {
    return pathname === '/panel' || pathname.indexOf('/panel/') === 0;
  }
  function isAuthPath(pathname) {
    return pathname === '/auth' || pathname.indexOf('/auth/') === 0;
  }
  function isDownload(pathname) {
    return /\/download\/?$/.test(pathname);
  }
  function pageKey(url) {
    return url.pathname + url.search;
  }
  function menuKeys() {
    var keys = [];
    document.querySelectorAll('#side nav.nav a').forEach(function (a) {
      try { keys.push(pageKey(new URL(a.href, location.href))); } catch (err) {}
    });
    return keys;
  }
  function snapshot() {
    var main = document.querySelector('main.main');
    if (!main) return;
    var on = document.querySelector('#side nav.nav a.on');
    cache[location.pathname + location.search] = {
      fragment: main.outerHTML,
      title: document.title,
      active: on ? on.getAttribute('href') : '',
      finalPath: location.pathname,
      finalSearch: location.search
    };
  }
  function parseMain(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var main = doc.querySelector('main.main');
    if (!main) return null;
    var on = doc.querySelector('#side nav.nav a.on');
    var title = doc.querySelector('title');
    return {
      fragment: main.outerHTML,
      title: title ? title.textContent : document.title,
      active: on ? on.getAttribute('href') : ''
    };
  }
  function invalidateMenus(keepKey) {
    menuKeys().forEach(function (key) {
      if (key !== keepKey) delete cache[key];
    });
    cacheGen += 1;
    prefetchMenu();
  }
  function load(key) {
    if (cache[key]) return Promise.resolve(cache[key]);
    if (inflight[key]) return inflight[key];
    var gen = cacheGen;
    var flights = inflight;
    inflight[key] = fetch(key, {
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
      redirect: 'follow',
      cache: 'no-store'
    }).then(function (res) {
      var finalUrl = new URL(res.url, location.origin);
      var finalKey = finalUrl.pathname + finalUrl.search;
      if (isAuthPath(finalUrl.pathname)) {
        var authEntry = { auth: true, finalUrl: finalUrl.pathname + finalUrl.search };
        if (gen === cacheGen) cache[key] = authEntry;
        return authEntry;
      }
      var type = (res.headers.get('content-type') || '').toLowerCase();
      if (!res.ok || !isPanelPath(finalUrl.pathname) || type.indexOf('text/html') === -1) {
        var hardEntry = { hard: true, finalUrl: finalUrl.href };
        if (gen === cacheGen) cache[key] = hardEntry;
        return hardEntry;
      }
      return res.text().then(function (html) {
        var parsed = parseMain(html);
        if (!parsed) {
          var again = { hard: true, finalUrl: finalUrl.href };
          if (gen === cacheGen) cache[key] = again;
          return again;
        }
        parsed.finalPath = finalUrl.pathname;
        parsed.finalSearch = finalUrl.search;
        if (gen !== cacheGen) return parsed;
        if (finalKey !== key) {
          invalidateMenus(finalKey);
          cache[finalKey] = parsed;
          return parsed;
        }
        cache[key] = parsed;
        return parsed;
      });
    }).then(function (entry) {
      if (inflight === flights) delete inflight[key];
      return entry;
    }, function (err) {
      if (inflight === flights) delete inflight[key];
      throw err;
    });
    return inflight[key];
  }
  function confirmAuth(key) {
    fetch(key, {
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
      redirect: 'follow',
      cache: 'no-store'
    }).then(function (res) {
      var finalUrl = new URL(res.url, location.origin);
      if (!isAuthPath(finalUrl.pathname)) return;
      cache = Object.create(null);
      location.href = finalUrl.pathname + finalUrl.search;
    }).catch(function () {});
  }
  function prefetch(key) {
    if (!key || key === currentKey) return;
    load(key).then(function (entry) {
      if (entry && entry.auth) location.href = entry.finalUrl || '/auth/login';
    }).catch(function () {});
  }
  function prefetchMenu() {
    menuKeys().forEach(prefetch);
  }
  var pendingNav = null;
  var navRunning = false;

  function applyMain(next, entry, url, mode, seq, motion, useVT) {
    if (seq !== navSeq) return;
    var current = document.querySelector('main.main');
    if (!current) return;
    if (!useVT && motion) next.classList.remove('reveal');
    current.replaceWith(next);
    if (!useVT && motion) {
      void next.offsetWidth;
      next.classList.add('reveal');
    }
    if (entry.title) document.title = entry.title;
    document.querySelectorAll('#side nav.nav a').forEach(function (a) {
      a.classList.toggle('on', a.getAttribute('href') === entry.active);
    });
    var freshToken = next.querySelector('input[name="_csrf"]');
    if (freshToken && freshToken.value) {
      document.querySelectorAll('#side input[name="_csrf"], #logout input[name="_csrf"]').forEach(function (input) {
        input.value = freshToken.value;
      });
    }
    var modal = document.getElementById('logout');
    if (modal) modal.hidden = true;
    closeDrawer();
    window.scrollTo(0, 0);
    var path = entry.finalPath || url.pathname;
    var search = entry.finalSearch != null ? entry.finalSearch : url.search;
    var dest = path + search + (url.hash || '');
    var now = location.pathname + location.search + location.hash;
    if (dest !== now) {
      if (mode === 'push') history.pushState({ gdl: 1 }, '', dest);
      else history.replaceState({ gdl: 1 }, '', dest);
    }
    currentKey = path + search;
    bootPage();
  }

  function pump() {
    if (navRunning || !pendingNav) return;
    var job = pendingNav;
    pendingNav = null;
    if (job.seq !== navSeq) { pump(); return; }
    var wrap = document.createElement('div');
    wrap.innerHTML = job.entry.fragment;
    var next = wrap.firstElementChild;
    if (!next || !next.classList.contains('main')) {
      location.href = job.url.href;
      return;
    }
    var motion = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var useVT = motion && typeof document.startViewTransition === 'function';
    if (useVT) next.classList.remove('reveal');
    function finish() {
      navRunning = false;
      pump();
    }
    navRunning = true;
    if (useVT) {
      var ran = false;
      function swap() {
        ran = true;
        applyMain(next, job.entry, job.url, job.mode, job.seq, motion, true);
      }
      try {
        var transition = document.startViewTransition(swap);
        Promise.resolve(transition.finished).then(function () {
          if (!ran && job.seq === navSeq) swap();
          finish();
        }, function () {
          if (!ran && job.seq === navSeq) swap();
          finish();
        });
        return;
      } catch (err) {
        next.classList.add('reveal');
      }
    }
    applyMain(next, job.entry, job.url, job.mode, job.seq, motion, false);
    finish();
  }

  function mount(entry, url, mode, seq) {
    if (!entry || !entry.fragment) return false;
    pendingNav = { entry: entry, url: url, mode: mode, seq: seq };
    pump();
    return true;
  }
  function visit(url, mode) {
    var seq = ++navSeq;
    var key = url.pathname + url.search;
    function go(entry) {
      if (seq !== navSeq) return;
      if (!entry || entry.auth) {
        location.href = (entry && entry.finalUrl) || '/auth/login';
        return;
      }
      if (entry.hard || !entry.fragment) {
        location.href = entry.finalUrl || url.href;
        return;
      }
      if (!mount(entry, url, mode, seq)) location.href = url.href;
    }
    var hit = cache[key];
    if (hit) {
      if (hit.fragment) confirmAuth(key);
      go(hit);
      return;
    }
    load(key).then(go).catch(function () {
      if (seq === navSeq) location.href = url.href;
    });
  }
  function shouldSwap(event, anchor) {
    if (!anchor || event.defaultPrevented || event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (anchor.target && anchor.target !== '_self') return false;
    if (anchor.hasAttribute('download') || !anchor.hasAttribute('href')) return false;
    var url;
    try { url = new URL(anchor.href, location.href); } catch (err) { return false; }
    if (url.origin !== location.origin) return false;
    if (!isPanelPath(url.pathname) || isDownload(url.pathname)) return false;
    if (url.pathname === location.pathname && url.search === location.search) {
      if ((url.hash || '') !== (location.hash || '')) return false;
      event.preventDefault();
      return false;
    }
    event.preventDefault();
    return url;
  }

  snapshot();
  bootPage();

  document.addEventListener('click', function (event) {
    var anchor = event.target && event.target.closest ? event.target.closest('a') : null;
    var url = shouldSwap(event, anchor);
    if (url) {
      closeDrawer();
      visit(url, 'push');
    }
  });
  document.addEventListener('mouseover', function (event) {
    var anchor = event.target && event.target.closest ? event.target.closest('#side nav.nav a') : null;
    if (!anchor) return;
    try { prefetch(pageKey(new URL(anchor.href, location.href))); } catch (err) {}
  });
  document.addEventListener('focusin', function (event) {
    var anchor = event.target && event.target.closest ? event.target.closest('#side nav.nav a') : null;
    if (!anchor) return;
    try { prefetch(pageKey(new URL(anchor.href, location.href))); } catch (err) {}
  });
  window.addEventListener('popstate', function () {
    if (!isPanelPath(location.pathname)) {
      location.reload();
      return;
    }
    var key = location.pathname + location.search;
    if (key === currentKey) {
      showSettings();
      return;
    }
    visit(new URL(location.href), 'pop');
  });
  window.addEventListener('pageshow', function (event) {
    if (!event.persisted) return;
    cache = Object.create(null);
    inflight = Object.create(null);
    cacheGen += 1;
    currentKey = '';
    visit(new URL(location.href), 'pop');
    prefetchMenu();
  });

  var startPrefetch = window.requestIdleCallback
    ? function (fn) { window.requestIdleCallback(fn, { timeout: 400 }); }
    : function (fn) { setTimeout(fn, 1); };
  startPrefetch(prefetchMenu);
})();
