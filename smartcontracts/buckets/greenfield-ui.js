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
  const gfClient =
    client ||
    createGreenfieldClient({
      transport: fetchTransport,
      get owner() {
        return ownerInput ? ownerInput.value.trim() : undefined;
      },
    });

  // When the default client is used we cannot pass a live getter through the
  // factory, so re-resolve the owner per call by rebuilding lightweight opts.
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
