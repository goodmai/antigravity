/**
 * Daskibo Academy — Web3 Genesis: HD-wallet derivation demo (Lesson 01)
 *
 * Shows how a BIP-39 mnemonic → seed → BIP-32 HD tree → BIP-44 derivation path
 * → secp256k1 keypair → Ethereum address. Everything happens locally with viem
 * (loaded from CDN). No network, no MetaMask. The default mnemonic is the
 * well-known Anvil/Hardhat test mnemonic — students can paste their own or
 * regenerate it.
 *
 * Wires <div data-wallet-demo="hd"> blocks in the lesson page.
 */

const ANVIL_MNEMONIC =
  'test test test test test test test test test test test junk';

const BASE_PATH = "m/44'/60'/0'/0"; // Ethereum, BIP-44 coin_type=60

let cachedMnemonic = null;

async function loadViemAccounts() {
  if (!cachedMnemonic) {
    cachedMnemonic = await import('https://esm.sh/viem@2/accounts');
  }
  return cachedMnemonic;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (v != null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function field(label, input) {
  return el('div', { class: 'field' }, [el('label', { text: label }), input]);
}

function shortAddr(addr) {
  return addr.length > 14 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
}

async function deriveAccounts(mnemonic, count = 5) {
  const { mnemonicToAccount } = await loadViemAccounts();
  const out = [];
  for (let i = 0; i < count; i++) {
    const path = `${BASE_PATH}/${i}`;
    const acc = mnemonicToAccount(mnemonic, { accountIndex: 0, addressIndex: i });
    out.push({ index: i, path, address: acc.address, publicKey: acc.publicKey });
  }
  return out;
}

function buildDemo(root) {
  const mnemonicInput = el('input', {
    type: 'text',
    value: ANVIL_MNEMONIC,
    id: 'mnemonic',
    spellcheck: 'false',
  });
  mnemonicInput.style.minWidth = '340px';

  const deriveBtn = el('button', { class: 'btn btn-primary', type: 'button', text: '🔑 Derive addresses' });
  const status = el('span', { class: 'sandbox-status' });
  const generateBtn = el('button', { class: 'btn btn-ghost', type: 'button', text: '🎲 Generate new mnemonic' });

  const inputRow = el('div', { class: 'sandbox-row' }, [
    field('BIP-39 mnemonic (12 or 24 words)', mnemonicInput),
    deriveBtn,
    generateBtn,
    status,
  ]);

  const tableWrap = el('div', { class: 'state-card' }, [
    el('h4', { text: `Derivation path:  ${BASE_PATH}/i  (first 5)` }),
    el('div', { class: 'empty', text: 'Click "Derive addresses" to compute the first five accounts.' }),
  ]);

  const warning = el('div', { class: 'note', style: 'border-left-color:var(--err);margin-top:14px' });
  warning.innerHTML =
    '<strong style="color:var(--err)">⚠ Никогда не вводите вашу реальную seed-фразу в браузере.</strong> ' +
    'Демо использует публично известную тестовую фразу Anvil / Hardhat — её адреса знают все. ' +
    'Для собственного кошелька — только аппаратное устройство.';

  const header = el('div', { class: 'sandbox-header' }, [
    el('span', { class: 'title', text: root.dataset.title || 'HD-Wallet Derivation' }),
    el('span', { text: 'BIP-39 → BIP-32 → BIP-44 (secp256k1)' }),
  ]);

  const body = el('div', { class: 'sandbox-body' }, [inputRow, tableWrap, warning]);

  root.textContent = '';
  root.appendChild(header);
  root.appendChild(body);

  async function refresh() {
    status.className = 'sandbox-status';
    status.textContent = 'deriving…';
    deriveBtn.disabled = true;
    try {
      const accounts = await deriveAccounts(mnemonicInput.value.trim(), 5);
      tableWrap.innerHTML = '';
      tableWrap.appendChild(el('h4', { text: `Derivation path:  ${BASE_PATH}/i  (first 5)` }));
      const table = el('table');
      const head = el('tr', {}, [
        el('td', { text: 'i', style: 'color:var(--muted)' }),
        el('td', { text: 'path', style: 'color:var(--muted)' }),
        el('td', { text: 'address', style: 'color:var(--muted)' }),
      ]);
      table.appendChild(head);
      for (const a of accounts) {
        table.appendChild(el('tr', {}, [
          el('td', { text: String(a.index) }),
          el('td', { text: a.path }),
          el('td', { text: a.address, title: a.address }),
        ]));
      }
      tableWrap.appendChild(table);
      status.className = 'sandbox-status ok';
      status.textContent = `✓ derived ${accounts.length} accounts`;
    } catch (err) {
      status.className = 'sandbox-status err';
      status.textContent = `✗ ${err.message}`;
    } finally {
      deriveBtn.disabled = false;
    }
  }

  deriveBtn.addEventListener('click', refresh);

  generateBtn.addEventListener('click', async () => {
    status.textContent = 'rolling dice…';
    try {
      const { generateMnemonic, english } = await import('https://esm.sh/viem@2/accounts');
      mnemonicInput.value = generateMnemonic(english);
      status.className = 'sandbox-status ok';
      status.textContent = '✓ new mnemonic generated (in memory only)';
    } catch (err) {
      status.className = 'sandbox-status err';
      status.textContent = `✗ ${err.message}`;
    }
  });
}

function init() {
  document.querySelectorAll('[data-wallet-demo="hd"]').forEach(buildDemo);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
