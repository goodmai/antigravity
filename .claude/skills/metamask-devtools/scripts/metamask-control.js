#!/usr/bin/env node
// `ws` is only needed by the raw-WebSocket CLI path (openMetaMask). Import it
// lazily so consumers that just use the exported CDP helpers (which receive a
// `run` fn — e.g. build-cache.mjs / daskibo.setup.ts driving MetaMask through
// Playwright's CDP session) don't need `ws` on their module resolution path.
import * as path from 'path';

const MM_ID = process.env.METAMASK_EXT_ID ?? 'hebhblbkkdabgoldnojllkipeoacjioc';
const CDP = 'http://127.0.0.1:9222';

async function openMetaMask() {
  const { default: WebSocket } = await import('ws');
  const tabs = await fetch(`${CDP}/json`).then(r => r.json());
  let mm = tabs.find(t => t.url?.startsWith(`chrome-extension://${MM_ID}/home.html`));

  if (!mm) {
    const { webSocketDebuggerUrl: bws } = await fetch(`${CDP}/json/version`).then(r => r.json());
    const bwsConn = new WebSocket(bws);
    await new Promise(r => bwsConn.on('open', r));
    bwsConn.send(JSON.stringify({ id: 1, method: 'Target.createTarget',
      params: { url: `chrome-extension://${MM_ID}/home.html` } }));
    await new Promise(r => bwsConn.on('message', m => { if(JSON.parse(m).id===1) r(); }));
    bwsConn.close();
    await new Promise(r => setTimeout(r, 1500));
    const tabs2 = await fetch(`${CDP}/json`).then(r => r.json());
    mm = tabs2.find(t => t.url?.startsWith(`chrome-extension://${MM_ID}/home.html`));
  }

  if (!mm) throw new Error("Could not find or open MetaMask tab. Make sure Chrome is running with correct flags.");

  const ws = new WebSocket(mm.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let msgId = 100;
  async function run(expression) {
    const id = ++msgId;
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true } }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP timeout for: ' + expression.slice(0, 50))), 3000);
      const h = m => {
        const d = JSON.parse(m.toString());
        if (d.id !== id) return;
        clearTimeout(timer);
        ws.off('message', h);
        if (d.result?.exceptionDetails) reject(new Error(d.result.exceptionDetails.exception?.description || d.result.exceptionDetails.text));
        else resolve(d.result?.result?.value);
      };
      ws.on('message', h);
    });
  }
  return { ws, run, close: () => ws.close() };
}

async function unlock(mm, password) {
  const { run } = mm;
  const isLocked = await run(`!!document.querySelector('[data-testid="unlock-password"]')`);
  if (isLocked) {
    await run(`{
      const inp = document.querySelector('[data-testid="unlock-password"]');
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(inp), 'value').set;
      setter.call(inp, '${password}');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }`);
    await new Promise(r => setTimeout(r, 300));
    await run(`document.querySelector('[data-testid="unlock-submit"]').click()`);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Unlocked successfully.');
  } else {
    console.log('Already unlocked.');
  }
}

// Set a React-controlled input's value via the native setter + input event.
// MetaMask 13.x ignores a plain `.value =` assignment (React owns the state).
// NOTE: this build ships LavaMoat in *scuttling* mode, which makes the GLOBAL
// `HTMLInputElement` inaccessible. Reach the prototype via Object.getPrototypeOf(inp)
// instead (LavaMoat does not scuttle the element's own prototype chain).
async function setReactInput(run, selector, value) {
  return run(`(() => {
    let inp = document.querySelector('${selector}');
    if (!inp) return 'not-found';
    // The testid may sit on a wrapper div; reach the real <input>/<textarea>.
    if (inp.tagName !== 'INPUT' && inp.tagName !== 'TEXTAREA')
      inp = inp.querySelector('input, textarea') || inp;
    // Find the native value setter by walking the prototype chain (LavaMoat
    // scuttles the global HTMLInputElement, but the chain itself is intact).
    let proto = Object.getPrototypeOf(inp), desc;
    while (proto && !((desc = Object.getOwnPropertyDescriptor(proto, 'value')) && desc.set))
      proto = Object.getPrototypeOf(proto);
    if (!desc || !desc.set) return 'no-setter';
    const setter = desc.set;
    setter.call(inp, '');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    setter.call(inp, ${JSON.stringify(String(value))});
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    inp.dispatchEvent(new Event('blur', { bubbles: true }));
    return 'ok';
  })()`);
}

