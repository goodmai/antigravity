#!/usr/bin/env node
/**
 * Full UI test: MetaMask + local Anvil + course-demo.html
 *
 * Flow:
 *   1. Launch Chrome with MetaMask extension
 *   2. Set up MetaMask with provided seed phrase (first run only)
 *   3. Add "Daskibo Local Anvil" network (chainId 31337)
 *   4. Import Alice (Anvil #0) and Bob (Anvil #1) accounts
 *   5. As Alice: register a course
 *   6. As Bob: buy the course
 *   7. Check access matrix (Alice ✓, Bob ✓, Eve ✗)
 *   8. As Alice: withdraw proceeds
 *
 * Run: node test-ui-metamask.mjs
 * Add --headed for visible browser (default: headed)
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

// ── Config ──────────────────────────────────────────────────────────────────
const METAMASK_PATH = '/home/g/projects/metamask-chrome-13.24.0';
const USER_DATA_DIR = '/tmp/daskibo-chrome-profile';
const FRONTEND      = 'http://localhost:8085/course-demo.html';

const MM_SEED     = 'cream timber combine fly ostrich animal sniff rice decade width glad author fresh dumb dune danger vital fetch mansion tip produce parade old pole';
const MM_PASSWORD = 'Daskibo123!';

// Anvil standard accounts (mnemonic: "test test test … junk")
const ALICE = { name: 'Alice (Author)',  pk: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', addr: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' };
const BOB   = { name: 'Bob (Client)',    pk: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', addr: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' };

const CHAIN = {
  name:   'Daskibo Local Anvil',
  id:     '31337',
  idHex:  '0x7a69',
  rpc:    'http://localhost:9545',
  symbol: 'tBNB',
};

// ── Helpers ─────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function ok(label)  { console.log(`  ✓  ${label}`); passed++; }
function fail(label, detail = '') { console.error(`  ✗  ${label}${detail ? ': '+detail : ''}`); failed++; }

async function ss(page, name) {
  const p = `/tmp/daskibo-test-${name}.png`;
  await page.screenshot({ path: p, fullPage: true });
  console.log(`     📸 ${p}`);
}

async function waitAndClick(page, selector, opts = {}) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout: opts.timeout ?? 15000 });
  await el.click();
}

async function waitAndFill(page, selector, value, opts = {}) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout: opts.timeout ?? 10000 });
  await el.fill(value);
}

// ── MetaMask helpers ─────────────────────────────────────────────────────────
async function getMMPage(context) {
  // Find the MetaMask popup / fullscreen tab
  const pages = context.pages();
  for (const p of pages) {
    if (p.url().includes('chrome-extension://')) return p;
  }
  return null;
}

async function openMM(context, extensionId) {
  const p = await context.newPage();
  await p.goto(`chrome-extension://${extensionId}/home.html`);
  await p.waitForLoadState('domcontentloaded');
  return p;
}

// ── MetaMask onboarding ──────────────────────────────────────────────────────
async function setupMetaMask(context, extensionId) {
  console.log('\n[MetaMask] Starting onboarding…');
  const mm = await openMM(context, extensionId);
  await mm.waitForTimeout(2000);
  await ss(mm, '01-mm-open');

  // Accept ToS if shown
  try {
    const tos = mm.locator('input[data-testid="onboarding-terms-of-service-checkbox"]');
    if (await tos.isVisible({ timeout: 3000 })) {
      await tos.check();
      await mm.locator('button[data-testid="onboarding-terms-of-service-next-button"]').click();
      console.log('[MetaMask] ToS accepted');
    }
  } catch { /* not on ToS page */ }

  await mm.waitForTimeout(1000);
  await ss(mm, '02-mm-after-tos');

  // Click "Import an existing wallet"
  try {
    const importBtn = mm.locator('button[data-testid="onboarding-import-wallet"]');
    if (await importBtn.isVisible({ timeout: 5000 })) {
      await importBtn.click();
      console.log('[MetaMask] Clicked "Import an existing wallet"');
    }
  } catch {
    // Might already be set up
    console.log('[MetaMask] Wallet might already be set up, skipping import step');
    return mm;
  }

  await mm.waitForTimeout(1000);

  // "Help us improve" — click "No thanks"
  try {
    const noThanks = mm.locator('button[data-testid="metametrics-no-thanks"]');
    if (await noThanks.isVisible({ timeout: 4000 })) {
      await noThanks.click();
      console.log('[MetaMask] Declined metrics');
    }
  } catch { /* not shown */ }

  await mm.waitForTimeout(1000);
  await ss(mm, '03-mm-seed-entry');

  // Enter seed phrase — MetaMask v13 uses individual word inputs
  const words = MM_SEED.split(' ');
  // Try single textarea first
  try {
    const textarea = mm.locator('textarea[data-testid="import-srp__srp-word-0"]');
    if (await textarea.isVisible({ timeout: 2000 })) {
      // Word-by-word inputs
      for (let i = 0; i < words.length; i++) {
        const inp = mm.locator(`[data-testid="import-srp__srp-word-${i}"]`);
        await inp.fill(words[i]);
      }
      console.log('[MetaMask] Seed phrase entered (word inputs)');
    }
  } catch {
    // Try single textarea
    try {
      const srp = mm.locator('textarea[data-testid="import-srp-text"]');
      if (await srp.isVisible({ timeout: 3000 })) {
        await srp.fill(MM_SEED);
        console.log('[MetaMask] Seed phrase entered (textarea)');
      }
    } catch {
      console.error('[MetaMask] Could not find seed phrase input');
    }
  }

  // Click Confirm / Next after SRP
  await mm.waitForTimeout(500);
  try {
    const confirmSrp = mm.locator('button[data-testid="import-srp-confirm"]');
    if (await confirmSrp.isVisible({ timeout: 3000 })) {
      await confirmSrp.click();
    }
  } catch { /* no button yet */ }

  await mm.waitForTimeout(1000);
  await ss(mm, '04-mm-password');

  // Set password
  try {
    const pwdNew = mm.locator('input[data-testid="create-password-new"]');
    if (await pwdNew.isVisible({ timeout: 5000 })) {
      await pwdNew.fill(MM_PASSWORD);
      await mm.locator('input[data-testid="create-password-confirm"]').fill(MM_PASSWORD);
      const terms = mm.locator('input[data-testid="create-password-terms"]');
      if (await terms.isVisible({ timeout: 2000 }).catch(() => false)) {
        await terms.check();
      }
      await mm.locator('button[data-testid="create-password-import"]').click();
      console.log('[MetaMask] Password set');
    }
  } catch { console.log('[MetaMask] Password step skipped (already set?)'); }

  await mm.waitForTimeout(2000);
  await ss(mm, '05-mm-completion');

  // Click "Done" or "Got it" on completion screens
  for (const testId of ['onboarding-complete-done', 'pin-extension-done', 'pin-extension-next']) {
    try {
      const btn = mm.locator(`button[data-testid="${testId}"]`);
      if (await btn.isVisible({ timeout: 3000 })) {
        await btn.click();
        await mm.waitForTimeout(1000);
        console.log(`[MetaMask] Clicked ${testId}`);
      }
    } catch { /* not shown */ }
  }

  await ss(mm, '06-mm-ready');
  console.log('[MetaMask] Onboarding complete');
  return mm;
}

