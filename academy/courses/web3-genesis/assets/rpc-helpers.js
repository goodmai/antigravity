/**
 * Daskibo Academy — Web3 Genesis: JSON-RPC helpers (Lesson 03)
 *
 * Pure ESM, no DOM, no network. Encapsulates the small bits of logic that
 * are easy to get wrong when talking to an Ethereum node by hand:
 *
 *   • Encoding/decoding the JSON-RPC envelope.
 *   • Detecting whether an address is a contract from `eth_getCode`.
 *   • Reading a transaction status / gas cost from a receipt (legacy + 1559).
 *   • Deriving finality from `eth_getBlockByNumber` with tags
 *     `latest` / `safe` / `finalized`.
 *   • Summarising an `eth_feeHistory` response into base/priority averages.
 *
 * The lesson's UI playground and the vitest suite import the same module.
 */

// ── JSON-RPC envelope ─────────────────────────────────────────────────────

/**
 * Build a single JSON-RPC 2.0 request. `id` defaults to 1 — the playground
 * passes monotonic ids.
 */
export function buildRpcRequest(method, params = [], id = 1) {
  if (typeof method !== 'string' || method.length === 0) {
    throw new TypeError('method must be a non-empty string');
  }
  if (!Array.isArray(params)) {
    throw new TypeError('params must be an array');
  }
  return { jsonrpc: '2.0', id, method, params };
}

/**
 * Parse a JSON-RPC response (either single or batch). Returns
 * `{ result, error }` where exactly one is defined for a single response,
 * or `{ batch: [...] }` for a batch.
 */
export function parseRpcResponse(json) {
  if (Array.isArray(json)) {
    return { batch: json.map((r) => parseRpcResponse(r)) };
  }
  if (!json || typeof json !== 'object') {
    return { error: { code: -32700, message: 'Parse error: response is not an object' } };
  }
  if ('error' in json && json.error) {
    return { error: json.error };
  }
  return { result: json.result };
}

// ── Address introspection ─────────────────────────────────────────────────

/**
 * Determine whether an `eth_getCode` response indicates a contract.
 * Convention: empty code is `"0x"` or `"0x0"`; anything longer is bytecode.
 */
export function isContract(codeHex) {
  if (typeof codeHex !== 'string') return false;
  if (!codeHex.startsWith('0x')) return false;
  const body = codeHex.slice(2).replace(/^0+/, '');
  return body.length > 0;
}

// ── Hex helpers ───────────────────────────────────────────────────────────

export function hexToBigInt(hex) {
  if (typeof hex !== 'string' || !hex.startsWith('0x')) {
    throw new TypeError(`not a hex string: ${hex}`);
  }
  if (hex === '0x') return 0n;
  return BigInt(hex);
}

export function bigIntToHex(value) {
  const v = BigInt(value);
  if (v < 0n) throw new RangeError('cannot encode negative as hex');
  return '0x' + v.toString(16);
}

// ── Receipt parsing ───────────────────────────────────────────────────────

/**
 * Status field per the Yellow Paper: '0x1' = success, '0x0' = reverted.
 * Older receipts (pre-Byzantium) had `root` instead of `status`; we treat
 * those as 'success' if `root` exists.
 */
export function txStatus(receipt) {
  if (!receipt || typeof receipt !== 'object') return 'unknown';
  if (receipt.status === '0x1') return 'success';
  if (receipt.status === '0x0') return 'reverted';
  if (receipt.root) return 'success';
  return 'unknown';
}

/**
 * Total fee paid in wei: `gasUsed × effectiveGasPrice`. Falls back to
 * `gasPrice` for legacy (type-0) receipts.
 */
export function txFeeWei(receipt) {
  if (!receipt) throw new TypeError('receipt is required');
  const gasUsed = hexToBigInt(receipt.gasUsed);
  const price = hexToBigInt(receipt.effectiveGasPrice ?? receipt.gasPrice ?? '0x0');
  return gasUsed * price;
}

/**
 * Was this receipt for a contract deployment?
 * The node returns `contractAddress` only when `to == null` in the tx.
 */
export function isDeployReceipt(receipt) {
  return Boolean(receipt && typeof receipt.contractAddress === 'string'
    && /^0x[0-9a-fA-F]{40}$/.test(receipt.contractAddress));
}

// ── Finality ──────────────────────────────────────────────────────────────