/**
 * Drive MetaMask's post-import onboarding completion screens ("Your wallet is
 * ready!" → Done, then the "Pin the extension" popover) until the home page
 * (account-menu-icon) is reachable. Synpress 0.0.14's importWallet stops before
 * these. Idempotent + tolerant of ordering; safe to call when already home.
 */
async function completeOnboarding(mm) {
  const { run } = mm;
  const onHome = () => run(`!!document.querySelector('[data-testid="account-menu-icon"]')`);
  const clickTid = (tid) => run(`(()=>{const b=document.querySelector('[data-testid="${tid}"]');if(b){b.click();return true}return false})()`).catch(() => false);
  if (await onHome()) return;
  for (const tid of ['onboarding-complete-done', 'pin-extension-next', 'pin-extension-done']) {
    await clickTid(tid);
    await new Promise(r => setTimeout(r, 800));
  }
  // Give the background time, then force-route home if it didn't navigate itself.
  for (let i = 0; i < 12 && !(await onHome()); i++) {
    if (i === 4) await run(`window.location.hash = '#/'`);
    await new Promise(r => setTimeout(r, 700));
  }
  if (!(await onHome())) throw new Error('completeOnboarding: never reached home');
  console.log('Onboarding completed — home reached.');
}

// Click a button/anchor whose visible text matches `re` (case-insensitive).
async function clickByText(run, re) {
  return run(`(() => {
    const b = [...document.querySelectorAll('button, a[role=button], a')]
      .find(x => /${re}/i.test((x.innerText || '').trim()));
    if (b) { b.click(); return (b.innerText || '').trim(); }
    return null;
  })()`);
}

/**
 * Add a custom network to MetaMask 13.24.0.
 *
 * Why not Synpress's MetaMask.addNetwork()? It clicks `[data-testid="network-display"]`
 * (gone in 13.24.0 — the home button is now `sort-by-networks`) and uses the legacy
 * single-page network form. Worse, the modern entry point — the network menu's
 * "Add custom network" button — CRASHES this build into MetaMask's React error
 * boundary ("MetaMask encountered an error"). The SAME form reached directly via the
 * route `#/settings/networks/add-network` renders fine, so we navigate there instead.
 *
 * Flow (13.24.0): route → name → RPC sub-modal (Add RPC URL → url+name → Add URL)
 * → chainId → ticker → Save. Idempotent: skips if a network with this chainId exists.
 */
