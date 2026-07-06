/**
 * Daskibo Academy — Lit Protocol access-control core
 *
 * Real Lit threshold encryption applied to the **bucket master key** (the
 * efficient compose from lit.md §12: AES-GCM does the bulk object
 * encryption via crypto-envelope; Lit guards the single 32-byte master
 * behind on-chain Access Control Conditions). Only an authorized reader
 * — proven by Lit session sigs satisfying the ACC — can reassemble the
 * master and therefore decrypt the bucket.
 *
 * Pure & DOM-free. The Lit network client is injected so this
 * orchestration is unit-tested with a fake; the real CDN-loaded
 * `@lit-protocol/*` adapter is `lit-sdk.js`.
 *
 * @typedef {Array<Record<string, unknown>>} AccessControlConditions
 *
 * @typedef {Object} LitEnvelope
 * @property {'daskibo.lit.acc/1'} schema
 * @property {string} chain
 * @property {AccessControlConditions} accessControlConditions
 * @property {string} ciphertext
 * @property {string} dataToEncryptHash
 *
 * @typedef {Object} LitClient
 * @property {(args: { accessControlConditions: AccessControlConditions, dataToEncrypt: string }) => Promise<{ ciphertext: string, dataToEncryptHash: string }>} encrypt
 * @property {(args: { accessControlConditions: AccessControlConditions, ciphertext: string, dataToEncryptHash: string, chain: string }, authContext: unknown) => Promise<string>} decrypt
 */

const LIT_ENVELOPE_SCHEMA = 'daskibo.lit.acc/1';

/**
 * @param {string} message
 * @param {string} code
 * @returns {Error & { code: string }}
 */
function litError(message, code) {
  return /** @type {Error & { code: string }} */ (
    Object.assign(new Error(message), { code })
  );
}

/**
 * Classify a thrown Lit error into a stable coded error.
 * @param {unknown} err
 * @returns {Error & { code: string }}
 */
function classify(err) {
  const msg = (
    err instanceof Error ? err.message : String(err)
  ).toLowerCase();
  if (
    msg.includes('not authorized') ||
    msg.includes('access control') ||
    msg.includes('unauthorized')
  ) {
    return litError('Access denied by the Lit access control conditions', 'ACCESS_DENIED');
  }
  if (
    msg.includes('connect') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('unavailable') ||
    msg.includes('lit nodes')
  ) {
    return litError(`Lit network unavailable: ${msg}`, 'LIT_UNAVAILABLE');
  }
  return litError(`Lit operation failed: ${msg}`, 'LIT_ERROR');
}

/**
 * @param {{ litClient: LitClient, chain?: string }} cfg
 */
export function createLitAccess({ litClient, chain = 'ethereum' }) {
  if (!litClient || typeof litClient.encrypt !== 'function') {
    throw litError('A Lit client is required', 'NO_LIT_CLIENT');
  }

  /**
   * Encrypt the AES bucket master key under a set of ACCs.
   * @param {string} masterKeyB64
   * @param {AccessControlConditions} [accessControlConditions]
   * @returns {Promise<LitEnvelope>}
   */
  async function encryptMasterKey(masterKeyB64, accessControlConditions) {
    if (typeof masterKeyB64 !== 'string' || masterKeyB64.length === 0) {
      throw litError('A non-empty master key is required', 'INVALID_MASTER');
    }
    if (
      !Array.isArray(accessControlConditions) ||
      accessControlConditions.length === 0
    ) {
      throw litError(
        'At least one access control condition is required',
        'INVALID_ACC',
      );
    }
    let res;
    try {
      res = await litClient.encrypt({
        accessControlConditions,
        dataToEncrypt: masterKeyB64,
      });
    } catch (err) {
      throw classify(err);
    }
    return {
      schema: LIT_ENVELOPE_SCHEMA,
      chain,
      accessControlConditions,
      ciphertext: res.ciphertext,
      dataToEncryptHash: res.dataToEncryptHash,
    };
  }

  /**
   * Recover the master key — only succeeds if `authContext` proves the
   * caller satisfies the envelope's ACC.
   * @param {LitEnvelope} envelope
   * @param {unknown} authContext  Lit session sigs / auth (opaque here).
   * @returns {Promise<string>}
   */
  async function decryptMasterKey(envelope, authContext) {
    if (
      !envelope ||
      typeof envelope !== 'object' ||
      /** @type {{ schema?: unknown }} */ (envelope).schema !==
        LIT_ENVELOPE_SCHEMA ||
      !Array.isArray(
        /** @type {{ accessControlConditions?: unknown }} */ (envelope)
          .accessControlConditions,
      ) ||
      typeof /** @type {{ ciphertext?: unknown }} */ (envelope).ciphertext !==
        'string' ||
      typeof /** @type {{ dataToEncryptHash?: unknown }} */ (envelope)
        .dataToEncryptHash !== 'string'
    ) {
      throw litError('Unrecognized Lit envelope', 'INVALID_LIT_ENVELOPE');
    }
    const env = /** @type {LitEnvelope} */ (envelope);
    try {
      return await litClient.decrypt(
        {
          accessControlConditions: env.accessControlConditions,
          ciphertext: env.ciphertext,
          dataToEncryptHash: env.dataToEncryptHash,
          chain: env.chain || chain,
        },
        authContext,
      );
    } catch (err) {
      throw classify(err);
    }
  }

  return { encryptMasterKey, decryptMasterKey };
}
