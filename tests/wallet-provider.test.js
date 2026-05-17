/**
 * Daskibo Academy — injected wallet provider resolver (TDD)
 *
 * Removes the cross-package coupling to academy/js/web3-core.js: a tiny
 * pure EIP-1193 resolver owned by smartcontracts.
 */

import { describe, it, expect } from 'vitest';
import { resolveInjectedProvider } from '../smartcontracts/buckets/wallet-provider.js';

describe('resolveInjectedProvider', () => {
  it('returns window.ethereum when it exposes request()', () => {
    const eth = { request: () => {} };
    expect(resolveInjectedProvider({ ethereum: eth })).toBe(eth);
  });

  it('prefers an EIP-6963 MetaMask provider when present', () => {
    const mm = { request: () => {}, isMetaMask: true };
    const win = {
      ethereum: { request: () => {} },
      __eip6963: [{ info: { rdns: 'io.metamask' }, provider: mm }],
    };
    expect(resolveInjectedProvider(win)).toBe(mm);
  });

  it('returns undefined when no wallet is injected', () => {
    expect(resolveInjectedProvider({})).toBeUndefined();
    expect(resolveInjectedProvider(undefined)).toBeUndefined();
  });

  it('ignores an ethereum object without request()', () => {
    expect(resolveInjectedProvider({ ethereum: {} })).toBeUndefined();
  });
});
