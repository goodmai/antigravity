/**
 * Daskibo Academy — real Lit Protocol client adapter
 *
 * The concrete `LitClient` consumed by `lit-access.js`. Lazily loads the
 * official `@lit-protocol/*` packages from an ESM CDN (same zero-build
 * trick used for viem / the Greenfield SDK) and talks to the Datil
 * network. Integration glue, intentionally OUTSIDE the strict/no-any core
 * (it wraps external, dynamically-imported SDKs). Exercised in a real
 * browser / opt-in, not by the unit suite — like greenfield-wallet-sdk.js
 * and sdk-backend.mjs. Pin the SDK versions.
 *
 * Network pairing: `datil-dev` (free) / `datil-test` (pair with
 * Greenfield testnet) / `datil` (prod).
 */

const NODE_URL = 'https://esm.sh/@lit-protocol/lit-node-client@7';
const ENC_URL = 'https://esm.sh/@lit-protocol/encryption@7';

/**
 * @param {{ network?: string }} [cfg]
 * @returns {Promise<import('./lit-access.js').LitClient>}
 */
export async function makeLitClient({ network = 'datil-test' } = {}) {
  const [{ LitNodeClient }, { encryptString, decryptToString }] =
    await Promise.all([
      import(/* @vite-ignore */ NODE_URL),
      import(/* @vite-ignore */ ENC_URL),
    ]);

  const litNodeClient = new LitNodeClient({ litNetwork: network });
  await litNodeClient.connect();

  return {
    async encrypt({ accessControlConditions, dataToEncrypt }) {
      const { ciphertext, dataToEncryptHash } = await encryptString(
        { accessControlConditions, dataToEncrypt },
        litNodeClient,
      );
      return { ciphertext, dataToEncryptHash };
    },

    async decrypt(
      { accessControlConditions, ciphertext, dataToEncryptHash, chain },
      authContext,
    ) {
      // authContext must carry Lit session sigs that satisfy the ACC
      // (obtained via litNodeClient.getSessionSigs in the calling app).
      const sessionSigs =
        authContext && typeof authContext === 'object'
          ? authContext.sessionSigs
          : undefined;
      return decryptToString(
        {
          accessControlConditions,
          ciphertext,
          dataToEncryptHash,
          chain,
          sessionSigs,
        },
        litNodeClient,
      );
    },
  };
}
