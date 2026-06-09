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
 * Public gateway URL for a CID on the dedicated gateway.
 * @param {string} cid
 * @param {{ gateway?: string }} [opts]
 * @returns {string}
 */
export function gatewayUrl(cid, { gateway } = {}) {
  if (typeof cid !== 'string' || cid.trim().length === 0) {
    throw pinataError('a CID is required', 'INVALID_CID');
  }
  return `https://${normalizeGateway(gateway)}/ipfs/${cid.trim()}`;
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