async function addNetwork(mm, { name, rpcUrl, chainId, symbol }) {
  const { run } = mm;
  const chainHex = '0x' + Number(chainId).toString(16);

  // Idempotency: the network popover reliably exposes each network by chainId as
  // `network-list-item-eip155:<id>`. Detect + bail if it already exists.
  await run(`window.location.hash = '#/'`); await new Promise(r => setTimeout(r, 700));
  await run(`document.querySelector('[data-testid="sort-by-networks"]')?.click()`);
  await new Promise(r => setTimeout(r, 800));
  const exists = await run(`!!document.querySelector('[data-testid="network-list-item-eip155:${chainId}"]')`);
  await run(`document.querySelector('[data-testid="modal-header-close-button"]')?.click()`);
  await new Promise(r => setTimeout(r, 400));
  if (exists) { console.log(`Network chainId ${chainId} already present — skipping add.`); return; }

  // The network menu's "Add custom network" button CRASHES this build into the
  // React error boundary; the same form renders fine at the route below. Reset to
  // home first so any half-open menu/modal is torn down, then route in and poll.
  await run(`window.location.hash = '#/'`); await new Promise(r => setTimeout(r, 600));
  await run(`document.querySelector('[data-testid="modal-header-close-button"]')?.click()`);
  await new Promise(r => setTimeout(r, 300));
  let formReady = false;
  for (let i = 0; i < 16 && !formReady; i++) {
    if (i % 4 === 0) await run(`window.location.hash = '#/settings/networks/add-network'`);
    await new Promise(r => setTimeout(r, 500));
    formReady = await run(`!!document.querySelector('[data-testid="network-form-network-name"]')`);
  }
  if (!formReady) throw new Error('add-network form did not render');

  // Field testids sit on the <input> itself for these three (the *-input ones
  // are wrapper divs); setReactInput also drills into a wrapper as a fallback.
  await setReactInput(run, '[data-testid="network-form-network-name"]', name);

  // RPC URL lives in a sub-modal behind the "Add a URL" dropdown.
  await run(`document.querySelector('[data-testid="test-add-rpc-drop-down"]')?.click()`);
  await new Promise(r => setTimeout(r, 700));
  await clickByText(run, 'add rpc url');
  await new Promise(r => setTimeout(r, 700));
  await setReactInput(run, '[data-testid="rpc-url-input-test"]', rpcUrl);
  await setReactInput(run, '[data-testid="rpc-name-input-test"]', name);
  await new Promise(r => setTimeout(r, 300));
  await clickByText(run, '^add url$');
  await new Promise(r => setTimeout(r, 800));

  await setReactInput(run, '[data-testid="network-form-chain-id"]', String(chainId));
  await setReactInput(run, '[data-testid="network-form-ticker-input"]', symbol);
  await new Promise(r => setTimeout(r, 600));

  // Surface a blocking form error (chainId mismatch / dup) instead of silently failing.
  const formErr = await run(`(() => {
    const e = [...document.querySelectorAll('.mm-help-text, .mm-form-text-field__help-text, [class*="error"]')]
      .map(x => (x.innerText||'').trim()).filter(Boolean);
    return e.join(' | ').slice(0, 200);
  })()`);

  // A duplicate chainId is reported inline before Save even fires — treat as present.
  if (/already (used|exists|added)|chain id.*used|same chain id/i.test(formErr)) {
    console.log(`Network chainId ${chainId} already present — skipping (form: "${formErr}").`);
    await run(`window.location.hash = '#/'`); await new Promise(r => setTimeout(r, 400));
    return;
  }

  const saved = await clickByText(run, '^save$');
  await new Promise(r => setTimeout(r, 1500));
  const stillOnForm = await run(`!!document.querySelector('[data-testid="network-form-network-name"]')`);
  if (stillOnForm) throw new Error(`Save did not dismiss the form (button="${saved}", formErr="${formErr}")`);
  console.log(`Added network "${name}" (chainId ${chainId} / ${chainHex}, RPC ${rpcUrl}).`);
}

async function renameCurrentAccount(mm, name) {
  const { run } = mm;
  await run(`document.querySelector('[data-testid="account-options-menu-button"]')?.click()`);
  await new Promise(r => setTimeout(r, 400));
  await run(`{
    const items = Array.from(document.querySelectorAll('[data-testid="account-list-menu-details"]'));
    if (items[0]) items[0].click();
  }`);
  await new Promise(r => setTimeout(r, 400));
  await run(`document.querySelector('[data-testid="editable-label-button"]')?.click()`);
  await new Promise(r => setTimeout(r, 300));
  await run(`{
    const inp = document.querySelector('[data-testid="editable-input"]');
    if (inp) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(inp), 'value').set;
      setter.call(inp, '');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(inp, '${name}');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }`);
  await new Promise(r => setTimeout(r, 200));
  await run(`document.querySelector('[data-testid="editable-label-button"]')?.click()`);
  await new Promise(r => setTimeout(r, 400));
  await run(`document.querySelector('[data-testid="account-details-close"]')?.click()`);
  console.log(`Renamed account to: ${name}`);
}