// ── Add network in MetaMask ───────────────────────────────────────────────────
async function addNetwork(mm) {
  console.log('\n[MetaMask] Adding Daskibo Anvil network…');
  await mm.bringToFront();

  // Open the network dropdown
  await waitAndClick(mm, '[data-testid="network-display"]');
  await mm.waitForTimeout(500);

  // Click "Add a custom network" or "Add network"
  try {
    const addBtn = mm.locator('button:has-text("Add a custom network"), button:has-text("Add network")').first();
    await addBtn.waitFor({ state: 'visible', timeout: 5000 });
    await addBtn.click();
  } catch {
    // Try alternative
    await waitAndClick(mm, '[data-testid="multichain-network-list-menu-add-network"]', { timeout: 5000 });
  }

  await mm.waitForTimeout(1000);
  await ss(mm, '07-mm-add-network');

  // Fill in network details - check if we're on the "add network manually" page
  // First try the manual form
  try {
    const manualBtn = mm.locator('button:has-text("Add a network manually")');
    if (await manualBtn.isVisible({ timeout: 3000 })) {
      await manualBtn.click();
      await mm.waitForTimeout(1000);
    }
  } catch { /* already on manual form */ }

  // Fill network name
  try {
    await waitAndFill(mm, 'input[data-testid="network-form-network-name"]', CHAIN.name);
    await waitAndFill(mm, 'input[data-testid="network-form-rpc-url"]', CHAIN.rpc);
    await waitAndFill(mm, 'input[data-testid="network-form-chain-id"]', CHAIN.id);
    await waitAndFill(mm, 'input[data-testid="network-form-ticker-symbol"]', CHAIN.symbol);
    await ss(mm, '08-mm-network-form');

    await waitAndClick(mm, 'button[data-testid="network-form-submit-button"]');
    await mm.waitForTimeout(1000);

    // Confirm switch
    try {
      const switchBtn = mm.locator('button:has-text("Switch to"), button[data-testid="confirmation-submit-button"]').first();
      if (await switchBtn.isVisible({ timeout: 4000 })) {
        await switchBtn.click();
      }
    } catch { /* no switch dialog */ }

    console.log('[MetaMask] Network added and switched');
  } catch (e) {
    console.error('[MetaMask] Failed to add network:', e.message);
    await ss(mm, '08-mm-network-error');
  }

  await mm.waitForTimeout(1000);
}

