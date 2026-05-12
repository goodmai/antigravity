# Daskibo Academy — Implementation Plan

## Overview

Daskibo Academy is a multi-course web platform hosted on GitHub Pages, built as a pure static site (HTML + CSS + vanilla JS). It wraps the existing Antigravity lesson content and adds three new course tracks, Web3 authentication via MetaMask, internationalisation, and a dark/light theme system.

---

## Goals

1. **Platform rebrand** — replace the single-course "Anti-Gravity Academy" with a multi-course "Daskibo Academy" hub.
2. **Four courses** — Antigravity (live), Claude Code (stub), Rust on Android (stub), Web3 Genesis (stub).
3. **Web3 auth** — signup/login via MetaMask; switch user to Unit Zero Mainnet; obtain ownership signature.
4. **i18n** — support English, Russian, Spanish, Chinese, Arabic, French via flag buttons in the header.
5. **Theme** — dark/light toggle persisted in `localStorage`.
6. **Documentation** — plan, implementation, internalization, web3-integration, test guides.

---

## Architecture Decision: Static-First

All pages are vanilla HTML/CSS/JS — no build step, no framework. This fits GitHub Pages zero-config hosting and keeps the existing lesson structure intact.

### File layout

```
academy/
├── index.html                  # Academy hub (TOC)
├── login.html                  # MetaMask login
├── signup.html                 # MetaMask signup
├── css/
│   └── academy.css             # Shared design system
├── js/
│   ├── header.js               # Inject nav + footer, theme toggle
│   ├── i18n.js                 # Translation engine
│   └── web3.js                 # MetaMask + Unit0 integration
└── courses/
    ├── antigravity/index.html  # Existing course (rewrapped)
    ├── claude-code/
    │   ├── index.html          # Stub
    │   └── README.md           # Full curriculum (21 lessons + 12 labs)
    ├── rust-android/index.html # Stub
    └── web3-genesis/index.html # Stub
```

The existing `lessons/` and `labs/` trees remain untouched.

---

## Milestones

| Phase | Scope | Status |
|-------|-------|--------|
| P0 | Shared CSS design system + tokens | ✅ Done |
| P1 | Academy index + 4 course pages | ✅ Done |
| P2 | i18n module (6 languages) | ✅ Done |
| P3 | Theme toggle (dark/light) | ✅ Done |
| P4 | Shared header (nav + flags + toggle) | ✅ Done |
| P5 | Web3 module (MetaMask + Unit0 + sign) | ✅ Done |
| P6 | Auth pages (login + signup) | ✅ Done |
| P7 | Claude Code README (21 lessons, 12 labs) | ✅ Done |
| P8 | Documentation files | ✅ Done |
| P9 | New index redirect to academy | Planned |
| P10 | Lesson pages i18n retrofit | Future |
| P11 | On-chain certificate smart contract | Future |

---

## Design System

- **Font**: Inter (Google Fonts), weights 300/400/600/700/800
- **Palette**: CSS custom properties — dark default with light override via `[data-theme="light"]`
- **Radius**: 20px cards, 10px inputs, 50px pill buttons
- **Motion**: `0.25s cubic-bezier(0.4, 0, 0.2, 1)` uniform transitions
- **Responsive**: single-column mobile via `@media (max-width: 640px)`
- **RTL**: Arabic activates `dir="rtl"` on `<html>` via i18n module

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| MetaMask not installed | Error message shown (i18n-aware), link to metamask.io |
| Unit0 chain add fails | `wallet_addEthereumChain` fallback with full params |
| User rejects signature | Non-blocking — graceful error state, retry button |
| GitHub Pages path depth | All asset paths are relative to avoid root issues |
| RTL layout breaks | `box-sizing: border-box` + flex layout handles most RTL cases |
