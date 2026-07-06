# Synpress Quick Reference (Playwright)

This guide covers the Synpress layer (`@synthetixio/synpress v4`) for testing Daskibo locally. It is intended for full E2E testing and parallel execution.

## Setup & Execution

> [!IMPORTANT]
> The vanilla Synpress CLI (`pnpm cache`) does NOT work in this environment
> (Ubuntu 26.04, system Chrome 148, MetaMask 13.24.0 + LavaMoat). Use the custom
> flow below. See BUG-016/017/018 in the bughunter register for the why.

```bash
cd smartcontracts/e2e-synpress
pnpm install
node patch-synpress.mjs          # re-apply node_modules patches (after every install)
DISPLAY=:0 node build-cache.mjs --force   # build the wallet cache (our builder, not `pnpm cache`)
DISPLAY=:0 npx playwright test   # run specs (headed; needs an X display)
```

### Why the custom flow (environment blockers + fixes)

| Blocker | Fix |
|---|---|
| Chrome 137+ blocks `--load-extension`; system Chrome is 148 | Use **Chrome-for-Testing 130** at `~/.local/share/chrome-for-testing-130` (≥ MetaMask min 115). `build-cache.mjs` `executablePath`; Playwright's `chromium-1140` symlink also points here. |
| Synpress downloads MetaMask **13.13.1** (ext ID differs from our 13.24.0 cache) | `patch-synpress.mjs` makes `prepareExtension()` return the local `metamask-chrome-13.24.0` (ext ID **hebhblbkkdabgoldnojllkipeoacjioc**). |
| Playwright's default `--disable-extensions` disables the loaded MetaMask | Patch adds `ignoreDefaultArgs: ['--disable-extensions', …]` to the fixture launch. |
| `getExtensionId` matches name `"MetaMask"` exactly; this build is `"MetaMask MV3 lavamoat snow"` | Patch matches by substring. |
| LavaMoat scuttling blocks `page.evaluate` + `sw.evaluate` (eval), and crashes the network-menu "Add custom network" | Drive via raw CDP `Runtime.evaluate`; add networks via the route `#/settings/networks/add-network` (see SKILL.md). |
| Cache dir hash must match `daskibo.setup.ts` | `build-cache.mjs` `CACHE_HASH` (or `CACHE_HASH=…` env); the fixture error "Cache for `<hash>` does not exist" prints the expected value. |

`build-cache.mjs` provisions the profile: importWallet → completeOnboarding → addNetwork (Daskibo Anvil 31337 @ :9545) → import Alice/Bob/Eve from anvil keys → switch to Anvil + Alice. All MetaMask steps use the CDP helpers in `scripts/metamask-control.js` (Synpress's own page objects use stale 13.13.1 selectors).

## Wallet Setup Definition

The wallet is defined once in `wallet-setup/daskibo.setup.ts`. This file is cached by Synpress.

```ts
// wallet-setup/daskibo.setup.ts
import { defineWalletSetup } from '@synthetixio/synpress'
import { MetaMask } from '@synthetixio/synpress/playwright'

export default defineWalletSetup(PASSWORD, async (context, walletPage) => {
  const metamask = new MetaMask(context, walletPage, PASSWORD)

  await metamask.importWallet(SEED)
  await metamask.addNetwork({ name, rpcUrl, chainId, symbol })
  
  await metamask.importWalletFromPrivateKey(ALICE_PK)
  await metamask.renameAccount('Account 2', 'Alice (Author)')
  
  await metamask.switchAccount('Alice (Author)')
})
```

## Writing Tests

Import `test` and `MetaMask` from the custom Synpress wrapper to use the cached setup in your Playwright specs:

```ts
// specs/example.spec.ts
import { test, expect } from './synpress'

test('buy course', async ({ page, metamask }) => {
  await metamask.switchAccount('Bob (Client)')
  await page.locator('#btn-connect').click()
  await metamask.connectToDapp()
  
  await page.locator('button:has-text("Buy")').first().click()
  await metamask.confirmTransaction()
  
  // Handling network requests
  await metamask.approveNewNetwork()      // for wallet_addEthereumChain
  await metamask.approveSwitchNetwork()   // for wallet_switchEthereumChain
})
```

Use this layer for comprehensive regression tests. For quick ad-hoc scripts, see the CDP reference.
