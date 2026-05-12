/**
 * Daskibo Academy — Web3 / MetaMask integration
 * Network: Unit Zero Mainnet (Chain ID 88811)
 */
(function (global) {
  'use strict';

  var UNIT0_CHAIN = {
    chainId: '0x15AEB',          // 88811 in hex
    chainName: 'Unit Zero Mainnet',
    nativeCurrency: { name: 'UNIT0', symbol: 'UNIT0', decimals: 18 },
    rpcUrls: ['https://rpc.unit0.dev'],
    blockExplorerUrls: ['https://explorer.unit0.dev'],
  };

  /* Message users sign on login/signup — must be in English per spec */
  var SIGN_MESSAGE =
    'I am the owner of this wallet. ' +
    'I agree to save my progress via cookies and to receive a certificate ' +
    'upon completion of practical tasks on Daskibo Academy.';

  /* ── helpers ─────────────────────────────────────── */
  function hasMetaMask() {
    return typeof window.ethereum !== 'undefined' && window.ethereum.isMetaMask;
  }

  function shortAddress(addr) {
    return addr.slice(0, 6) + '…' + addr.slice(-4);
  }

  function setSession(addr, sig) {
    /* progress stored in a cookie (7-day expiry) */
    var expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = 'daskibo_wallet=' + encodeURIComponent(addr) + '; expires=' + expires + '; path=/; SameSite=Lax';
    document.cookie = 'daskibo_sig=' + encodeURIComponent(sig)  + '; expires=' + expires + '; path=/; SameSite=Lax';
    try {
      localStorage.setItem('daskibo_wallet', addr);
      localStorage.setItem('daskibo_sig', sig);
    } catch (e) {}
  }

  function getSession() {
    try {
      var addr = localStorage.getItem('daskibo_wallet');
      var sig  = localStorage.getItem('daskibo_sig');
      if (addr && sig) return { address: addr, sig: sig };
    } catch (e) {}
    return null;
  }

  function clearSession() {
    var past = 'Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'daskibo_wallet=; expires=' + past + '; path=/';
    document.cookie = 'daskibo_sig=; expires='    + past + '; path=/';
    try {
      localStorage.removeItem('daskibo_wallet');
      localStorage.removeItem('daskibo_sig');
    } catch (e) {}
  }

  /* ── network switch ──────────────────────────────── */
  async function switchToUnit0() {
    var eth = window.ethereum;
    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: UNIT0_CHAIN.chainId }],
      });
    } catch (err) {
      /* 4902 = chain not yet added */
      if (err.code === 4902) {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [UNIT0_CHAIN],
        });
      } else {
        throw err;
      }
    }
  }

  /* ── core auth flow ──────────────────────────────── */
  /**
   * Full connect + switch network + sign message flow.
   * Returns { address, sig } on success, throws on failure.
   */
  async function connectAndSign() {
    if (!hasMetaMask()) {
      throw new Error('METAMASK_NOT_FOUND');
    }

    /* 1. Request account access */
    var accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    var address  = accounts[0];

    /* 2. Switch / add Unit0 network */
    await switchToUnit0();

    /* 3. Personal sign */
    var sig = await window.ethereum.request({
      method: 'personal_sign',
      params: [SIGN_MESSAGE, address],
    });

    /* 4. Persist session */
    setSession(address, sig);

    return { address: address, sig: sig };
  }

  /* ── UI helpers ──────────────────────────────────── */
  function updateWalletUI() {
    var session = getSession();
    var btns    = document.querySelectorAll('[data-wallet-status]');
    btns.forEach(function (el) {
      if (session) {
        el.textContent = shortAddress(session.address);
        el.classList.add('connected');
      } else {
        el.textContent = el.dataset.defaultText || 'Connect';
        el.classList.remove('connected');
      }
    });
  }

  function showError(containerId, msg) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  }

  function hideError(containerId) {
    var el = document.getElementById(containerId);
    if (el) el.style.display = 'none';
  }

  /* ── bootstrap ───────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    updateWalletUI();

    /* Wire any element with data-action="connect" */
    document.querySelectorAll('[data-action="connect"]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        hideError('web3-error');
        btn.disabled = true;
        btn.classList.add('loading');
        try {
          var result = await connectAndSign();
          updateWalletUI();
          document.dispatchEvent(new CustomEvent('walletConnected', { detail: result }));
        } catch (err) {
          var msg = err.message === 'METAMASK_NOT_FOUND'
            ? (window.I18n ? window.I18n.t('auth_no_metamask') : 'MetaMask not found.')
            : (err.message || 'Connection failed.');
          showError('web3-error', msg);
        } finally {
          btn.disabled = false;
          btn.classList.remove('loading');
        }
      });
    });

    /* Wire logout */
    document.querySelectorAll('[data-action="logout"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        clearSession();
        updateWalletUI();
        document.dispatchEvent(new CustomEvent('walletDisconnected'));
      });
    });
  });

  global.Web3Auth = {
    hasMetaMask:    hasMetaMask,
    connectAndSign: connectAndSign,
    switchToUnit0:  switchToUnit0,
    getSession:     getSession,
    clearSession:   clearSession,
    SIGN_MESSAGE:   SIGN_MESSAGE,
    UNIT0_CHAIN:    UNIT0_CHAIN,
  };
}(window));
