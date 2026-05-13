/**
 * Daskibo Academy — Web3 Genesis Lesson 03 helper tests
 *
 * Pure-function coverage for the JSON-RPC client logic that lives in
 * academy/courses/web3-genesis/assets/rpc-helpers.js. The four practical
 * lesson tasks each get their own describe block:
 *
 *   1. Is this address a contract?       → isContract
 *   2. How much gas did this tx burn?    → txFeeWei / txStatus / isDeployReceipt
 *   3. Is this block final?              → finalityOf / confirmations
 *   4. What does the fee market look like? → parseFeeHistory
 *
 * Plus the supporting primitives (envelope, hex helpers, curl rendering,
 * method index).
 */

import { describe, it, expect } from 'vitest';
import {
  buildRpcRequest,
  parseRpcResponse,
  isContract,
  hexToBigInt,
  bigIntToHex,
  txStatus,
  txFeeWei,
  isDeployReceipt,
  finalityOf,
  confirmations,
  parseFeeHistory,
  renderCurl,
  RPC_METHODS,
} from '../academy/courses/web3-genesis/assets/rpc-helpers.js';

// ── 1. JSON-RPC envelope ─────────────────────────────────────────────────

describe('buildRpcRequest', () => {
  it('produces a JSON-RPC 2.0 envelope', () => {
    const req = buildRpcRequest('eth_blockNumber');
    expect(req).toEqual({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] });
  });

  it('preserves params order', () => {
    const req = buildRpcRequest('eth_getCode', ['0xabc', 'latest'], 42);
    expect(req.params).toEqual(['0xabc', 'latest']);
    expect(req.id).toBe(42);
  });

  it('rejects empty method', () => {
    expect(() => buildRpcRequest('', [])).toThrowError(/method/);
  });

  it('rejects non-array params', () => {
    expect(() => buildRpcRequest('eth_chainId', 'not-array')).toThrowError(/params/);
  });
});

describe('parseRpcResponse', () => {
  it('extracts result on success', () => {
    expect(parseRpcResponse({ jsonrpc: '2.0', id: 1, result: '0x1' })).toEqual({ result: '0x1' });
  });

  it('extracts error on failure', () => {
    const err = { code: -32602, message: 'invalid params' };
    expect(parseRpcResponse({ jsonrpc: '2.0', id: 1, error: err })).toEqual({ error: err });
  });

  it('handles batch responses', () => {
    const batch = [
      { jsonrpc: '2.0', id: 1, result: '0x1' },
      { jsonrpc: '2.0', id: 2, error: { code: -32601, message: 'not found' } },
    ];
    const out = parseRpcResponse(batch);
    expect(out.batch).toHaveLength(2);
    expect(out.batch[0].result).toBe('0x1');
    expect(out.batch[1].error.code).toBe(-32601);
  });

  it('handles malformed input', () => {
    expect(parseRpcResponse(null).error.code).toBe(-32700);
    expect(parseRpcResponse('garbage').error.code).toBe(-32700);
  });
});

// ── 2. Practical task #1: isContract ─────────────────────────────────────

describe('isContract (eth_getCode)', () => {
  it('returns false for an EOA (code == 0x)', () => {
    expect(isContract('0x')).toBe(false);
  });

  it('returns false for an explicit 0x00 / 0x0', () => {
    expect(isContract('0x0')).toBe(false);
    expect(isContract('0x00')).toBe(false);
  });

  it('returns true for non-empty bytecode', () => {
    expect(isContract('0x6080604052348015600f57600080fd5b50')).toBe(true);
  });

  it('returns false for malformed input', () => {
    expect(isContract(null)).toBe(false);
    expect(isContract('608060…')).toBe(false);
    expect(isContract('')).toBe(false);
  });
});

// ── 3. hexToBigInt / bigIntToHex ─────────────────────────────────────────

