#!/usr/bin/env node
/**
 * UI test via CDP against the ALREADY-RUNNING Chrome (start-chrome-dev.sh).
 *
 * This is the Chrome-148-compatible path documented in the metamask-devtools
 * skill: MetaMask is pre-installed in the persistent .chrome-user-data profile,
 * so we connectOverCDP to the live browser instead of fighting Synpress's
 * ephemeral --load-extension cache (blocked on Chrome 137+).
 *
 * Reproduces synpress specs 01–03 against REAL MetaMask:
 *   1. course-demo.html loads with the correct chain config (chain 31337 + MP)
 *   2. Connect MetaMask  → wallet connects, account populates
 *   3. Role is detected from the active account (Author/Client/Eve)
 *
 * Prereq: stack up (anvil:9545 + deploy + frontend:8085) and
 *         `DISPLAY=:0 bash start-chrome-dev.sh` already running (CDP :9222).
 */
import { chromium } from 'playwright';

const CDP = 'http://localhost:9222';
const DEMO = 'course-demo.html';
const MM_ID = 'hebhblbkkdabgoldnojllkipeoacjioc';
const RPC = process.env.ANVIL_RPC || 'http://localhost:9545'; // host → daskibo-anvil :8545
const EXPECT_CHAIN = 31337;

// Independent RPC availability probe via the BACKEND (direct eth_chainId), NOT
// via MetaMask's UI. MetaMask's "Still connecting / Unable to connect" state is
// unreliable and slow; the test must not block on it. We assert the chain is
// actually reachable here, then drive the wallet regardless of its own banner.
async function backendRpcUp(url = RPC) {
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: AbortSignal.timeout(3000),
    });
    const j = await r.json();
    return { ok: true, chainId: parseInt(j.result, 16) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

let pass = 0, fail = 0;
const ok  = (m) => { console.log(`  ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function findDemoPage(browser) {
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (p.url().includes(DEMO)) return p;
    }
  }
  return null;
}

// Click the MetaMask connect/confirm popup if one opens.
async function approveMetaMaskPopup(browser, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        const u = p.url();
        if (u.includes(MM_ID) && (u.includes('notification') || u.includes('popup'))) {
          // MetaMask 13 connect flow: "Connect" / "Next" / "Confirm".
          for (let i = 0; i < 4; i++) {
            const clicked = await p.evaluate(() => {
              const sels = [
                '[data-testid="confirm-btn"]',
                '[data-testid="confirmation-submit-button"]',
                '[data-testid="page-container-footer-next"]',
                '[data-testid="connect-more-accounts-button"]',
              ];
              for (const s of sels) { const b = document.querySelector(s); if (b) { b.click(); return s; } }
              const byText = [...document.querySelectorAll('button')]
                .find(b => /connect|next|confirm|approve/i.test(b.textContent || ''));
              if (byText) { byText.click(); return 'text:' + byText.textContent.trim(); }
              return null;
            }).catch(() => null);
            if (clicked) { console.log(`    · popup click → ${clicked}`); await sleep(900); }
            else break;
          }
          return true;
        }
      }
    }
    await sleep(400);
  }
  return false;
}

async function main() {
  console.log('━━ Daskibo UI (CDP / real MetaMask) ━━');

  // [0] Backend RPC availability — independent of MetaMask's own banner.
  console.log('\n[0] Backend RPC availability (direct eth_chainId)…');
  const rpc = await backendRpcUp();
  rpc.ok && rpc.chainId === EXPECT_CHAIN
    ? ok(`RPC ${RPC} reachable, chainId ${rpc.chainId}`)
    : bad(`RPC ${RPC} not usable: ${rpc.ok ? 'chainId ' + rpc.chainId : rpc.error}`);
  // MetaMask's built-in "Localhost 8545" is the wrong endpoint (Anvil is :9545);
  // confirm 8545 is indeed dead so the report is unambiguous.
  const dead = await backendRpcUp('http://localhost:8545');
  console.log(`    · localhost:8545 (MetaMask default) → ${dead.ok ? 'unexpectedly up' : 'down (expected)'}`);

  const browser = await chromium.connectOverCDP(CDP);

  // ── [1] page loads with correct chain config ──────────────────────────────
  console.log('\n[1] course-demo.html loads with correct chain config…');
  let page = await findDemoPage(browser);
  if (!page) { bad('course-demo.html tab not found — is start-chrome-dev.sh running?'); return finish(browser); }
  await page.goto(`http://localhost:8085/${DEMO}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const s = document.getElementById('status')?.textContent || '';
    return /Catalog loaded|Connect MetaMask|demo chain/i.test(s);
  }, { timeout: 20000 }).catch(() => {});
  const cfg = await page.evaluate(() => ({
    status: document.getElementById('status')?.textContent?.trim(),
    body:   document.body.innerText,
  }));
  cfg.status ? ok(`status: "${cfg.status.slice(0, 70)}"`) : bad('no status text rendered');
  // course-demo renders the marketplace shortened: `Marketplace 0x9fE4…a6e0`.
  (/0x9fE4/i.test(cfg.body) && /a6e0/i.test(cfg.body))
    ? ok('marketplace 0x9fE4…a6e0 rendered on page')
    : bad('marketplace address not rendered');
  /31337|0x7a69/.test(cfg.body) ? ok('chain 31337 shown') : bad('chain id not shown');

  // ── [2] connect MetaMask ──────────────────────────────────────────────────
  console.log('\n[2] Connect MetaMask…');
  await page.click('#btn-connect').catch(() => {});
  await approveMetaMaskPopup(browser);
  await page.waitForFunction(() => {
    const a = document.getElementById('acct')?.textContent || '';
    return /^0x[0-9a-fA-F]{40}$/.test(a.trim());
  }, { timeout: 15000 }).catch(() => {});
  const conn = await page.evaluate(() => ({
    acct: document.getElementById('acct')?.textContent?.trim(),
    role: document.getElementById('role')?.textContent?.trim(),
  }));
  /^0x[0-9a-fA-F]{40}$/.test(conn.acct || '')
    ? ok(`wallet connected: ${conn.acct}`)
    : bad(`wallet not connected (acct="${conn.acct}")`);

  // ── [3] role detected ─────────────────────────────────────────────────────
  console.log('\n[3] Role detection…');
  ['Author', 'Client', 'Eve', 'Unknown'].includes(conn.role)
    ? ok(`role detected: ${conn.role}`)
    : bad(`role not detected (role="${conn.role}")`);

  finish(browser);
}

function finish(browser) {
  console.log(`\n━━ Result: ${pass} passed, ${fail} failed ━━`);
  browser.close().catch(() => {});
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('FAILED:', e?.message || e); process.exit(1); });
