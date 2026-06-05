#!/usr/bin/env node
/**
 * UI test with manual MetaMask setup.
 *
 * Phase 1 (manual, 3 min):
 *   - Chrome opens with MetaMask extension loaded
 *   - MetaMask onboarding page opens automatically
 *   - User sets up MetaMask: seed phrase, network, import Anvil accounts
 *
 * Phase 2 (automated):
 *   - Navigate to demo page
 *   - Test "Add / switch Anvil network" button
 *   - Alice registers course, Bob buys, access matrix checked, Alice withdraws
 *
 * Anvil accounts to import into MetaMask:
 *   Alice (Author)  #0  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
 *                       PK: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
 *   Bob   (Client)  #1  0x70997970C51812dc3A010C7d01b50e0d17dc79C8
 *                       PK: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
 *   Eve   (other)   #2  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
 *                       PK: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
 *
 * Network to add in MetaMask:
 *   Name:     Daskibo Local Anvil
 *   RPC:      http://localhost:9545
 *   Chain ID: 31337
 *   Symbol:   tBNB
 *
 * Run: DISPLAY=:0 node test-ui-manual-setup.mjs
 */

import { chromium } from 'playwright';
import readline from 'readline';

// ── Config ───────────────────────────────────────────────────────────────────
const METAMASK_PATH  = '/home/g/projects/metamask-chrome-13.24.0';
const USER_DATA_DIR  = '/tmp/daskibo-manual-profile';
const FRONTEND       = 'http://localhost:8085/course-demo.html';
const MANUAL_TIMEOUT = 3 * 60 * 1000; // 3 minutes

