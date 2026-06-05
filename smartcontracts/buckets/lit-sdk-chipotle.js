/**
 * Daskibo Academy — Chipotle REST API adapter
 *
 * Implements the same LitClient interface expected by lit-access.js but
 * targets the Chipotle REST API (https://api.chipotle.litprotocol.com or
 * a local mock at http://localhost:8000) instead of the Lit P2P network.
 *
 * Works in both Node.js and modern browsers (uses only fetch + Web Crypto).
 *
 * LitClient interface:
 *   encrypt({ accessControlConditions, dataToEncrypt }) → { ciphertext, dataToEncryptHash }
 *   decrypt({ accessControlConditions, ciphertext, dataToEncryptHash, chain }, authContext) → string
 *
 * authContext for Chipotle decrypt:
 *   { userAddress: string, signedProof: { message: string, signature: string } }
 *   - userAddress: the Ethereum address that owns the session
 *   - signedProof: { message: nonce string, signature: MetaMask personal_sign result }
 *
 * @module lit-sdk-chipotle
 */

import { evaluateAcc, makeFetchEthCall } from './lit-acc-eval.js';

// Transient HTTP statuses the Chipotle TEE (Rocket server) returns while
// rate-limiting or warming up. They mean the request was NOT processed, so
// retrying is safe and idempotent.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/**
 * `fetch` with exponential backoff + jitter on transient failures (429/5xx and
 * network errors). Honors a numeric `Retry-After` header. Returns the final
 * response (even if still failing) so the caller's own error handling runs.
 *
 * @param {string} url
 * @param {RequestInit} [init]
 * @param {{ retries?: number, baseMs?: number, maxMs?: number }} [opts]
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, init = {}, { retries = 6, baseMs = 500, maxMs = 8000 } = {}) {
  /** @type {unknown} */
  let lastErr;
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      // Network-level failure (connection refused while the node boots, etc.)
      lastErr = err;
      if (attempt >= retries) throw err;
      await sleep(backoffMs(attempt, baseMs, maxMs));
      continue;
    }
    if (!RETRYABLE_STATUS.has(res.status) || attempt >= retries) return res;
    const retryAfter = Number(res.headers.get('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(maxMs, retryAfter * 1000)
      : backoffMs(attempt, baseMs, maxMs);
    await sleep(wait);
  }
}

function backoffMs(attempt, baseMs, maxMs) {
  return Math.min(maxMs, baseMs * 2 ** attempt) + Math.random() * baseMs;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {{ chipotleUrl?: string, pkpId?: string, apiKey?: string }} cfg
 * @returns {import('./lit-access.js').LitClient}
 */
export function createChipotleClient({ chipotleUrl = 'http://localhost:8000', pkpId, apiKey = 'dummy-api-key' } = {}) {
  const base = chipotleUrl.replace(/\/$/, '');

  async function callLitAction(jsParams) {
    const res = await fetchWithRetry(`${base}/core/v1/lit_action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // mock accepts any key; real Chipotle (api.chipotle.litprotocol.com)
        // requires the account's API key (Stripe-funded) — pass via apiKey.
        'X-Api-Key': apiKey
      },
      body: JSON.stringify({
        // Code stub — real Chipotle executes this in the TEE.
        code: `
          async function main(p) {
            if (p.action === 'encrypt') {
              const ciphertext = await LitActions.Encrypt({ pkpId: p.pkpId, message: p.masterKey });
              const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p.masterKey));
              const dataToEncryptHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
              LitActions.setResponse({ response: JSON.stringify({ ciphertext, dataToEncryptHash }) });
            } else if (p.action === 'decrypt') {
              const decrypted = await LitActions.Decrypt({ pkpId: p.pkpId, ciphertext: p.ciphertext });
              LitActions.setResponse({ response: JSON.stringify({ decrypted }) });
            } else {
              throw new Error('Unknown action: ' + p.action);
            }
          }
        `,
        js_params: { ...jsParams, pkpId },
      }),
    });
    if (!res.ok && res.status !== 200) {
      throw new Error(`Chipotle HTTP ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    if (data.has_error) {
      throw new Error(data.error ?? data.logs ?? 'Chipotle action failed');
    }
    try {
      return JSON.parse(data.response);
    } catch {
      return data.response;
    }
  }

  return {
    /**
     * Encrypt a master key under access control conditions.
     * Returns { ciphertext, dataToEncryptHash }.
     */
    async encrypt({ accessControlConditions, dataToEncrypt }) {
      const result = await callLitAction({
        action: 'encrypt',
        masterKey: dataToEncrypt,
        accessControlConditions,
      });
      return {
        ciphertext: result.ciphertext,
        dataToEncryptHash: result.dataToEncryptHash,
        // pkpId is carried here for the write script to embed in manifest
        pkpId: result.pkpId ?? pkpId,
      };
    },

    /**
     * Decrypt a master key.
     * authContext = { userAddress, signedProof: { message, signature } }
     */
    async decrypt(
      { accessControlConditions, ciphertext, dataToEncryptHash, chain },
      authContext,
    ) {
      const { userAddress, signedProof } = authContext ?? {};
      if (!userAddress) {
        throw new Error('Chipotle decrypt requires authContext.userAddress');
      }

      // App-side ACC enforcement via the canonical evaluator (lit-acc-eval.js).
      // The Chipotle TEE does NOT implement Lit.Actions.checkConditions, so the
      // conditions are enforced HERE, before the decrypt call — identically to
      // the mock and the browser readers (single source of truth). This is what
      // enforces P-A subscription expiry: without the timestamp pass an expired
      // buyer (whose address condition always matches) would still recover the
      // master key on mainnet.
      const rpc = (typeof process !== 'undefined' && process.env.ANVIL_RPC)
        ? process.env.ANVIL_RPC
        : 'http://127.0.0.1:8545';
      const verdict = await evaluateAcc({
        accessControlConditions,
        userAddress,
        ethCall: makeFetchEthCall(rpc),
      });
      if (!verdict.ok) {
        throw new Error(`not authorized: ${verdict.reason}`);
      }

      const result = await callLitAction({
        action: 'decrypt',
        ciphertext,
        dataToEncryptHash,
        accessControlConditions,
        chain,
        userAddress,
        signedProof,  // { message, signature } — may be omitted in dev/mock mode
      });
      return result.decrypted;
    },
  };
}

/**
 * Convenience: create a signed proof by asking MetaMask to sign a nonce.
 * Returns { message, signature } to pass as authContext.signedProof.
 *
 * @param {string} userAddress
 * @param {object} provider  window.ethereum or ethers provider
 * @returns {Promise<{ message: string, signature: string }>}
 */
export async function createSignedProof(userAddress, provider) {
  const nonce = 'Daskibo-DRM-Auth-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  const message =
    `Daskibo Academy — Verify ownership of ${userAddress}\n\nNonce: ${nonce}\n\nThis signature is used only for local DRM access verification.`;

  // Works with both raw window.ethereum and ethers.js provider
  let signature;
  if (provider?.request) {
    signature = await provider.request({
      method: 'personal_sign',
      params: [message, userAddress],
    });
  } else if (provider?.getSigner) {
    const signer = await provider.getSigner();
    signature = await signer.signMessage(message);
  } else {
    throw new Error('Provider must expose .request() or .getSigner()');
  }

  return { message, signature };
}
