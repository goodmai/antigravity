#!/usr/bin/env node
/**
 * Custom Synpress cache builder for Ubuntu 26.04 + system Chrome 148.
 *
 * Problem: Synpress CLI uses Playwright's bundled Chromium which doesn't exist
 * on Ubuntu 26.04. System Chrome via symlink doesn't auto-open extension pages.
 *
 * Solution: Build cache manually by launching system Chrome with Playwright,
 * explicitly opening MetaMask home.html, then running daskibo.setup.ts logic.
 */

// Import chromium from @playwright/test (the actual dependency); the bare
// 'playwright' package isn't installed here and only resolved locally via
// node_modules hoisting — it's absent in CI's strict pnpm tree.
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  addNetwork as addNetworkCDP,
  completeOnboarding,
  importAccount as importAccountCDP,
  switchAccount as switchAccountCDP,
  switchNetwork as switchNetworkCDP,
} from '../../.claude/skills/metamask-devtools/scripts/metamask-control.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Hash must match what Synpress computes for daskibo.setup.ts (printed in the
// fixture error "Cache for <hash> does not exist" if it drifts after editing the
// setup file). Override with CACHE_HASH=... env.
const CACHE_HASH = process.env.CACHE_HASH ?? '1a6f1899c902e05101dd';
const CACHE_DIR  = path.join(__dirname, '.cache-synpress', CACHE_HASH);
// Path to the unpacked MetaMask 13.24.0 extension. Override with METAMASK_EXT_PATH
// (CI downloads the v13.24.0 release zip and unpacks it). Must match the value
// patch-synpress.mjs feeds the Synpress fixture's prepareExtension().
const MM_PATH    = process.env.METAMASK_EXT_PATH ?? '/home/g/projects/metamask-chrome-13.24.0';
// Chrome 137+ blocks `--load-extension` outright; system Chrome here is 148.
// Use Chrome-for-Testing 130 (>= MetaMask's minimum_chrome_version 115), which
// still honours `--load-extension`. Persisted under ~/.local/share so it survives
// reboots (the original lived on tmpfs /tmp/cft130). Override with CHROME_BIN.
const CHROME_BIN = process.env.CHROME_BIN
  ?? '/home/g/.local/share/chrome-for-testing-130/chrome-linux64/chrome';
const PASSWORD   = process.env.METAMASK_PASSWORD ?? '1234567890';
const SEED       = process.env.METAMASK_SEED ?? 'cream timber combine fly ostrich animal sniff rice decade width glad author fresh dumb dune danger vital fetch mansion tip produce parade old pole';
// MUST match wallet-setup/daskibo.setup.ts and course-demo.js PERSONAS:
//   Author = anvil #1 (0x7099…), Client = anvil #2 (0x3C44…), Eve = anvil #3 (0x90F7…).
const ALICE_PK   = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'; // anvil #1 → 0x7099 (Author)
const BOB_PK     = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'; // anvil #2 → 0x3C44 (Client)
const EVE_PK     = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6'; // anvil #3 → 0x90F7 (Eve)

const NETWORK = { name: 'Daskibo Local Anvil', rpcUrl: 'http://localhost:9545', chainId: 31337, symbol: 'tBNB' };

const sleep = ms => new Promise(r => setTimeout(r, ms));

if (fs.existsSync(path.join(CACHE_DIR, 'Default')) && !process.argv.includes('--force')) {
  console.log(`Cache already exists at ${CACHE_DIR} — pass --force to rebuild`);
  process.exit(0);
}
// --force must start from a clean profile: a half-built profile lands MetaMask on
// the unlock screen instead of the import flow, breaking importWallet.
if (process.argv.includes('--force') && fs.existsSync(CACHE_DIR)) {
  fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  console.log('Wiped existing cache dir for clean rebuild.');
}

console.log('Building Synpress cache with Chrome-for-Testing 130:', CHROME_BIN);
console.log('Cache dir:', CACHE_DIR);

const context = await chromium.launchPersistentContext(CACHE_DIR, {
  executablePath: CHROME_BIN,
  headless: false,
  args: [
    `--load-extension=${MM_PATH}`,
    '--no-sandbox',
    '--no-first-run',
  ],
  ignoreDefaultArgs: ['--disable-extensions', '--enable-automation', '--disable-component-extensions-with-background-pages'],
  viewport: { width: 1280, height: 800 },
  slowMo: 50,
});

await sleep(2000);

// Get MetaMask extension ID
let extId = context.serviceWorkers().find(sw => sw.url().includes('chrome-extension://'))?.url().split('/')[2];
if (!extId) {
  await sleep(3000);
  extId = context.serviceWorkers()[0]?.url().split('/')[2];
}
console.log('MetaMask extension ID:', extId);
if (!extId) { console.error('Extension not found!'); await context.close(); process.exit(1); }

