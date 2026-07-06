/**
 * Daskibo wallet setup — imported once, cached by Synpress for all tests.
 *
 * Establishes:
 *   - Wallet 1 (seed phrase from .env)
 *   - Network: Daskibo Local Anvil (chainId 31337)
 *   - Alice (Author)  — Anvil account #0
 *   - Bob   (Client)  — Anvil account #1
 *   - Eve   (other)   — Anvil account #2
 */
import { defineWalletSetup } from '@synthetixio/synpress'
import { MetaMask } from '@synthetixio/synpress/playwright'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
// @ts-ignore — plain-JS skill helper (route-based add-network for MM 13.24.0)
import { addNetwork as addNetworkCDP } from '../../../.claude/skills/metamask-devtools/scripts/metamask-control.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

const SEED     = process.env.METAMASK_SEED    ?? 'cream timber combine fly ostrich animal sniff rice decade width glad author fresh dumb dune danger vital fetch mansion tip produce parade old pole'
const PASSWORD = process.env.METAMASK_PASSWORD ?? '1234567890'

const ANVIL_NETWORK = {
  name:    'Daskibo Local Anvil',
  rpcUrl:  'http://localhost:9545',
  chainId: 31337,
  symbol:  'tBNB',
}

// Anvil standard private keys (test test…junk mnemonic). These are HARDCODED (no
// env fallback) and MUST match the persona→address map in course-demo.js (PERSONAS):
//   Author = anvil #1 (0x7099…), Client = anvil #2 (0x3C44…), Eve = anvil #3 (0x90F7…).
// The dapp derives #role from that map, so the spec's "Alice (Author)" account has
// to BE the demo's Author address or #role resolves to "Unknown".
const ALICE_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' // anvil #1 → 0x7099 (Author)
const BOB_PK   = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' // anvil #2 → 0x3C44 (Client)
const EVE_PK   = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6' // anvil #3 → 0x90F7 (Eve)

// Click through MetaMask 13.13.1's post-import completion screens ("Your wallet
// is ready!" → Open wallet, then the "Pin the extension" popover) until the
// home page (network-display) is reachable. Synpress 0.0.14's importWallet
// stops before these screens, so we drive them here. Tolerant of ordering.
async function dismissOnboardingCompletion(walletPage: any) {
  // Sequentially click the completion CTA ("Open wallet") and the optional
  // "Pin the extension" popover, until the home page (network-display) shows.
  // This MetaMask build ships LavaMoat, which blocks Playwright's page.evaluate
  // and makes the wallet-ready CTA inert to synthetic input. RAW CDP
  // Runtime.evaluate runs in the page's real world and is NOT blocked (same
  // mechanism the metamask-devtools skill uses), so click via a CDP session.
  const cdp = await walletPage.context().newCDPSession(walletPage).catch(() => null)
  const evalClick = async (tid: string) => {
    if (!cdp) return
    await cdp.send('Runtime.evaluate', {
      expression: `(()=>{const b=document.querySelector('[data-testid="${tid}"]');if(b){b.click();return true}return false})()`,
      awaitPromise: true,
    }).catch(() => {})
  }
  const onHome = async () =>
    !!(await walletPage.locator('[data-testid="account-menu-icon"]').count().catch(() => 0))
  // Click the completion CTA (fires onClick → sets completedOnboarding), give the
  // background time, then force-route to home if it doesn't navigate on its own.
  await evalClick('onboarding-complete-done')
  for (let w = 0; w < 10 && !(await onHome()); w++) await walletPage.waitForTimeout(1000)
  if (!(await onHome()) && cdp) {
    const base = walletPage.url().split('#')[0]
    await cdp.send('Page.navigate', { url: base + '#/' }).catch(() => {})
    await walletPage.waitForTimeout(3000)
  }
  await evalClick('pin-extension-next'); await evalClick('pin-extension-done')
}

export default defineWalletSetup(PASSWORD, async (context, walletPage) => {
  const metamask = new MetaMask(context, walletPage, PASSWORD)

  // 1. Import base wallet (Account 1 from seed)
  await metamask.importWallet(SEED)

  // MetaMask 13.x ends onboarding on a "Your wallet is ready!" screen with an
  // "Open wallet" CTA that Synpress 0.0.14's importWallet does not dismiss.
  // (Only reachable once LavaMoat is disabled in the bundled build — otherwise
  // the CTA is inert to automation.)
  await dismissOnboardingCompletion(walletPage)

  // 2. Add Daskibo Anvil network.
  // Synpress's metamask.addNetwork() drives MetaMask 13.13.1's network form via
  // `network-display` (renamed to `sort-by-networks` in 13.24.0) and the network
  // menu's "Add custom network" button, which CRASHES 13.24.0 into its React error
  // boundary. The same form renders fine at the route #/settings/networks/add-network,
  // so we add via our route-based CDP helper. Raw CDP Runtime.evaluate runs in the
  // page's real world and bypasses LavaMoat scuttling (which blocks page.evaluate).
  const setupCdp = await context.newCDPSession(walletPage)
  const run = async (expression: string) => {
    const r: any = await setupCdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    return r.result?.value
  }
  await addNetworkCDP({ run }, ANVIL_NETWORK)

  // 3. Import Alice, Bob, Eve from Anvil private keys
  await metamask.importWalletFromPrivateKey(ALICE_PK)
  await metamask.renameAccount('Account 2', 'Alice (Author)')

  await metamask.importWalletFromPrivateKey(BOB_PK)
  await metamask.renameAccount('Account 3', 'Bob (Client)')

  await metamask.importWalletFromPrivateKey(EVE_PK)
  await metamask.renameAccount('Account 4', 'Eve (other)')

  // 4. Switch to Anvil network and Alice as default
  await metamask.switchNetwork('Daskibo Local Anvil', true)
  await metamask.switchAccount('Alice (Author)')
})
