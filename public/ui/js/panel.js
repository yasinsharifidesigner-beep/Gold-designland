(function () {
  var menu = document.getElementById('menu-btn');
  var side = document.getElementById('side');
  if (menu && side) {
    menu.addEventListener('click', function () { side.classList.toggle('open'); });
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
    var tick = setInterval(function () {
      left -= 1;
      if (left <= 0) {
        clearInterval(tick);
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
      if (navigator.clipboard) navigator.clipboard.writeText(link);
      var toast = document.getElementById('copied');
      if (toast) { toast.hidden = false; setTimeout(function () { toast.hidden = true; }, 1800); }
    });
  }
  var cancel = document.getElementById('logout-cancel');
  var modal = document.getElementById('logout');
  if (cancel && modal) cancel.addEventListener('click', function () { modal.hidden = true; location.hash = 'account'; });
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
  showSettings();
  window.addEventListener('hashchange', showSettings);
  var play = document.getElementById('play');
  var vid = document.getElementById('vid');
  if (play && vid) {
    play.addEventListener('click', function () {
      play.hidden = true;
      fetch(vid.getAttribute('data-end'), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: '_csrf=' + encodeURIComponent((document.querySelector('[name=_csrf]') || {}).value || '') });
    });
  }
  var full = document.getElementById('full');
  if (full) full.addEventListener('click', function () {
    var p = document.querySelector('.player');
    if (p.requestFullscreen) p.requestFullscreen();
  });
})();
