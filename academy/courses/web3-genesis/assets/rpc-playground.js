/**
 * Daskibo Academy — Web3 Genesis: JSON-RPC playground (Lesson 03)
 *
 * In-browser sandbox for the 7 foundational Ethereum JSON-RPC methods.
 * Backed by a deterministic mock so the page works offline and gives
 * stable, reviewable responses.
 *
 * Wires <div data-rpc-playground="mock"> blocks in the lesson page.
 */

import {
  buildRpcRequest,
  parseRpcResponse,
  isContract,
  txStatus,
  txFeeWei,
  finalityOf,
  parseFeeHistory,
  renderCurl,
  RPC_METHODS,
  hexToBigInt,
  bigIntToHex,
} from './rpc-helpers.js';

// ── Mock state ────────────────────────────────────────────────────────────

const CHAIN_ID = '0x1'; // mainnet
const NODE_URL = 'https://eth.llamarpc.com';

// Fixed “current head” — choose stable numbers so screenshots don’t rot.
const LATEST_BLOCK    = 21_345_678n;
const SAFE_BLOCK      = LATEST_BLOCK - 32n;     // ~1 epoch
const FINALIZED_BLOCK = LATEST_BLOCK - 64n;     // ~2 epochs

const UNISWAP_V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const ANVIL_ACCOUNT_0   = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const KNOWN_TX_HASH     = '0x88df016429689c079f3b2f6ad39fa052532c56795b733da78a91ebe6a713944b';
const DEPLOY_TX_HASH    = '0xdeadbeef00000000000000000000000000000000000000000000000000000001';

// Truncated Uniswap V2 router bytecode prefix — purely illustrative.
const ROUTER_CODE_PREFIX =
  '0x6080604052600436106101e35760003560e01c80638da5cb5b1161010257806' +
  '3f305d71911610095578063fb3bdb411161006e578063fb3bdb411461066c578' +
  '063fc6ef37f1461067f578063…';

function tagToNumber(tag) {
  if (tag === 'latest')    return LATEST_BLOCK;
  if (tag === 'safe')      return SAFE_BLOCK;
  if (tag === 'finalized') return FINALIZED_BLOCK;
  if (tag === 'pending')   return LATEST_BLOCK + 1n;
  if (tag === 'earliest')  return 0n;
  if (typeof tag === 'string' && tag.startsWith('0x')) return hexToBigInt(tag);
  return null;
}

function buildBlock(number) {
  const ts = 1700000000n + number * 12n;
  return {
    number:         bigIntToHex(number),
    hash:           '0x' + number.toString(16).padStart(64, 'b'),
    parentHash:     '0x' + (number - 1n).toString(16).padStart(64, 'b'),
    timestamp:      bigIntToHex(ts),
    baseFeePerGas:  bigIntToHex(15_000_000_000n + (number % 100n) * 100_000_000n),
    gasUsed:        bigIntToHex(15_000_000n),
    gasLimit:       bigIntToHex(30_000_000n),
    miner:          '0xdAC17F958D2ee523a2206206994597C13D831ec7', // illustrative
    transactions:   [],
  };
}

