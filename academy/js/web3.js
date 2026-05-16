/**
 * Daskibo Academy — MetaMask DOM integration
 * ES module. Imports pure logic from web3-core.js, handles DOM, toasts,
 * provider events, and exposes window.Web3Auth for legacy pages.
 */

import {
  connectAndSign,
  clearSession,
  getSession,
  shortAddress,
  hasMetaMask,
  getMetaMaskProvider,
  __registerEip6963Provider,
  UNIT0_CHAIN_ID_HEX,
} from './web3-core.js';

// ── Toast notification system ─────────────────────────────────────────────

function _toastContainer() {
  let el = document.getElementById('daskibo-toasts');
  if (!el) {
    el = document.createElement('div');
    el.id = 'daskibo-toasts';
    el.className = 'toast-container';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'false');
    document.body.appendChild(el);
  }
  return el;
}

function showToast(msg, type = 'info', duration = 4500) {
  const container = _toastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');
  toast.textContent = msg;
  container.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

// ── Error code → human-readable toast ────────────────────────────────────

const ERROR_MESSAGES = {
  METAMASK_NOT_FOUND:    '🦊 MetaMask not detected. Install it at metamask.io',
  USER_REJECTED:         'Connection cancelled.',
  USER_REJECTED_NETWORK: 'Please approve switching to Unit Zero Mainnet in MetaMask.',
  USER_REJECTED_SIGNING: 'Signature is required to access the academy. Please try again.',
  NETWORK_UNAVAILABLE:   'Unit Zero network is currently unavailable. Please try again later.',
  INVALID_SIGNATURE:     'Signature verification failed. Please reconnect.',
  NO_ACCOUNTS:           'No accounts found — please unlock your MetaMask wallet.',
  METAMASK_MOBILE_REDIRECT: 'Opening the MetaMask app…',
};

function _errMsg(err) {
  return ERROR_MESSAGES[err?.code] || err?.message || 'An unexpected error occurred.';
}

// ── Auth card helpers ─────────────────────────────────────────────────────

function _showAuthError(msg) {
  const el = document.getElementById('web3-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function _hideAuthError() {
  const el = document.getElementById('web3-error');
  if (el) el.style.display = 'none';
}

// ── Nav wallet pill ───────────────────────────────────────────────────────

function updateNavWallet(address) {
  const pill     = document.getElementById('nav-wallet-pill');
  const addrEl   = document.getElementById('nav-wallet-addr');
  const loginBtn = document.getElementById('nav-btn-login');
  const signupBtn= document.getElementById('nav-btn-signup');

  if (address) {
    if (pill)    { pill.style.display = 'flex'; }
    if (addrEl)  { addrEl.textContent = shortAddress(address); }
    if (loginBtn)  loginBtn.style.display = 'none';
    if (signupBtn) signupBtn.style.display = 'none';
  } else {
    if (pill)      pill.style.display = 'none';
    if (loginBtn)  loginBtn.style.display = '';
    if (signupBtn) signupBtn.style.display = '';
  }
}

// ── Provider event handlers ───────────────────────────────────────────────

function _onAccountsChanged(accounts) {
  if (!accounts || accounts.length === 0) {
    clearSession();
    updateNavWallet(null);
    showToast('Wallet disconnected.', 'warning');
    document.dispatchEvent(new CustomEvent('walletDisconnected'));
    return;
  }
  const newAddr = accounts[0];
  const session = getSession();
  if (session && session.address.toLowerCase() !== newAddr.toLowerCase()) {
    clearSession();
    updateNavWallet(null);
    showToast(
      `Account changed to ${shortAddress(newAddr)}. Please reconnect to continue.`,
      'warning', 6000,
    );
    document.dispatchEvent(new CustomEvent('walletDisconnected'));
  }
}

function _onChainChanged(chainId) {
  if (chainId.toLowerCase() === UNIT0_CHAIN_ID_HEX.toLowerCase()) {
    showToast('Switched to Unit Zero Mainnet.', 'success');
  } else if (getSession()) {
    showToast('You left Unit Zero Mainnet. Some features may not work.', 'warning', 6000);
  }
}

function _onDisconnect() {
  clearSession();
  updateNavWallet(null);
  showToast('Wallet provider disconnected.', 'warning');
  document.dispatchEvent(new CustomEvent('walletDisconnected'));
}

// Idempotent listener binding — EIP-6963 may resolve the same provider
// the legacy fallback already wired up.
const _wiredProviders = new WeakSet();
function _attachProviderEvents(provider) {
  if (!provider || typeof provider.on !== 'function') return;
  if (_wiredProviders.has(provider)) return;
  _wiredProviders.add(provider);
  provider.on('accountsChanged', _onAccountsChanged);
  provider.on('chainChanged',    _onChainChanged);
  provider.on('disconnect',      _onDisconnect);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────

function _init() {
  // Restore wallet state from persisted session
  const session = getSession();
  if (session) updateNavWallet(session.address);

  // EIP-6963: collect announced providers so MetaMask is discoverable even
  // when several wallet extensions coexist on desktop Chrome.
  window.addEventListener('eip6963:announceProvider', (e) => {
    __registerEip6963Provider(e.detail);
    const mm = getMetaMaskProvider();
    if (mm) _attachProviderEvents(mm);
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));

  // Attach MetaMask provider event listeners (resolved across environments)
  const eth = getMetaMaskProvider();
  if (eth) _attachProviderEvents(eth);

  // Wire connect buttons (data-action="connect")
  document.querySelectorAll('[data-action="connect"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      _hideAuthError();
      btn.disabled = true;
      btn.classList.add('loading');

      try {
        const result = await connectAndSign();

        // Update nav wallet indicator
        updateNavWallet(result.address);
        showToast(`Connected: ${shortAddress(result.address)}`, 'success');

        // Update auth card success state (login / signup pages)
        const display = document.getElementById('wallet-display');
        const addrEl  = document.getElementById('wallet-addr');
        if (display && addrEl) {
          addrEl.textContent = shortAddress(result.address);
          display.classList.add('visible');
        }

        document.dispatchEvent(new CustomEvent('walletConnected', { detail: result }));
      } catch (err) {
        if (err?.code === 'METAMASK_MOBILE_REDIRECT' && err.deepLink) {
          showToast(ERROR_MESSAGES.METAMASK_MOBILE_REDIRECT, 'info', 6000);
          window.location.href = err.deepLink;
          return;
        }
        const msg = _errMsg(err);
        showToast(msg, 'error', 6000);
        if (err?.code === 'METAMASK_NOT_FOUND') {
          _showAuthError('MetaMask not installed. Visit metamask.io to install.');
        } else {
          _showAuthError(msg);
        }
      } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    });
  });

  // Wire logout / nav-disconnect buttons
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-action="logout"], #nav-wallet-disconnect')) return;
    clearSession();
    updateNavWallet(null);
    showToast('Disconnected from Daskibo Academy.', 'info');
    document.dispatchEvent(new CustomEvent('walletDisconnected'));
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _init);
} else {
  _init();
}

// Expose minimal API for any inline page scripts that need it
window.Web3Auth = {
  hasMetaMask,
  getMetaMaskProvider,
  connectAndSign,
  getSession,
  clearSession,
  shortAddress,
  showToast,
  updateNavWallet,
};