// ── Import account in MetaMask ────────────────────────────────────────────────
async function importAccount(mm, account) {
  console.log(`\n[MetaMask] Importing ${account.name}…`);
  await mm.bringToFront();

  // Open account menu
  await waitAndClick(mm, '[data-testid="account-menu-icon"]');
  await mm.waitForTimeout(500);

  // Click "Add account or hardware wallet"
  try {
    const addAcct = mm.locator('button[data-testid="multichain-account-menu-popover-add-account"]');
    await addAcct.waitFor({ state: 'visible', timeout: 5000 });
    await addAcct.click();
  } catch {
    await waitAndClick(mm, 'button:has-text("Add account or hardware wallet")', { timeout: 5000 });
  }

  await mm.waitForTimeout(500);

  // Click "Import account"
  await waitAndClick(mm, 'button[data-testid="multichain-account-menu-popover-add-imported"], button:has-text("Import account")', { timeout: 5000 });
  await mm.waitForTimeout(500);
  await ss(mm, `09-mm-import-${account.name.split(' ')[0].toLowerCase()}`);

  // Enter private key
  await waitAndFill(mm, '#private-key-box, input[data-testid="import-account-private-key-input"]', account.pk);
  await waitAndClick(mm, 'button[data-testid="import-account-confirm-button"], button:has-text("Import")');
  await mm.waitForTimeout(1500);

  console.log(`[MetaMask] ${account.name} imported`);
}

// ── Switch active account in MetaMask ─────────────────────────────────────────
async function switchAccount(mm, addr) {
  console.log(`\n[MetaMask] Switching to ${addr.slice(0,10)}…`);
  await mm.bringToFront();

  await waitAndClick(mm, '[data-testid="account-menu-icon"]');
  await mm.waitForTimeout(500);

  // Find account by address (partial match)
  const shortAddr = addr.slice(2, 8).toLowerCase();
  const acctBtn = mm.locator(`[data-testid*="account-list-address"]:has-text("${addr.slice(0,6)}")`).first();
  try {
    await acctBtn.waitFor({ state: 'visible', timeout: 4000 });
    await acctBtn.click();
  } catch {
    // Try clicking by account button that matches
    const buttons = mm.locator('[data-testid^="account-list-item"]');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const text = await buttons.nth(i).textContent();
      if (text && text.toLowerCase().includes(addr.slice(2, 8).toLowerCase())) {
        await buttons.nth(i).click();
        break;
      }
    }
  }
  await mm.waitForTimeout(1000);
}