describe('hex helpers', () => {
  it('hexToBigInt parses normal values', () => {
    expect(hexToBigInt('0x10')).toBe(16n);
    expect(hexToBigInt('0xabc')).toBe(2748n);
  });

  it('hexToBigInt accepts empty 0x as 0', () => {
    expect(hexToBigInt('0x')).toBe(0n);
  });

  it('hexToBigInt rejects non-hex', () => {
    expect(() => hexToBigInt('10')).toThrowError(/hex/);
    expect(() => hexToBigInt(null)).toThrowError(/hex/);
  });

  it('bigIntToHex round-trips', () => {
    for (const v of [0n, 1n, 255n, 1_234_567_890n, 10n ** 30n]) {
      expect(hexToBigInt(bigIntToHex(v))).toBe(v);
    }
  });

  it('bigIntToHex rejects negatives', () => {
    expect(() => bigIntToHex(-1n)).toThrowError(/negative/);
  });
});

// ── 4. Practical task #2: gas burn from a receipt ────────────────────────

describe('txStatus / txFeeWei / isDeployReceipt', () => {
  const eip1559 = {
    status: '0x1',
    gasUsed: '0x5208',                  // 21000
    effectiveGasPrice: '0x3b9aca00',    // 1 gwei
    contractAddress: null,
  };

  const legacy = {
    status: '0x1',
    gasUsed: '0x5208',                  // 21000
    gasPrice: '0x77359400',             // 2 gwei
    contractAddress: null,
  };

  const reverted = { status: '0x0', gasUsed: '0x5208', effectiveGasPrice: '0x3b9aca00' };

  const deployment = {
    status: '0x1',
    gasUsed: '0xcf08',                  // 53000
    effectiveGasPrice: '0x3b9aca00',
    contractAddress: '0xAbCdEf0123456789ABCDef0123456789ABCdef01',
  };

  it('reads success status', () => {
    expect(txStatus(eip1559)).toBe('success');
  });

  it('reads revert status', () => {
    expect(txStatus(reverted)).toBe('reverted');
  });

  it('treats pre-Byzantium receipts with root as success', () => {
    expect(txStatus({ root: '0xabc', gasUsed: '0x0' })).toBe('success');
  });

  it('returns "unknown" for missing receipt', () => {
    expect(txStatus(null)).toBe('unknown');
    expect(txStatus({})).toBe('unknown');
  });

  it('computes fee = gasUsed × effectiveGasPrice (EIP-1559)', () => {
    expect(txFeeWei(eip1559)).toBe(21_000n * 10n ** 9n); // 21000 gas × 1 gwei
  });

  it('falls back to gasPrice for legacy receipts', () => {
    expect(txFeeWei(legacy)).toBe(21_000n * 2n * 10n ** 9n);
  });

  it('returns 0 for receipts with zero price', () => {
    expect(txFeeWei({ gasUsed: '0x0', effectiveGasPrice: '0x0' })).toBe(0n);
  });

  it('detects deployment receipts by contractAddress', () => {
    expect(isDeployReceipt(deployment)).toBe(true);
    expect(isDeployReceipt(eip1559)).toBe(false);
  });

  it('rejects malformed contractAddress', () => {
    expect(isDeployReceipt({ contractAddress: '0xnotvalid' })).toBe(false);
  });
});

// ── 5. Practical task #3: finality ───────────────────────────────────────

