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
const AUTH_URL = 'https://esm.sh/@lit-protocol/auth-helpers@7';
const CONST_URL = 'https://esm.sh/@lit-protocol/constants@7';

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

/**
 * Produce a Lit auth context (session sigs) for decryption, signed by the
 * user's wallet via SIWE. Integration glue — CDN-loaded, wallet-driven,
 * not unit-verified (like the rest of lit-sdk.js).
 *
 * @param {{ provider: any, network?: string }} cfg
 * @returns {Promise<{ sessionSigs: unknown }>}
 */
export async function makeLitAuth({ provider, network = 'datil-test' }) {
  const [{ LitNodeClient }, authHelpers, consts] = await Promise.all([
    import(/* @vite-ignore */ NODE_URL),
    import(/* @vite-ignore */ AUTH_URL),
    import(/* @vite-ignore */ CONST_URL),
  ]);
  const { LitActionResource, createSiweMessage, generateAuthSig } = authHelpers;
  const { LIT_ABILITY } = consts;

  const litNodeClient = new LitNodeClient({ litNetwork: network });
  await litNodeClient.connect();

  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  const walletAddress = Array.isArray(accounts) ? accounts[0] : undefined;

  const sessionSigs = await litNodeClient.getSessionSigs({
    chain: 'ethereum',
    resourceAbilityRequests: [
      { resource: new LitActionResource('*'), ability: LIT_ABILITY.LitActionExecution },
    ],
    authNeededCallback: async ({ uri, expiration, resourceAbilityRequests }) => {
      const toSign = await createSiweMessage({
        uri,
        expiration,
        resources: resourceAbilityRequests,
        walletAddress,
        nonce: await litNodeClient.getLatestBlockhash(),
        litNodeClient,
      });
      return generateAuthSig({
        signer: {
          getAddress: async () => walletAddress,
          signMessage: async (message) =>
            provider.request({
              method: 'personal_sign',
              params: [message, walletAddress],
            }),
        },
        toSign,
      });
    },
  });

  return { sessionSigs };
}