// On a fresh install MetaMask auto-opens its own onboarding tab. We must use
// THAT tab — if we open our own home.html, MetaMask closes/replaces it (the old
// sw.evaluate(chrome.tabs.create) approach also breaks here: LavaMoat scuttling
// makes `eval` inaccessible in the service worker, which Playwright's
// worker.evaluate needs). So poll for the auto-opened extension tab; only if it
// never appears do we open one ourselves via page.goto (needs no eval).
let mmPage = null;
for (let i = 0; i < 20 && !mmPage; i++) {
  mmPage = context.pages().find(p => p.url().includes(extId) && !p.url().includes('offscreen'));
  if (!mmPage) await sleep(500);
}
if (!mmPage) {
  mmPage = await context.newPage();
  await mmPage.goto(`chrome-extension://${extId}/home.html`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await sleep(1500);
}
// The onboarding tab may still be settling its route; wait for it to be ready.
await mmPage.waitForLoadState('domcontentloaded').catch(() => {});
await sleep(1500);
if (!mmPage.url().includes(extId)) {
  console.log('Pages:', context.pages().map(p => p.url()));
  throw new Error('MetaMask onboarding page not found');
}
console.log('MetaMask page:', mmPage.url());

// Import the MetaMask class from Synpress to use its methods
const { MetaMask } = await import('@synthetixio/synpress/playwright');
const metamask = new MetaMask(context, mmPage, PASSWORD, extId);

// Back `run()` with a raw CDP session: LavaMoat (scuttling mode) blocks
// Playwright's page.evaluate, but Runtime.evaluate runs in the page's real world
// and is not blocked. Shared by the onboarding + addNetwork helpers below.
const cdp = await context.newCDPSession(mmPage);
const run = async (expression) => {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};

try {
  console.log('\n[1] Importing wallet...');
  await metamask.importWallet(SEED);
  // Synpress 0.0.14's importWallet stops on the "Your wallet is ready!" /
  // pin-extension screens; drive them to the home page before doing anything else.
  await completeOnboarding({ run });
  console.log('    Done');

  console.log('\n[2] Adding Daskibo Anvil network...');
  // Synpress's metamask.addNetwork() targets MetaMask 13.13.1 selectors
  // (`network-display`) and drives the network-menu "Add custom network" button,
  // which CRASHES MetaMask 13.24.0 into its React error boundary. Use our
  // route-based CDP addNetwork instead.
  await addNetworkCDP({ run }, NETWORK);
  console.log('    Done');

  // Synpress's importWalletFromPrivateKey/renameAccount/switchNetwork also use
  // 13.13.1 selectors (multichain-account-menu-popover-action-button etc.) that
  // don't exist in 13.24.0. Use the skill's CDP helpers (import = import+rename).
  console.log('\n[3] Importing Alice...');
  await importAccountCDP({ run }, ALICE_PK, 'Alice (Author)');
  console.log('    Done');

  console.log('\n[4] Importing Bob...');
  await importAccountCDP({ run }, BOB_PK, 'Bob (Client)');
  console.log('    Done');

  console.log('\n[5] Importing Eve...');
  await importAccountCDP({ run }, EVE_PK, 'Eve (other)');
  console.log('    Done');

  console.log('\n[6] Switching to Daskibo Anvil + Alice...');
  await switchNetworkCDP({ run }, NETWORK.chainId);
  await switchAccountCDP({ run }, '0x70997970c51812dc3a010c7d01b50e0d17dc79c8'); // Alice / anvil #1
  console.log('    Done');

  // Verify the imported keyring accounts actually landed in the vault before we
  // close (otherwise the cache profile ships only the seed accounts).
  await run(`window.location.hash='#/'`); await sleep(600);
  await run(`document.querySelector('[data-testid="account-menu-icon"]')?.click()`); await sleep(900);
  const cells = await run(`[...document.querySelectorAll('[data-testid^="multichain-account-cell-"]')].filter(c=>/keyring/.test(c.getAttribute('data-testid')||'')).map(c=>c.getAttribute('data-testid')).join(' | ')`);
  await run(`document.querySelector('[data-testid="modal-header-close-button"]')?.click()`); await sleep(300);
  console.log('\n[verify] imported keyring cells:', cells || '(NONE)');

  await sleep(2000);
  console.log('\n✓ Cache built successfully!');
  console.log('  Run: npx playwright test');
} catch (e) {
  console.error('\n✗ Cache build failed:', e.message);
  console.error(e.stack);
  process.exit(1);
} finally {
  await context.close();
}
