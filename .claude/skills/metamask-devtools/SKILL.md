---
name: metamask-devtools
description: Automate MetaMask interactions for Daskibo local UI testing — unlock, import private keys from .env by role, rename accounts, add/switch networks. PRIMARY tool: Synpress (@synthetixio/synpress v4) with Playwright — see e2e-synpress/. FALLBACK for one-off ops: raw CDP WebSocket scripts in scratch/. Trigger when: testing course-demo.html flows, setting up roles (Author/Client/Eve), switching MetaMask accounts during UI automation, verifying wallet_addEthereumChain button, or any MetaMask interaction needed for the local Anvil stack.
---

# MetaMask DevTools — Automation Skill

This skill provides ready-to-use tools and standards for automating MetaMask during local testing in the Daskibo project. By strictly adhering to the Progressive Disclosure principle, heavy code blocks have been extracted to dedicated script and reference files.

## 🧭 Navigation & Resources

- **CLI Management Tool (Preferred)**: Use the dedicated CLI script at [`scripts/metamask-control.js`](file:///home/g/projects/antigravity/.claude/skills/metamask-devtools/scripts/metamask-control.js) for any one-off operations. This guarantees deterministic execution and saves context window space.
- **Synpress (Playwright) Guide**: See [`references/synpress-guide.md`](file:///home/g/projects/antigravity/.claude/skills/metamask-devtools/references/synpress-guide.md) for how to write UI tests and build the wallet cache.
- **Raw CDP WebSocket Reference**: See [`references/cdp-raw-reference.md`](file:///home/g/projects/antigravity/.claude/skills/metamask-devtools/references/cdp-raw-reference.md) for low-level protocol mechanics, CDP scripts, Chrome launch flags, and troubleshooting tables.

## 🚀 Basic CLI Scenarios

Use `metamask-control.js` rather than raw WebSocket scripts:

```bash
# Unlock wallet
node scripts/metamask-control.js unlock --password "1234567890"

# Import a role account by private key
node scripts/metamask-control.js import --key "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" --name "Alice (Author)"

# Switch active account
node scripts/metamask-control.js switch-account --name "Bob (Client)"

# Add the local Anvil network (idempotent — skips if chainId already present)
node scripts/metamask-control.js add-network --name "Daskibo Local Anvil" --rpc "http://localhost:9545" --chainId 31337 --symbol tBNB
```

## ➕ Adding a network on MetaMask 13.24.0 (verified flow)

> [!WARNING]
> Do **NOT** use Synpress's `metamask.addNetwork()` on this build. It clicks
> `[data-testid="network-display"]` (renamed to **`sort-by-networks`** in 13.24.0)
> and drives the network menu's **"Add custom network"** button — which **CRASHES**
> MetaMask into its React error boundary ("MetaMask encountered an error").

The same network form renders fine when reached **directly by route**, so `addNetwork()`
in `metamask-control.js` does this instead (verified end-to-end against the live wallet):

1. `window.location.hash = '#/settings/networks/add-network'` (bypass the crashing menu).
2. Name → input testid **`network-form-network-name`** (the `…-input` testids are wrapper divs).
3. RPC → click **`test-add-rpc-drop-down`** → "Add RPC URL" → fill **`rpc-url-input-test`** + **`rpc-name-input-test`** → click "Add URL".
4. Chain ID → **`network-form-chain-id`**; Symbol → **`network-form-ticker-input`**.
5. Click **Save**. Idempotency pre-check: the network popover lists each net as `network-list-item-eip155:<chainId>`.

> [!IMPORTANT]
> This build ships **LavaMoat in scuttling mode**: the *global* `HTMLInputElement`,
> `KeyboardEvent`, etc. are inaccessible, and Playwright's `page.evaluate` is blocked.
> Reach the native value-setter via `Object.getPrototypeOf(inp)` (walk the chain), and
> drive everything through **raw CDP `Runtime.evaluate`** (runs in the page's real world).

## 🎯 Verified Selectors (MetaMask v13.24.0)

> [!IMPORTANT]
> MetaMask v13 relies heavily on React state. When interacting via CDP or automation directly, setting `.value` is not enough. You must use the native HTML setter and dispatch the `input` event to update the state.

| Element | Selector (testId / CSS) |
|---------|-----------------------|
| Unlock Password | `[data-testid="unlock-password"]` |
| Unlock Submit | `[data-testid="unlock-submit"]` |
| Add Wallet Button | `[data-testid="account-list-add-wallet-button"]` |
| Import Account Box | `#private-key-box` or `[data-testid="import-account-private-key-input"]` |
| Current Network Badge / network menu opener | `[data-testid="sort-by-networks"]` (NOT `network-display`) |
| Network in popover (by chainId) | `[data-testid="network-list-item-eip155:<chainId>"]` |
| Add-network form route | `#/settings/networks/add-network` |
| Network name input | `[data-testid="network-form-network-name"]` |
| RPC dropdown / Add RPC URL | `[data-testid="test-add-rpc-drop-down"]` → "Add RPC URL" → `[data-testid="rpc-url-input-test"]` |
| Chain ID input | `[data-testid="network-form-chain-id"]` |
| Ticker/Symbol input | `[data-testid="network-form-ticker-input"]` |
| Confirmation Submit | `[data-testid="confirmation-submit-button"]` |

## 🛠️ Troubleshooting & RCA

If you run into issues related to MetaMask connectivity, signature mismatches, or if `run_e2e_lit.sh` is failing, check the Root Cause Analysis (RCA) register before debugging further:
👉 **[Bug Hunter (RCA Register)](file:///home/g/projects/antigravity/skills/bughunter/SKILL.md)**
