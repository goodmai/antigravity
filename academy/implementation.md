# Daskibo Academy — Implementation Notes

## Module Map

### `academy/css/academy.css`

Single shared stylesheet using CSS custom properties for theming.

**Key patterns:**

```css
/* Dark default */
:root { --bg: #020617; --text: #f8fafc; ... }

/* Light override — applied via JS */
[data-theme="light"] { --bg: #f1f5f9; --text: #0f172a; ... }

/* RTL-safe spacing — use logical properties */
margin-inline-end: auto;   /* instead of margin-right */
padding-inline-start: 8px; /* instead of padding-left */
```

**Theme toggle logic** lives in `header.js`, not CSS. CSS only provides the variable set.

---

### `academy/js/header.js`

Injects the shared `<header>` and `<footer>` into every page that includes it.

- Reads saved theme from `localStorage` key `daskibo_theme`
- Wires `#theme-toggle` click handler
- Pages that use the full injector include `id="site-header"` / `id="site-footer"` placeholders
- Auth pages (`login.html`, `signup.html`) inline the header manually to avoid circular dependency on the injector's redirect links

---

### `academy/js/i18n.js`

Translation engine — IIFE, no dependencies.

**Usage:**
```html
<span data-i18n="hero_title">Daskibo Academy</span>
```

**API:**
```js
I18n.t('key')           // translate key in current language
I18n.apply('ru')        // switch language & re-render all data-i18n elements
I18n.current()          // returns saved language code ('en', 'ru', ...)
```

**Adding a new language:**
1. Add entry to `LANGS` object
2. Add translations for every key in `TRANSLATIONS`
3. Add a flag button in each page's lang-switcher HTML

**RTL support:**
When `lang === 'ar'`, the module sets `<html dir="rtl">`. CSS uses logical properties throughout so layout flips automatically.

---

### `academy/js/web3.js`

MetaMask integration — IIFE, no dependencies.

**Unit Zero Mainnet config (embedded):**
```js
var UNIT0_CHAIN = {
  chainId: '0x15AEB',   // 88811 decimal
  chainName: 'Unit Zero Mainnet',
  nativeCurrency: { name: 'UNIT0', symbol: 'UNIT0', decimals: 18 },
  rpcUrls: ['https://rpc.unit0.dev'],
  blockExplorerUrls: ['https://explorer.unit0.dev'],
};
```

**Auth flow:**
1. `eth_requestAccounts` — request wallet access
2. `wallet_switchEthereumChain` — switch to Unit0; if 4902 error, `wallet_addEthereumChain`
3. `personal_sign` — sign ownership message
4. `setSession()` — writes wallet address + sig to **both** cookie (7-day) and `localStorage`

**Session storage strategy:**
Cookies are used for server-side session verification (when a backend is added). `localStorage` is used for immediate client-side checks. Both are written and cleared together.

**Signature message (English, immutable):**
```
I am the owner of this wallet. I agree to save my progress via cookies
and to receive a certificate upon completion of practical tasks on Daskibo Academy.
```

**Public API:**
```js
Web3Auth.hasMetaMask()        // bool
Web3Auth.connectAndSign()     // async → { address, sig }
Web3Auth.getSession()         // { address, sig } | null
Web3Auth.clearSession()       // logout
Web3Auth.UNIT0_CHAIN          // chain config object
Web3Auth.SIGN_MESSAGE         // the canonical message string
```

---

## Page Architecture

| Page | Header source | Script deps |
|------|--------------|-------------|
| `academy/index.html` | `header.js` inject | `header.js`, `i18n.js`, `web3.js` |
| `academy/login.html` | Inline HTML | `i18n.js`, `web3.js` |
| `academy/signup.html` | Inline HTML | `i18n.js`, `web3.js` |
| `courses/*/index.html` | `header.js` inject | `header.js`, `i18n.js` |

Auth pages inline the header because they are the auth destination — injecting from `header.js` which links back to auth would create a confusing loop.

---

## Extending the Platform

### Add a new course

1. Create `academy/courses/<slug>/index.html` using the placeholder template
2. Add a card to `academy/index.html` courses grid
3. Add i18n keys `course_<slug>_title` and `course_<slug>_desc` in `i18n.js`
4. Add a CSS accent class `.course-card.<slug>::before` in `academy.css`

### Add a new language

1. Add to `LANGS` and all `TRANSLATIONS` keys in `i18n.js`
2. Add `<button class="lang-btn" data-lang="<code>">🏳️</button>` in every page's lang-switcher

### Add a backend

The cookie session (`daskibo_wallet`, `daskibo_sig`) is ready for server-side verification. Verify:
- Recover the signer address from the signature using `eth_accounts` + `personal_ecRecover`
- Match against the stored wallet address in the cookie
