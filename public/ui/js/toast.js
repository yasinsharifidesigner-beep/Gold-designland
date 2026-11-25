(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ICONS = {
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v6"/><path d="M12 16.6h.01"/></svg>',
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.2 10.6 14.8 16.2 9.2"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>'
  };

  function host() {
    var node = document.getElementById('toasts');
    if (node) return node;
    node = document.createElement('div');
    node.id = 'toasts';
    node.className = 'toasts';
    node.setAttribute('data-close', 'بستن');
    document.body.appendChild(node);
    return node;
  }

  function dismiss(toast) {
    if (!toast || toast.getAttribute('data-gone') === '1') return;
    toast.setAttribute('data-gone', '1');
    if (toast._timer) clearTimeout(toast._timer);
    if (reduce) {
      toast.remove();
      return;
    }
    toast.classList.add('is-out');
    var done = false;
    function remove() {
      if (done) return;
      done = true;
      toast.remove();
    }
    toast.addEventListener('animationend', remove, { once: true });
    setTimeout(remove, 280);
  }

  function show(text, kind) {
    var message = String(text || '').replace(/\s+/g, ' ').trim();
    if (!message) return null;
    var tone = kind === 'error' || kind === 'success' ? kind : 'info';
    var toast = document.createElement('div');
    toast.className = 'toast is-' + tone;
    toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');
    var icon = document.createElement('span');
    icon.className = 'toast-ico';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = ICONS[tone];
    var body = document.createElement('p');
    body.className = 'toast-text';
    body.textContent = message;
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-x';
    close.setAttribute('aria-label', host().getAttribute('data-close') || 'بستن');
    close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';
    toast.appendChild(icon);
    toast.appendChild(body);
    toast.appendChild(close);
    toast.addEventListener('click', function () { dismiss(toast); });
    var remain = 4000;
    var stamp = 0;
    function arm() {
      stamp = Date.now();
      toast._timer = setTimeout(function () { dismiss(toast); }, remain);
    }
    toast.addEventListener('pointerenter', function (event) {
      if (event.pointerType !== 'mouse' || !toast._timer) return;
      clearTimeout(toast._timer);
      toast._timer = null;
      remain -= Date.now() - stamp;
      if (remain < 700) remain = 700;
    });
    toast.addEventListener('pointerleave', function (event) {
      if (event.pointerType !== 'mouse' || toast.getAttribute('data-gone') === '1' || toast._timer) return;
      arm();
    });
    host().prepend(toast);
    arm();
    return toast;
  }

  function collect() {
    document.querySelectorAll('template.toast-seed').forEach(function (node) {
      var text = node.content ? node.content.textContent : node.textContent;
      show(text, node.getAttribute('data-kind'));
      node.remove();
    });
    syncHints();
  }

  function latinPassword(value) {
    return String(value || '')
      .replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); })
      .replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); });
  }

  function ruleMet(value) {
    var text = latinPassword(value);
    return text.length >= 6 && /\p{L}/u.test(text) && /\d/.test(text);
  }

  function paintHint(input) {
    if (!input || !input.form || !input.name) return;
    var hint = input.form.querySelector('[data-pass-hint][data-pass-input="' + input.name + '"]');
    if (!hint) return;
    hint.classList.toggle('is-met', ruleMet(input.value));
  }

  function syncHints() {
    document.querySelectorAll('[data-pass-hint]').forEach(function (hint) {
      var form = hint.closest('form');
      var name = hint.getAttribute('data-pass-input') || '';
      var input = form && form.querySelector('input[name="' + name.replace(/"/g, '') + '"]');
      if (input) paintHint(input);
    });
  }

  function wantsEnterNext(form) {
    if (!form) return false;
    if (form.closest('.auth')) return true;
    return form.querySelectorAll('input[type="password"]').length >= 2;
  }

  function focusables(form) {
    var list = [];
    Array.prototype.forEach.call(form.querySelectorAll('input, select, textarea, .selbox'), function (el) {
      if (el.disabled || (el.closest && el.closest('[hidden]'))) return;
      if (el.classList && el.classList.contains('selbox')) {
        list.push(el);
        return;
      }
      if (el.closest && el.closest('.selbox')) return;
      if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'file') return;
      if (el.tabIndex < 0) return;
      list.push(el);
    });
    return list;
  }

  document.addEventListener('input', function (event) {
    paintHint(event.target);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return;
    var el = event.target;
    if (!el || el.tagName === 'TEXTAREA' || el.isContentEditable) return;
    var box = el.closest && el.closest('.selbox');
    if (box && box.classList.contains('open')) return;
    var field = box || ((el.matches && el.matches('input, select, textarea')) ? el : null);
    if (!field || field.type === 'hidden' || field.type === 'submit' || field.type === 'button') return;
    var form = field.form || (field.closest && field.closest('form'));
    if (!wantsEnterNext(form)) return;
    var fields = focusables(form);
    var index = fields.indexOf(field);
    if (index < 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (index < fields.length - 1) {
      fields[index + 1].focus();
      return;
    }
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.submit();
  }, true);

  window.gdlToast = show;
  window.gdlToast.collect = collect;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', collect);
  else collect();
})();