// Import a private-key account. MetaMask 13.24.0 restructured the account list
// into a "wallet tree": account-menu → "Add wallet" (`account-list-add-wallet-button`)
// → modal `add-wallet-modal-import-account` → `private-key-box` → confirm. (The old
// `multichain-account-menu-popover-add-account/-add-imported` testids are gone.)
async function importAccount(mm, privateKey, name) {
  const { run } = mm;
  await run(`window.location.hash = '#/'`); await new Promise(r => setTimeout(r, 900));
  await run(`document.querySelector('[data-testid="account-menu-icon"]')?.click()`);
  await new Promise(r => setTimeout(r, 700));
  await run(`document.querySelector('[data-testid="account-list-add-wallet-button"]')?.click()`);
  await new Promise(r => setTimeout(r, 700));
  if (!(await run(`!!document.querySelector('[data-testid="add-wallet-modal-import-account"]')`)))
    throw new Error('import: add-wallet modal did not open');
  await run(`document.querySelector('[data-testid="add-wallet-modal-import-account"]')?.click()`);
  // The private-key form renders after a modal animation — poll for it, re-clicking
  // the import-account entry if a transient modal state swallowed the first click.
  let keyBox = false;
  for (let i = 0; i < 16 && !keyBox; i++) {
    await new Promise(r => setTimeout(r, 500));
    keyBox = await run(`!!document.querySelector('#private-key-box')`);
    if (!keyBox && i === 6) await run(`document.querySelector('[data-testid="add-wallet-modal-import-account"]')?.click()`);
  }
  if (!keyBox) {
    const present = await run(`[...document.querySelectorAll('[data-testid]')].map(e=>e.getAttribute('data-testid')).filter(t=>/import|wallet|account|key|modal|srp/i.test(t)).slice(0,20).join(' | ')`);
    const inputs = await run(`[...document.querySelectorAll('input,textarea,select')].map(i=>(i.getAttribute('data-testid')||i.id||i.placeholder||i.name||i.type||'?')+'['+i.type+']').join(' | ')`);
    throw new Error(`import: private-key-box did not render. Present: ${present}. Inputs: ${inputs}`);
  }
  await setReactInput(run, '#private-key-box', privateKey);
  await new Promise(r => setTimeout(r, 500));
  // The Import button is disabled until the key validates; wait for it to enable.
  for (let i = 0; i < 8; i++) {
    if (!(await run(`(document.querySelector('[data-testid="import-account-confirm-button"]')||{}).disabled`))) break;
    await new Promise(r => setTimeout(r, 400));
  }
  await run(`document.querySelector('[data-testid="import-account-confirm-button"]')?.click()`);
  await new Promise(r => setTimeout(r, 1500));
  if (await run(`!!document.querySelector('#private-key-box')`))
    throw new Error('import: still on the import form after confirm (invalid key or disabled button)');

  if (name) {
    await renameCurrentAccount(mm, name);
  } else {
    console.log(`Imported account successfully.`);
  }
}

// Select an already-added network by chainId via the network popover.
async function switchNetwork(mm, chainId) {
  const { run } = mm;
  await run(`window.location.hash = '#/'`); await new Promise(r => setTimeout(r, 600));
  await run(`document.querySelector('[data-testid="sort-by-networks"]')?.click()`);
  await new Promise(r => setTimeout(r, 800));
  const clicked = await run(`(()=>{const el=document.querySelector('[data-testid="network-list-item-eip155:${chainId}"]');if(el){el.click();return true}return false})()`);
  await new Promise(r => setTimeout(r, 900));
  await run(`document.querySelector('[data-testid="modal-header-close-button"]')?.click()`);
  await new Promise(r => setTimeout(r, 300));
  if (!clicked) throw new Error(`switchNetwork: chainId ${chainId} not in the network list`);
  console.log(`Switched to network chainId ${chainId}.`);
}