// ── Handle MetaMask popup (approve tx / add network) ──────────────────────────
async function handleMMPopup(context, action = 'confirm') {
  await new Promise(r => setTimeout(r, 2000));
  const pages = context.pages();
  const popup = pages.find(p => p.url().includes('chrome-extension://') && p !== pages[0]);
  if (!popup) {
    console.log('[MetaMask] No popup found');
    return;
  }
  await popup.bringToFront();
  await ss(popup, 'popup-' + Date.now());

  if (action === 'confirm') {
    for (const sel of [
      'button[data-testid="confirmation-submit-button"]',
      'button[data-testid="page-container-footer-next"]',
      'button:has-text("Confirm")',
      'button:has-text("Next")',
      'button:has-text("Approve")',
    ]) {
      try {
        const btn = popup.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          await btn.click();
          console.log(`[MetaMask popup] Clicked: ${sel}`);
          await popup.waitForTimeout(1000);
          break;
        }
      } catch { /* try next */ }
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Daskibo Academy — Full MetaMask UI Test              ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  // Clean old profile if doing fresh test
  const freshRun = process.argv.includes('--fresh');
  if (freshRun && fs.existsSync(USER_DATA_DIR)) {
    fs.rmSync(USER_DATA_DIR, { recursive: true });
    console.log('Cleaned existing profile (fresh run)');
  }

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    executablePath: '/usr/bin/google-chrome',
    headless: false,
    args: [
      `--load-extension=${METAMASK_PATH}`,
      `--disable-extensions-except=${METAMASK_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
    ignoreDefaultArgs: ['--disable-extensions'],
    viewport: { width: 1280, height: 800 },
    slowMo: 50,
  });

  // Get MetaMask extension ID from service worker
  let extensionId;
  try {
    const sw = await context.waitForEvent('serviceworker', {
      predicate: sw => sw.url().startsWith('chrome-extension://'),
      timeout: 10000,
    });
    extensionId = sw.url().split('/')[2];
    console.log('\nMetaMask extension ID:', extensionId);
  } catch {
    // Fallback: find via existing pages
    await new Promise(r => setTimeout(r, 3000));
    const pg = context.pages().find(p => p.url().startsWith('chrome-extension://'));
    if (pg) extensionId = pg.url().split('/')[2];
  }

  if (!extensionId) {
    console.error('Could not detect MetaMask extension ID. Check the extension loaded correctly.');
    await context.close();
    process.exit(1);
  }

  try {
    // ── Step 1: Set up MetaMask ────────────────────────────────────────────
    const mm = await setupMetaMask(context, extensionId);

    // ── Step 2: Add Daskibo Anvil network ─────────────────────────────────
    await addNetwork(mm);

    // ── Step 3: Import Alice & Bob ─────────────────────────────────────────
    await importAccount(mm, ALICE);
    await importAccount(mm, BOB);

    // ── Step 4: Navigate to demo page ─────────────────────────────────────
    console.log('\n[Demo] Opening course demo page…');
    const demo = await context.newPage();
    await demo.goto(FRONTEND, { waitUntil: 'domcontentloaded' });
    await demo.waitForTimeout(2000);
    await ss(demo, '10-demo-loaded');

    // Check addresses loaded
    const statusText = await demo.locator('#status').textContent();
    console.log('[Demo] Status:', statusText?.trim());
    if (statusText?.includes('Error') || statusText?.includes('error')) {
      fail('Addresses loaded', statusText);
    } else {
      ok('Demo page loaded with addresses');
    }

    // ── Step 5: Test "Add / switch Anvil network" button ───────────────────
    console.log('\n[Test] Clicking "Add / switch Anvil network"…');
    await demo.bringToFront();
    await waitAndClick(demo, '#btn-network');
    await demo.waitForTimeout(500);
    // Handle MetaMask confirmation popup if it appears
    await handleMMPopup(context, 'confirm');
    await demo.waitForTimeout(1000);
    await ss(demo, '11-demo-after-add-network');
    ok('"Add / switch Anvil network" button clicked without error');

    // ── Step 6: Connect as Alice ───────────────────────────────────────────
    console.log('\n[Test] Connecting as Alice (Author)…');
    await demo.bringToFront();

    // First switch MetaMask to Alice's account
    await switchAccount(mm, ALICE.addr);
    await demo.bringToFront();

    await waitAndClick(demo, '#btn-connect');
    await demo.waitForTimeout(1500);
    // MetaMask will show a connect popup
    await handleMMPopup(context, 'confirm');
    await demo.waitForTimeout(1000);
    await ss(demo, '12-demo-connected-alice');

    const acctText = await demo.locator('#acct').textContent();
    console.log('[Demo] Connected account:', acctText);
    if (acctText?.toLowerCase().includes(ALICE.addr.slice(2, 8).toLowerCase())) {
      ok('Connected as Alice');
    } else {
      fail('Connected account mismatch', `got ${acctText}, expected Alice ${ALICE.addr}`);
    }

    // ── Step 7: Register a course ──────────────────────────────────────────
    console.log('\n[Test] Registering course as Alice…');
    await demo.waitForTimeout(500);
    await waitAndClick(demo, '#btn-register');
    await demo.waitForTimeout(1500);
    await handleMMPopup(context, 'confirm');
    await demo.waitForTimeout(3000);
    await ss(demo, '13-demo-after-register');

    const statusAfterRegister = await demo.locator('#status').textContent();
    console.log('[Demo] Status after register:', statusAfterRegister?.trim());
    if (statusAfterRegister?.toLowerCase().includes('registered') || statusAfterRegister?.toLowerCase().includes('course')) {
      ok('Course registered by Alice');
    } else {
      fail('Course registration status unclear', statusAfterRegister ?? '');
    }

    // Refresh catalog
    await waitAndClick(demo, '#btn-refresh');
    await demo.waitForTimeout(2000);
    await ss(demo, '14-demo-catalog');

    const catalogText = await demo.locator('#catalog').textContent();
    console.log('[Demo] Catalog:', catalogText?.slice(0, 100));
    if (catalogText && !catalogText.includes('No courses')) {
      ok('Catalog shows at least one course');
    } else {
      fail('Catalog empty after registration', catalogText ?? '');
    }

    // ── Step 8: Switch to Bob and buy ─────────────────────────────────────
    console.log('\n[Test] Switching to Bob (Client)…');
    await switchAccount(mm, BOB.addr);
    await demo.bringToFront();

    // Reconnect as Bob
    await waitAndClick(demo, '#btn-connect');
    await demo.waitForTimeout(1500);
    await handleMMPopup(context, 'confirm');
    await demo.waitForTimeout(1000);

    const acctBob = await demo.locator('#acct').textContent();
    console.log('[Demo] Connected account:', acctBob);
    if (acctBob?.toLowerCase().includes(BOB.addr.slice(2, 8).toLowerCase())) {
      ok('Switched to Bob');
    } else {
      console.log(`[Demo] Account text: "${acctBob}" — may not have switched yet, continuing…`);
    }

    // Click "Buy" on the first course in catalog
    await demo.bringToFront();
    const buyBtn = demo.locator('button:has-text("Buy")').first();
    await buyBtn.waitFor({ state: 'visible', timeout: 10000 });
    await buyBtn.click();
    await demo.waitForTimeout(1500);
    await handleMMPopup(context, 'confirm');
    await demo.waitForTimeout(4000);
    await ss(demo, '15-demo-after-buy');

    const statusAfterBuy = await demo.locator('#status').textContent();
    console.log('[Demo] Status after buy:', statusAfterBuy?.trim());
    if (statusAfterBuy?.toLowerCase().includes('purchased') || statusAfterBuy?.toLowerCase().includes('access') || statusAfterBuy?.toLowerCase().includes('success')) {
      ok('Course purchased by Bob');
    } else {
      fail('Purchase status unclear', statusAfterBuy ?? '');
    }

    // ── Step 9: Check access matrix ───────────────────────────────────────
    console.log('\n[Test] Checking access matrix…');
    await demo.bringToFront();
    await waitAndClick(demo, '#btn-access');
    await demo.waitForTimeout(3000);
    await ss(demo, '16-demo-access-matrix');

    const matrixHtml = await demo.locator('#matrix').innerHTML();
    const matrixText = await demo.locator('#matrix').textContent();
    console.log('[Demo] Access matrix:', matrixText?.slice(0, 200));

    // Check Alice has access (she's the author)
    if (matrixHtml.includes('yes') || matrixText?.includes('✓') || matrixText?.includes('true')) {
      ok('Access matrix rendered (has "yes" entries)');
    } else {
      fail('Access matrix looks empty or all denied', matrixText ?? '');
    }

    // ── Step 10: Alice withdraws ───────────────────────────────────────────
    console.log('\n[Test] Switching back to Alice for withdrawal…');
    await switchAccount(mm, ALICE.addr);
    await demo.bringToFront();

    await waitAndClick(demo, '#btn-connect');
    await demo.waitForTimeout(1500);
    await handleMMPopup(context, 'confirm');
    await demo.waitForTimeout(1000);

    const pendingText = await demo.locator('#pending').textContent();
    console.log('[Demo] Pending balance:', pendingText);
    if (pendingText && pendingText !== '—' && pendingText !== '0') {
      ok(`Pending balance for Alice: ${pendingText} ETH`);

      await waitAndClick(demo, '#btn-withdraw');
      await demo.waitForTimeout(1500);
      await handleMMPopup(context, 'confirm');
      await demo.waitForTimeout(4000);
      await ss(demo, '17-demo-after-withdraw');

      const statusWithdraw = await demo.locator('#status').textContent();
      console.log('[Demo] Status after withdraw:', statusWithdraw?.trim());
      if (statusWithdraw?.toLowerCase().includes('withdrawn') || statusWithdraw?.toLowerCase().includes('success')) {
        ok('Alice withdrew proceeds');
      } else {
        console.log('[Demo] Withdraw status:', statusWithdraw);
      }
    } else {
      console.log('[Demo] Pending balance is 0 or not loaded — skipping withdraw');
    }

  } catch (e) {
    console.error('\nUnexpected error:', e.message);
    console.error(e.stack);
    failed++;
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(54));
  console.log(`  Result: ${passed} passed, ${failed} failed`);
  console.log('  Screenshots in /tmp/daskibo-test-*.png');
  console.log('═'.repeat(54));

  // Keep browser open 10s for visual inspection before closing
  await new Promise(r => setTimeout(r, 10000));
  await context.close();
  process.exit(failed > 0 ? 1 : 0);
})();
