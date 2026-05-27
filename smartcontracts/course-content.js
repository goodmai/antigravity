// Daskibo demo — GATED course reader.
//
// The lesson body is AES-encrypted (manifest.env); its master key is wrapped by
// the Chipotle mock behind an ACC. To read, the page:
//   1. connects MetaMask,
//   2. verifies hasCourseAccess(account, courseId) on the demo chain (authoritative),
//   3. signs an ownership proof and asks Chipotle to release the master key
//      (Chipotle re-checks the ACC on-chain — no NFT, no key),
//   4. AES-decrypts the lesson client-side and renders it.
// Anyone without the NFT/AccessPass is denied at steps 2–3; the ciphertext alone
// is useless.
import { BrowserProvider, JsonRpcProvider, Contract, getAddress } from 'https://esm.sh/ethers@6.13.4';
import { decryptObject } from './buckets/crypto-envelope.js';

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const setStatus = (m, s = 'ok') => { statusEl.textContent = m; statusEl.dataset.state = s; };
const short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '—');

const q = new URLSearchParams(location.search);
const courseId = Number(q.get('id') || 1);

const MP_ABI = ['function hasCourseAccess(address,uint256) view returns (bool)'];

let manifest = null;

async function boot() {
  try {
    const res = await fetch(`./demo/manifest-${courseId}.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`manifest-${courseId}.json HTTP ${res.status}`);
    manifest = await res.json();
    $('title').textContent = `#${courseId} · ${manifest.title}`;
    document.title = `Daskibo — Course #${courseId}`;
    $('kv').innerHTML = [
      ['Course', `#${courseId} · ${manifest.title}`],
      ['Marketplace', manifest.marketplace],
      ['Access condition', `hasCourseAccess(you, ${courseId}) == true`],
      ['Encryption', `${manifest.env?.alg || 'AES-256-GCM'} · key wrapped by Chipotle`],
    ].map(([k, v]) => `<div>${k}</div><div class="mono">${esc(String(v))}</div>`).join('');
    setStatus('Manifest loaded. Connect MetaMask to verify access and decrypt.', 'ok');
  } catch (e) {
    setStatus('Could not load the course manifest (is the demo stack up?).\n' + e.message, 'error');
    $('btn-unlock').disabled = true;
  }
}

async function unlock() {
  if (!window.ethereum) { setStatus('MetaMask not found. Install it to read gated courses.', 'error'); return; }
  if (!manifest) { setStatus('Manifest not loaded.', 'error'); return; }
  $('btn-unlock').disabled = true;
  try {
    // 1. Connect
    const accts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const account = getAddress(accts[0]);

    // 2. Authoritative on-chain access check against the demo chain.
    setStatus(`Checking on-chain access for ${short(account)}…`, 'ok');
    const read = new JsonRpcProvider(manifest.rpcUrl, manifest.chainId, { staticNetwork: true });
    const mp = new Contract(manifest.marketplace, MP_ABI, read);
    const ok = await mp.hasCourseAccess(account, courseId);
    if (!ok) {
      setStatus(`🔒 Access denied — ${short(account)} does not own course #${courseId}. ` +
        'Buy it on the demo page first, then reload.', 'error');
      $('btn-unlock').disabled = false;
      return;
    }

    // 3. Sign an ownership proof and ask Chipotle to release the master key.
    setStatus('Access confirmed. Signing proof & requesting the decryption key…', 'ok');
    const message = `Daskibo course access\nCourse: ${courseId}\nWallet: ${account}\nNonce: ${Date.now()}`;
    const signature = await window.ethereum.request({ method: 'personal_sign', params: [message, account] });

    const resp = await fetch(`${manifest.chipotleUrl}/core/v1/lit_action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'dummy-api-key' },
      body: JSON.stringify({
        js_params: {
          action: 'decrypt',
          ciphertext: manifest.masterCiphertext,
          accessControlConditions: manifest.accessControlConditions,
          userAddress: account,
          signedProof: { message, signature },
        },
      }),
    });
    const data = await resp.json();
    if (data.has_error) throw new Error(data.error || 'Chipotle refused to release the key');
    const masterKey = data.response?.decrypted;
    if (!masterKey) throw new Error('No key returned');

    // 4. Decrypt the lesson client-side and render it.
    const { text } = await decryptObject(masterKey, manifest.env);
    renderLesson(text);
    setStatus(`✓ Unlocked as ${short(account)} — key released by Chipotle after the access check.`, 'ok');
  } catch (e) {
    setStatus('Unlock failed: ' + (e?.shortMessage || e?.message || String(e)), 'error');
    $('btn-unlock').disabled = false;
  }
}

// Minimal, safe markdown → HTML (escape first, then a few block rules).
function renderLesson(md) {
  const html = esc(md).split('\n').map((line) => {
    if (/^### /.test(line)) return `<h3>${line.slice(4)}</h3>`;
    if (/^## /.test(line)) return `<h2>${line.slice(3)}</h2>`;
    if (/^# /.test(line)) return `<h2>${line.slice(2)}</h2>`;
    if (line.trim() === '') return '';
    return `<p>${inline(line)}</p>`;
  }).join('\n');
  const el = $('lesson');
  el.classList.remove('locked');
  el.innerHTML = html;
}

function inline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/_([^_]+)_/g, '<i>$1</i>');
}

function esc(s) {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

$('btn-unlock').addEventListener('click', unlock);
boot();
