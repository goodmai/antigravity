/**
 * Daskibo Academy — Web3 Genesis sandbox tests
 *
 * Covers the four classroom mechanics of Lesson 01:
 *   1. Deploy ERC-20 ⇒ correct supply, deployer credited, Transfer(0→deployer).
 *   2. Transfer    ⇒ debit/credit, Transfer event emitted, supply preserved.
 *   3. Read views  ⇒ balanceOf, totalSupply, tokenInfo are consistent.
 *   4. Invariants  ⇒ no transfer to zero address, no overdraw, no negatives.
 *
 * Plus the supporting primitives (address derivation, parse/format units,
 * gas accounting, event indexing).
 */

import { describe, it, expect } from 'vitest';
import {
  createSandbox,
  deriveAddress,
  deriveTxHash,
  normalizeAddress,
  formatUnits,
  parseUnits,
  SandboxError,
  ZERO_ADDRESS,
  DEFAULT_NATIVE,
  TRANSFER_GAS,
  DEPLOY_GAS,
  GAS_PRICE,
} from '../academy/courses/web3-genesis/assets/sandbox.js';

const TOKEN = { name: 'Antigravity Token', symbol: 'AGT', decimals: 18, initialSupply: 1000n };

// ── 1. Address & hash helpers ────────────────────────────────────────────

