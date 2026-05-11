(function () {
  var CONSENT = 'ag_consent';
  var PROGRESS = 'ag_progress';

  function store(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }

  function load(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function getProgress() {
    try { return JSON.parse(load(PROGRESS) || '{}'); } catch (e) { return {}; }
  }

  function markCurrentLesson() {
    if (load(CONSENT) !== 'yes') return;
    var m = window.location.pathname.match(/\/lessons\/(\d+)\//);
    if (!m) return;
    var p = getProgress();
    p[m[1]] = Date.now();
    store(PROGRESS, JSON.stringify(p));
  }

  function setBadgeVisited(card) {
    var badge = card.querySelector('.badge');
    if (!badge) return;
    if (!badge.dataset.orig) badge.dataset.orig = badge.textContent;
    badge.textContent = 'Просмотрено';
    badge.classList.add('ag-badge-done');
  }

  function restoreBadge(card) {
    var badge = card.querySelector('.badge');
    if (!badge) return;
    if (badge.dataset.orig) badge.textContent = badge.dataset.orig;
    badge.classList.remove('ag-badge-done');
  }

  function applyVisitedBadges() {
    if (load(CONSENT) !== 'yes') return;
    var p = getProgress();
    var cards = document.querySelectorAll('[data-lesson-id]');
    var total = cards.length;
    var count = 0;

    cards.forEach(function (el) {
      if (p[el.getAttribute('data-lesson-id')]) {
        el.classList.add('ag-visited');
        setBadgeVisited(el);
        count++;
      } else {
        el.classList.remove('ag-visited');
        restoreBadge(el);
      }
    });

    var counter = document.getElementById('ag-counter');
    if (counter) {
      if (count > 0) {
        counter.textContent = 'Просмотрено: ' + count + ' / ' + total;
        counter.style.display = 'inline-block';
      } else {
        counter.style.display = 'none';
      }
    }

    var resetBtn = document.getElementById('ag-reset-btn');
    if (resetBtn) {
      resetBtn.style.display = count > 0 ? 'inline-flex' : 'none';
    }
  }

  function resetProgress() {
    store(PROGRESS, '{}');
    document.querySelectorAll('[data-lesson-id]').forEach(function (el) {
      el.classList.remove('ag-visited');
      restoreBadge(el);
    });
    var counter = document.getElementById('ag-counter');
    if (counter) counter.style.display = 'none';
    var resetBtn = document.getElementById('ag-reset-btn');
    if (resetBtn) resetBtn.style.display = 'none';
  }

  function showBanner() {
    if (load(CONSENT) !== null) return;

    var s = document.createElement('style');
    s.textContent =
      '#ag-banner{position:fixed;bottom:0;left:0;right:0;z-index:9999;' +
      'padding:16px 20px;background:rgba(2,6,23,0.96);' +
      'backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);' +
      'border-top:1px solid rgba(255,255,255,0.08);}' +
      '#ag-inner{max-width:900px;margin:0 auto;display:flex;' +
      'align-items:center;gap:20px;flex-wrap:wrap;}' +
      '#ag-inner p{margin:0;color:#94a3b8;font-size:.875rem;flex:1 1 260px;}' +
      '#ag-inner strong{color:#f8fafc;}' +
      '#ag-inner code{background:rgba(30,41,59,.6);padding:2px 6px;' +
      'border-radius:4px;font-size:.8em;border:1px solid rgba(255,255,255,.1);}' +
      '#ag-btns{display:flex;gap:8px;flex-shrink:0;}' +
      '#ag-accept,#ag-decline{padding:8px 20px;border-radius:20px;border:1px solid;' +
      'cursor:pointer;font-size:.875rem;font-family:inherit;transition:opacity .2s;}' +
      '#ag-accept{background:#38bdf8;border-color:#38bdf8;color:#020617;font-weight:600;}' +
      '#ag-decline{background:transparent;border-color:rgba(255,255,255,.2);color:#94a3b8;}' +
      '#ag-accept:hover,#ag-decline:hover{opacity:.75;}';
    document.head.appendChild(s);

    var banner = document.createElement('div');
    banner.id = 'ag-banner';
    banner.innerHTML =
      '<div id="ag-inner">' +
      '<p><strong>Отслеживание прогресса.</strong> ' +
      'Сохраняем в <code>localStorage</code> список просмотренных уроков. ' +
      'Данные остаются только на вашем устройстве и не передаются третьим лицам.</p>' +
      '<div id="ag-btns">' +
      '<button id="ag-accept">Принять</button>' +
      '<button id="ag-decline">Отклонить</button>' +
      '</div></div>';
    document.body.appendChild(banner);

    document.getElementById('ag-accept').addEventListener('click', function () {
      store(CONSENT, 'yes');
      banner.remove();
      s.remove();
      markCurrentLesson();
      applyVisitedBadges();
    });

    document.getElementById('ag-decline').addEventListener('click', function () {
      store(CONSENT, 'no');
      banner.remove();
      s.remove();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    showBanner();
    markCurrentLesson();
    applyVisitedBadges();
  });

  window.AgProgress = { reset: resetProgress };
}());
