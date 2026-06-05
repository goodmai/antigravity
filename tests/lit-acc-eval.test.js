/**
 * Canonical ACC evaluator — unit tests.
 *
 * This is the single source of truth for app-side ACC enforcement (the Chipotle
 * TEE has no checkConditions). Covers the two-pass semantics: timestamp expiry
 * (AND) then address/contract gate (OR), plus the dependency-free calldata path
 * exercised through an injected ethCall.
 */
import { describe, it, expect } from 'vitest';
import {
  timestampExpiry,
  evaluateAcc,
  realConditions,
  rpcForChain,
} from '../smartcontracts/buckets/lit-acc-eval.js';

const ALLOWED = '0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF';
const OTHER   = '0x0000000000000000000000000000000000000001';
const NFT     = '0x1111111111111111111111111111111111111111';
const MP      = '0x2222222222222222222222222222222222222222';

const addr = (a) => ({
  contractAddress: '', standardContractType: '', chain: 'bscTestnet',
  method: '', parameters: [':userAddress'],
  returnValueTest: { comparator: '=', value: a },
});
const ts = (expiry) => ({
  contractAddress: '', standardContractType: 'timestamp', chain: 'bscTestnet',
  method: 'eth_getBlockByNumber', parameters: ['latest'],
  returnValueTest: { comparator: '<=', value: String(expiry) },
});
const erc721 = (c, min = '1') => ({
  contractAddress: c, standardContractType: 'ERC721', chain: 'bscTestnet',
  method: 'balanceOf', parameters: [':userAddress'],
  returnValueTest: { comparator: '>=', value: String(min) },
});
const course = (c, id) => ({
  contractAddress: c, standardContractType: 'customContract', chain: 'bscTestnet',
  method: 'hasCourseAccess', parameters: [':userAddress', String(id)],
  returnValueTest: { comparator: '==', value: 'true' },
});

const now = () => Math.floor(Date.now() / 1000);

describe('timestampExpiry', () => {
  it('passes when no timestamp condition', () => {
    expect(timestampExpiry([addr(ALLOWED)])).toBeNull();
  });
  it('passes before expiry, value 0 = perpetual', () => {
    expect(timestampExpiry([ts(now() + 3600)])).toBeNull();
    expect(timestampExpiry([ts(0)])).toBeNull();
  });
  it('fails after expiry', () => {
    expect(timestampExpiry([ts(now() - 1)])).toMatch(/expired/);
  });
});

describe('realConditions', () => {
  it('strips operator joiners', () => {
    const acc = [addr(ALLOWED), { operator: 'and' }, ts(0)];
    expect(realConditions(acc)).toHaveLength(2);
  });
});

describe('evaluateAcc — address allowlist', () => {
  it('allows the bound address', async () => {
    expect(await evaluateAcc({ accessControlConditions: [addr(ALLOWED)], userAddress: ALLOWED })).toEqual({ ok: true });
  });
  it('denies a different address', async () => {
    const r = await evaluateAcc({ accessControlConditions: [addr(ALLOWED)], userAddress: OTHER });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/does not satisfy/);
  });
});

describe('evaluateAcc — timestamp AND address (P-A timed)', () => {
  const timed = (exp) => [addr(ALLOWED), { operator: 'and' }, ts(exp)];
  it('allows bound address before expiry', async () => {
    expect(await evaluateAcc({ accessControlConditions: timed(now() + 3600), userAddress: ALLOWED })).toEqual({ ok: true });
  });
  it('denies bound address AFTER expiry (the mainnet leak this prevents)', async () => {
    const r = await evaluateAcc({ accessControlConditions: timed(now() - 1), userAddress: ALLOWED });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/expired/);
  });
});

describe('evaluateAcc — on-chain contract conditions via injected ethCall', () => {
  // word(n) → 32-byte hex word, as an RPC eth_call would return.
  const word = (n) => '0x' + BigInt(n).toString(16).padStart(64, '0');

  it('ERC721 balanceOf >= 1 grants access', async () => {
    const ethCall = async (to, data) => {
      expect(to).toBe(NFT);
      expect(data.slice(0, 10)).toBe('0x70a08231'); // balanceOf selector
      return word(1);
    };
    expect(await evaluateAcc({ accessControlConditions: [erc721(NFT)], userAddress: ALLOWED, ethCall })).toEqual({ ok: true });
  });

  it('ERC721 balance 0 denies', async () => {
    const ethCall = async () => word(0);
    const r = await evaluateAcc({ accessControlConditions: [erc721(NFT)], userAddress: ALLOWED, ethCall });
    expect(r.ok).toBe(false);
  });

  it('hasCourseAccess true grants; encodes courseId', async () => {
    const ethCall = async (to, data) => {
      expect(to).toBe(MP);
      expect(data.slice(0, 10)).toBe('0xc77628fb'); // hasCourseAccess selector
      expect(data.slice(-64)).toBe(BigInt(7).toString(16).padStart(64, '0')); // courseId 7
      return word(1);
    };
    expect(await evaluateAcc({ accessControlConditions: [course(MP, 7)], userAddress: ALLOWED, ethCall })).toEqual({ ok: true });
  });

  it('hasCourseAccess false denies', async () => {
    const r = await evaluateAcc({ accessControlConditions: [course(MP, 1)], userAddress: ALLOWED, ethCall: async () => word(0) });
    expect(r.ok).toBe(false);
  });

  it('without ethCall, a contract-only ACC cannot pass (fails closed)', async () => {
    const r = await evaluateAcc({ accessControlConditions: [erc721(NFT)], userAddress: ALLOWED });
    expect(r.ok).toBe(false);
  });

  it('contract gate still blocked by an expired timestamp (AND)', async () => {
    const acc = [erc721(NFT), { operator: 'and' }, ts(now() - 1)];
    const r = await evaluateAcc({ accessControlConditions: acc, userAddress: ALLOWED, ethCall: async () => word(99) });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/expired/);
  });
});

describe('rpcForChain', () => {
  it('maps known chains and returns null for unknown', () => {
    expect(rpcForChain('bscTestnet')).toMatch(/^https?:\/\//);
    expect(rpcForChain('nope')).toBeNull();
    expect(rpcForChain('bsc', { bsc: 'http://x' })).toBe('http://x');
  });
});
