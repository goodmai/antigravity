/**
 * Daskibo Academy — Lit/Greenfield payments & w3ext fee math (TDD)
 *
 * Money is integer minor units as BigInt (wei-style). Percentages are
 * basis points (bps): 2000 = 20%. Pure, deterministic, no rounding drift —
 * splits always re-sum to the input (remainder goes to the principal).
 *
 * Rules under test:
 *   - Lit is paid for BOTH save (encryption) and read (decryption).
 *   - w3ext takes 20% of the course SAVE cost by default.
 *   - On a course SALE, 20% of the price goes to the treasury contract.
 */

import { describe, it, expect } from 'vitest';
import {
  BPS_DENOMINATOR,
  DEFAULT_W3EXT_FEE_BPS,
  DEFAULT_W3EXT_READ_FEE_BPS,
  DEFAULT_TREASURY_BPS,
  toAmount,
  applyBps,
  computeSaveCharge,
  computeReadCharge,
  computeSaleSplit,
} from '../smartcontracts/buckets/lit-pricing.js';

describe('1. Constants & primitives', () => {
  it('defaults: 20% w3ext save, 20% w3ext read, 20% treasury', () => {
    expect(BPS_DENOMINATOR).toBe(10000n);
    expect(DEFAULT_W3EXT_FEE_BPS).toBe(2000n);
    expect(DEFAULT_W3EXT_READ_FEE_BPS).toBe(2000n);
    expect(DEFAULT_TREASURY_BPS).toBe(2000n);
  });

  it('toAmount accepts bigint, integer number and integer string', () => {
    expect(toAmount(5n)).toBe(5n);
    expect(toAmount(5)).toBe(5n);
    expect(toAmount('1000000000000000000')).toBe(1000000000000000000n);
  });

  it('toAmount rejects negative / fractional / garbage', () => {
    expect(() => toAmount(-1)).toThrowError(
      expect.objectContaining({ code: 'INVALID_AMOUNT' }),
    );
    expect(() => toAmount(1.5)).toThrowError(
      expect.objectContaining({ code: 'INVALID_AMOUNT' }),
    );
    expect(() => toAmount('abc')).toThrowError(
      expect.objectContaining({ code: 'INVALID_AMOUNT' }),
    );
  });

  it('applyBps floors and rejects out-of-range bps', () => {
    expect(applyBps(1000n, 2000n)).toBe(200n);
    expect(applyBps(999n, 2000n)).toBe(199n); // floor, not 199.8
    expect(() => applyBps(1n, 10001n)).toThrowError(
      expect.objectContaining({ code: 'INVALID_BPS' }),
    );
    expect(() => applyBps(1n, -1n)).toThrowError(
      expect.objectContaining({ code: 'INVALID_BPS' }),
    );
  });
});

describe('2. computeSaveCharge — w3ext takes 20% of save cost', () => {
  it('base = lit save + storage; w3ext = 20% of base; total = base + fee', () => {
    const r = computeSaveCharge({ litSaveCost: 800, storageCost: 200 });
    expect(r.base).toBe(1000n);
    expect(r.w3extFeeBps).toBe(2000n);
    expect(r.w3extFee).toBe(200n); // 20% of 1000
    expect(r.total).toBe(1200n);
    expect(r.litSaveCost).toBe(800n);
    expect(r.storageCost).toBe(200n);
  });

  it('breakdown re-sums to total and routes to the right payees', () => {
    const r = computeSaveCharge({
      litSaveCost: 800,
      storageCost: 200,
      litPayee: '0xLIT',
      storagePayee: '0xSP',
      w3extPayee: '0xW3EXT',
    });
    const sum = r.payouts.reduce((a, p) => a + p.amount, 0n);
    expect(sum).toBe(r.total);
    expect(r.payouts).toEqual(
      expect.arrayContaining([
        { to: '0xLIT', amount: 800n, kind: 'lit-save' },
        { to: '0xSP', amount: 200n, kind: 'storage' },
        { to: '0xW3EXT', amount: 200n, kind: 'w3ext-fee' },
      ]),
    );
  });

  it('w3ext fee bps is overridable', () => {
    const r = computeSaveCharge({
      litSaveCost: 1000,
      w3extFeeBps: 500,
    });
    expect(r.w3extFee).toBe(50n); // 5%
    expect(r.total).toBe(1050n);
  });

  it('zero storage cost is allowed', () => {
    const r = computeSaveCharge({ litSaveCost: 1000 });
    expect(r.base).toBe(1000n);
    expect(r.w3extFee).toBe(200n);
  });
});

describe('3. computeReadCharge — Lit is also paid for reads', () => {
  it('charges the lit read cost plus the default 20% w3ext fee', () => {
    const r = computeReadCharge({ litReadCost: 500 });
    expect(r.litReadCost).toBe(500n);
    expect(r.w3extFee).toBe(100n);
    expect(r.total).toBe(600n);
    expect(r.payouts.reduce((a, p) => a + p.amount, 0n)).toBe(r.total);
  });

  it('read fee bps is overridable independently of save', () => {
    const r = computeReadCharge({ litReadCost: 500, w3extFeeBps: 0 });
    expect(r.w3extFee).toBe(0n);
    expect(r.total).toBe(500n);
  });
});

describe('4. computeSaleSplit — 20% of a course sale to treasury', () => {
  it('treasury gets 20%, seller gets the exact remainder', () => {
    const r = computeSaleSplit({
      salePrice: 1000,
      treasury: '0xTREASURY',
      seller: '0xSELLER',
    });
    expect(r.treasuryAmount).toBe(200n);
    expect(r.sellerAmount).toBe(800n);
    expect(r.treasuryAmount + r.sellerAmount).toBe(1000n);
  });

  it('no wei is lost on indivisible prices (remainder → seller)', () => {
    const r = computeSaleSplit({
      salePrice: 999,
      treasury: '0xT',
      seller: '0xS',
    });
    expect(r.treasuryAmount).toBe(199n); // floor(999*0.2)
    expect(r.sellerAmount).toBe(800n);
    expect(r.treasuryAmount + r.sellerAmount).toBe(999n);
  });

  it('treasury bps is overridable and bounded', () => {
    const r = computeSaleSplit({
      salePrice: 1000,
      treasuryBps: 3000,
      treasury: '0xT',
      seller: '0xS',
    });
    expect(r.treasuryAmount).toBe(300n);
    expect(r.sellerAmount).toBe(700n);
  });

  it('requires both treasury and seller addresses', () => {
    expect(() => computeSaleSplit({ salePrice: 1, seller: '0xS' })).toThrowError(
      expect.objectContaining({ code: 'MISSING_PAYEE' }),
    );
  });

  it('payouts array re-sums to the sale price', () => {
    const r = computeSaleSplit({
      salePrice: 1234567,
      treasury: '0xT',
      seller: '0xS',
    });
    expect(r.payouts.reduce((a, p) => a + p.amount, 0n)).toBe(1234567n);
  });
});
