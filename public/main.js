document.documentElement.classList.add('js');

var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

var io = new IntersectionObserver(function (entries) {
  entries.forEach(function (entry) {
    if (entry.isIntersecting) {
      entry.target.classList.add('in');
      io.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.rv').forEach(function (el) {
  io.observe(el);
});

var menu = document.getElementById('menu');
document.getElementById('menu-btn').addEventListener('click', function () {
  menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
});
menu.addEventListener('click', function () {
  menu.style.display = 'none';
});

document.querySelectorAll('.fq').forEach(function (item) {
  var btn = item.querySelector('.fqh');
  var body = item.querySelector('.fqb');
  var plus = item.querySelector('.pl');
  btn.addEventListener('click', function () {
    var open = btn.getAttribute('aria-expanded') === 'true';
    document.querySelectorAll('.fq').forEach(function (other) {
      other.querySelector('.fqh').setAttribute('aria-expanded', 'false');
      other.querySelector('.fqb').style.gridTemplateRows = '0fr';
      other.querySelector('.pl').style.transform = '';
    });
    if (!open) {
      btn.setAttribute('aria-expanded', 'true');
      body.style.gridTemplateRows = '1fr';
      plus.style.transform = 'rotate(45deg)';
    }
  });
});

function clamp(v) {
  return Math.max(0, Math.min(1, v));
}

function prep(rm) {
  var path = rm.querySelector('[data-path]');
  var total = path.getTotalLength();
  if (!total) return false;
  var pts = [];
  for (var i = 0; i <= 300; i++) {
    var point = path.getPointAtLength(total * i / 300);
    pts.push([point.x, point.y]);
  }
  rm._th = Array.prototype.map.call(rm.querySelectorAll('.st'), function (st) {
    var x = +st.dataset.x;
    var y = +st.dataset.y;
    var best = 0;
    var bestDist = 1e12;
    pts.forEach(function (pt, index) {
      var dist = (pt[0] - x) * (pt[0] - x) + (pt[1] - y) * (pt[1] - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = index;
      }
    });
    return best / 300;
  });
  return true;
}

function updateRoadmap() {
  document.querySelectorAll('[data-rm]').forEach(function (rm) {
    if (!rm.offsetParent) return;
    if (!rm._th && !prep(rm)) return;
    var rect = rm.getBoundingClientRect();
    var vh = innerHeight;
    var p = reduce ? 1 : clamp((vh * 0.8 - rect.top) / (rect.height + vh * 0.3));
    rm.querySelector('[data-path]').style.strokeDashoffset = String(1 - p);
    rm.querySelectorAll('.st').forEach(function (st, index) {
      st.classList.toggle('lit', p >= rm._th[index] - 0.005);
    });
  });
}

addEventListener('scroll', updateRoadmap, { passive: true });
addEventListener('resize', updateRoadmap);
setTimeout(updateRoadmap, 300);
setTimeout(updateRoadmap, 1200);
