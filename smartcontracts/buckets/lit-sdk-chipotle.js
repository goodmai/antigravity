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

/**
 * @param {{ chipotleUrl?: string, pkpId?: string }} cfg
 * @returns {import('./lit-access.js').LitClient}
 */
export function createChipotleClient({ chipotleUrl = 'http://localhost:8000', pkpId } = {}) {
  const base = chipotleUrl.replace(/\/$/, '');

  async function callLitAction(jsParams) {
    const res = await fetch(`${base}/core/v1/lit_action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Code stub — real Chipotle executes this in the TEE.
        // The mock server ignores 'code' and dispatches on js_params.action.
        code: `async function main(p) { return Lit.Actions[p.action](p); }`,
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
    return data.response;
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
