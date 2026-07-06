/**
 * Daskibo Academy — Lit Access Control Condition builders (TDD)
 *
 * Pure ACC constructors used to gate Lit decryption. Centralised + typed
 * so the (audit 3.2 / 4.1) flash-loan caveat lives in one place and the
 * UI no longer hand-rolls conditions.
 */

import { describe, it, expect } from 'vitest';
import {
  addressAllowlistAcc,
  tokenBalanceAcc,
  anyOf,
  allOf,
} from '../smartcontracts/buckets/lit-acc.js';

describe('addressAllowlistAcc', () => {
  it('builds a single :userAddress equality condition (not flash-loanable)', () => {
    const acc = addressAllowlistAcc('0xReader');
    expect(acc).toEqual([
      {
        contractAddress: '',
        standardContractType: '',
        chain: 'ethereum',
        method: '',
        parameters: [':userAddress'],
        returnValueTest: { comparator: '=', value: '0xReader' },
      },
    ]);
  });

  it('rejects an empty address', () => {
    expect(() => addressAllowlistAcc('')).toThrowError(
      expect.objectContaining({ code: 'INVALID_ADDRESS' }),
    );
  });
});

describe('tokenBalanceAcc', () => {
  it('builds an ERC721 balance gate with a minimum', () => {
    const acc = tokenBalanceAcc({
      contractAddress: '0xNFT',
      standardContractType: 'ERC721',
      chain: 'ethereum',
      min: '1',
    });
    expect(acc[0]).toMatchObject({
      contractAddress: '0xNFT',
      standardContractType: 'ERC721',
      method: 'balanceOf',
      parameters: [':userAddress'],
      returnValueTest: { comparator: '>=', value: '1' },
    });
  });

  it('defaults min to "1" and standard to ERC721', () => {
    const acc = tokenBalanceAcc({ contractAddress: '0xT' });
    expect(acc[0].returnValueTest).toEqual({ comparator: '>=', value: '1' });
    expect(acc[0].standardContractType).toBe('ERC721');
  });

  it('requires a contract address', () => {
    expect(() => tokenBalanceAcc({})).toThrowError(
      expect.objectContaining({ code: 'INVALID_CONTRACT' }),
    );
  });
});

describe('anyOf / allOf combinators', () => {
  it('joins condition sets with the documented Lit operator', () => {
    const a = addressAllowlistAcc('0xA');
    const b = addressAllowlistAcc('0xB');
    expect(anyOf(a, b)).toEqual([...a, { operator: 'or' }, ...b]);
    expect(allOf(a, b)).toEqual([...a, { operator: 'and' }, ...b]);
  });

  it('returns the single set unchanged when only one is given', () => {
    const a = addressAllowlistAcc('0xA');
    expect(anyOf(a)).toEqual(a);
    expect(allOf(a)).toEqual(a);
  });
});
