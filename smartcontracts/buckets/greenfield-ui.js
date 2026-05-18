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
import { resolveInjectedProvider } from './wallet-provider.js';

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

/** Build a wallet-address allowlist Access Control Condition for Lit. */
export function addressAllowlistAcc(address) {
  return [
    {
      contractAddress: '',
      standardContractType: '',
      chain: 'ethereum',
      method: '',
      parameters: [':userAddress'],
      returnValueTest: { comparator: '=', value: address },
    },
  ];
}

export function initBucketConsole({
  doc,
  client,
  // Injectable seams so the Lit publish/open glue is unit-testable
  // without the CDN SDK; production lazily builds the real ones.
  publishCourseFn,
  openCourseObjectFn,
} = {}) {
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
  const walletProvider = resolveInjectedProvider();
  const gfClient =
    client ||
    createGreenfieldClient({
      transport: fetchTransport,
      backend: createWalletBackend({
        provider: walletProvider,
        makeClient: async () => {
          const m = await import('./greenfield-wallet-sdk.js');
          return m.makeWalletGreenfieldClient({
            provider: walletProvider,
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

  // ── Lit-protected encrypted course (publish / open) ──────────────────
  // Real defaults lazily load course-publish/read + the CDN Lit SDK; the
  // tested orchestration is injected in unit tests.
  const doPublishCourse =
    publishCourseFn ||
    (async ({ slug, accAddress }) => {
      const [{ publishCourse }, { createLitAccess }, { COURSE_TEMPLATE }, lit] =
        await Promise.all([
          import('./course-publish.js'),
          import('./lit-access.js'),
          import('./course-template.js'),
          import('./lit-sdk.js'),
        ]);
      const access = createLitAccess({
        litClient: await lit.makeLitClient({ network: 'datil-test' }),
      });
      return publishCourse({
        client: gfClient,
        spec: { ...COURSE_TEMPLATE, slug },
        pricing: { litSaveCost: 0n, storageCost: 0n },
        crypto: globalThis.crypto,
        lit: { access, accessControlConditions: addressAllowlistAcc(accAddress) },
      });
    });

  const doOpenCourse =
    openCourseObjectFn ||
    (async ({ bucketName, objectKey }) => {
      const [{ openCourseObject }, { createLitAccess }, lit] =
        await Promise.all([
          import('./course-read.js'),
          import('./lit-access.js'),
          import('./lit-sdk.js'),
        ]);
      const access = createLitAccess({
        litClient: await lit.makeLitClient({ network: 'datil-test' }),
      });
      const authContext = await lit.makeLitAuth({
        provider: walletProvider,
        network: 'datil-test',
      });
      return openCourseObject({
        client: gfClient,
        bucketName,
        objectKey,
        lit: { access, authContext },
        crypto: globalThis.crypto,
      });
    });

  bind('gf-lit-publish-form', async () => {
    const slug = $('gf-lit-slug').value.trim();
    const accAddress =
      ($('gf-lit-acc') && $('gf-lit-acc').value.trim()) ||
      (ownerInput && ownerInput.value.trim());
    if (!accAddress) {
      setStatus('Enter the reader address allowed to decrypt', false);
      return;
    }
    setStatus('Publishing Lit-protected course…');
    const res = await doPublishCourse({ slug, accAddress });
    setStatus(
      `Published "${res.bucketName}" — ${res.savedKeys.length} objects, ` +
        `w3ext fee ${res.settlement.w3extFee}`,
    );
  });

  bind('gf-lit-open-form', async () => {
    const bucketName = $('gf-lit-open-bucket').value.trim();
    const objectKey = $('gf-lit-open-key').value.trim();
    setStatus('Opening protected object via Lit…');
    const out = await doOpenCourse({ bucketName, objectKey });
    const pane = $('gf-lit-output');
    if (pane) pane.textContent = out.text ?? '[binary]';
    setStatus(`Decrypted ${objectKey}`);
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
