/**
 * Daskibo Academy — Greenfield bucket-console UI glue
 *
 * DOM-only layer: turns the smartcontracts/index.html form submissions into
 * calls on the pure greenfield-core client. Kept free of network code so it
 * stays unit-testable under jsdom with a mock client.
 */

import {
  createGreenfieldClient,
  GREENFIELD_TESTNET,
} from './greenfield-core.js';
import { createWalletBackend } from './greenfield-wallet-backend.js';
import { getMetaMaskProvider } from '../../academy/js/web3-core.js';

/** Real-fetch transport used in the browser. */
export async function fetchTransport({ method, url, headers, body }) {
  const res = await fetch(url, { method, headers, body: body || undefined });
  const text = await res.text();
  const hdrs = {};
  res.headers.forEach((v, k) => {
    hdrs[k.toLowerCase()] = v;
  });
  return { status: res.status, headers: hdrs, body: text };
}

export function initBucketConsole({ doc, client } = {}) {
  const d = doc || document;
  const $ = (id) => d.getElementById(id);

  const status = $('gf-status');
  const setStatus = (msg, ok = true) => {
    if (!status) return;
    status.textContent = msg;
    status.dataset.state = ok ? 'ok' : 'error';
  };

  const ownerInput = $('gf-owner');
  // The factory captures `owner` once, so the live address from the input
  // is passed per-call via ownerOpt()/ownerArgs() instead.
  //
  // Browser writes are signed by the user's wallet: the wallet backend
  // resolves the account (EIP-1193) and the real Greenfield protocol is
  // loaded lazily from the CDN SDK only when a write actually happens.
  const gfClient =
    client ||
    createGreenfieldClient({
      transport: fetchTransport,
      backend: createWalletBackend({
        provider: getMetaMaskProvider(),
        makeClient: async () => {
          const m = await import('./greenfield-wallet-sdk.js');
          return m.makeWalletGreenfieldClient({
            provider: getMetaMaskProvider(),
            rpcUrl: GREENFIELD_TESTNET.rpcUrl,
            chainId: GREENFIELD_TESTNET.chainId,
            spEndpoint: GREENFIELD_TESTNET.spEndpoint,
          });
        },
      }),
    });

  const ownerOpt = () =>
    ownerInput && ownerInput.value.trim()
      ? { owner: ownerInput.value.trim() }
      : {};

  function bind(formId, handler) {
    const form = $(formId);
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await handler();
      } catch (err) {
        setStatus(`[${err.code || 'ERROR'}] ${err.message}`, false);
      }
    });
  }

  bind('gf-create-form', async () => {
    const name = $('gf-bucket-name').value.trim();
    setStatus('Creating bucket…');
    const res = await gfClient.createBucket(name, {
      visibility: 'public',
      ...ownerOpt(),
    });
    setStatus(`Bucket "${res.bucketName}" created (tx ${res.txHash || 'n/a'})`);
    await refreshList();
  });

  bind('gf-search-form', async () => {
    const q = $('gf-search-query').value.trim();
    setStatus('Searching…');
    const results = await gfClient.searchBuckets(q, ...ownerArgs());
    renderList(results);
    setStatus(`${results.length} bucket(s) found`);
  });

  bind('gf-save-form', async () => {
    const bucket = $('gf-save-bucket').value.trim();
    const key = $('gf-save-key').value.trim();
    const body = $('gf-save-body').value;
    setStatus('Saving object…');
    const res = await gfClient.saveObject(bucket, key, body, {
      contentType: 'text/markdown',
      ...ownerOpt(),
    });
    setStatus(`Saved ${res.objectKey} → ${res.bucketName} (tx ${res.txHash || 'n/a'})`);
  });

  bind('gf-read-form', async () => {
    const bucket = $('gf-read-bucket').value.trim();
    const key = $('gf-read-key').value.trim();
    setStatus('Reading object…');
    const out = $('gf-object-output');
    const data = await gfClient.readObject(bucket, key);
    if (out) out.textContent = data;
    setStatus(`Read ${key} from ${bucket}`);
  });

  function ownerArgs() {
    return ownerInput && ownerInput.value.trim()
      ? [ownerInput.value.trim()]
      : [];
  }

  function renderList(buckets) {
    const list = $('gf-bucket-list');
    if (!list) return;
    list.innerHTML = '';
    for (const b of buckets) {
      const li = d.createElement('li');
      li.textContent = `${b.name} · ${b.visibility}`;
      list.appendChild(li);
    }
  }

  async function refreshList() {
    try {
      renderList(await gfClient.searchBuckets('', ...ownerArgs()));
    } catch (_) {
      /* listing is best-effort on the landing page */
    }
  }

  return { client: gfClient, config: GREENFIELD_TESTNET, refreshList };
}

// Auto-init in the browser (skipped under jsdom test, which imports directly).
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('gf-create-form')) initBucketConsole({});
  });
}