// Switch the active account. `query` matches a 13.24.0 account cell
// (`multichain-account-cell-*`) by its testid (which contains the address for
// imported keys) OR its visible text (account name) — case-insensitive substring.
// Match by ADDRESS for reliability: custom renames don't always stick, so cells
// often read "Imported Account N" while the testid always carries the address.
async function switchAccount(mm, query) {
  const { run } = mm;
  const q = String(query).toLowerCase();
  await run(`window.location.hash = '#/'`); await new Promise(r => setTimeout(r, 800));
  // Open the account menu and poll until the cells render (they can lazy-load).
  let clicked = null, seen = '';
  for (let i = 0; i < 10 && !clicked; i++) {
    if (i % 3 === 0) await run(`document.querySelector('[data-testid="account-menu-icon"]')?.click()`);
    await new Promise(r => setTimeout(r, 600));
    const res = await run(`(()=>{
      const cells = [...document.querySelectorAll('[data-testid^="multichain-account-cell-"]')]
        .filter(c => /(entropy|keyring)/.test(c.getAttribute('data-testid')||''));
      const target = cells.find(c =>
        (c.getAttribute('data-testid')||'').toLowerCase().includes(${JSON.stringify(q)}) ||
        (c.innerText||'').toLowerCase().includes(${JSON.stringify(q)}));
      if (target) { target.click(); return {clicked: (target.innerText||'').split('\\n')[0]}; }
      return {seen: cells.map(c=>c.getAttribute('data-testid')).join(' | ')};
    })()`);
    if (res && res.clicked) clicked = res.clicked; else if (res) seen = res.seen;
  }
  await new Promise(r => setTimeout(r, 700));
  await run(`document.querySelector('[data-testid="modal-header-close-button"]')?.click()`);
  await new Promise(r => setTimeout(r, 300));
  if (!clicked) throw new Error(`switchAccount: no account cell matches "${query}". Cells seen: ${seen}`);
  console.log(`Switched to account: ${clicked} (matched "${query}")`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help') {
    console.log(`
Usage: metamask-control.js <command> [options]
Commands:
  unlock --password <pwd>
  import --key <privateKey> [--name <accountName>]
  rename --name <accountName>
  switch-account --name <nameOrAddress>
  add-network --name <name> --rpc <url> --chainId <id> --symbol <sym>
    `);
    process.exit(0);
  }

  const mm = await openMetaMask();
  
  try {
    if (command === 'unlock') {
      const pwdIndex = args.indexOf('--password');
      if (pwdIndex === -1 || !args[pwdIndex + 1]) throw new Error("Missing --password");
      await unlock(mm, args[pwdIndex + 1]);
    } else if (command === 'import') {
      const keyIndex = args.indexOf('--key');
      const nameIndex = args.indexOf('--name');
      if (keyIndex === -1 || !args[keyIndex + 1]) throw new Error("Missing --key");
      await importAccount(mm, args[keyIndex + 1], nameIndex !== -1 ? args[nameIndex + 1] : null);
    } else if (command === 'rename') {
      const nameIndex = args.indexOf('--name');
      if (nameIndex === -1 || !args[nameIndex + 1]) throw new Error("Missing --name");
      await renameCurrentAccount(mm, args[nameIndex + 1]);
    } else if (command === 'switch-account') {
      const nameIndex = args.indexOf('--name');
      if (nameIndex === -1 || !args[nameIndex + 1]) throw new Error("Missing --name");
      await switchAccount(mm, args[nameIndex + 1]);
    } else if (command === 'add-network') {
      const opt = (k) => { const i = args.indexOf(k); return i === -1 ? undefined : args[i + 1]; };
      const name = opt('--name'), rpc = opt('--rpc'), chainId = opt('--chainId'), symbol = opt('--symbol') ?? 'ETH';
      if (!name || !rpc || !chainId) throw new Error('Missing --name/--rpc/--chainId');
      await unlock(mm, process.env.METAMASK_PASSWORD ?? '1234567890');
      await addNetwork(mm, { name, rpcUrl: rpc, chainId: Number(chainId), symbol });
    } else {
      console.log(`Unknown command: ${command}`);
    }
  } catch (e) {
    console.error("Error executing command:", e.message);
  } finally {
    mm.close();
  }
}

export { openMetaMask, unlock, renameCurrentAccount, importAccount, switchAccount, switchNetwork, addNetwork, completeOnboarding, setReactInput, clickByText };

import { fileURLToPath } from 'url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(console.error);
}
