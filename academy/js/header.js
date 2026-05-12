/**
 * Daskibo Academy — Injects shared header + footer and wires theme toggle.
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
    var icon  = document.getElementById('theme-icon');
    var label = document.getElementById('theme-label');
    if (icon)  icon.textContent  = theme === 'dark' ? '☀️' : '🌙';
    if (label) label.setAttribute('data-i18n', theme === 'dark' ? 'theme_light' : 'theme_dark');
    if (label && window.I18n) label.textContent = window.I18n.t(label.getAttribute('data-i18n'));
  }

  var headerHTML = `
<header class="site-header">
  <nav class="nav">
    <a href="/antigravity/academy/index.html" class="nav-logo">Daskibo Academy</a>

    <ul class="nav-links">
      <li><a href="/antigravity/academy/index.html"    data-i18n="nav_home">Home</a></li>
      <li><a href="/antigravity/academy/index.html#courses" data-i18n="nav_courses">Courses</a></li>
    </ul>

    <!-- Language switcher -->
    <div class="lang-switcher" aria-label="Language">
      <button class="lang-btn" data-lang="en" title="English">🇬🇧</button>
      <button class="lang-btn" data-lang="ru" title="Русский">🇷🇺</button>
      <button class="lang-btn" data-lang="es" title="Español">🇪🇸</button>
      <button class="lang-btn" data-lang="zh" title="中文">🇨🇳</button>
      <button class="lang-btn" data-lang="ar" title="العربية">🇸🇦</button>
      <button class="lang-btn" data-lang="fr" title="Français">🇫🇷</button>
    </div>

    <!-- Theme toggle -->
    <button class="theme-toggle" id="theme-toggle" aria-label="Toggle theme">
      <span class="icon" id="theme-icon">☀️</span>
      <span id="theme-label" data-i18n="theme_light">Light</span>
    </button>

    <!-- Auth buttons -->
    <a href="/antigravity/academy/login.html"  class="btn btn-outline"  style="padding:8px 18px;font-size:.875rem" data-i18n="nav_login">Login</a>
    <a href="/antigravity/academy/signup.html" class="btn btn-primary" style="padding:8px 18px;font-size:.875rem" data-i18n="nav_signup">Sign Up</a>
  </nav>
</header>`;

  var footerHTML = `
<footer class="site-footer">
  <span data-i18n="footer_copy">Daskibo Academy © 2026</span>
</footer>`;

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

    /* Wire theme toggle */
    document.addEventListener('click', function (e) {
      if (e.target.closest('#theme-toggle')) {
        var current = document.documentElement.getAttribute('data-theme') || 'dark';
        applyTheme(current === 'dark' ? 'light' : 'dark');
        /* re-apply i18n for updated label */
        if (window.I18n) window.I18n.apply(window.I18n.current());
      }
    });
  });
}());
