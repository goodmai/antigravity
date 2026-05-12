# Daskibo Academy — Internationalisation (i18n) Guide

## Supported Languages

| Code | Language | Flag | Direction |
|------|----------|------|-----------|
| `en` | English  | 🇬🇧  | LTR |
| `ru` | Russian (Русский) | 🇷🇺 | LTR |
| `es` | Spanish (Español) | 🇪🇸 | LTR |
| `zh` | Chinese (中文) | 🇨🇳 | LTR |
| `ar` | Arabic (العربية) | 🇸🇦 | RTL |
| `fr` | French (Français) | 🇫🇷 | LTR |

---

## Architecture

The i18n system is a self-contained IIFE in `academy/js/i18n.js`. It requires no build step and no external libraries.

### How it works

1. On `DOMContentLoaded`, reads the saved language from `localStorage` key `daskibo_lang` (default: `'en'`).
2. Applies translations by querying all `[data-i18n]` elements and setting `textContent`.
3. Sets `<html lang="...">` and `<html dir="...">` for accessibility and RTL support.
4. Highlights the active language button with class `.active`.

### HTML annotation

```html
<!-- Static text -->
<h1 data-i18n="hero_title">Daskibo Academy</h1>

<!-- Input placeholder -->
<input data-i18n="search_placeholder" placeholder="Search..." />

<!-- Tooltip -->
<button data-i18n-title="btn_tooltip_key" title="...">...</button>
```

The content inside the element serves as the English fallback and is visible before JS loads.

### Switching language

```js
// Via UI (handled automatically by i18n.js)
// — user clicks a .lang-btn[data-lang="ru"]

// Via JS API
I18n.apply('ru');

// Get current language
var lang = I18n.current(); // 'ru'

// Translate a key manually
var text = I18n.t('hero_subtitle', 'fr');
```

---

## Translation Keys Reference

### Navigation
| Key | EN | RU |
|-----|----|----|
| `nav_home` | Home | Главная |
| `nav_courses` | Courses | Курсы |
| `nav_login` | Login | Войти |
| `nav_signup` | Sign Up | Регистрация |

### Hero
| Key | EN | RU |
|-----|----|----|
| `hero_title` | Daskibo Academy | Daskibo Academy |
| `hero_subtitle` | Mastery in AI, Blockchain... | Мастерство в AI, блокчейне... |

### Course Cards
| Key | EN |
|-----|-----|
| `course_antigravity_title` | Antigravity |
| `course_antigravity_desc` | Autonomous AI agents... |
| `course_claude_title` | Claude Code |
| `course_claude_desc` | The definitive course... |
| `course_rust_title` | Rust on Android |
| `course_rust_desc` | Build high-performance... |
| `course_web3_title` | Web3 Genesis |
| `course_web3_desc` | Solidity, smart contracts... |

### Auth
| Key | EN |
|-----|-----|
| `auth_connect_metamask` | Connect MetaMask |
| `auth_login_title` | Log In with MetaMask |
| `auth_signup_title` | Create Account |
| `auth_no_metamask` | MetaMask not detected... |

### Badges & Misc
| Key | EN |
|-----|-----|
| `badge_available` | Available |
| `badge_coming_soon` | Coming Soon |
| `theme_dark` | Dark |
| `theme_light` | Light |
| `footer_copy` | Daskibo Academy © 2026 |

---

## RTL Support

When `ar` is selected, the module sets `dir="rtl"` on `<html>`. The CSS uses CSS logical properties throughout:

```css
/* Instead of margin-right */
margin-inline-end: auto;

/* Instead of padding-left */
padding-inline-start: 8px;

/* Instead of border-left */
border-inline-start: 2px solid var(--primary);
```

This ensures that in RTL mode, the layout mirrors correctly without explicit RTL overrides.

**Known limitation:** Google Fonts' Inter does not include Arabic glyphs. For production, add a suitable Arabic font (e.g. Cairo, Noto Sans Arabic) via a secondary `@font-face` or Google Fonts import scoped to `[lang="ar"]`.

---

## Adding a New Language

### Step 1 — Register the language

In `i18n.js`, add to the `LANGS` object:
```js
var LANGS = {
  // ...existing...
  pt: { flag: '🇧🇷', label: 'Português', dir: 'ltr' },
};
```

### Step 2 — Add all translations

In `TRANSLATIONS`, add `pt: '...'` to every key:
```js
hero_title: {
  en: 'Daskibo Academy',
  ru: 'Daskibo Academy',
  // ...
  pt: 'Daskibo Academy',
},
```

### Step 3 — Add the flag button

In every page's lang-switcher HTML:
```html
<button class="lang-btn" data-lang="pt" title="Português">🇧🇷</button>
```

---

## Quality Checklist

- [ ] All 6 languages have translations for every key (no `undefined` fallbacks)
- [ ] RTL layout tested with `dir="rtl"` in Arabic
- [ ] `lang` attribute on `<html>` is correct (screen reader compatibility)
- [ ] Language preference persists across page navigations
- [ ] Theme toggle label re-translates after language switch
- [ ] No hardcoded English text remains outside of `data-i18n` attributes (auth pages: review `auth-steps` inline text)
