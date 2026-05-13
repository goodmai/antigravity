/**
 * Daskibo Academy — Web3 Genesis: ERC-20 Playground
 *
 * Wires the pure sandbox.js simulator to a <div data-sandbox="erc20"> block in
 * the lesson page. The simulator stays headless and testable; this file owns
 * all DOM / event-listener concerns.
 */

import { createSandbox, formatUnits, parseUnits, ZERO_ADDRESS } from './sandbox.js';

const ACCOUNTS = ['alice', 'bob', 'carol', 'dave'];

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function buildPlayground(root) {
  const sb = createSandbox();
  let token = null; // { address, name, symbol, decimals }

  // ── Header ─────────────────────────────────────────────────────────────
  const header = el('div', { class: 'sandbox-header' }, [
    el('span', { class: 'title', text: root.dataset.title || 'ERC-20 Sandbox' }),
    el('span', { text: 'deploy · transfer · inspect events' }),
  ]);

  // ── Deploy form ────────────────────────────────────────────────────────
  const nameInput = el('input', { type: 'text', value: 'Antigravity Token', id: 'deploy-name' });
  const symInput = el('input', { type: 'text', value: 'AGT', id: 'deploy-sym', maxlength: '8' });
  const supInput = el('input', { type: 'text', value: '1000', id: 'deploy-sup' });
  const decInput = el('input', { type: 'number', value: '18', min: '0', max: '36', id: 'deploy-dec' });
  const deployerSelect = el('select', { id: 'deploy-from' },
    ACCOUNTS.map((a) => el('option', { value: a, text: a })));

  const deployBtn = el('button', { class: 'btn btn-primary', type: 'button', text: '🚀 Deploy ERC-20' });
  const deployStatus = el('span', { class: 'sandbox-status' });

  const deployRow = el('div', { class: 'sandbox-row' }, [
    field('Token name', nameInput),
    field('Symbol', symInput),
    field('Initial supply', supInput),
    field('Decimals', decInput),
    field('Deployer', deployerSelect),
    deployBtn,
    deployStatus,
  ]);

  // ── Transfer form ──────────────────────────────────────────────────────
  const fromSelect = el('select', { id: 'tx-from' },
    ACCOUNTS.map((a) => el('option', { value: a, text: a })));
  const toSelect = el('select', { id: 'tx-to' },
    ACCOUNTS.map((a) => el('option', { value: a, text: a, selected: a === 'bob' ? '' : undefined })));
  toSelect.value = 'bob';
  const amountInput = el('input', { type: 'text', value: '100', id: 'tx-amount' });
  const transferBtn = el('button', { class: 'btn btn-primary', type: 'button', text: '💸 Transfer', disabled: '' });
  const transferStatus = el('span', { class: 'sandbox-status' });

  const transferRow = el('div', { class: 'sandbox-row' }, [
    field('From', fromSelect),
    field('To', toSelect),
    field('Amount', amountInput),
    transferBtn,
    transferStatus,
  ]);

  // ── State display ──────────────────────────────────────────────────────
  const tokenCard = el('div', { class: 'state-card' }, [
    el('h4', { text: 'Token' }),
    el('div', { class: 'empty', text: 'Not yet deployed — fill the form above and click Deploy.' }),
  ]);

  const balancesCard = el('div', { class: 'state-card' }, [
    el('h4', { text: 'Token balances' }),
    el('div', { class: 'empty', text: 'Deploy a token to see balances.' }),
  ]);

  const nativeCard = el('div', { class: 'state-card' }, [
    el('h4', { text: 'Native balance (gas)' }),
    renderNativeTable(),
  ]);

  const stateGrid = el('div', { class: 'sandbox-state' }, [tokenCard, balancesCard, nativeCard]);

  // ── Event log ──────────────────────────────────────────────────────────
  const log = el('div', { class: 'event-log' });
  appendLog('dim', `🟣 Sandbox ready. Pre-funded: ${ACCOUNTS.join(', ')} (10 ETH each).\n`);

  // ── Reset ──────────────────────────────────────────────────────────────
  const resetBtn = el('button', { class: 'btn btn-ghost', type: 'button', text: '↺ Reset sandbox' });

  // ── Assemble ───────────────────────────────────────────────────────────
  const body = el('div', { class: 'sandbox-body' }, [
    deployRow,
    transferRow,
    stateGrid,
    log,
    el('div', { class: 'sandbox-row' }, [resetBtn]),
  ]);

  root.textContent = '';
  root.appendChild(header);
  root.appendChild(body);

  // ── Behaviour ──────────────────────────────────────────────────────────
  deployBtn.addEventListener('click', () => {
    deployStatus.className = 'sandbox-status';
    deployStatus.textContent = 'mining…';
    try {
      const decimals = parseInt(decInput.value, 10);
      const { address, tx } = sb.deployERC20(deployerSelect.value, {
        name: nameInput.value.trim(),
        symbol: symInput.value.trim(),
        decimals,
        initialSupply: BigInt(supInput.value.trim()),
      });
      token = { address, name: nameInput.value, symbol: symInput.value.trim(), decimals };
      deployStatus.className = 'sandbox-status ok';
      deployStatus.textContent = '✓ deployed';
      transferBtn.disabled = false;
      appendLog('ok',
        `✓ Deploy ${token.symbol}  tx=${shortHash(tx.hash)}  contract=${shortHash(address)}  gas=${tx.gas}\n`);
      appendLog('dim',
        `  └─ Transfer(${shortAddr(ZERO_ADDRESS)} → ${labelOf(tx.logs[0].args.to)}, ${formatUnits(tx.logs[0].args.value, decimals)} ${token.symbol})\n`);
      renderState();
    } catch (err) {
      deployStatus.className = 'sandbox-status err';
      deployStatus.textContent = `✗ ${err.message}`;
      appendLog('err', `✗ Deploy failed: ${err.message}\n`);
    }
  });

  transferBtn.addEventListener('click', () => {
    if (!token) return;
    transferStatus.className = 'sandbox-status';
    transferStatus.textContent = 'mining…';
    try {
      const amount = parseUnits(amountInput.value.trim(), token.decimals);
      const tx = sb.transfer(token.address, fromSelect.value, toSelect.value, amount);
      transferStatus.className = 'sandbox-status ok';
      transferStatus.textContent = '✓ transferred';
      const ev = tx.logs[0];
      appendLog('ok',
        `✓ Transfer  tx=${shortHash(tx.hash)}  ${labelOf(ev.args.from)} → ${labelOf(ev.args.to)}  ${formatUnits(ev.args.value, token.decimals)} ${token.symbol}\n`);
      renderState();
    } catch (err) {
      transferStatus.className = 'sandbox-status err';
      transferStatus.textContent = `✗ ${err.message}`;
      appendLog('err', `✗ Transfer reverted: ${err.message}\n`);
    }
  });

  resetBtn.addEventListener('click', () => {
    // Brutal but effective — rebuild from scratch.
    buildPlayground(root);
  });

  // ── Helpers (closure-scoped) ───────────────────────────────────────────
  function renderState() {
    if (token) {
      tokenCard.innerHTML = '';
      tokenCard.appendChild(el('h4', { text: 'Token' }));
      const info = sb.tokenInfo(token.address);
      tokenCard.appendChild(el('div', { class: 'big', text: `${info.symbol} · ${info.name}` }));
      tokenCard.appendChild(el('div', { class: 'dim', text: `address: ${shortHash(token.address)}` }));
      tokenCard.appendChild(el('div', { class: 'dim', text: `totalSupply: ${formatUnits(info.totalSupply, info.decimals)} ${info.symbol}` }));
      tokenCard.appendChild(el('div', { class: 'dim', text: `decimals: ${info.decimals}` }));

      balancesCard.innerHTML = '';
      balancesCard.appendChild(el('h4', { text: `${info.symbol} balances` }));
      const table = el('table');
      for (const name of ACCOUNTS) {
        const bal = sb.balanceOf(token.address, name);
        const row = el('tr', {}, [
          el('td', { text: name }),
          el('td', { text: `${formatUnits(bal, info.decimals)} ${info.symbol}` }),
        ]);
        table.appendChild(row);
      }
      balancesCard.appendChild(table);
    }

    nativeCard.innerHTML = '';
    nativeCard.appendChild(el('h4', { text: 'Native balance (gas)' }));
    nativeCard.appendChild(renderNativeTable());
  }

  function renderNativeTable() {
    const table = el('table');
    for (const name of ACCOUNTS) {
      const bal = sb.getBalance(name);
      const row = el('tr', {}, [
        el('td', { text: name }),
        el('td', { text: `${formatUnits(bal, 18)} ETH` }),
      ]);
      table.appendChild(row);
    }
    return table;
  }

  function appendLog(cls, text) {
    const span = el('span', { class: cls, text });
    log.appendChild(span);
    log.scrollTop = log.scrollHeight;
  }

  function labelOf(addr) {
    return `${sb.labelFor(addr)}`;
  }
}

function field(label, input) {
  return el('div', { class: 'field' }, [el('label', { text: label }), input]);
}

function shortHash(h) {
  return h && h.length > 14 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h;
}

function shortAddr(a) {
  return a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function init() {
  document.querySelectorAll('[data-sandbox="erc20"]').forEach(buildPlayground);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