describe('finalityOf / confirmations', () => {
  const ctx = { latest: 1000n, safe: 990n, finalized: 980n };

  it('classifies finalized blocks', () => {
    expect(finalityOf({ block: 980n, ...ctx })).toBe('finalized');
    expect(finalityOf({ block: 500n, ...ctx })).toBe('finalized');
  });

  it('classifies safe but not yet finalized', () => {
    expect(finalityOf({ block: 985n, ...ctx })).toBe('safe');
    expect(finalityOf({ block: 990n, ...ctx })).toBe('safe');
  });

  it('classifies unsafe (head) blocks', () => {
    expect(finalityOf({ block: 995n, ...ctx })).toBe('unsafe');
    expect(finalityOf({ block: 1000n, ...ctx })).toBe('unsafe');
  });

  it('classifies future blocks', () => {
    expect(finalityOf({ block: 1001n, ...ctx })).toBe('future');
  });

  it('accepts numbers as well as bigints', () => {
    expect(finalityOf({ block: 980, latest: 1000, safe: 990, finalized: 980 })).toBe('finalized');
  });

  it('confirmations counts depth from head', () => {
    expect(confirmations(995n, 1000n)).toBe(5n);
    expect(confirmations(1000n, 1000n)).toBe(0n);
    expect(confirmations(1001n, 1000n)).toBe(0n); // future ⇒ 0
  });
});

// ── 6. Practical task #4: fee history summary ────────────────────────────

describe('parseFeeHistory', () => {
  const fh = {
    oldestBlock: '0x100',
    baseFeePerGas: ['0x1', '0x2', '0x3', '0x4', '0x5', '0x6'], // N=5, last is next-block prediction
    gasUsedRatio: [0.5, 0.6, 0.7, 0.8, 0.9],
    reward: [
      ['0x1', '0x2', '0x3'],
      ['0x2', '0x3', '0x4'],
      ['0x3', '0x4', '0x5'],
      ['0x4', '0x5', '0x6'],
      ['0x5', '0x6', '0x7'],
    ],
  };

  it('uses only the first N=5 baseFees (drops next-block prediction)', () => {
    const s = parseFeeHistory(fh);
    expect(s.blocks).toBe(5);
  });

  it('computes average baseFee', () => {
    // (1+2+3+4+5)/5 = 3
    expect(parseFeeHistory(fh).avgBaseFee).toBe(3n);
  });

  it('computes max baseFee', () => {
    expect(parseFeeHistory(fh).maxBaseFee).toBe(5n);
  });

  it('picks median percentile from reward[]', () => {
    // reward column index 1 → [2,3,4,5,6] avg 4
    expect(parseFeeHistory(fh).avgPriorityFee).toBe(4n);
  });

  it('zero priority fee when reward is absent', () => {
    const noReward = { ...fh, reward: undefined };
    expect(parseFeeHistory(noReward).avgPriorityFee).toBe(0n);
  });

  it('throws on a non-feeHistory shape', () => {
    expect(() => parseFeeHistory({})).toThrowError(/feeHistory/);
    expect(() => parseFeeHistory(null)).toThrowError(/feeHistory/);
  });
});

// ── 7. curl rendering & method index ─────────────────────────────────────

describe('renderCurl', () => {
  it('renders a runnable curl command', () => {
    const req = buildRpcRequest('eth_chainId');
    const curl = renderCurl('https://eth.llamarpc.com', req);
    expect(curl).toMatch(/curl -s -X POST 'https:\/\/eth\.llamarpc\.com'/);
    expect(curl).toMatch(/content-type: application\/json/);
    expect(curl).toContain('"method":"eth_chainId"');
  });

  it('escapes single quotes safely', () => {
    const req = buildRpcRequest('eth_call', [{ data: "0xabc'def" }, 'latest']);
    const curl = renderCurl('https://x', req);
    expect(curl).toContain(`'\\''`);
  });
});

describe('RPC_METHODS catalogue', () => {
  it('exposes the seven foundational methods', () => {
    const names = RPC_METHODS.map((m) => m.method);
    for (const m of [
      'eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber',
      'eth_getCode', 'eth_getTransactionReceipt', 'eth_feeHistory', 'eth_getBalance',
    ]) {
      expect(names).toContain(m);
    }
  });

  it('each method has params[] and a purpose string', () => {
    for (const m of RPC_METHODS) {
      expect(Array.isArray(m.params)).toBe(true);
      expect(typeof m.purpose).toBe('string');
      expect(m.purpose.length).toBeGreaterThan(0);
    }
  });
});
