/**
 * Daskibo Academy — BNB Greenfield buckets core logic
 *
 * Pure, DOM-free module with an injectable HTTP transport. The browser entry
 * (greenfield-ui.js) wires the real `fetch`; tests inject a mock. This is the
 * same pattern as academy/js/web3-core.js.
 *
 * Greenfield stores data in S3-style **buckets**; objects live inside a
 * bucket and are reached through a Storage Provider (SP) HTTP gateway. We
 * speak the SP universal endpoint:
 *
 *   PUT  {sp}/{bucket}                  → create bucket
 *   GET  {sp}/        (owner header)    → list buckets
 *   PUT  {sp}/{bucket}/{key}            → save object
 *   GET  {sp}/download/{bucket}/{key}   → read object
 *   GET  {sp}/view/{bucket}/{key}       → public inline view
 *
 * The transport contract is intentionally tiny so it is trivial to mock:
 *   async ({ method, url, headers, body }) => { status, headers, body }
 */

export const GREENFIELD_TESTNET = {
  chainId: 5600,
  chainIdHex: '0x15E0',
  chainName: 'BNB Greenfield Testnet',
  cosmosChainId: 'greenfield_5600-1',
  nativeCurrency: { name: 'tBNB', symbol: 'BNB', decimals: 18 },
  rpcUrl: 'https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org',
  spEndpoint: 'https://gnfd-testnet-sp1.bnbchain.org',
  explorer: 'https://testnet.greenfieldscan.com',
  faucet: 'https://gnfd-testnet-faucet.bnbchain.org',
};

// ── Error helper ──────────────────────────────────────────────────────────

function gfError(message, code) {
  return Object.assign(new Error(message), { code });
}

// ── Validation ────────────────────────────────────────────────────────────
// Greenfield bucket names follow the S3-style DNS rules:
//   - 3..63 characters
//   - lowercase letters, digits, hyphens and dots
//   - must start and end with a letter or digit
//   - no consecutive dots, not formatted as an IPv4 address

const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const BUCKET_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

export function isValidBucketName(name) {
  if (typeof name !== 'string') return false;
  if (name.length < 3 || name.length > 63) return false;
  if (!BUCKET_RE.test(name)) return false;
  if (name.includes('..')) return false;
  if (IPV4_RE.test(name)) return false;
  return true;
}

export function assertBucketName(name) {
  if (!isValidBucketName(name)) {
    throw gfError(
      `Invalid bucket name: "${name}". Use 3-63 lowercase ` +
        `letters, digits or hyphens, starting and ending alphanumeric.`,
      'INVALID_BUCKET_NAME',
    );
  }
}

export function isValidObjectKey(key) {
  return typeof key === 'string' && key.length >= 1 && key.length <= 1024;
}

export function assertObjectKey(key) {
  if (!isValidObjectKey(key)) {
    throw gfError(
      'Invalid object key: must be 1-1024 characters.',
      'INVALID_OBJECT_KEY',
    );
  }
}

// ── URL builders ──────────────────────────────────────────────────────────

function encodeKey(key) {
  return String(key)
    .split('/')
    .map(encodeURIComponent)
    .join('/');
}

export function buildViewUrl(sp, bucket, key) {
  return `${sp}/view/${bucket}/${encodeKey(key)}`;
}

export function buildDownloadUrl(sp, bucket, key) {
  return `${sp}/download/${bucket}/${encodeKey(key)}`;
}

export function buildListBucketsRequest(sp, owner) {
  return {
    method: 'GET',
    url: `${sp}/`,
    headers: { 'X-Gnfd-User-Address': owner },
  };
}

// ── Status → error mapping ────────────────────────────────────────────────

function mapStatus(status, body) {
  if (status >= 200 && status < 300) return null;
  if (status === 404) return gfError('Resource not found', 'NOT_FOUND');
  if (status === 409) return gfError('Bucket already exists', 'BUCKET_EXISTS');
  if (status === 401 || status === 403) {
    return gfError('Not authorized for this Greenfield resource', 'UNAUTHORIZED');
  }
  if (status >= 500) {
    return gfError(
      `Storage Provider unavailable (HTTP ${status})`,
      'SP_UNAVAILABLE',
    );
  }
  return gfError(`Greenfield request failed (HTTP ${status}): ${body ?? ''}`, 'SP_ERROR');
}