/**
 * Classify a block by finality, given the current `latest`, `safe`, and
 * `finalized` block numbers as returned by `eth_getBlockByNumber`.
 *
 *   • finalized  — block ≤ finalized → state will never reorg (2 epochs deep).
 *   • safe       — block ≤ safe but > finalized → 1-epoch confidence.
 *   • unsafe     — block ≤ latest but > safe → reorg-able.
 *   • future     — block > latest.
 */
export function finalityOf({ block, latest, safe, finalized }) {
  const b = BigInt(block);
  const l = BigInt(latest);
  const s = BigInt(safe);
  const f = BigInt(finalized);
  if (b > l) return 'future';
  if (b <= f) return 'finalized';
  if (b <= s) return 'safe';
  return 'unsafe';
}

/** Depth in blocks from `latest`. Useful for confirmations counters. */
export function confirmations(block, latest) {
  const b = BigInt(block);
  const l = BigInt(latest);
  return l >= b ? l - b : 0n;
}

// ── eth_feeHistory ────────────────────────────────────────────────────────

/**
 * Summarise a fee-history response.
 * @param {object} fh   — raw `eth_feeHistory` result
 * @returns {object}    — { blocks, avgBaseFee, avgPriorityFee, maxBaseFee }
 */
export function parseFeeHistory(fh) {
  if (!fh || !Array.isArray(fh.baseFeePerGas)) {
    throw new TypeError('not a feeHistory response');
  }
  const baseFees = fh.baseFeePerGas.map(hexToBigInt);
  // baseFeePerGas has length N+1 (includes next block prediction); use first N.
  const observed = baseFees.slice(0, -1);
  const blocks = observed.length;
  const sum = observed.reduce((a, b) => a + b, 0n);
  const avgBaseFee = blocks > 0 ? sum / BigInt(blocks) : 0n;
  const maxBaseFee = observed.reduce((a, b) => (b > a ? b : a), 0n);

  // reward is `[[p10, p50, p90], ...]` if requested; pick the median percentile.
  let avgPriorityFee = 0n;
  if (Array.isArray(fh.reward) && fh.reward.length > 0) {
    const median = fh.reward.map((row) => hexToBigInt(row[Math.floor(row.length / 2)]));
    const r = median.reduce((a, b) => a + b, 0n);
    avgPriorityFee = median.length > 0 ? r / BigInt(median.length) : 0n;
  }

  return { blocks, avgBaseFee, maxBaseFee, avgPriorityFee };
}

// ── Curl rendering ────────────────────────────────────────────────────────

/**
 * Render a JSON-RPC request as a curl command students can paste into a
 * terminal. Quotes / escapes the body so it round-trips through bash safely.
 */
export function renderCurl(url, request) {
  const body = JSON.stringify(request);
  return [
    `curl -s -X POST '${url}'`,
    `  -H 'content-type: application/json'`,
    `  --data '${body.replace(/'/g, `'\\''`)}'`,
  ].join(' \\\n');
}

// ── Method index ──────────────────────────────────────────────────────────

/**
 * The minimal set of read-only JSON-RPC methods every Web3 developer should
 * know cold. Used by the playground UI; exported so tests can assert the
 * shape is right.
 */
export const RPC_METHODS = [
  {
    method: 'eth_chainId',
    title: 'Chain ID',
    params: [],
    purpose: 'Read EIP-155 chainId of the connected node — guards against cross-chain replay.',
  },
  {
    method: 'eth_blockNumber',
    title: 'Latest block number',
    params: [],
    purpose: 'Returns the head of the execution layer (highest block the node has).',
  },
  {
    method: 'eth_getBlockByNumber',
    title: 'Get block (by tag)',
    params: ['finalized', false],
    purpose: 'Fetch metadata for `latest` / `safe` / `finalized` / hex block.',
  },
  {
    method: 'eth_getCode',
    title: 'Is this address a contract?',
    params: ['0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', 'latest'],
    purpose: '"0x" means EOA. Anything else is contract bytecode.',
  },
  {
    method: 'eth_getTransactionReceipt',
    title: 'Transaction receipt',
    params: ['0x88df016429689c079f3b2f6ad39fa052532c56795b733da78a91ebe6a713944b'],
    purpose: 'Status, gasUsed, effectiveGasPrice, logs — and contractAddress on deploys.',
  },
  {
    method: 'eth_feeHistory',
    title: 'Recent gas market',
    params: ['0x5', 'latest', [10, 50, 90]],
    purpose: 'Sliding window of baseFee + priority-fee percentiles — for fee estimation.',
  },
  {
    method: 'eth_getBalance',
    title: 'Native balance',
    params: ['0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 'latest'],
    purpose: 'Wei balance of the account at a given block.',
  },
];
