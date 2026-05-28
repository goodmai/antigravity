// Daskibo Academy — local Anvil course demo.
//
// All chain I/O is routed through MetaMask (window.ethereum): writes are sent
// by the connected account; reads use the same provider so no direct RPC fetch
// is needed (keeps the CSP tight). Deployed addresses + chain metadata are read
// from ./demo/addresses.json, written by the `demo-deploy` compose service.
import {
  BrowserProvider, JsonRpcProvider, Contract, parseEther, formatEther,
  keccak256, toUtf8Bytes, getAddress,
} from 'https://esm.sh/ethers@6.13.4';

// Standard Anvil dev accounts (public, well-known test keys — pre-funded with
// 10000 ETH on a fresh local chain). These are the demo's three personas.
const PERSONAS = [
  { role: 'Author', addr: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' }, // anvil #1
  { role: 'Client', addr: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' }, // anvil #2
  { role: 'Eve',    addr: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' }, // anvil #3
];

const MARKETPLACE_ABI = [
  'function nextCourseId() view returns (uint256)',
  'function courses(uint256) view returns (address author, uint96 price, bytes32 contentHash, string bucket, uint64 accessDuration, bool active)',
  'function hasCourseAccess(address,uint256) view returns (bool)',
  'function registerCourse(uint96 price, bytes32 contentHash, string bucket, uint64 accessDuration) returns (uint256)',
  'function purchase(uint256) payable',
  'function quote(uint256) view returns (uint256,uint256,uint256)',
  'function withdraw()',
  'function pendingWithdrawals(address) view returns (uint256)',
];

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
function setStatus(msg, state = 'ok') {
  statusEl.textContent = msg;
  statusEl.dataset.state = state;
}

let cfg = null;          // { chainId, chainIdHex, rpcUrl, marketplace, accessPass, ... }
let provider = null;     // BrowserProvider (writes / signer — MetaMask)
let read = null;         // JsonRpcProvider pinned to the demo chain (all reads)
let account = null;      // connected address
let nativeBal = 0n;      // connected account's native (ETH) balance, for affordability

// ── Boot: load deployed addresses + open a read-only provider on the demo chain
async function boot() {
  renderPersonas();
  try {
    const res = await fetch('./demo/addresses.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`addresses.json HTTP ${res.status}`);
    cfg = await res.json();
    // Reads always target the demo chain directly — independent of whichever
    // network MetaMask happens to have selected. `staticNetwork` avoids extra
    // chainId round-trips and "network changed" churn.
    read = new JsonRpcProvider(cfg.rpcUrl, cfg.chainId, { staticNetwork: true });
    $('net-line').innerHTML =
      `Chain <code>${cfg.chainId}</code> · RPC <code>${cfg.rpcUrl}</code> · ` +
      `Marketplace <code class="mono">${short(cfg.marketplace)}</code>`;
    setStatus('Catalog loaded from the demo chain. Connect MetaMask to register/buy.', 'ok');
    // The catalog + access matrix are public reads — show them before connecting.
    $('btn-refresh').disabled = false;
    $('btn-access').disabled = false;
    await refreshCatalog();
  } catch (e) {
    setStatus(
      'Could not reach the demo chain.\n' +
      'Is the stack up (./run_demo.sh) and is ' + (cfg ? cfg.rpcUrl : './demo/addresses.json') +
      ' reachable?\n' + e.message,
      'error',
    );
  }
}

function short(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : '—'; }

function renderPersonas() {
  $('who').innerHTML = PERSONAS.map((p) =>
    `<div class="line"><span class="pill" data-addr="${p.addr.toLowerCase()}">${p.role}</span>` +
    `<span class="mono">${short(p.addr)}</span></div>`).join('');
}

function roleOf(addr) {
  if (!addr) return '—';
  const hit = PERSONAS.find((p) => p.addr.toLowerCase() === addr.toLowerCase());
  return hit ? hit.role : 'Unknown';
}

// ── Connect / network ────────────────────────────────────────────────────────
async function connect() {
  if (!window.ethereum) { setStatus('MetaMask not found. Install it first.', 'error'); return; }
  try {
    const accts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    provider = new BrowserProvider(window.ethereum);
    account = getAddress(accts[0]);
    $('acct').textContent = account;
    const r = roleOf(account);
    $('role').textContent = r;
    $('role').className = 'pill' + (r !== 'Unknown' && r !== '—' ? ' me' : '');
    highlightMe();
    enableActions(true);
    // Reads already work (they go to the demo RPC); only writes need MetaMask on
    // the demo chain — offer to switch now so register/buy are one click later.
    const net = await provider.getNetwork();
    if (cfg && Number(net.chainId) !== Number(cfg.chainId)) {
      setStatus(`Connected as ${r} (${short(account)}). MetaMask is on chain ${net.chainId}; ` +
        `switching to the demo chain ${cfg.chainId}…`, 'ok');
      await ensureChain();
    } else {
      setStatus(`Connected as ${r} (${short(account)}) on the demo chain ${cfg.chainId}.`, 'ok');
    }
    await refreshWallet();
    await refreshCatalog();
    await refreshPending();
  } catch (e) { setStatus('Connect failed: ' + reason(e), 'error'); }
}

// Show the connected wallet's native balance (needed to BUY) — reads from the
// demo chain regardless of MetaMask's selected network.
async function refreshWallet() {
  if (!account) return;
  try {
    nativeBal = await read.getBalance(account);
    $('bal').textContent = `${formatEther(nativeBal)} ETH`;
  } catch { $('bal').textContent = '—'; }
}

// Make sure MetaMask is on the demo chain before sending a write. Switches
// (adding the network first if MetaMask doesn't know it — error 4902).
async function ensureChain() {
  const net = await provider.getNetwork();
  if (Number(net.chainId) === Number(cfg.chainId)) return true;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: cfg.chainIdHex }],
    });
  } catch (e) {
    if (e && e.code === 4902) { await addNetwork(); }
    else { setStatus('Please switch MetaMask to the demo network: ' + reason(e), 'error'); return false; }
  }
  // Rebuild the signer-side provider on the new network.
  provider = new BrowserProvider(window.ethereum);
  const after = await provider.getNetwork();
  return Number(after.chainId) === Number(cfg.chainId);
}

