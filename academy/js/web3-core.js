/**
 * Daskibo Academy — Web3 core logic
 * Pure functions: no DOM access. Injectable viem dependency for testing.
 * Used by both web3.js (browser) and tests/web3.test.js (vitest).
 */

export const UNIT0_CHAIN_ID_HEX = '0x15AEB'; // 88811

export const UNIT0_CHAIN = {
  chainId: UNIT0_CHAIN_ID_HEX,
  chainName: 'Unit Zero Mainnet',
  nativeCurrency: { name: 'UNIT0', symbol: 'UNIT0', decimals: 18 },
  rpcUrls: ['https://rpc.unit0.dev'],
  blockExplorerUrls: ['https://explorer.unit0.dev'],
};

export const SIGN_MESSAGE =
  'I am the owner of this wallet. ' +
  'I agree to save my progress via cookies and to receive a certificate ' +
  'upon completion of practical tasks on Daskibo Academy.';

// ── viem verifyMessage — lazy CDN load, injectable for tests ──────────────

let _verifyFn = null;

/** Override the verify implementation (used by tests). */
export function __injectVerifyMessage(fn) {
  _verifyFn = fn;
}

async function getVerifyFn() {
  if (_verifyFn) return _verifyFn;
  const { verifyMessage } = await import('https://esm.sh/viem@2');
  _verifyFn = verifyMessage;
  return _verifyFn;
}

// ── Helpers ───────────────────────────────────────────────────────────────

export function hasMetaMask(ethereum) {
  const eth = ethereum ?? (typeof window !== 'undefined' ? window.ethereum : undefined);
  return Boolean(eth?.isMetaMask);
}

export function shortAddress(addr) {
  if (!addr || addr.length < 10) return addr ?? '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ── Session (localStorage + cookie) ──────────────────────────────────────

export function setSession(address, sig) {
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
  if (typeof document !== 'undefined') {
    document.cookie = `daskibo_wallet=${encodeURIComponent(address)}; expires=${expires}; path=/antigravity/; SameSite=Lax`;
    document.cookie = `daskibo_sig=${encodeURIComponent(sig)}; expires=${expires}; path=/antigravity/; SameSite=Lax`;
  }
  try { localStorage.setItem('daskibo_wallet', address); } catch (_) {}
  try { localStorage.setItem('daskibo_sig', sig); } catch (_) {}
}

export function getSession() {
  try {
    let address = localStorage.getItem('daskibo_wallet');
    let sig     = localStorage.getItem('daskibo_sig');

    // Migration / Cookie fallback
    if (!address || !sig) {
      if (typeof document !== 'undefined') {
        const cookies = document.cookie.split('; ');
        const getCookie = (name) => {
          const c = cookies.find(x => x.startsWith(name + '='));
          return c ? decodeURIComponent(c.split('=')[1]) : null;
        };
        address = getCookie('daskibo_wallet') || localStorage.getItem('antigravity_wallet');
        sig     = getCookie('daskibo_sig')    || localStorage.getItem('antigravity_sig');
        
        if (address && sig) {
          localStorage.setItem('daskibo_wallet', address);
          localStorage.setItem('daskibo_sig', sig);
        }
      }
    }
    
    if (address && sig) return { address, sig };
  } catch (_) {}
  return null;
}

export function clearSession() {
  const past = 'Thu, 01 Jan 1970 00:00:00 GMT';
  if (typeof document !== 'undefined') {
    document.cookie = `daskibo_wallet=; expires=${past}; path=/antigravity/`;
    document.cookie = `daskibo_sig=; expires=${past}; path=/antigravity/`;
  }
  try { localStorage.removeItem('daskibo_wallet'); } catch (_) {}
  try { localStorage.removeItem('daskibo_sig'); } catch (_) {}
}

// ── Network ───────────────────────────────────────────────────────────────

/**
 * Switches MetaMask to Unit Zero Mainnet.
 * Adds the chain if it is not yet in the wallet (error code 4902 / -32603).
 */
export async function switchToUnit0(ethereum) {
  const eth = ethereum ?? (typeof window !== 'undefined' ? window.ethereum : null);
  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: UNIT0_CHAIN_ID_HEX }],
    });
  } catch (err) {
    if (err?.code === 4902 || err?.code === -32603) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [UNIT0_CHAIN],
      });
    } else {
      throw err;
    }
  }
}

// ── Signature verification (offline, via viem) ────────────────────────────

export async function verifyWalletSignature(address, sig) {
  try {
    const verify = await getVerifyFn();
    return await verify({ address, message: SIGN_MESSAGE, signature: sig });
  } catch (_) {
    return false;
  }
}

// ── Core auth flow ────────────────────────────────────────────────────────

/**
 * Full connect → switch network → sign → verify flow.
 * Returns { address, sig } on success.
 * Throws typed errors with a .code property (see ERROR_CODES below).
 */
export async function connectAndSign(ethereum) {
  const eth = ethereum ?? (typeof window !== 'undefined' ? window.ethereum : null);

  if (!eth?.isMetaMask) {
    throw _err('MetaMask is not installed', 'METAMASK_NOT_FOUND');
  }

  // 1. Request account access
  let accounts;
  try {
    accounts = await eth.request({ method: 'eth_requestAccounts' });
  } catch (err) {
    if (err?.code === 4001) throw _err('Connection rejected by user', 'USER_REJECTED');
    throw err;
  }

  const address = accounts?.[0];
  if (!address) throw _err('No accounts available — please unlock MetaMask', 'NO_ACCOUNTS');

  // 2. Switch / add Unit Zero network
  try {
    await switchToUnit0(eth);
  } catch (err) {
    if (err?.code === 4001)     throw _err('Network switch rejected by user', 'USER_REJECTED_NETWORK');
    if (_isNetworkError(err))   throw _err('Unit Zero network endpoint is unavailable', 'NETWORK_UNAVAILABLE');
    throw err;
  }

  // 3. Personal sign
  let sig;
  try {
    sig = await eth.request({ method: 'personal_sign', params: [SIGN_MESSAGE, address] });
  } catch (err) {
    if (err?.code === 4001) throw _err('Signing rejected by user', 'USER_REJECTED_SIGNING');
    throw err;
  }

  // 4. Offline signature verification via viem
  const isValid = await verifyWalletSignature(address, sig);
  if (!isValid) throw _err('Signature verification failed', 'INVALID_SIGNATURE');

  // 5. Persist session
  setSession(address, sig);
  return { address, sig };
}

// ── Internal helpers ──────────────────────────────────────────────────────

function _err(message, code) {
  return Object.assign(new Error(message), { code });
}

function _isNetworkError(err) {
  const msg = (err?.message ?? '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('network error')   ||
    msg.includes('econnrefused')    ||
    msg.includes('timeout')         ||
    msg.includes('unreachable')     ||
    (err?.code === -32603 && msg.includes('fetch'))
  );
}
