# Daskibo Academy — Testing Guide

## Overview

The platform is a static site with no build step. Testing covers:
1. **Manual smoke tests** — visual checks in browser
2. **i18n correctness** — all keys translated, RTL layout
3. **Web3 flows** — MetaMask connection, network switch, signing
4. **Theme** — dark/light toggle persists across pages
5. **Responsiveness** — mobile breakpoints

---

## Environment Setup

```bash
# Serve locally (no backend needed)
npx serve /path/to/antigravity -l 3000
# or
python3 -m http.server 3000 --directory /path/to/antigravity

# Open in browser
open http://localhost:3000/academy/index.html
```

For MetaMask testing, use a **real browser** (Chrome/Firefox with MetaMask extension). MetaMask does not work in headless mode.

---

## Smoke Test Checklist

### Academy Index (`/academy/index.html`)

- [ ] Page loads without console errors
- [ ] Header displays: logo, nav links, 6 flag buttons, theme toggle, Login/Sign Up buttons
- [ ] Hero section renders title + subtitle + CTA buttons
- [ ] 4 course cards visible: Antigravity (Available badge), Claude Code / Rust / Web3 (Coming Soon badge)
- [ ] Antigravity card links to `/academy/courses/antigravity/index.html`
- [ ] Placeholder cards link to their respective course stubs
- [ ] Footer renders copyright text

### Antigravity Course (`/academy/courses/antigravity/index.html`)

- [ ] 24 lesson cards rendered
- [ ] 3 lab cards rendered
- [ ] "View Course" button links to `/lessons/index.html`
- [ ] All lesson links are correct (../../lessons/N/index.html)
- [ ] Header and footer present

### Stub Course Pages (Claude Code, Rust, Web3)

- [ ] Placeholder icon, title, description, stats visible
- [ ] "Coming Soon" badge displayed
- [ ] "Back to Academy" button works

---

## i18n Test Matrix

For each language, verify on `academy/index.html`:

| Check | EN | RU | ES | ZH | AR | FR |
|-------|----|----|----|----|----|-----|
| `<html lang>` attribute set | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Hero title translated | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Hero subtitle translated | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Course titles translated | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Badge labels translated | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Footer text translated | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Active flag highlighted | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Direction RTL (Arabic only) | — | — | — | — | ✓ | — |
| Language persists on reload | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Test procedure:**
1. Click each flag button in the header
2. Verify all `[data-i18n]` elements update
3. Reload the page — language should be remembered
4. For Arabic: verify layout mirrors (nav logo goes right, text flows right)

---

## Theme Test Matrix

| Step | Expected |
|------|----------|
| Default load (no saved pref) | Dark theme |
| Click theme toggle | Switches to light theme |
| Reload | Light theme persists |
| Click theme toggle again | Switches back to dark |
| Navigate to another page | Theme persists |
| Toggle label text updates | "Light" in dark mode, "Dark" in light mode |
| Icon updates | ☀️ in dark mode, 🌙 in light mode |

---

## Web3 / MetaMask Tests

**Requires:** MetaMask extension installed, test account with any ETH/UNIT0.

### Test 1: Happy path (first-time Unit0 user)

1. Open `/academy/signup.html`
2. Click "Connect MetaMask"
3. MetaMask opens → approve account access
4. MetaMask opens → "Add Unit Zero Mainnet" network prompt → approve
5. MetaMask opens → sign message prompt → sign
6. ✅ Wallet address shown in success box
7. ✅ Redirect to `index.html` after ~1.8s
8. ✅ Cookies `daskibo_wallet` and `daskibo_sig` set (DevTools → Application → Cookies)
9. ✅ `localStorage` keys set

### Test 2: Happy path (Unit0 already added)

1. Repeat Test 1 — skip step 4 (no add-network prompt)
2. ✅ Same success result

### Test 3: MetaMask not installed

1. Open in a browser without MetaMask
2. Click "Connect MetaMask"
3. ✅ Error message appears: "MetaMask not detected. Please install it first."
4. ✅ Button re-enabled

### Test 4: User rejects account access

1. Click "Connect MetaMask"
2. In MetaMask popup → click "Reject"
3. ✅ Error message appears
4. ✅ Button re-enabled

### Test 5: User rejects network switch

1. Click "Connect MetaMask", approve account
2. In network switch prompt → click "Reject"
3. ✅ Error message appears
4. ✅ Button re-enabled

### Test 6: User rejects signature

1. Complete steps 1-4, approve network
2. In sign prompt → click "Reject"
3. ✅ Error message appears
4. ✅ Button re-enabled

### Test 7: Logout (future)

```js
// In DevTools console
Web3Auth.clearSession();
// Verify cookies and localStorage cleared
```

---

## Responsive Tests

Test at these viewport widths (Chrome DevTools Device Toolbar):

| Width | Expected |
|-------|----------|
| 375px (iPhone SE) | Single column cards, stacked nav |
| 390px (iPhone 14) | Same |
| 768px (iPad) | 2-column card grid |
| 1024px (iPad Pro) | 3-column card grid |
| 1440px (Desktop) | 4-column card grid, full nav |

---

## Accessibility Checklist

- [ ] All images have `alt` text (none currently, decorative emoji used)
- [ ] `lang` attribute set on `<html>`
- [ ] `dir` attribute set for RTL languages
- [ ] Buttons have accessible labels (`aria-label` on theme toggle)
- [ ] Color contrast ratio ≥ 4.5:1 for normal text (verify with browser DevTools)
- [ ] Keyboard navigation works: Tab through nav, Enter on buttons
- [ ] Error messages have appropriate role (add `role="alert"` to `.web3-error`)

---

## Known Limitations

1. **MetaMask mobile** — `window.ethereum` may be injected differently in MetaMask's in-app browser. Test separately.
2. **WalletConnect** — not supported in v1. Planned for a future release.
3. **Arabic font** — Inter has limited Arabic support. Glyphs may fall back to system font.
4. **No automated E2E tests** — Playwright cannot automate MetaMask popups without the `@playwright/test` MetaMask fixture. Manual testing is required for all Web3 flows.
