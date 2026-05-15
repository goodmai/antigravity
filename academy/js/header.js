/**
 * Daskibo Academy — Injects shared header + footer; wires theme toggle.
 * Include AFTER academy.css but BEFORE i18n.js and web3.js.
 */
(function () {
  'use strict';

  var THEME_KEY = 'daskibo_theme';

  function getSavedTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) { return 'dark'; }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    var icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  /* ── Injected HTML ─────────────────────────────────────────────────── */
  var headerHTML = `
<header class="site-header">
  <nav class="nav">

    <!-- Left: nav links -->
    <div class="nav-left">
      <ul class="nav-links">
        <li><a href="/antigravity/academy/index.html" data-i18n="nav_home">Home</a></li>
        <li><a href="/antigravity/academy/index.html#courses" data-i18n="nav_courses">Courses</a></li>
      </ul>
    </div>

    <!-- Centre: logo -->
    <a href="/antigravity/academy/index.html" class="nav-logo">Daskibo Academy</a>

    <!-- Right: theme + wallet / auth -->
    <div class="nav-right">
      <!-- Theme toggle: icon only, no text label -->
      <button class="theme-toggle" id="theme-toggle" aria-label="Toggle theme">
        <span id="theme-icon">☀️</span>
      </button>

      <!-- Wallet pill — shown when connected, hidden otherwise -->
      <div class="wallet-pill" id="nav-wallet-pill" style="display:none" aria-label="Connected wallet">
        <span class="wallet-dot" aria-hidden="true"></span>
        <span id="nav-wallet-addr" class="wallet-pill-addr"></span>
        <button class="wallet-disconnect-btn" id="nav-wallet-disconnect"
                title="Disconnect wallet" aria-label="Disconnect wallet">✕</button>
      </div>

      <!-- Auth links — hidden when wallet is connected -->
      <a id="nav-btn-login"  href="/antigravity/academy/login.html"
         class="btn btn-outline nav-auth-btn" data-i18n="nav_login">Login</a>
    </div>

  </nav>

  <!-- Second row: Flags -->
  <div class="nav-bottom-bar" dir="ltr">
    <div class="lang-switcher" aria-label="Language">
      <button class="lang-btn" data-lang="en" title="English">🇬🇧</button>
      <button class="lang-btn" data-lang="ru" title="Русский">🇷🇺</button>
      <button class="lang-btn" data-lang="es" title="Español">🇪🇸</button>
      <button class="lang-btn" data-lang="zh" title="中文">🇨🇳</button>
      <button class="lang-btn" data-lang="ar" title="العربية">🇸🇦</button>
      <button class="lang-btn" data-lang="fr" title="Français">🇫🇷</button>
      <button class="lang-btn" data-lang="it" title="Italiano">🇮🇹</button>
      <button class="lang-btn" data-lang="id" title="Bahasa Indonesia">🇮🇩</button>
    </div>
  </div>
</header>`;

  var footerHTML = `
<footer class="site-footer">
  <span data-i18n="footer_copy">Daskibo Academy © 2026</span>
</footer>`;

  /* ── Bootstrap ─────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {

    /* Inject header */
    var headerSlot = document.getElementById('site-header');
    if (headerSlot) headerSlot.outerHTML = headerHTML;
    else document.body.insertAdjacentHTML('afterbegin', headerHTML);

    /* Inject footer */
    var footerSlot = document.getElementById('site-footer');
    if (footerSlot) footerSlot.outerHTML = footerHTML;
    else document.body.insertAdjacentHTML('beforeend', footerHTML);

    /* Apply saved theme */
    applyTheme(getSavedTheme());

    /* Wire theme toggle (icon only) */
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#theme-toggle')) return;
      var current = document.documentElement.getAttribute('data-theme') || 'dark';
      applyTheme(current === 'dark' ? 'light' : 'dark');
      if (window.I18n) window.I18n.apply(window.I18n.current());
    });

    /* Wire lang buttons */
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.lang-btn[data-lang]');
      if (btn && window.I18n) window.I18n.apply(btn.dataset.lang);
    });
  });
}());
