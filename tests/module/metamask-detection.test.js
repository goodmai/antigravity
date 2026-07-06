// @vitest-environment jsdom
/**
 * [module] MetaMask provider detection, session management, signing flow
 *
 * Tests the three deployment environments:
 *   Mode 1 — MetaMask mobile in-app browser (injected window.ethereum)
 *   Mode 2 — Desktop Chrome with extension (window.ethereum.providers[], EIP-6963)
 *   Mode 3 — Mobile Chrome (deep-link redirect to metamask.app.link)
 *
 * All ethereum calls are mocked with vi.fn(). No real wallet, no network.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  connectAndSign,
  switchToUnit0,
  hasMetaMask,
  getMetaMaskProvider,
  isMobileUserAgent,
  isInAppMetaMaskBrowser,
  buildMetaMaskDeepLink,
  shortAddress,
  getSession,
  setSession,
  clearSession,
  verifyWalletSignature,
  SIGN_MESSAGE,
  UNIT0_CHAIN_ID_HEX,
  UNIT0_CHAIN,
  __injectVerifyMessage,
  __registerEip6963Provider,
  __clearEip6963Providers,
} from '../../academy/js/web3-core.js';

const UA_ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const UA_METAMASK_INAPP =
  'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 MetaMaskMobile';
const UA_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── Provider mock helpers ─────────────────────────────────────────────────

function mockEthereum(overrides = {}) {
  return {
    isMetaMask: true,
    request: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    ...overrides,
  };
}

function successEthereum(address = '0xAbCd1234567890abcdef1234567890AbCd123456', sig = '0xdeadbeef') {
  const eth = mockEthereum();
  eth.request.mockImplementation(({ method }) => {
    if (method === 'eth_requestAccounts')        return Promise.resolve([address]);
    if (method === 'wallet_switchEthereumChain') return Promise.resolve(null);
    if (method === 'personal_sign')              return Promise.resolve(sig);
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
    const result = await connectAndSign(successEthereum(addr));
    expect(result.address).toBe(addr);
  });

  it('persists the address in localStorage after connect', async () => {
    const addr = '0x1111222233334444555566667777888899990000';
    __injectVerifyMessage(vi.fn().mockResolvedValue(true));
    await connectAndSign(successEthereum(addr));
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

// ── 6. Session lifecycle ──────────────────────────────────────────────────

describe('Session lifecycle', () => {
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
    await connectAndSign(successEthereum(addr1, '0xsig1'));
    expect(getSession()?.address).toBe(addr1);
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

// ── 7. Mobile browser detection ──────────────────────────────────────────

describe('Mobile browser detection', () => {
  it('hasMetaMask returns false without a provider', () => {
    expect(hasMetaMask(undefined)).toBe(false);
  });

  it('hasMetaMask returns false when provider lacks isMetaMask flag', () => {
    expect(hasMetaMask({ request: vi.fn() })).toBe(false);
    expect(hasMetaMask({ isMetaMask: false })).toBe(false);
  });

  it('connectAndSign throws METAMASK_NOT_FOUND when isMetaMask flag is absent', async () => {
    const eth = { isMetaMask: false, request: vi.fn() };
    await expect(connectAndSign(eth)).rejects.toMatchObject({ code: 'METAMASK_NOT_FOUND' });
  });
});

// ── 8. Mode 1 — MetaMask mobile in-app browser ───────────────────────────

describe('Mode 1 — MetaMask mobile in-app browser', () => {
  beforeEach(() => { clearSession(); __clearEip6963Providers(); });

  it('resolves the injected provider inside the MetaMask app', () => {
    const eth = mockEthereum();
    expect(getMetaMaskProvider(eth)).toBe(eth);
    expect(hasMetaMask(eth)).toBe(true);
  });

  it('isInAppMetaMaskBrowser detects the MetaMask in-app UA', () => {
    expect(isInAppMetaMaskBrowser(UA_METAMASK_INAPP)).toBe(true);
    expect(isInAppMetaMaskBrowser(UA_ANDROID_CHROME)).toBe(false);
  });

  it('connectAndSign completes the full flow with the injected provider', async () => {
    __injectVerifyMessage(vi.fn().mockResolvedValue(true));
    const addr = '0xAbCd1234567890abcdef1234567890AbCd123456';
    const result = await connectAndSign(successEthereum(addr), { userAgent: UA_METAMASK_INAPP });
    expect(result.address).toBe(addr);
  });
});

// ── 9. Mode 2 — Desktop Chrome with extension(s) ─────────────────────────

describe('Mode 2 — Desktop Chrome with extension(s)', () => {
  beforeEach(() => { clearSession(); __clearEip6963Providers(); });

  it('resolves MetaMask from window.ethereum.providers[] when multiple wallets coexist', () => {
    const coinbase = { isMetaMask: false, isCoinbaseWallet: true, request: vi.fn() };
    const metamask = mockEthereum();
    const root = { isMetaMask: false, providers: [coinbase, metamask], request: vi.fn() };
    expect(getMetaMaskProvider(root)).toBe(metamask);
    expect(hasMetaMask(root)).toBe(true);
  });

  it('does NOT mistake Brave/Coinbase shims for MetaMask', () => {
    const brave = { isMetaMask: true, isBraveWallet: true, request: vi.fn() };
    expect(getMetaMaskProvider(brave)).toBeNull();
    expect(hasMetaMask(brave)).toBe(false);
  });

  it('resolves MetaMask via EIP-6963 announcement even when window.ethereum is another wallet', () => {
    const mmProvider = mockEthereum();
    __registerEip6963Provider({ info: { rdns: 'io.metamask', name: 'MetaMask' }, provider: mmProvider });
    const phantom = { isMetaMask: false, isPhantom: true, request: vi.fn() };
    expect(getMetaMaskProvider(phantom)).toBe(mmProvider);
  });

  it('connectAndSign uses the EIP-6963-resolved MetaMask provider', async () => {
    __injectVerifyMessage(vi.fn().mockResolvedValue(true));
    const addr = '0x9999000000000000000000000000000000000001';
    const mm = successEthereum(addr);
    __registerEip6963Provider({ info: { rdns: 'io.metamask', name: 'MetaMask' }, provider: mm });
    const result = await connectAndSign({ isMetaMask: false, isPhantom: true, request: vi.fn() });
    expect(result.address).toBe(addr);
    expect(mm.request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
  });
});

// ── 10. Mode 3 — Mobile Chrome (Android), no injected provider ────────────

describe('Mode 3 — Mobile Chrome (Android), no injected provider', () => {
  beforeEach(() => { clearSession(); __clearEip6963Providers(); });

  it('isMobileUserAgent detects Android Chrome', () => {
    expect(isMobileUserAgent(UA_ANDROID_CHROME)).toBe(true);
    expect(isMobileUserAgent(UA_DESKTOP)).toBe(false);
  });

  it('buildMetaMaskDeepLink targets metamask.app.link/dapp/<host><path>', () => {
    const link = buildMetaMaskDeepLink({
      host: 'goodmai.github.io',
      pathname: '/antigravity/academy/login.html',
      search: '',
    });
    expect(link).toBe('https://metamask.app.link/dapp/goodmai.github.io/antigravity/academy/login.html');
  });

  it('connectAndSign throws METAMASK_MOBILE_REDIRECT with a deep link on mobile Chrome', async () => {
    const err = await connectAndSign(undefined, {
      userAgent: UA_ANDROID_CHROME,
      location: { host: 'example.com', pathname: '/p', search: '?x=1' },
    }).catch(e => e);
    expect(err.code).toBe('METAMASK_MOBILE_REDIRECT');
    expect(err.deepLink).toBe('https://metamask.app.link/dapp/example.com/p?x=1');
  });

  it('does NOT redirect when already inside the MetaMask in-app browser', async () => {
    await expect(
      connectAndSign(undefined, { userAgent: UA_METAMASK_INAPP }),
    ).rejects.toMatchObject({ code: 'METAMASK_NOT_FOUND' });
  });

  it('desktop without MetaMask still gets METAMASK_NOT_FOUND (no false redirect)', async () => {
    await expect(
      connectAndSign(undefined, { userAgent: UA_DESKTOP }),
    ).rejects.toMatchObject({ code: 'METAMASK_NOT_FOUND' });
  });
});
