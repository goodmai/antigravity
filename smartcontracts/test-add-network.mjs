#!/usr/bin/env node
/**
 * Playwright test: validates that the "Add / switch Anvil network" button
 * sends the correct wallet_addEthereumChain parameters.
 *
 * Mocks window.ethereum so no MetaMask extension is needed.
 * Run: node test-add-network.mjs
 */
import { chromium } from 'playwright';

const FRONTEND = 'http://localhost:8085/course-demo.html';

const EXPECTED = {
  chainId:       '0x7a69',        // 31337
  chainName:     'Daskibo Local Anvil',
  symbol:        'tBNB',
  rpcUrl:        'http://localhost:9545',
};

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓  ${label}: ${actual}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}: expected "${expected}", got "${actual}"`);
    failed++;
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page    = await context.newPage();

  // Capture console errors from the page
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('[page error]', msg.text());
  });

  // Inject window.ethereum mock BEFORE the page script loads
  await page.addInitScript(() => {
    window.__capturedRequests = [];
    window.ethereum = {
      isMetaMask: true,
      request({ method, params }) {
        window.__capturedRequests.push({ method, params });
        if (method === 'eth_requestAccounts')
          return Promise.resolve(['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266']);
        if (method === 'eth_chainId')
          return Promise.resolve('0x7a69');
        if (method === 'wallet_addEthereumChain')
          return Promise.resolve(null);
        if (method === 'wallet_switchEthereumChain')
          return Promise.resolve(null);
        return Promise.resolve(null);
      },
      on() {},
      removeListener() {},
    };
  });

  await page.goto(FRONTEND, { waitUntil: 'domcontentloaded' });

  // Wait for the JS to wire up event handlers
  await page.waitForTimeout(1000);

  // Click the "Add / switch Anvil network" button
  const btn = page.locator('#btn-network');
  await btn.waitFor({ state: 'visible', timeout: 5000 });
  await btn.click();

  // Give the async handler time to run
  await page.waitForTimeout(500);

  // Pull captured requests out of the page context
  const reqs = await page.evaluate(() => window.__capturedRequests);

  console.log('\n=== wallet_addEthereumChain test ===');
  console.log('All intercepted ethereum.request calls:',
    reqs.map(r => r.method).join(', ') || '(none)');

  const addReq = reqs.find(r => r.method === 'wallet_addEthereumChain');
  if (!addReq) {
    console.error('\n✗  wallet_addEthereumChain was never called!');
    console.error('   Intercepted methods:', reqs.map(r => r.method));
    failed++;
  } else {
    const p = addReq.params[0];
    console.log('\nParameters sent:');
    assert('chainId',   p.chainId,                           EXPECTED.chainId);
    assert('chainName', p.chainName,                         EXPECTED.chainName);
    assert('symbol',    p.nativeCurrency?.symbol,            EXPECTED.symbol);
    assert('rpcUrl',    p.rpcUrls?.[0],                      EXPECTED.rpcUrl);
  }

  // Also verify the Connect button triggers eth_requestAccounts
  console.log('\n=== eth_requestAccounts test ===');
  await page.evaluate(() => { window.__capturedRequests = []; });
  await page.locator('#btn-connect').click();
  await page.waitForTimeout(500);
  const reqs2 = await page.evaluate(() => window.__capturedRequests);
  const connectReq = reqs2.find(r => r.method === 'eth_requestAccounts');
  if (connectReq) {
    console.log('  ✓  eth_requestAccounts called');
    passed++;
  } else {
    console.error('  ✗  eth_requestAccounts not called (methods:', reqs2.map(r => r.method).join(', '), ')');
    failed++;
  }

  await browser.close();

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Result: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