function mockHandle(request) {
  const { method, params = [] } = request;
  switch (method) {
    case 'eth_chainId':
      return CHAIN_ID;
    case 'eth_blockNumber':
      return bigIntToHex(LATEST_BLOCK);
    case 'eth_getBlockByNumber': {
      const n = tagToNumber(params[0]);
      if (n == null) throw { code: -32602, message: `unknown block tag: ${params[0]}` };
      return buildBlock(n);
    }
    case 'eth_getCode': {
      const [addr] = params;
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr ?? '')) {
        throw { code: -32602, message: 'invalid address' };
      }
      if (addr.toLowerCase() === UNISWAP_V2_ROUTER.toLowerCase()) return ROUTER_CODE_PREFIX;
      if (addr.toLowerCase() === ANVIL_ACCOUNT_0.toLowerCase())   return '0x';
      // Default: pretend any "deployed" mock addr beginning with 0xcc… has code.
      return addr.toLowerCase().startsWith('0xcc') ? '0x60806040' : '0x';
    }
    case 'eth_getTransactionReceipt': {
      const [hash] = params;
      if (hash === KNOWN_TX_HASH) {
        return {
          transactionHash:   KNOWN_TX_HASH,
          blockNumber:       bigIntToHex(LATEST_BLOCK - 100n),
          blockHash:         '0x' + (LATEST_BLOCK - 100n).toString(16).padStart(64, 'b'),
          from:              '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          to:                UNISWAP_V2_ROUTER,
          status:            '0x1',
          gasUsed:           '0x1d4c0', // 120_000
          effectiveGasPrice: '0x77359400', // 2 gwei
          contractAddress:   null,
          logs: [{
            address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
            topics:  [
              '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', // Transfer
              '0x000000000000000000000000' + UNISWAP_V2_ROUTER.slice(2).toLowerCase(),
              '0x00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8',
            ],
            data:    '0x0000000000000000000000000000000000000000000000000000000005f5e100', // 100 USDC
          }],
        };
      }
      if (hash === DEPLOY_TX_HASH) {
        return {
          transactionHash:   DEPLOY_TX_HASH,
          blockNumber:       bigIntToHex(LATEST_BLOCK - 50n),
          status:            '0x1',
          gasUsed:           '0xcf08', // 53_000
          effectiveGasPrice: '0x3b9aca00', // 1 gwei
          contractAddress:   '0xcc11223344556677889900aabbccddeeff001122',
          from:              ANVIL_ACCOUNT_0,
          to:                null,
          logs:              [],
        };
      }
      return null; // unknown tx
    }
    case 'eth_feeHistory': {
      const [count] = params;
      const n = Number(hexToBigInt(typeof count === 'string' ? count : bigIntToHex(BigInt(count))));
      const baseFeePerGas = [];
      const reward = [];
      for (let i = 0; i <= n; i++) {
        baseFeePerGas.push(bigIntToHex(15_000_000_000n + BigInt(i) * 250_000_000n));
        if (i < n) {
          reward.push([
            bigIntToHex(1_000_000_000n),
            bigIntToHex(1_500_000_000n + BigInt(i) * 100_000_000n),
            bigIntToHex(3_000_000_000n + BigInt(i) * 500_000_000n),
          ]);
        }
      }
      const gasUsedRatio = Array.from({ length: n }, (_, i) => 0.4 + (i % 5) * 0.1);
      return { oldestBlock: bigIntToHex(LATEST_BLOCK - BigInt(n)), baseFeePerGas, gasUsedRatio, reward };
    }
    case 'eth_getBalance': {
      const [addr] = params;
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr ?? '')) throw { code: -32602, message: 'invalid address' };
      // Anvil account 0 gets 10 000 ETH like in foundry; everyone else gets 1.234 ETH.
      const wei = addr.toLowerCase() === ANVIL_ACCOUNT_0.toLowerCase()
        ? 10_000n * 10n ** 18n
        : 1234n * 10n ** 15n;
      return bigIntToHex(wei);
    }
    default:
      throw { code: -32601, message: `Method ${method} not handled by mock` };
  }
}

function mockCall(request) {
  try {
    const result = mockHandle(request);
    return { jsonrpc: '2.0', id: request.id, result };
  } catch (err) {
    return { jsonrpc: '2.0', id: request.id, error: err };
  }
}

// ── UI building blocks ────────────────────────────────────────────────────

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

