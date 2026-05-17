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

/**
 * @typedef {Object} TransportRequest
 * @property {string} method
 * @property {string} url
 * @property {Record<string,string>} headers
 * @property {string | Uint8Array} [body]
 *
 * @typedef {Object} TransportResponse
 * @property {number} status
 * @property {Record<string,string>} headers
 * @property {string} body
 *
 * @typedef {(req: TransportRequest) => Promise<TransportResponse>} Transport
 *
 * @typedef {Object} BucketInfo
 * @property {string} name
 * @property {string} visibility
 * @property {string|number|null} createdAt
 * @property {Record<string,unknown>} raw
 *
 * @typedef {Error & { code: string }} CodedError
 *
 * Write operations on real Greenfield are on-chain, signed transactions
 * (MsgCreateBucket / MsgCreateObject + SP approval), not plain HTTP PUTs.
 * The core never fabricates them — it delegates to an injected signer
 * `GreenfieldBackend` (the real one is SDK-backed; tests/Flow-A inject a
 * local SP-emulation backend).
 *
 * @typedef {Object} GreenfieldBackend
 * @property {(args: { bucketName: string, owner: string, visibility: string }) => Promise<{ bucketName: string, txHash: string|null }>} createBucket
 * @property {(args: { bucketName: string, objectKey: string, data: string|Uint8Array, contentType: string, owner: string, visibility: string }) => Promise<{ bucketName: string, objectKey: string, txHash: string|null }>} putObject
 */

// ── Error helper ──────────────────────────────────────────────────────────

/**
 * @param {string} message
 * @param {string} code
 * @returns {CodedError}
 */
function gfError(message, code) {
  return /** @type {CodedError} */ (Object.assign(new Error(message), { code }));
}

/** @param {unknown} v @returns {string|undefined} */
function asStr(v) {
  return typeof v === 'string' ? v : undefined;
}

/**
 * Safely normalize one untrusted SP list-buckets page — `unknown` in,
 * validated out, no `any`. Returns the page's buckets plus the
 * continuation token for the next page (empty/absent ⇒ last page).
 * @param {string} body
 * @returns {{ buckets: BucketInfo[], next: string|undefined }}
 */
function parseBucketPage(body) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { buckets: [], next: undefined };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { buckets: [], next: undefined };
  }
  const root = /** @type {Record<string, unknown>} */ (parsed);
  const list = root.buckets ?? root.Buckets;

  const pg = root.pagination;
  const pgObj =
    pg && typeof pg === 'object'
      ? /** @type {Record<string, unknown>} */ (pg)
      : undefined;
  const rawNext =
    asStr(root.next_continuation_token) ??
    asStr(root.NextContinuationToken) ??
    (pgObj ? asStr(pgObj.next_continuation_token) : undefined);
  const next = rawNext ? rawNext : undefined;

  if (!Array.isArray(list)) return { buckets: [], next };

  /** @type {BucketInfo[]} */
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const b = /** @type {Record<string, unknown>} */ (item);
    const name = asStr(b.bucket_name) ?? asStr(b.BucketName) ?? asStr(b.name);
    if (!name) continue;
    const created = b.create_at ?? b.createAt;
    out.push({
      name,
      visibility: asStr(b.visibility) ?? asStr(b.Visibility) ?? 'private',
      createdAt:
        typeof created === 'string' || typeof created === 'number'
          ? created
          : null,
      raw: b,
    });
  }
  return { buckets: out, next };
}

// ── Validation ────────────────────────────────────────────────────────────
// Greenfield bucket names follow the S3-style DNS rules:
//   - 3..63 characters
//   - lowercase letters, digits, hyphens and dots
//   - must start and end with a letter or digit
//   - no consecutive dots, not formatted as an IPv4 address

const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const BUCKET_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

/** @param {unknown} name @returns {boolean} */
export function isValidBucketName(name) {
  if (typeof name !== 'string') return false;
  if (name.length < 3 || name.length > 63) return false;
  if (!BUCKET_RE.test(name)) return false;
  if (name.includes('..')) return false;
  if (IPV4_RE.test(name)) return false;
  return true;
}

/** @param {unknown} name @returns {void} */
export function assertBucketName(name) {
  if (!isValidBucketName(name)) {
    throw gfError(
      `Invalid bucket name: "${name}". Use 3-63 lowercase ` +
        `letters, digits or hyphens, starting and ending alphanumeric.`,
      'INVALID_BUCKET_NAME',
    );
  }
}

/** @param {unknown} key @returns {boolean} */
export function isValidObjectKey(key) {
  return typeof key === 'string' && key.length >= 1 && key.length <= 1024;
}

/** @param {unknown} key @returns {void} */
export function assertObjectKey(key) {
  if (!isValidObjectKey(key)) {
    throw gfError(
      'Invalid object key: must be 1-1024 characters.',
      'INVALID_OBJECT_KEY',
    );
  }
}

// ── URL builders ──────────────────────────────────────────────────────────

