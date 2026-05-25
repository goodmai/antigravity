/**
 * Daskibo Academy — Greenfield primary-SP selection (TDD)
 *
 * Shared by both real SDK write paths (Node sdk-backend + browser
 * wallet-sdk) so SP selection is uniform and an empty/filtered SP list
 * fails with a coded SP_UNAVAILABLE instead of an opaque TypeError.
 */

import { describe, it, expect, afterEach } from 'vitest';
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

  it('excludes in-service SPs whose status is non-zero', () => {
    const sp = pickPrimarySp([
      { operatorAddress: '0x1', endpoint: 'https://busy.sp', status: 1 },
      { operatorAddress: '0x2', endpoint: 'https://idle.sp', status: 0 },
    ]);
    expect(sp.operatorAddress).toBe('0x2');
  });
});

// GF_SP-aware selection: when GF_SP is set the chosen SP must serve that
// gateway. On the local stack the configured host (greenfield-local:9033)
// differs from the SP's on-chain endpoint host (127.0.0.1:9033), so a
// PORT fallback deterministically selects the primary (sp0). See BUG-011.
describe('pickPrimarySp with GF_SP', () => {
  afterEach(() => {
    delete process.env.GF_SP;
  });

  it('matches the SP by host when GF_SP host appears in the endpoint', () => {
    process.env.GF_SP = 'http://127.0.0.1:9033';
    const sp = pickPrimarySp([
      { operatorAddress: '0xPRIMARY', endpoint: 'http://127.0.0.1:9033' },
      { operatorAddress: '0xOTHER', endpoint: 'http://127.0.0.1:9034' },
    ]);
    expect(sp.operatorAddress).toBe('0xPRIMARY');
  });

  it('falls back to PORT match when host differs (local docker case)', () => {
    process.env.GF_SP = 'http://greenfield-local:9033';
    const sp = pickPrimarySp([
      { operatorAddress: '0xPRIMARY', endpoint: 'http://127.0.0.1:9033' },
      { operatorAddress: '0xSECONDARY', endpoint: 'http://127.0.0.1:9034' },
    ]);
    expect(sp.operatorAddress).toBe('0xPRIMARY');
    expect(sp.endpoint).toBe('http://127.0.0.1:9033');
  });

  it('falls through to https/http selection when GF_SP matches nothing', () => {
    process.env.GF_SP = 'http://no-such-host:1234';
    const sp = pickPrimarySp([
      { operatorAddress: '0x1', endpoint: 'http://insecure.sp' },
      { operatorAddress: '0x2', endpoint: 'https://secure.sp' },
    ]);
    expect(sp.operatorAddress).toBe('0x2'); // normal https preference
  });
});
