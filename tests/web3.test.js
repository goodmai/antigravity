/**
 * Daskibo Academy — MetaMask integration tests
 *
 * Test suites:
 *   1. Network switching
 *   2. Address display
 *   3. Signing rejection
 *   4. Endpoint unavailability
 *   5. Signed message validation
 *   6. Disconnect and wallet change
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  connectAndSign,
  switchToUnit0,
  hasMetaMask,
  shortAddress,
  getSession,
  setSession,
  clearSession,
  verifyWalletSignature,
  SIGN_MESSAGE,
  UNIT0_CHAIN_ID_HEX,
  UNIT0_CHAIN,
  __injectVerifyMessage,
} from '../academy/js/web3-core.js';

// ── Mock ethereum provider factory ───────────────────────────────────────

function mockEthereum(overrides = {}) {
  return {
    isMetaMask: true,
    request: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    ...overrides,
  };
}

// Default full-success ethereum mock (accounts + switch + sign all pass)
function successEthereum(address = '0xAbCd1234567890abcdef1234567890AbCd123456', sig = '0xdeadbeef') {
  const eth = mockEthereum();
  eth.request.mockImplementation(({ method }) => {
    if (method === 'eth_requestAccounts')      return Promise.resolve([address]);
    if (method === 'wallet_switchEthereumChain') return Promise.resolve(null);
    if (method === 'personal_sign')            return Promise.resolve(sig);
    return Promise.resolve(null);
  });
  return eth;
}

// ── 1. Network switching ──────────────────────────────────────────────────

describe('Network switching', () => {
  it('calls wallet_switchEthereumChain with Unit0 chain ID', async () => {
    const eth = mockEthereum();
    eth.request.mockResolvedValue(null);

    await switchToUnit0(eth);

    expect(eth.request).toHaveBeenCalledWith({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: UNIT0_CHAIN_ID_HEX }],
    });
  });

  it('adds the chain when wallet returns 4902 (not found)', async () => {
    const eth = mockEthereum();
    eth.request
      .mockRejectedValueOnce({ code: 4902, message: 'Unrecognized chain ID' })
      .mockResolvedValue(null);

    await switchToUnit0(eth);

    expect(eth.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'wallet_addEthereumChain',
        params: expect.arrayContaining([
          expect.objectContaining({ chainId: UNIT0_CHAIN_ID_HEX }),
        ]),
      }),
    );
  });

  it('adds the chain when wallet returns -32603 (internal error)', async () => {
    const eth = mockEthereum();
    eth.request
      .mockRejectedValueOnce({ code: -32603, message: 'chain not found' })
      .mockResolvedValue(null);

    await switchToUnit0(eth);

    expect(eth.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'wallet_addEthereumChain' }),
    );
  });

  it('throws USER_REJECTED_NETWORK when user rejects the network switch', async () => {
    __injectVerifyMessage(vi.fn().mockResolvedValue(true));
    const eth = mockEthereum();
    eth.request.mockImplementation(({ method }) => {
      if (method === 'eth_requestAccounts')        return Promise.resolve(['0xABCD']);
      if (method === 'wallet_switchEthereumChain') return Promise.reject({ code: 4001, message: 'User rejected' });
      return Promise.resolve(null);
    });

    await expect(connectAndSign(eth)).rejects.toMatchObject({ code: 'USER_REJECTED_NETWORK' });
  });

  it('adds UNIT0_CHAIN with correct RPC and explorer URLs', () => {
    expect(UNIT0_CHAIN.rpcUrls).toContain('https://rpc.unit0.dev');
    expect(UNIT0_CHAIN.blockExplorerUrls).toContain('https://explorer.unit0.dev');
    expect(UNIT0_CHAIN.nativeCurrency.symbol).toBe('UNIT0');
  });
});

// ── 2. Address display ────────────────────────────────────────────────────

describe('Address display', () => {
  beforeEach(() => clearSession());

  it('connectAndSign returns the connected address', async () => {
    const addr = '0xAbCd1234567890abcdef1234567890AbCd123456';
    __injectVerifyMessage(vi.fn().mockResolvedValue(true));
    const eth = successEthereum(addr);

    const result = await connectAndSign(eth);
    expect(result.address).toBe(addr);
  });

  it('persists the address in localStorage after connect', async () => {
    const addr = '0x1111222233334444555566667777888899990000';
    __injectVerifyMessage(vi.fn().mockResolvedValue(true));
    const eth = successEthereum(addr);

    await connectAndSign(eth);
    expect(getSession()?.address).toBe(addr);
  });

  it('shortAddress formats correctly (6 chars … 4 chars)', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678';
    expect(shortAddress(addr)).toBe('0x1234…5678');
  });

  it('shortAddress handles short or empty strings gracefully', () => {
    expect(shortAddress('')).toBe('');
    expect(shortAddress('0x123')).toBe('0x123');
  });

  it('hasMetaMask returns true for a valid MetaMask provider', () => {
    expect(hasMetaMask({ isMetaMask: true })).toBe(true);
  });

  it('hasMetaMask returns false without a provider', () => {
    expect(hasMetaMask(null)).toBe(false);
    expect(hasMetaMask(undefined)).toBe(false);
    expect(hasMetaMask({ isMetaMask: false })).toBe(false);
  });
});

// ── 3. Signing rejection ──────────────────────────────────────────────────

describe('Signing rejection', () => {
  beforeEach(() => clearSession());

  it('throws USER_REJECTED_SIGNING when user rejects personal_sign', async () => {
    const addr = '0xAbCd1234567890abcdef1234567890AbCd123456';
    const eth = mockEthereum();
    eth.request.mockImplementation(({ method }) => {
      if (method === 'eth_requestAccounts')        return Promise.resolve([addr]);
      if (method === 'wallet_switchEthereumChain') return Promise.resolve(null);
      if (method === 'personal_sign')              return Promise.reject({ code: 4001, message: 'User rejected' });
      return Promise.resolve(null);
    });

    await expect(connectAndSign(eth)).rejects.toMatchObject({ code: 'USER_REJECTED_SIGNING' });
  });

  it('does NOT persist a session when signing is rejected', async () => {
    const addr = '0xAbCd1234567890abcdef1234567890AbCd123456';
    const eth = mockEthereum();
    eth.request.mockImplementation(({ method }) => {
      if (method === 'eth_requestAccounts')        return Promise.resolve([addr]);
      if (method === 'wallet_switchEthereumChain') return Promise.resolve(null);
      if (method === 'personal_sign')              return Promise.reject({ code: 4001, message: 'User rejected' });
      return Promise.resolve(null);
    });

    try { await connectAndSign(eth); } catch (_) {}
    expect(getSession()).toBeNull();
  });

  it('throws USER_REJECTED when user rejects eth_requestAccounts', async () => {
    const eth = mockEthereum();
    eth.request.mockRejectedValue({ code: 4001, message: 'User denied account access' });

    await expect(connectAndSign(eth)).rejects.toMatchObject({ code: 'USER_REJECTED' });
  });
});

// ── 4. Endpoint unavailability ────────────────────────────────────────────

describe('Endpoint unavailability', () => {
  it('throws NETWORK_UNAVAILABLE when RPC endpoint cannot be reached', async () => {
    const addr = '0xAbCd1234567890abcdef1234567890AbCd123456';
    const eth = mockEthereum();
    eth.request.mockImplementation(({ method }) => {
      if (method === 'eth_requestAccounts')        return Promise.resolve([addr]);
      if (method === 'wallet_switchEthereumChain') return Promise.reject({ code: 4902 });
      if (method === 'wallet_addEthereumChain')    return Promise.reject({
        code: -32603,
        message: 'Internal JSON-RPC error. Failed to fetch',
      });
      return Promise.resolve(null);
    });

    await expect(connectAndSign(eth)).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
  });

  it('throws NETWORK_UNAVAILABLE on generic fetch failure during chain add', async () => {
    const addr = '0xAbCd1234567890abcdef1234567890AbCd123456';
    const eth = mockEthereum();
    eth.request.mockImplementation(({ method }) => {
      if (method === 'eth_requestAccounts')        return Promise.resolve([addr]);
      if (method === 'wallet_switchEthereumChain') return Promise.reject({ code: 4902 });
      if (method === 'wallet_addEthereumChain')    return Promise.reject(new Error('Failed to fetch'));
      return Promise.resolve(null);
    });

    await expect(connectAndSign(eth)).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });
  });

  it('throws METAMASK_NOT_FOUND when ethereum provider is absent', async () => {
    await expect(connectAndSign(null)).rejects.toMatchObject({ code: 'METAMASK_NOT_FOUND' });
    await expect(connectAndSign({ isMetaMask: false })).rejects.toMatchObject({ code: 'METAMASK_NOT_FOUND' });
  });
});

// ── 5. Signed message validation ─────────────────────────────────────────

describe('Signed message validation', () => {
  it('verifyWalletSignature returns true when viem reports valid', async () => {
    __injectVerifyMessage(vi.fn().mockResolvedValue(true));
    const ok = await verifyWalletSignature('0x1234', '0xvalidsig');
    expect(ok).toBe(true);
  });

  it('verifyWalletSignature returns false when viem reports invalid', async () => {
    __injectVerifyMessage(vi.fn().mockResolvedValue(false));
    const ok = await verifyWalletSignature('0x1234', '0xinvalidsig');
    expect(ok).toBe(false);
  });

  it('verifyWalletSignature returns false when viem throws', async () => {
    __injectVerifyMessage(vi.fn().mockRejectedValue(new Error('invalid hex')));
    const ok = await verifyWalletSignature('0x1234', '0xbadsig');
    expect(ok).toBe(false);
  });

  it('throws INVALID_SIGNATURE when signature does not match address', async () => {
    __injectVerifyMessage(vi.fn().mockResolvedValue(false));
    const addr = '0xAbCd1234567890abcdef1234567890AbCd123456';
    const eth = mockEthereum();
    eth.request.mockImplementation(({ method }) => {
      if (method === 'eth_requestAccounts')        return Promise.resolve([addr]);
      if (method === 'wallet_switchEthereumChain') return Promise.resolve(null);
      if (method === 'personal_sign')              return Promise.resolve('0xwrongsig');
      return Promise.resolve(null);
    });

    await expect(connectAndSign(eth)).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
  });

  it('connectAndSign calls verifyWalletSignature with the correct address and sig', async () => {
    const addr = '0xAbCd1234567890abcdef1234567890AbCd123456';
    const sig  = '0xmysignature';
    const mockVerify = vi.fn().mockResolvedValue(true);
    __injectVerifyMessage(mockVerify);
    const eth = successEthereum(addr, sig);

    await connectAndSign(eth);

    expect(mockVerify).toHaveBeenCalledWith(
      expect.objectContaining({ address: addr, signature: sig, message: SIGN_MESSAGE }),
    );
  });
});

// ── 6. Disconnect and wallet change ──────────────────────────────────────

describe('Disconnect and wallet change', () => {
  beforeEach(() => clearSession());

  it('clearSession removes wallet and sig from localStorage', () => {
    setSession('0xABC', '0xSIG');
    expect(getSession()).not.toBeNull();

    clearSession();
    expect(getSession()).toBeNull();
  });

  it('getSession returns null when no session exists', () => {
    expect(getSession()).toBeNull();
  });

  it('setSession / getSession roundtrip preserves address and sig', () => {
    const addr = '0xDeAdBeEf00000000000000000000000000000001';
    const sig  = '0xSignature';
    setSession(addr, sig);
    const session = getSession();
    expect(session?.address).toBe(addr);
    expect(session?.sig).toBe(sig);
  });

  it('new connectAndSign after wallet change stores the new address', async () => {
    const addr1 = '0x1111111111111111111111111111111111111111';
    const addr2 = '0x2222222222222222222222222222222222222222';
    __injectVerifyMessage(vi.fn().mockResolvedValue(true));

    // First connection
    await connectAndSign(successEthereum(addr1, '0xsig1'));
    expect(getSession()?.address).toBe(addr1);

    // Simulate wallet change: app clears old session, user reconnects
    clearSession();
    await connectAndSign(successEthereum(addr2, '0xsig2'));
    expect(getSession()?.address).toBe(addr2);
  });

  it('clearSession is idempotent (safe to call multiple times)', () => {
    clearSession();
    clearSession();
    expect(getSession()).toBeNull();
  });
});