const ALICE = { name: 'Alice (Author)', addr: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' };
const BOB   = { name: 'Bob (Client)',   addr: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' };

// ── Helpers ──────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const ok   = label       => { console.log(`  ✓  ${label}`); passed++; };
const fail = (label, d='') => { console.error(`  ✗  ${label}${d ? ': '+d : ''}`); failed++; };

async function ss(page, name) {
  const p = `/tmp/daskibo-${name}.png`;
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  console.log(`     📸 ${p}`);
}

async function waitClick(page, sel, timeout = 15000) {
  const el = page.locator(sel).first();
  await el.waitFor({ state: 'visible', timeout });
  await el.click();
}

async function handlePopup(context, label = '') {
  await new Promise(r => setTimeout(r, 2000));
  for (const p of context.pages()) {
    if (!p.url().includes('chrome-extension://')) continue;
    if (p.url().includes('home.html') || p.isClosed()) continue;
    await p.bringToFront();
    await ss(p, `popup-${label || Date.now()}`);
    for (const sel of [
      'button[data-testid="confirmation-submit-button"]',
      'button[data-testid="confirm-footer-button"]',
      'button[data-testid="page-container-footer-next"]',
      'button:has-text("Confirm")',
      'button:has-text("Approve")',
      'button:has-text("Connect")',
      'button:has-text("Next")',
    ]) {
      const btn = p.locator(sel).first();
      if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await btn.click();
        console.log(`     [popup] clicked: ${sel}`);
        await p.waitForTimeout(1000);
        break;
      }
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Daskibo Academy — Full UI Test (manual MetaMask setup)       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\nAnvil accounts for MetaMask:');
  console.log('  Alice #0  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  console.log('             PK: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  console.log('  Bob   #1  0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
  console.log('             PK: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
  console.log('  Eve   #2  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC');
  console.log('             PK: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');
  console.log('\nNetwork to add:');
  console.log('  Name: Daskibo Local Anvil  |  RPC: http://localhost:9545  |  ChainID: 31337  |  Symbol: tBNB');

  // ── Launch Chrome ──────────────────────────────────────────────────────────
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    executablePath: '/usr/bin/google-chrome',
    headless: false,
    args: [
      `--load-extension=${METAMASK_PATH}`,
      `--disable-extensions-except=${METAMASK_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
    ignoreDefaultArgs: ['--disable-extensions', '--enable-automation', '--disable-component-extensions-with-background-pages'],
    viewport: { width: 1280, height: 800 },
    slowMo: 30,
  });

  console.log('\nChrome launched.');

  // Get extension ID
  let extensionId;
  const sws = context.serviceWorkers();
  if (sws.length > 0) {
    extensionId = sws[0].url().split('/')[2];
  } else {
    await new Promise(r => setTimeout(r, 3000));
    const sw = context.serviceWorkers()[0];
    if (sw) extensionId = sw.url().split('/')[2];
  }

  if (!extensionId) {
    // Fallback: check pages for extension URL
    await new Promise(r => setTimeout(r, 5000));
    for (const p of context.pages()) {
      if (p.url().startsWith('chrome-extension://')) {
        extensionId = p.url().split('/')[2];
        break;
      }
    }
  }

  console.log('MetaMask extension ID:', extensionId ?? '(not found — proceeding anyway)');

  // Open MetaMask onboarding page
  if (extensionId) {
    const mmPage = await context.newPage();
    await mmPage.goto(`chrome-extension://${extensionId}/home.html`);
    console.log('\nMetaMask onboarding page opened.');
  }

  // ── Manual setup window ────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(64));
  console.log('  MANUAL SETUP — you have 3 minutes (or press Enter to continue)');
  console.log('  1. Set up MetaMask with your seed phrase');
  console.log('  2. Add network: Daskibo Local Anvil (RPC localhost:9545, ChainID 31337)');
  console.log('  3. Import Alice private key (PK above)');
  console.log('  4. Import Bob private key (PK above)');
  console.log('  Press Enter in this terminal when done (or wait 3 min auto-continue)');
  console.log('─'.repeat(64));

  await new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; rl.close(); resolve(); } }, MANUAL_TIMEOUT);
    rl.question('', () => { if (!done) { done = true; clearTimeout(timer); rl.close(); resolve(); } });
  });

  console.log('\nStarting automated test phase…');

  // ── Open demo page ─────────────────────────────────────────────────────────
  const demo = await context.newPage();
  await demo.goto(FRONTEND, { waitUntil: 'domcontentloaded' });
  await demo.waitForTimeout(2000);
  await ss(demo, 'step01-demo-loaded');

  const statusText = await demo.locator('#status').textContent().catch(() => '');
  console.log('\n[Demo] Initial status:', statusText?.trim());
  if (!statusText?.includes('error')) {
    ok('Demo page loaded');
  } else {
    fail('Demo page load error', statusText);
  }

  // ── Test: Add / switch Anvil network button ─────────────────────────────────
  console.log('\n── TEST: "Add / switch Anvil network" button ─────────────────');
  await demo.bringToFront();
  await waitClick(demo, '#btn-network');
  await demo.waitForTimeout(500);
  await handlePopup(context, 'add-network');
  await demo.waitForTimeout(1500);
  await ss(demo, 'step02-after-add-network');
  const errAfterNet = await demo.locator('#status').getAttribute('data-state').catch(() => '');
  if (errAfterNet !== 'error') {
    ok('Add/switch network button — no error thrown');
  } else {
    const msg = await demo.locator('#status').textContent().catch(() => '');
    fail('Add/switch network button', msg ?? '');
  }

  // ── TEST: Connect as Alice ─────────────────────────────────────────────────
  console.log('\n── TEST: Connect (Alice should be active in MetaMask) ─────────');
  await demo.bringToFront();
  await waitClick(demo, '#btn-connect');
  await demo.waitForTimeout(1000);
  await handlePopup(context, 'connect-alice');
  await demo.waitForTimeout(2000);
  await ss(demo, 'step03-connected');

  const acctText = await demo.locator('#acct').textContent().catch(() => '');
  console.log('[Demo] Connected:', acctText);
  if (acctText && acctText !== '—') {
    ok(`Connected: ${acctText}`);
  } else {
    fail('No account connected — did you connect in MetaMask popup?');
  }

  // ── TEST: Register course ──────────────────────────────────────────────────
  console.log('\n── TEST: Register course (as Alice) ───────────────────────────');
  await demo.bringToFront();
  const registerBtn = demo.locator('#btn-register');
  const regDisabled = await registerBtn.isDisabled().catch(() => true);
  if (regDisabled) {
    fail('Register button is disabled — make sure Alice is connected and on chainId 31337');
  } else {
    await registerBtn.click();
    await demo.waitForTimeout(1500);
    await handlePopup(context, 'register');
    await demo.waitForTimeout(5000);
    await ss(demo, 'step04-after-register');
    const st = await demo.locator('#status').textContent().catch(() => '');
    console.log('[Demo] Status:', st?.trim());
    if (st?.toLowerCase().includes('register') || st?.toLowerCase().includes('course') || st?.toLowerCase().includes('id')) {
      ok('Course registered');
    } else {
      fail('Registration unclear', st ?? '');
    }
  }

  // Refresh catalog
  const refreshBtn = demo.locator('#btn-refresh');
  if (!await refreshBtn.isDisabled().catch(() => true)) {
    await refreshBtn.click();
    await demo.waitForTimeout(2000);
    await ss(demo, 'step05-catalog');
    const catalogTxt = await demo.locator('#catalog').textContent().catch(() => '');
    if (catalogTxt && !catalogTxt.includes('No courses yet')) {
      ok('Catalog: course visible');
    } else {
      fail('Catalog empty', catalogTxt ?? '');
    }
  }

  // ── Pause for user to switch to Bob ────────────────────────────────────────
  console.log('\n' + '─'.repeat(64));
  console.log('  MANUAL STEP: Switch MetaMask to Bob (Client) account');
  console.log('  Press Enter when ready…');
  console.log('─'.repeat(64));
  await new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('', () => { rl.close(); resolve(); });
  });

  // ── TEST: Buy course as Bob ────────────────────────────────────────────────
  console.log('\n── TEST: Buy course (as Bob) ───────────────────────────────────');
  await demo.bringToFront();
  await waitClick(demo, '#btn-connect');
  await demo.waitForTimeout(1000);
  await handlePopup(context, 'connect-bob');
  await demo.waitForTimeout(2000);

  const acctBob = await demo.locator('#acct').textContent().catch(() => '');
  console.log('[Demo] Connected:', acctBob);

  const buyBtn = demo.locator('button:has-text("Buy")').first();
  if (await buyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await buyBtn.click();
    await demo.waitForTimeout(1500);
    await handlePopup(context, 'buy');
    await demo.waitForTimeout(5000);
    await ss(demo, 'step06-after-buy');
    const st = await demo.locator('#status').textContent().catch(() => '');
    console.log('[Demo] Buy status:', st?.trim());
    if (st?.toLowerCase().includes('purchas') || st?.toLowerCase().includes('access') || st?.toLowerCase().includes('success') || st?.toLowerCase().includes('nft')) {
      ok('Course purchased by Bob');
    } else {
      fail('Purchase unclear', st ?? '');
    }
  } else {
    fail('Buy button not found');
  }

  // ── TEST: Access matrix ────────────────────────────────────────────────────
  console.log('\n── TEST: Access matrix ────────────────────────────────────────');
  await demo.bringToFront();
  const accessBtn = demo.locator('#btn-access');
  if (!await accessBtn.isDisabled().catch(() => true)) {
    await accessBtn.click();
    await demo.waitForTimeout(3000);
    await ss(demo, 'step07-access-matrix');
    const matrixTxt = await demo.locator('#matrix').textContent().catch(() => '');
    console.log('[Demo] Matrix:', matrixTxt?.slice(0, 200));
    if (matrixTxt?.toLowerCase().includes('yes') || matrixTxt?.includes('✓') || matrixTxt?.includes('true')) {
      ok('Access matrix: has granted entries');
    } else {
      fail('Access matrix looks wrong', matrixTxt ?? '');
    }
  } else {
    fail('Access button disabled');
  }

  // ── Pause for Alice to withdraw ────────────────────────────────────────────
  console.log('\n' + '─'.repeat(64));
  console.log('  MANUAL STEP: Switch MetaMask back to Alice (Author)');
  console.log('  Press Enter when ready…');
  console.log('─'.repeat(64));
  await new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('', () => { rl.close(); resolve(); });
  });

  // ── TEST: Withdraw ─────────────────────────────────────────────────────────
  console.log('\n── TEST: Withdraw proceeds (as Alice) ─────────────────────────');
  await demo.bringToFront();
  await waitClick(demo, '#btn-connect');
  await demo.waitForTimeout(1000);
  await handlePopup(context, 'connect-alice2');
  await demo.waitForTimeout(2000);

  const pendingTxt = await demo.locator('#pending').textContent().catch(() => '0');
  console.log('[Demo] Pending balance:', pendingTxt);

  if (pendingTxt && pendingTxt !== '—' && parseFloat(pendingTxt) > 0) {
    ok(`Pending balance: ${pendingTxt} ETH`);
    const wdBtn = demo.locator('#btn-withdraw');
    if (!await wdBtn.isDisabled().catch(() => true)) {
      await wdBtn.click();
      await demo.waitForTimeout(1500);
      await handlePopup(context, 'withdraw');
      await demo.waitForTimeout(5000);
      await ss(demo, 'step08-after-withdraw');
      const st = await demo.locator('#status').textContent().catch(() => '');
      console.log('[Demo] Withdraw status:', st?.trim());
      if (st?.toLowerCase().includes('withdraw') || st?.toLowerCase().includes('success')) {
        ok('Alice withdrew proceeds');
      } else {
        console.log('[Demo] (withdraw status unclear:', st, ')');
      }
    }
  } else {
    fail('Pending balance is 0 or not loaded', pendingTxt ?? '');
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(64));
  console.log(`  Result: ${passed} passed, ${failed} failed`);
  console.log('  Screenshots in /tmp/daskibo-step*.png');
  console.log('═'.repeat(64));

  console.log('\nBrowser stays open — close it when done.');
  await new Promise(r => setTimeout(r, 600000)); // keep open 10 min
  await context.close();
  process.exit(failed > 0 ? 1 : 0);
})();
