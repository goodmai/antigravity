/**
 * Daskibo Academy — Lit-protected course reader
 *
 * Completes the round-trip the rest of the pipeline sets up: recover the
 * Lit-guarded AES bucket master from `manifest.lit` (only if the reader
 * satisfies the on-chain ACC), then AES-decrypt a stored `.enc` object
 * via crypto-envelope. Pure orchestration + a thin IO wrapper over a
 * greenfield-core read client (reads need no signer).
 *
 * @typedef {import('./lit-access.js').LitEnvelope} LitEnvelope
 * @typedef {import('./crypto-envelope.js').WebCryptoLike} WebCryptoLike
 *
 * @typedef {Object} LitAccessLike
 * @property {(env: LitEnvelope, authContext: unknown) => Promise<string>} decryptMasterKey
 *
 * @typedef {{ access: LitAccessLike, authContext?: unknown }} LitReadOption
 *
 * @typedef {{ lit?: LitEnvelope }} ProtectedManifest
 *
 * @typedef {Object} ReadClient
 * @property {(bucket: string, key: string) => Promise<string>} readObject
 */

import { decryptObject } from './crypto-envelope.js';

/**
 * @param {string} message
 * @param {string} code
 * @returns {Error & { code: string }}
 */
function readError(message, code) {
  return /** @type {Error & { code: string }} */ (
    Object.assign(new Error(message), { code })
  );
}

/**
 * Recover the AES bucket master key from a Lit-protected manifest.
 * @param {ProtectedManifest} manifest
 * @param {LitReadOption} lit
 * @returns {Promise<string>}
 */
export async function recoverCourseMasterKey(manifest, lit) {
  if (!manifest || typeof manifest !== 'object' || !manifest.lit) {
    throw readError(
      'Manifest carries no Lit envelope (manifest.lit missing)',
      'NO_LIT',
    );
  }
  if (!lit || !lit.access || typeof lit.access.decryptMasterKey !== 'function') {
    throw readError('A Lit access client is required to read', 'NO_LIT_CLIENT');
  }
  return lit.access.decryptMasterKey(manifest.lit, lit.authContext);
}

/**
 * Decrypt one stored `.enc` object body using the Lit-recovered master.
 * @param {ProtectedManifest} manifest
 * @param {string} objectBodyJson  The `.enc` object body (envelope JSON).
 * @param {{ access: LitAccessLike, authContext?: unknown, crypto?: WebCryptoLike }} opts
 * @returns {Promise<{ bytes: Uint8Array, text: string|undefined, meta: object }>}
 */
export async function decryptCourseObject(manifest, objectBodyJson, opts) {
  const master = await recoverCourseMasterKey(manifest, {
    access: opts.access,
    authContext: opts.authContext,
  });
  /** @type {unknown} */
  let env;
  try {
    env = JSON.parse(objectBodyJson);
  } catch {
    throw readError('Object body is not a valid envelope JSON', 'INVALID_ENVELOPE');
  }
  return decryptObject(
    master,
    /** @type {import('./crypto-envelope.js').Envelope} */ (env),
    opts.crypto,
  );
}

/**
 * Fetch the manifest + `.enc` object from a read client and decrypt it.
 * @param {{ client: ReadClient, bucketName: string, objectKey: string, lit: LitReadOption, crypto?: WebCryptoLike }} args
 * @returns {Promise<{ bytes: Uint8Array, text: string|undefined, meta: object }>}
 */
export async function openCourseObject({
  client,
  bucketName,
  objectKey,
  lit,
  crypto,
}) {
  const manifestRaw = await client.readObject(bucketName, '_lit/manifest.json');
  /** @type {ProtectedManifest} */
  let manifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch {
    throw readError('Manifest is not valid JSON', 'INVALID_ENVELOPE');
  }
  const body = await client.readObject(bucketName, `${objectKey}.enc`);
  return decryptCourseObject(manifest, body, {
    access: lit.access,
    authContext: lit.authContext,
    crypto,
  });
}
