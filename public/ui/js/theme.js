(function () {
  var key = 'gdl-theme';
  var mq = window.matchMedia('(prefers-color-scheme: dark)');

  function stored() {
    try {
      var s = localStorage.getItem(key);
      return s === 'light' || s === 'dark' ? s : '';
    } catch (e) {
      return '';
    }
  }

  function effective() {
    var s = stored();
    if (s) return s;
    return mq.matches ? 'dark' : 'light';
  }

  function paint(theme) {
    var root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.style.backgroundColor = '';
    root.style.colorScheme = '';
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    }
    var choices = document.querySelectorAll('.themes button.theme');
    for (var j = 0; j < choices.length; j++) {
      choices[j].classList.toggle('on', choices[j].value === theme);
    }
  }

  function save(theme) {
    try { localStorage.setItem(key, theme); } catch (e) {}
    paint(theme);
  }

  function csrfValue() {
    var input = document.querySelector('input[name="_csrf"]');
    return input ? input.value : '';
  }

  function syncServer(theme) {
    var token = csrfValue();
    if (!token) return;
    fetch('/panel/settings/appearance', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' },
      body: '_csrf=' + encodeURIComponent(token) + '&theme=' + encodeURIComponent(theme)
    }).catch(function () {});
  }

  function onScheme() {
    if (!stored()) paint(mq.matches ? 'dark' : 'light');
  }

  if (mq.addEventListener) mq.addEventListener('change', onScheme);
  else if (mq.addListener) mq.addListener(onScheme);

  document.addEventListener('click', function (event) {
    var node = event.target;
    if (!node || !node.closest) return;
    var choice = node.closest('.themes button.theme');
    if (choice && (choice.value === 'light' || choice.value === 'dark')) {
      save(choice.value);
      return;
    }
    var toggle = node.closest('[data-theme-toggle]');
    if (!toggle) return;
    event.preventDefault();
    var next = effective() === 'dark' ? 'light' : 'dark';
    save(next);
    syncServer(next);
  });

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || !form.getAttribute) return;
    if (form.getAttribute('action') === '/panel/theme') {
      event.preventDefault();
      return;
    }
    if (form.getAttribute('action') === '/panel/settings/appearance') {
      var btn = event.submitter;
      if (btn && (btn.value === 'light' || btn.value === 'dark')) save(btn.value);
    }
  });

  paint(effective());
  window.gdlSyncTheme = function () { paint(effective()); };
})();