/** @param {string} key @returns {string} */
function encodeKey(key) {
  return String(key)
    .split('/')
    .map(encodeURIComponent)
    .join('/');
}

/** @param {string} sp @param {string} bucket @param {string} key @returns {string} */
export function buildViewUrl(sp, bucket, key) {
  return `${sp}/view/${bucket}/${encodeKey(key)}`;
}

/** @param {string} sp @param {string} bucket @param {string} key @returns {string} */
export function buildDownloadUrl(sp, bucket, key) {
  return `${sp}/download/${bucket}/${encodeKey(key)}`;
}

/**
 * @param {string} sp
 * @param {string} owner
 * @param {string} [continuationToken]  Fetch the next page when present.
 * @returns {TransportRequest}
 */
export function buildListBucketsRequest(sp, owner, continuationToken) {
  return {
    method: 'GET',
    url: continuationToken
      ? `${sp}/?continuation-token=${encodeURIComponent(continuationToken)}`
      : `${sp}/`,
    headers: { 'X-Gnfd-User-Address': owner },
  };
}

// ── Status → error mapping ────────────────────────────────────────────────

/** @param {number} status @param {string} [body] @returns {CodedError|null} */
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
 * @param {{ transport?: Transport, owner?: string, endpoint?: string, backend?: GreenfieldBackend }} [cfg]
 */
export function createGreenfieldClient({
  transport,
  owner,
  endpoint,
  backend,
} = {}) {
  if (typeof transport !== 'function') {
    throw gfError('A transport function is required', 'NO_TRANSPORT');
  }
  /** @type {Transport} */
  const tx = transport;
  const sp = (endpoint || GREENFIELD_TESTNET.spEndpoint).replace(/\/+$/, '');

  /** @param {string} [override] @returns {string} */
  function requireOwner(override) {
    const o = override || owner;
    if (!o) throw gfError('An owner address is required', 'NO_OWNER');
    return o;
  }

  /** @returns {GreenfieldBackend} */
  function requireBackend() {
    if (!backend) {
      throw gfError(
        'Write operations require a Greenfield signer backend ' +
          '(real SDK backend, or a local SP-emulation backend for dev). ' +
          'The client will not fabricate an unsigned write.',
        'NO_BACKEND',
      );
    }
    return backend;
  }

  /** @param {TransportRequest} req @returns {Promise<TransportResponse>} */
  async function send(req) {
    let res;
    try {
      res = await tx(req);
    } catch (err) {
      throw gfError(
        `Greenfield network error: ${
          err instanceof Error ? err.message : String(err)
        }`,
        'NETWORK_ERROR',
      );
    }
    const failure = mapStatus(res.status, res.body);
    if (failure) throw failure;
    return res;
  }

  /**
   * @param {string} name
   * @param {{ owner?: string, visibility?: string }} [opts]
   */
  async function createBucket(name, opts = {}) {
    assertBucketName(name);
    const be = requireBackend();
    const o = requireOwner(opts.owner);
    const visibility = opts.visibility || 'private';
    const res = await be.createBucket({ bucketName: name, owner: o, visibility });
    return { bucketName: res.bucketName, visibility, txHash: res.txHash };
  }

  /** @param {string} [ownerOverride] @returns {Promise<BucketInfo[]>} */
  async function listBuckets(ownerOverride) {
    const o = requireOwner(ownerOverride);
    const MAX_PAGES = 1000; // hard stop: never loop forever on a bad SP
    /** @type {BucketInfo[]} */
    const all = [];
    /** @type {string|undefined} */
    let token;
    let pages = 0;
    do {
      const res = await send(buildListBucketsRequest(sp, o, token));
      const page = parseBucketPage(res.body);
      all.push(...page.buckets);
      token = page.next;
      pages += 1;
    } while (token && pages < MAX_PAGES);
    return all;
  }

  /** @param {string} [query] @param {string} [ownerOverride] @returns {Promise<BucketInfo[]>} */
  async function searchBuckets(query, ownerOverride) {
    const all = await listBuckets(ownerOverride);
    const q = String(query || '').trim().toLowerCase();
    if (!q) return all;
    return all.filter((b) => (b.name || '').toLowerCase().includes(q));
  }

  /** @param {string} name @param {string} [ownerOverride] @returns {Promise<boolean>} */
  async function bucketExists(name, ownerOverride) {
    const all = await listBuckets(ownerOverride);
    return all.some((b) => b.name === name);
  }

  /**
   * @param {string} bucket
   * @param {string} key
   * @param {string|Uint8Array} data
   * @param {{ owner?: string, contentType?: string, visibility?: string }} [opts]
   */
  async function saveObject(bucket, key, data, opts = {}) {
    assertBucketName(bucket);
    assertObjectKey(key);
    const be = requireBackend();
    const o = requireOwner(opts.owner);
    return be.putObject({
      bucketName: bucket,
      objectKey: key,
      data,
      contentType: opts.contentType || 'application/octet-stream',
      owner: o,
      visibility: opts.visibility || 'inherit',
    });
  }

  /** @param {string} bucket @param {string} key @returns {Promise<string>} */
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