function highlightMe() {
  document.querySelectorAll('#who .pill').forEach((el) => {
    el.classList.toggle('me', account && el.dataset.addr === account.toLowerCase());
  });
}

async function addNetwork() {
  if (!window.ethereum) { setStatus('MetaMask not found.', 'error'); return; }
  if (!cfg) { setStatus('Addresses not loaded yet.', 'error'); return; }
  try {
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: cfg.chainIdHex,
        chainName: cfg.chainName || 'Daskibo Anvil',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: [cfg.rpcUrl],
      }],
    });
    setStatus('Anvil network added/selected in MetaMask.', 'ok');
  } catch (e) {
    // 4902 = chain not added; addEthereumChain also adds, so most errors are user-rejections.
    setStatus('Network add/switch failed (or rejected): ' + (e.message || e), 'error');
  }
}

function enableActions(on) {
  ['btn-register', 'btn-refresh', 'btn-access', 'btn-withdraw'].forEach((id) => { $(id).disabled = !on; });
}

function mp(signerOrProvider) { return new Contract(cfg.marketplace, MARKETPLACE_ABI, signerOrProvider); }
function mpRead() { return mp(read); }                       // reads → demo chain RPC
async function mpWrite() { return mp(await provider.getSigner()); } // writes → MetaMask signer

// ── Register (author) ────────────────────────────────────────────────────────
async function register() {
  try {
    const title = $('c-title').value.trim() || 'Untitled';
    const priceEth = $('c-price').value.trim();
    const bucket = $('c-bucket').value.trim() || 'daskibo-demo';
    const duration = BigInt($('c-duration').value);
    const price = parseEther(priceEth);
    if (price <= 0n) { setStatus('Price must be > 0.', 'error'); return; }
    // Bake a registration timestamp into the content hash so each course (even
    // same title/bucket) gets a unique token → a distinct content link.
    const contentHash = keccak256(toUtf8Bytes(`${title}|${bucket}|${Date.now()}`));
    if (!(await ensureChain())) return;
    setStatus('Submitting registerCourse… confirm in MetaMask.', 'ok');
    const tx = await (await mpWrite()).registerCourse(price, contentHash, bucket, duration);
    const rcpt = await tx.wait();
    setStatus(`Course registered (tx ${short(rcpt.hash)}). You are its author.`, 'ok');
    await refreshCatalog();
  } catch (e) { setStatus('Register failed: ' + reason(e), 'error'); }
}