describe('address helpers', () => {
  it('deriveAddress is deterministic for the same seed', () => {
    expect(deriveAddress('alice')).toBe(deriveAddress('alice'));
  });

  it('deriveAddress returns a 20-byte 0x-prefixed address', () => {
    const a = deriveAddress('alice');
    expect(a).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it('different seeds yield different addresses', () => {
    expect(deriveAddress('alice')).not.toBe(deriveAddress('bob'));
  });

  it('deriveTxHash returns a 32-byte 0x-prefixed hash', () => {
    expect(deriveTxHash('tx:1')).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('normalizeAddress lowercases checksummed input', () => {
    const mixed = '0xAbCdEf0123456789ABCDef0123456789ABCdef01';
    expect(normalizeAddress(mixed)).toBe(mixed.toLowerCase());
  });

  it('normalizeAddress rejects malformed input', () => {
    expect(() => normalizeAddress('not-an-address')).toThrowError(SandboxError);
    expect(() => normalizeAddress('0x1234')).toThrowError(/valid 20-byte/);
  });
});

// ── 2. parseUnits / formatUnits ──────────────────────────────────────────

describe('parseUnits / formatUnits', () => {
  it('parses whole numbers at 18 decimals', () => {
    expect(parseUnits('1', 18)).toBe(10n ** 18n);
    expect(parseUnits('1000', 18)).toBe(1000n * 10n ** 18n);
  });

  it('parses fractional numbers', () => {
    expect(parseUnits('0.5', 18)).toBe(5n * 10n ** 17n);
    expect(parseUnits('1.25', 6)).toBe(1_250_000n);
  });

  it('rejects malformed decimals', () => {
    expect(() => parseUnits('abc', 18)).toThrowError(SandboxError);
    expect(() => parseUnits('1.123456789', 6)).toThrowError(/too many decimals/);
  });

  it('round-trips parse → format', () => {
    expect(formatUnits(parseUnits('123.456', 18), 18)).toBe('123.456');
    expect(formatUnits(parseUnits('0.000001', 18), 18)).toBe('0.000001');
  });

  it('formats whole numbers without trailing dot', () => {
    expect(formatUnits(10n ** 18n, 18)).toBe('1');
  });

  it('handles negative values', () => {
    expect(parseUnits('-2.5', 18)).toBe(-(5n * 10n ** 17n) * 5n);
    expect(formatUnits(-(5n * 10n ** 17n) * 5n, 18)).toBe('-2.5');
  });
});

// ── 3. Sandbox initialisation ─────────────────────────────────────────────

describe('sandbox initialisation', () => {
  it('seeds the four default accounts with the faucet balance', () => {
    const sb = createSandbox();
    for (const acc of sb.listAccounts()) {
      expect(acc.balance).toBe(DEFAULT_NATIVE);
    }
  });

  it('exposes alice, bob, carol, dave by name', () => {
    const sb = createSandbox();
    const names = sb.listAccounts().map((a) => a.name);
    expect(names).toEqual(['alice', 'bob', 'carol', 'dave']);
  });

  it('addresses are stable across sessions (deterministic seeds)', () => {
    const sb1 = createSandbox();
    const sb2 = createSandbox();
    expect(sb1.resolve('alice')).toBe(sb2.resolve('alice'));
  });

  it('two sandboxes share no state', () => {
    const sb1 = createSandbox();
    const sb2 = createSandbox();
    const { address } = sb1.deployERC20('alice', TOKEN);
    expect(sb1.totalSupply(address)).toBe(1000n * 10n ** 18n);
    expect(() => sb2.totalSupply(address)).toThrowError(/no ERC-20/);
  });

  it('custom faucet balance is applied', () => {
    const sb = createSandbox({ faucet: 1n * 10n ** 18n });
    expect(sb.getBalance('alice')).toBe(10n ** 18n);
  });
});

// ── 4. ERC-20: deploy ─────────────────────────────────────────────────────

describe('ERC-20: deploy', () => {
  it('credits the full initial supply to the deployer', () => {
    const sb = createSandbox();
    const { address } = sb.deployERC20('alice', TOKEN);
    expect(sb.balanceOf(address, 'alice')).toBe(1000n * 10n ** 18n);
  });

  it('reports totalSupply == initialSupply × 10^decimals', () => {
    const sb = createSandbox();
    const { address } = sb.deployERC20('alice', TOKEN);
    expect(sb.totalSupply(address)).toBe(1000n * 10n ** 18n);
  });

  it('returns valid 20-byte token address and 32-byte tx hash', () => {
    const sb = createSandbox();
    const { address, tx } = sb.deployERC20('alice', TOKEN);
    expect(address).toMatch(/^0x[0-9a-f]{40}$/);
    expect(tx.hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('emits Transfer(0x0 → deployer, totalSupply) on deploy', () => {
    const sb = createSandbox();
    const { address, tx } = sb.deployERC20('alice', TOKEN);
    expect(tx.logs).toHaveLength(1);
    const ev = tx.logs[0];
    expect(ev.event).toBe('Transfer');
    expect(ev.args.from).toBe(ZERO_ADDRESS);
    expect(ev.args.to).toBe(sb.resolve('alice'));
    expect(ev.args.value).toBe(1000n * 10n ** 18n);
  });

  it('charges deploy gas from the deployer', () => {
    const sb = createSandbox();
    const before = sb.getBalance('alice');
    sb.deployERC20('alice', TOKEN);
    const fee = DEPLOY_GAS * GAS_PRICE;
    expect(sb.getBalance('alice')).toBe(before - fee);
  });

  it('zero initial supply deploys but emits no Transfer event', () => {
    const sb = createSandbox();
    const { address, tx } = sb.deployERC20('alice', { ...TOKEN, initialSupply: 0n });
    expect(sb.totalSupply(address)).toBe(0n);
    expect(tx.logs).toHaveLength(0);
  });

  it('rejects negative initial supply', () => {
    const sb = createSandbox();
    expect(() => sb.deployERC20('alice', { ...TOKEN, initialSupply: -1n })).toThrowError(SandboxError);
  });

  it('rejects missing name or symbol', () => {
    const sb = createSandbox();
    expect(() => sb.deployERC20('alice', { ...TOKEN, name: '' })).toThrowError(/name/);
    expect(() => sb.deployERC20('alice', { ...TOKEN, symbol: '' })).toThrowError(/symbol/);
  });

  it('rejects out-of-range decimals', () => {
    const sb = createSandbox();
    expect(() => sb.deployERC20('alice', { ...TOKEN, decimals: -1 })).toThrowError(/decimals/);
    expect(() => sb.deployERC20('alice', { ...TOKEN, decimals: 99 })).toThrowError(/decimals/);
  });

  it('exposes name / symbol / decimals via tokenInfo', () => {
    const sb = createSandbox();
    const { address } = sb.deployERC20('alice', TOKEN);
    const info = sb.tokenInfo(address);
    expect(info.name).toBe(TOKEN.name);
    expect(info.symbol).toBe(TOKEN.symbol);
    expect(info.decimals).toBe(18);
  });
});

// ── 5. ERC-20: transfer ───────────────────────────────────────────────────

describe('ERC-20: transfer', () => {
  function setup() {
    const sb = createSandbox();
    const { address } = sb.deployERC20('alice', TOKEN);
    return { sb, address };
  }

  it('debits sender and credits recipient by the same amount', () => {
    const { sb, address } = setup();
    const amount = parseUnits('100', 18);
    sb.transfer(address, 'alice', 'bob', amount);
    expect(sb.balanceOf(address, 'alice')).toBe(1000n * 10n ** 18n - amount);
    expect(sb.balanceOf(address, 'bob')).toBe(amount);
  });

  it('emits a single Transfer(from, to, value) event', () => {
    const { sb, address } = setup();
    const amount = parseUnits('1', 18);
    const tx = sb.transfer(address, 'alice', 'bob', amount);
    expect(tx.logs).toHaveLength(1);
    const ev = tx.logs[0];
    expect(ev.event).toBe('Transfer');
    expect(ev.args.from).toBe(sb.resolve('alice'));
    expect(ev.args.to).toBe(sb.resolve('bob'));
    expect(ev.args.value).toBe(amount);
    expect(ev.address).toBe(address);
  });

  it('preserves totalSupply after a transfer', () => {
    const { sb, address } = setup();
    const before = sb.totalSupply(address);
    sb.transfer(address, 'alice', 'bob', parseUnits('250', 18));
    expect(sb.totalSupply(address)).toBe(before);
  });

  it('rejects transfer to the zero address (ERC-20 invariant)', () => {
    const { sb, address } = setup();
    expect(() => sb.transfer(address, 'alice', ZERO_ADDRESS, 1n)).toThrowError(/zero address/);
  });

  it('rejects transfer larger than the sender balance', () => {
    const { sb, address } = setup();
    const tooMuch = 5000n * 10n ** 18n;
    expect(() => sb.transfer(address, 'alice', 'bob', tooMuch)).toThrowError(/exceeds balance/);
  });

  it('rejects negative amounts', () => {
    const { sb, address } = setup();
    expect(() => sb.transfer(address, 'alice', 'bob', -1n)).toThrowError(/negative/);
  });

  it('transferring 0 succeeds and still emits Transfer (ERC-20 spec)', () => {
    const { sb, address } = setup();
    const tx = sb.transfer(address, 'alice', 'bob', 0n);
    expect(tx.logs).toHaveLength(1);
    expect(tx.logs[0].args.value).toBe(0n);
  });

  it('sequential transfers accumulate on the recipient', () => {
    const { sb, address } = setup();
    sb.transfer(address, 'alice', 'bob', parseUnits('10', 18));
    sb.transfer(address, 'alice', 'bob', parseUnits('15', 18));
    expect(sb.balanceOf(address, 'bob')).toBe(parseUnits('25', 18));
  });

  it('charges transfer gas from the sender on every call', () => {
    const { sb, address } = setup();
    const before = sb.getBalance('alice');
    sb.transfer(address, 'alice', 'bob', 1n);
    const after = sb.getBalance('alice');
    expect(before - after).toBe(TRANSFER_GAS * GAS_PRICE);
  });

  it('unknown account has balanceOf 0n', () => {
    const { sb, address } = setup();
    expect(sb.balanceOf(address, deriveAddress('stranger'))).toBe(0n);
  });

  it('throws on transfer for a non-existent contract address', () => {
    const sb = createSandbox();
    const fake = deriveAddress('nope');
    expect(() => sb.transfer(fake, 'alice', 'bob', 1n)).toThrowError(/no ERC-20/);
  });
});

// ── 6. Cross-cutting: tx log & event filtering ───────────────────────────

describe('history & filtering', () => {
  it('records deploy + transfer transactions in order', () => {
    const sb = createSandbox();
    const { address } = sb.deployERC20('alice', TOKEN);
    sb.transfer(address, 'alice', 'bob', 1n);
    sb.transfer(address, 'alice', 'carol', 2n);
    const txs = sb.getTransactions();
    expect(txs.map((t) => t.kind)).toEqual(['deploy', 'transfer', 'transfer']);
    expect(txs.every((t) => t.hash.startsWith('0x'))).toBe(true);
  });

  it('filters events by contract address', () => {
    const sb = createSandbox();
    const a = sb.deployERC20('alice', TOKEN).address;
    const b = sb.deployERC20('alice', { ...TOKEN, name: 'Other', symbol: 'OTH' }).address;
    sb.transfer(a, 'alice', 'bob', 1n);
    sb.transfer(b, 'alice', 'bob', 1n);
    expect(sb.getEvents({ address: a })).toHaveLength(2); // mint + transfer
    expect(sb.getEvents({ address: b })).toHaveLength(2);
  });

  it('filters events by event name', () => {
    const sb = createSandbox();
    const { address } = sb.deployERC20('alice', TOKEN);
    sb.transfer(address, 'alice', 'bob', 1n);
    expect(sb.getEvents({ event: 'Transfer' })).toHaveLength(2);
    expect(sb.getEvents({ event: 'Approval' })).toHaveLength(0);
  });

  it('tx hashes are unique across the session', () => {
    const sb = createSandbox();
    const { address } = sb.deployERC20('alice', TOKEN);
    const tx1 = sb.transfer(address, 'alice', 'bob', 1n);
    const tx2 = sb.transfer(address, 'alice', 'bob', 1n);
    expect(tx1.hash).not.toBe(tx2.hash);
  });
});
