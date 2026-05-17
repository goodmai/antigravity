/**
 * Daskibo Academy — Greenfield primary-SP selection (TDD)
 *
 * Shared by both real SDK write paths (Node sdk-backend + browser
 * wallet-sdk) so SP selection is uniform and an empty/filtered SP list
 * fails with a coded SP_UNAVAILABLE instead of an opaque TypeError.
 */

import { describe, it, expect } from 'vitest';
import { pickPrimarySp } from '../smartcontracts/buckets/greenfield-sp.js';

describe('pickPrimarySp', () => {
  it('prefers an https SP endpoint', () => {
    const sp = pickPrimarySp([
      { operatorAddress: '0x1', endpoint: 'http://insecure.sp' },
      { operatorAddress: '0x2', endpoint: 'https://secure.sp' },
    ]);
    expect(sp.operatorAddress).toBe('0x2');
    expect(sp.endpoint).toBe('https://secure.sp');
  });

  it('falls back to an http endpoint when no https exists', () => {
    const sp = pickPrimarySp([
      { operatorAddress: '0x1', endpoint: 'ftp://nope' },
      { operatorAddress: '0x2', endpoint: 'http://only.sp' },
    ]);
    expect(sp.operatorAddress).toBe('0x2');
  });

  it('throws a coded SP_UNAVAILABLE for an empty list', () => {
    expect(() => pickPrimarySp([])).toThrowError(
      expect.objectContaining({ code: 'SP_UNAVAILABLE' }),
    );
  });

  it('throws SP_UNAVAILABLE when no usable endpoint and on bad input', () => {
    expect(() =>
      pickPrimarySp([{ operatorAddress: '0x1', endpoint: 'ws://x' }]),
    ).toThrowError(expect.objectContaining({ code: 'SP_UNAVAILABLE' }));
    expect(() => pickPrimarySp(undefined)).toThrowError(
      expect.objectContaining({ code: 'SP_UNAVAILABLE' }),
    );
    expect(() => pickPrimarySp([{ endpoint: 'https://x' }])).toThrowError(
      expect.objectContaining({ code: 'SP_UNAVAILABLE' }),
    );
  });
});