function buildPlayground(root) {
  // header
  const header = el('div', { class: 'sandbox-header' }, [
    el('span', { class: 'title', text: root.dataset.title || 'JSON-RPC Mock Playground' }),
    el('span', { text: `mock endpoint · chainId = ${CHAIN_ID}` }),
  ]);

  // method picker
  const methodSelect = el('select', { id: 'rpc-method' },
    RPC_METHODS.map((m) => el('option', { value: m.method, text: m.method })));

  const paramsTa = el('textarea', { id: 'rpc-params', spellcheck: 'false' });
  paramsTa.style.minHeight = '70px';
  paramsTa.style.fontFamily = '"JetBrains Mono", ui-monospace, monospace';
  paramsTa.style.fontSize = '0.85rem';

  const purposeLine = el('div', { class: 'dim', style: 'font-size:.85rem;margin:-4px 0 8px;color:var(--muted)' });

  const sendBtn = el('button', { class: 'btn btn-primary', type: 'button', text: '⚡ Send request' });
  const copyCurlBtn = el('button', { class: 'btn btn-ghost', type: 'button', text: '📋 Copy curl' });
  const status = el('span', { class: 'sandbox-status' });

  const reqColumn = el('div', { class: 'state-card' }, [
    el('h4', { text: 'Request (JSON-RPC)' }),
    el('pre', { class: 'event-log', id: 'rpc-req-json', style: 'max-height:200px' }),
    el('h4', { text: 'curl', style: 'margin-top:14px' }),
    el('pre', { class: 'event-log', id: 'rpc-curl', style: 'max-height:200px' }),
  ]);

  const resColumn = el('div', { class: 'state-card' }, [
    el('h4', { text: 'Response' }),
    el('pre', { class: 'event-log', id: 'rpc-res-json', style: 'max-height:200px' }),
    el('h4', { text: 'Derived facts', style: 'margin-top:14px' }),
    el('pre', { class: 'event-log', id: 'rpc-derived', style: 'max-height:200px' }),
  ]);

  const grid = el('div', { class: 'sandbox-state' }, [reqColumn, resColumn]);

  const formRow = el('div', { class: 'sandbox-row' }, [
    el('div', { class: 'field' }, [el('label', { text: 'method' }), methodSelect]),
    el('div', { class: 'field', style: 'flex: 2 1 320px' }, [el('label', { text: 'params (JSON array)' }), paramsTa]),
    sendBtn,
    copyCurlBtn,
    status,
  ]);

  root.textContent = '';
  root.appendChild(header);
  root.appendChild(el('div', { class: 'sandbox-body' }, [formRow, purposeLine, grid]));

  let nextId = 1;

  function selectMethod(name) {
    const def = RPC_METHODS.find((m) => m.method === name) ?? RPC_METHODS[0];
    paramsTa.value = JSON.stringify(def.params, null, 2);
    purposeLine.textContent = '↪ ' + def.purpose;
  }

  selectMethod(methodSelect.value);
  methodSelect.addEventListener('change', () => selectMethod(methodSelect.value));

  function deriveFacts(method, response) {
    const lines = [];
    if (response.error) {
      lines.push(`error code: ${response.error.code}`);
      lines.push(`error message: ${response.error.message}`);
      return lines.join('\n');
    }
    const r = response.result;
    switch (method) {
      case 'eth_chainId':
        lines.push(`decoded chainId: ${Number(hexToBigInt(r))}`);
        break;
      case 'eth_blockNumber':
        lines.push(`decoded block: ${hexToBigInt(r)}`);
        break;
      case 'eth_getBlockByNumber':
        if (r) {
          const num = hexToBigInt(r.number);
          lines.push(`block number: ${num}`);
          lines.push(`baseFeePerGas: ${hexToBigInt(r.baseFeePerGas)} wei (${Number(hexToBigInt(r.baseFeePerGas)) / 1e9} gwei)`);
          lines.push(`gasUsed/limit: ${hexToBigInt(r.gasUsed)} / ${hexToBigInt(r.gasLimit)}`);
          const fin = finalityOf({ block: num, latest: LATEST_BLOCK, safe: SAFE_BLOCK, finalized: FINALIZED_BLOCK });
          lines.push(`finality: ${fin}`);
        }
        break;
      case 'eth_getCode':
        lines.push(`isContract: ${isContract(r)}`);
        lines.push(`bytecode length: ${(r.length - 2) / 2} bytes`);
        break;
      case 'eth_getTransactionReceipt':
        if (r) {
          lines.push(`status: ${txStatus(r)}`);
          lines.push(`gasUsed: ${hexToBigInt(r.gasUsed)}`);
          const fee = txFeeWei(r);
          lines.push(`fee: ${fee} wei (${Number(fee) / 1e9} gwei or ${Number(fee) / 1e18} ETH)`);
          if (r.contractAddress) lines.push(`deployed contract: ${r.contractAddress}`);
          lines.push(`logs: ${r.logs?.length ?? 0}`);
        } else {
          lines.push('receipt not found — tx may still be pending');
        }
        break;
      case 'eth_feeHistory': {
        const s = parseFeeHistory(r);
        lines.push(`window: ${s.blocks} blocks`);
        lines.push(`avg baseFee: ${s.avgBaseFee} wei (${Number(s.avgBaseFee) / 1e9} gwei)`);
        lines.push(`max baseFee: ${s.maxBaseFee} wei (${Number(s.maxBaseFee) / 1e9} gwei)`);
        lines.push(`avg priority (p50): ${s.avgPriorityFee} wei (${Number(s.avgPriorityFee) / 1e9} gwei)`);
        break;
      }
      case 'eth_getBalance': {
        const wei = hexToBigInt(r);
        lines.push(`wei: ${wei}`);
        lines.push(`ETH: ${Number(wei) / 1e18}`);
        break;
      }
      default:
        lines.push('(no derived facts for this method)');
    }
    return lines.join('\n');
  }

  function send() {
    status.className = 'sandbox-status';
    status.textContent = 'sending…';
    try {
      const params = JSON.parse(paramsTa.value || '[]');
      const req = buildRpcRequest(methodSelect.value, params, nextId++);
      const reqJson = JSON.stringify(req, null, 2);

      const res = mockCall(req);
      const resJson = JSON.stringify(res, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2);

      const curl = renderCurl(NODE_URL, req);

      root.querySelector('#rpc-req-json').textContent = reqJson;
      root.querySelector('#rpc-curl').textContent = curl;
      root.querySelector('#rpc-res-json').textContent = resJson;
      root.querySelector('#rpc-derived').textContent = deriveFacts(methodSelect.value, parseRpcResponse(res));
      status.className = res.error ? 'sandbox-status err' : 'sandbox-status ok';
      status.textContent = res.error ? `✗ ${res.error.message}` : '✓ 200 OK';
    } catch (err) {
      status.className = 'sandbox-status err';
      status.textContent = `✗ ${err.message}`;
    }
  }

  sendBtn.addEventListener('click', send);

  copyCurlBtn.addEventListener('click', async () => {
    const text = root.querySelector('#rpc-curl').textContent;
    if (!text) { send(); }
    try {
      await navigator.clipboard.writeText(root.querySelector('#rpc-curl').textContent);
      status.className = 'sandbox-status ok';
      status.textContent = '✓ curl copied to clipboard';
    } catch (_) {
      status.className = 'sandbox-status err';
      status.textContent = '✗ clipboard blocked — select & copy manually';
    }
  });

  // Auto-send the default selection so the page never looks empty.
  send();
}

function init() {
  document.querySelectorAll('[data-rpc-playground="mock"]').forEach(buildPlayground);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
