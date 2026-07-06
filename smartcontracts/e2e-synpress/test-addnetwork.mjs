#!/usr/bin/env node
/**
 * Regression test for the MetaMask 13.24.0 route-based addNetwork() helper.
 *
 * Requires the debug Chrome (start-chrome-dev.sh) on :9222 with MetaMask unlocked.
 * Self-contained: spins a throwaway Anvil (chainId 1234) on :9546, adds it via
 * addNetwork(), asserts it appears in the network popover, then deletes it.
 * Also exercises idempotency against the always-present Daskibo Anvil (31337).
 *
 *   node test-addnetwork.mjs
 */
import { spawn } from 'node:child_process';
import { openMetaMask, unlock, addNetwork } from '../../.claude/skills/metamask-devtools/scripts/metamask-control.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const PASSWORD = process.env.METAMASK_PASSWORD ?? '1234567890';
const PROBE = { name: 'Anvil Probe 1234', rpcUrl: 'http://localhost:9546', chainId: 1234, symbol: 'ETH' };
let fails = 0;
const ok = m => console.log(`  ✓ ${m}`);
const bad = m => { console.log(`  ✗ ${m}`); fails++; };

const anvil = spawn('anvil', ['--port', '9546', '--chain-id', '1234'], { stdio: 'ignore' });
await sleep(2000);

const mm = await openMetaMask();
const { run } = mm;
try {
  await unlock(mm, PASSWORD);

  const present = async (chainId) => {
    await run(`window.location.hash='#/'`); await sleep(700);
    await run(`document.querySelector('[data-testid="sort-by-networks"]')?.click()`); await sleep(700);
    const p = await run(`!!document.querySelector('[data-testid="network-list-item-eip155:${chainId}"]')`);
    await run(`document.querySelector('[data-testid="modal-header-close-button"]')?.click()`); await sleep(300);
    return p;
  };

  console.log('\n━━ addNetwork() — MetaMask 13.24.0 ━━');

  // 1) idempotency: Daskibo Anvil (31337) already exists → must skip, not throw
  await addNetwork(mm, { name: 'Daskibo Local Anvil', rpcUrl: 'http://localhost:9545', chainId: 31337, symbol: 'tBNB' });
  ok('idempotent skip on existing chainId 31337');

  // 2) full add path on an absent network
  if (await present(1234)) bad('probe net 1234 unexpectedly already present');
  await addNetwork(mm, PROBE);
  (await present(1234)) ? ok('added absent network (chainId 1234) — present in popover') : bad('network 1234 not present after add');

  // 3) cleanup: switch off the probe net, then delete it (delete is blocked on the active net)
  await run(`window.location.hash='#/'`); await sleep(600);
  await run(`document.querySelector('[data-testid="sort-by-networks"]')?.click()`); await sleep(700);
  await run(`document.querySelector('[data-testid="network-list-item-eip155:31337"]')?.click()`); await sleep(900);
  await run(`document.querySelector('[data-testid="sort-by-networks"]')?.click()`); await sleep(700);
  await run(`document.querySelector('[data-testid="network-list-item-options-button-eip155:1234"]')?.click()`); await sleep(600);
  await run(`(()=>{const b=document.querySelector('[data-testid="network-list-item-options-delete"]')||[...document.querySelectorAll('button,div[role=button]')].find(x=>/^delete$/i.test((x.innerText||'').trim()));b&&b.click();})()`); await sleep(700);
  await run(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^delete$/i.test((x.innerText||'').trim()));b&&b.click();})()`); await sleep(900);
  await run(`document.querySelector('[data-testid="modal-header-close-button"]')?.click()`); await sleep(300);
  (await present(1234)) ? bad('probe net still present after delete') : ok('cleanup deleted probe net');
} catch (e) {
  bad(`threw: ${e.message}`);
} finally {
  mm.close();
  anvil.kill();
}

console.log(fails === 0 ? '\n━━ addNetwork OK ━━' : `\n━━ addNetwork FAILED — ${fails} ━━`);
process.exit(fails === 0 ? 0 : 1);
