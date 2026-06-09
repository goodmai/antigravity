/**
 * Pinata IPFS client — pin files/JSON to IPFS and resolve them via a dedicated
 * gateway. Built for pinning the project's **Lit Actions** (claim-signer,
 * wrap_for_buyer) so the action can be referenced by its immutable CID and a PKP
 * bound to that CID (see ../../skills/pinata/litaction.md).
 *
 * Based on the Pinata quickstart (https://docs.pinata.cloud/quickstart):
 *   - v3 upload: POST https://uploads.pinata.cloud/v3/files (Bearer JWT),
 *     multipart form-data { file, network }, response { data: { cid, ... } }.
 *   - legacy: POST https://api.pinata.cloud/pinning/pinFileToIPFS with
 *     pinata_api_key / pinata_secret_api_key headers, response { IpfsHash }.
 *   - gateway read: https://<gateway>/ipfs/<cid>.
 *
 * Pure helpers (no I/O) are unit-tested hermetically; pinFile/pinJson take an
 * injected `fetch` so they are testable without network or real credentials.
 */

export const PINATA_UPLOAD_URL = 'https://uploads.pinata.cloud/v3/files';
export const PINATA_LEGACY_UPLOAD_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

/** @param {string} message @param {string} code */
function pinataError(message, code) {
  return /** @type {Error & { code: string }} */ (
    Object.assign(new Error(`${code}: ${message}`), { code })
  );
}

/**
 * Build the auth headers for a Pinata request. JWT (Bearer) is preferred; the
 * legacy api-key+secret pair is the fallback. Either a JWT or BOTH legacy values
 * are required.
 * @param {{ jwt?: string, apiKey?: string, apiSecret?: string }} [creds]
 * @returns {Record<string,string>}
 */
export function pinataAuthHeaders({ jwt, apiKey, apiSecret } = {}) {
  if (jwt && jwt.trim()) return { Authorization: `Bearer ${jwt.trim()}` };
  if (apiKey && apiSecret) {
    return { pinata_api_key: apiKey, pinata_secret_api_key: apiSecret };
  }
  throw pinataError(
    'set PINATA_JWT (recommended) or PINATA_API_KEY + PINATA_API_SECRET',
    'MISSING_PINATA_AUTH',
  );
}

/**
 * Normalize a gateway to a bare host: strip protocol and any trailing slash.
 * @param {string} gateway
 * @returns {string}
 */
export function normalizeGateway(gateway) {
  if (typeof gateway !== 'string' || gateway.trim().length === 0) {
    throw pinataError('a Pinata gateway host is required', 'INVALID_GATEWAY');
  }
  return gateway.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

/**
 * Public gateway URL for a CID on the dedicated gateway. If a gateway access
 * `token` is given (Pinata "Gateway Key"), it is appended as
 * `?pinataGatewayToken=…` — required to read content from a restricted dedicated
 * gateway.
 * @param {string} cid
 * @param {{ gateway?: string, token?: string }} [opts]
 * @returns {string}
 */
export function gatewayUrl(cid, { gateway, token } = {}) {
  if (typeof cid !== 'string' || cid.trim().length === 0) {
    throw pinataError('a CID is required', 'INVALID_CID');
  }
  const base = `https://${normalizeGateway(gateway)}/ipfs/${cid.trim()}`;
  return token ? `${base}?pinataGatewayToken=${token}` : base;
}

/**
 * Extract the CID from an upload response across v3 / top-level / legacy shapes.
 * @param {any} json
 * @returns {string}
 */
export function parseCid(json) {
  const cid =
    json?.data?.cid ?? // v3: { data: { cid } }
    json?.cid ?? //       top-level { cid }
    json?.IpfsHash; //    legacy pinFileToIPFS { IpfsHash }
  if (typeof cid !== 'string' || cid.length === 0) {
    throw pinataError('upload response had no cid', 'NO_CID_IN_RESPONSE');
  }
  return cid;
}

/**
 * Pin a single file/blob to IPFS via Pinata.
 * @param {{
 *   content: string|Uint8Array|Blob,
 *   name?: string,
 *   network?: 'public'|'private',
 *   contentType?: string,
 *   jwt?: string, apiKey?: string, apiSecret?: string,
 *   gateway?: string,
 * }} opts
 * @param {{ fetch?: typeof fetch, FormData?: typeof FormData, Blob?: typeof Blob }} [deps]
 * @returns {Promise<{ cid: string, url?: string, raw: any }>}
 */
export async function pinFile(opts, deps = {}) {
  const {
    content,
    name = 'file',
    network = 'public',
    contentType = 'application/octet-stream',
    jwt,
    apiKey,
    apiSecret,
    gateway,
    gatewayToken,
  } = opts ?? {};

  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const FormDataImpl = deps.FormData ?? globalThis.FormData;
  const BlobImpl = deps.Blob ?? globalThis.Blob;
  if (typeof fetchImpl !== 'function') {
    throw pinataError('no fetch implementation available', 'NO_FETCH');
  }

  // Auth FIRST — fail before constructing/sending the request when missing.
  const headers = pinataAuthHeaders({ jwt, apiKey, apiSecret });

  const form = new FormDataImpl();
  const blob =
    BlobImpl && content instanceof BlobImpl
      ? content
      : new BlobImpl([content], { type: contentType });
  form.append('file', blob, name);
  form.append('network', network);
  form.append('name', name);

  const res = await fetchImpl(PINATA_UPLOAD_URL, { method: 'POST', headers, body: form });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw pinataError(`upload failed (HTTP ${res.status}) ${detail}`.trim(), 'PINATA_UPLOAD_FAILED');
  }
  const json = await res.json();
  const cid = parseCid(json);
  return {
    cid,
    url: gateway ? gatewayUrl(cid, { gateway, token: gatewayToken }) : undefined,
    raw: json,
  };
}

/**
 * Pin a JSON object (pretty-printed) to IPFS.
 * @param {any} obj
 * @param {Omit<Parameters<typeof pinFile>[0], 'content'|'contentType'>} [opts]
 * @param {Parameters<typeof pinFile>[1]} [deps]
 */
export async function pinJson(obj, opts = {}, deps = {}) {
  return pinFile(
    {
      ...opts,
      content: JSON.stringify(obj, null, 2),
      contentType: 'application/json',
      name: opts.name ?? 'data.json',
    },
    deps,
  );
}