// ── Catalog + buy ────────────────────────────────────────────────────────────
async function refreshCatalog() {
  try {
    const c = mpRead();
    const next = await c.nextCourseId();
    const n = Number(next) - 1;
    const box = $('catalog');
    if (n <= 0) { box.textContent = 'No courses yet — register one above.'; return; }
    const rows = [];
    for (let id = 1; id <= n; id++) {
      const co = await c.courses(id);
      // Whether the *connected* account already has access (author or buyer) —
      // decides Buy button vs. Open-course link.
      let access = false;
      if (account) { try { access = await c.hasCourseAccess(account, id); } catch { access = false; } }
      rows.push({ id, author: co.author, price: co.price, bucket: co.bucket,
        contentHash: co.contentHash, duration: co.accessDuration, active: co.active, access });
    }
    box.innerHTML = rows.map(renderCourse).join('');
    rows.forEach((r) => {
      const b = $(`buy-${r.id}`);
      if (b) b.addEventListener('click', () => buy(r.id, r.price));
    });
    // Wallet's course-access NFTs: AccessPass is soulbound (no balanceOf), so a
    // "pass held" = a course you have access to but did NOT author.
    if (account) {
      const accessIds = rows.filter((r) => r.access).map((r) => r.id);
      const passIds = rows.filter((r) => r.access && r.author.toLowerCase() !== account.toLowerCase()).map((r) => r.id);
      $('passes').textContent = `${passIds.length}${passIds.length ? ` (course ${passIds.join(', ')})` : ''}`;
      $('access-list').textContent = `Access to: ${accessIds.length ? `course ${accessIds.join(', ')}` : 'none yet'}`;
    }
    await refreshMatrix(rows.map((r) => r.id));
  } catch (e) { setStatus('Catalog read failed: ' + reason(e), 'error'); }
}

function durLabel(d) {
  d = Number(d);
  if (d === 0) return 'perpetual';
  if (d === 3600) return '1 hour';
  if (d === 604800) return '1 week';
  if (d === 2592000) return '30 days';
  return d + 's';
}

// Link to the course content.
//   • On devnet/mainnet (addresses.json has a real Greenfield `bucket`) the
//     course lives in Greenfield → open course-view.html, the gated mirror of
//     antigravity/lessons/index.html (lesson-card grid + in-browser decrypt).
//   • On the local Anvil demo (no Greenfield bucket — just a stub lesson)
//     fall back to course-content.html which reads ./demo/manifest-<id>.json.
function courseLink(r) {
  if (cfg && cfg.bucket) return `./course-view.html`;
  const p = new URLSearchParams({ id: String(r.id), bucket: r.bucket, ts: r.contentHash });
  return `./course-content.html?${p.toString()}`;
}

function renderCourse(r) {
  const mine = account && r.author.toLowerCase() === account.toLowerCase();
  const owned = !!r.access; // author (free) or a buyer who holds the pass
  // Owned → show the access link and DROP the Buy button; otherwise show Buy.
  const action = owned
    ? `<a class="open" href="${courseLink(r)}" target="_blank" rel="noopener">Open course →</a>`
    : `<button id="buy-${r.id}">Buy for ${formatEther(r.price)} ETH</button>`;
  const ownTag = owned
    ? `<span class="pill me">${mine ? 'your course' : 'owned'} · access ✓</span>`
    : (account ? '<span class="pill">not owned</span>' : '');
  // Requirements to gain access (shown when you don't own it yet): the price in
  // native tokens (must be covered by your balance) + the AccessPass NFT you'll
  // receive on purchase.
  let req = '';
  if (!owned) {
    const afford = !account || nativeBal >= r.price;
    req = `<div class="meta">requires: <b>${formatEther(r.price)} ETH</b> + 1 AccessPass NFT (minted on buy)` +
      `${account ? (afford ? ' · ✓ balance ok' : ' · ✗ insufficient balance') : ''}</div>`;
  }
  return `<div class="courseItem">
    <div class="row" style="justify-content:space-between;">
      <strong>#${r.id} · ${r.bucket}</strong>
      ${ownTag}
    </div>
    <div class="meta">author ${short(r.author)}${mine ? ' (you)' : ''} · price ${formatEther(r.price)} ETH · access ${durLabel(r.duration)} · ${r.active ? 'active' : 'inactive'}</div>
    ${req}
    ${action}
  </div>`;
}