// ── Client ────────────────────────────────────────────────────────────────

/**
 * @param {object}   cfg
 * @param {Function} cfg.transport  async ({method,url,headers,body}) => {status,headers,body}
 * @param {string}  [cfg.owner]     EVM address of the bucket owner
 * @param {string}  [cfg.endpoint]  SP gateway (defaults to testnet SP1)
 */
export function createGreenfieldClient({ transport, owner, endpoint } = {}) {
  if (typeof transport !== 'function') {
    throw gfError('A transport function is required', 'NO_TRANSPORT');
  }
  const sp = (endpoint || GREENFIELD_TESTNET.spEndpoint).replace(/\/+$/, '');

  function requireOwner(override) {
    const o = override || owner;
    if (!o) throw gfError('An owner address is required', 'NO_OWNER');
    return o;
  }

  async function send(req) {
    let res;
    try {
      res = await transport(req);
    } catch (err) {
      throw gfError(
        `Greenfield network error: ${err?.message ?? err}`,
        'NETWORK_ERROR',
      );
    }
    const failure = mapStatus(res.status, res.body);
    if (failure) throw failure;
    return res;
  }

  async function createBucket(name, opts = {}) {
    assertBucketName(name);
    const o = requireOwner(opts.owner);
    const res = await send({
      method: 'PUT',
      url: `${sp}/${name}`,
      headers: {
        'X-Gnfd-User-Address': o,
        'X-Gnfd-Visibility': opts.visibility || 'private',
      },
      body: '',
    });
    return {
      bucketName: name,
      visibility: opts.visibility || 'private',
      txHash: res.headers?.['x-gnfd-txn-hash'] || null,
    };
  }

  async function listBuckets(ownerOverride) {
    const o = requireOwner(ownerOverride);
    const res = await send(buildListBucketsRequest(sp, o));
    let parsed = {};
    try {
      parsed = typeof res.body === 'string' ? JSON.parse(res.body) : res.body || {};
    } catch (_) {
      parsed = {};
    }
    const raw = parsed.buckets || parsed.Buckets || [];
    return raw.map((b) => ({
      name: b.bucket_name || b.BucketName || b.name,
      visibility: b.visibility || b.Visibility || 'private',
      createdAt: b.create_at || b.createAt || null,
      raw: b,
    }));
  }

  async function searchBuckets(query, ownerOverride) {
    const all = await listBuckets(ownerOverride);
    const q = String(query || '').trim().toLowerCase();
    if (!q) return all;
    return all.filter((b) => (b.name || '').toLowerCase().includes(q));
  }

  async function bucketExists(name, ownerOverride) {
    const all = await listBuckets(ownerOverride);
    return all.some((b) => b.name === name);
  }

  async function saveObject(bucket, key, data, opts = {}) {
    assertBucketName(bucket);
    assertObjectKey(key);
    const o = requireOwner(opts.owner);
    const res = await send({
      method: 'PUT',
      url: `${sp}/${bucket}/${encodeKey(key)}`,
      headers: {
        'X-Gnfd-User-Address': o,
        'Content-Type': opts.contentType || 'application/octet-stream',
        'X-Gnfd-Visibility': opts.visibility || 'inherit',
      },
      body: data,
    });
    return {
      bucketName: bucket,
      objectKey: key,
      txHash: res.headers?.['x-gnfd-txn-hash'] || null,
    };
  }

  async function readObject(bucket, key) {
    assertBucketName(bucket);
    assertObjectKey(key);
    const res = await send({
      method: 'GET',
      url: buildDownloadUrl(sp, bucket, key),
      headers: {},
    });
    return res.body;
  }

  return {
    endpoint: sp,
    config: GREENFIELD_TESTNET,
    createBucket,
    listBuckets,
    searchBuckets,
    bucketExists,
    saveObject,
    readObject,
  };
}