async function buy(id, price) {
  try {
    if (!provider) { setStatus('Connect MetaMask first to buy.', 'error'); return; }
    if (!(await ensureChain())) return;
    setStatus(`Buying course #${id}… confirm in MetaMask.`, 'ok');
    const tx = await (await mpWrite()).purchase(id, { value: price });
    const rcpt = await tx.wait();
    setStatus(`Purchased course #${id} (tx ${short(rcpt.hash)}). A soulbound pass was minted.`, 'ok');
    await refreshWallet();
    await refreshCatalog();
    await refreshPending();
  } catch (e) { setStatus(`Buy failed: ${reason(e)}`, 'error'); }
}

// ── Access matrix ──────────────────────────────────────────────────────────
async function refreshMatrix(ids) {
  const box = $('matrix');
  if (!ids || !ids.length) { box.textContent = 'Register a course first.'; return; }
  const c = mpRead();
  const head = `<tr><th>Persona</th>${ids.map((id) => `<th>#${id}</th>`).join('')}</tr>`;
  const body = [];
  for (const p of PERSONAS) {
    const cells = [];
    for (const id of ids) {
      const ok = await c.hasCourseAccess(p.addr, id);
      cells.push(`<td class="${ok ? 'yes' : 'no'}">${ok ? '✓' : '✗'}</td>`);
    }
    const me = account && p.addr.toLowerCase() === account.toLowerCase();
    body.push(`<tr><td><span class="pill ${me ? 'me' : ''}">${p.role}</span> ${short(p.addr)}</td>${cells.join('')}</tr>`);
  }
  box.innerHTML = `<table>${head}${body.join('')}</table>`;
}

// ── Withdraw (author proceeds) ─────────────────────────────────────────────
async function refreshPending() {
  try {
    if (!account) return;
    const bal = await mpRead().pendingWithdrawals(account);
    $('pending').textContent = formatEther(bal);
    $('btn-withdraw').disabled = bal <= 0n;
  } catch { /* ignore */ }
}

async function withdraw() {
  try {
    if (!provider) { setStatus('Connect MetaMask first.', 'error'); return; }
    if (!(await ensureChain())) return;
    setStatus('Withdrawing… confirm in MetaMask.', 'ok');
    const tx = await (await mpWrite()).withdraw();
    await tx.wait();
    setStatus('Withdrawn.', 'ok');
    await refreshPending();
  } catch (e) { setStatus('Withdraw failed: ' + reason(e), 'error'); }
}

function reason(e) {
  // Surface custom-error names (AlreadyOwned, Inactive, BadPrice…) when present.
  return e?.revert?.name || e?.shortMessage || e?.reason || e?.message || String(e);
}

// ── Wire up ──────────────────────────────────────────────────────────────────
$('btn-connect').addEventListener('click', connect);
$('btn-network').addEventListener('click', addNetwork);
$('btn-register').addEventListener('click', register);
$('btn-refresh').addEventListener('click', async () => { await refreshCatalog(); await refreshPending(); });
$('btn-access').addEventListener('click', async () => {
  const next = Number(await mpRead().nextCourseId()) - 1;
  await refreshMatrix(Array.from({ length: Math.max(0, next) }, (_, i) => i + 1));
});
$('btn-withdraw').addEventListener('click', withdraw);

if (window.ethereum) {
  window.ethereum.on?.('accountsChanged', () => connect());
  window.ethereum.on?.('chainChanged', () => connect());
}

boot();
