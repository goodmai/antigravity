/**
 * Daskibo Academy — browser Greenfield SDK adapter (wallet off-chain auth)
 *
 * The real `WalletGreenfieldClient` consumed by greenfield-wallet-backend.
 * Lazily loads `@bnb-chain/greenfield-js-sdk` from an ESM CDN (same
 * zero-build trick the repo uses for viem) and signs with the user's
 * wallet via off-chain auth (a one-time personal_sign that mints an
 * EDDSA session key — the browser-recommended Greenfield flow).
 *
 * Integration glue, intentionally OUTSIDE the strict/no-any core (it
 * wraps an external, dynamically-imported SDK). Pin the SDK version.
 * Exercised in a real browser / opt-in, not by the unit suite — like
 * greenfield-testnet/sdk-backend.mjs.
 */

import { makeSignTypedDataCallback } from './greenfield-wallet-backend.js';
import { pickPrimarySp } from './greenfield-sp.js';

const SDK_URL = 'https://esm.sh/@bnb-chain/greenfield-js-sdk@2.2.2';

/**
 * @param {{ provider: any, rpcUrl: string, chainId: string|number, spEndpoint: string }} cfg
 * @returns {Promise<import('./greenfield-wallet-backend.js').WalletGreenfieldClient>}
 */
export async function makeWalletGreenfieldClient({
  provider,
  rpcUrl,
  chainId,
  spEndpoint,
}) {
  const sdk = await import(/* @vite-ignore */ SDK_URL);
  const { Client, Long, VisibilityType } = sdk;
  const client = Client.create(rpcUrl, String(chainId));

  const vis = (v) =>
    v === 'private'
      ? VisibilityType.VISIBILITY_TYPE_PRIVATE
      : VisibilityType.VISIBILITY_TYPE_PUBLIC_READ;

  // One-time wallet off-chain auth (personal_sign → EDDSA session seed).
  let auth;
  /** @type {{ operatorAddress: string, endpoint: string }|undefined} */
  let spCache;
  async function getSp() {
    if (spCache) return spCache;
    spCache = pickPrimarySp(await client.sp.getStorageProviders());
    return spCache;
  }
  async function ensureAuth(address) {
    if (auth) return auth;
    const sp = await getSp();
    // NOTE: the SDK property is `offchainauth` (all-lowercase).
    const offchain = await client.offchainauth.genOffChainAuthKeyPairAndUpload(
      {
        sps: [{ address: sp.operatorAddress, endpoint: sp.endpoint }],
        chainId: Number(chainId),
        expirationMs: 6 * 24 * 60 * 60 * 1000,
        domain: globalThis.location ? globalThis.location.origin : spEndpoint,
        address,
      },
      provider,
    );
    auth = {
      type: 'EDDSA',
      domain: globalThis.location ? globalThis.location.origin : spEndpoint,
      seed: offchain.seedString,
      address,
    };
    return auth;
  }

  return {
    async createBucket({ bucketName, creator, visibility }) {
      const sp = await getSp();
      const tx = await client.bucket.createBucket({
        bucketName,
        creator,
        visibility: vis(visibility),
        chargedReadQuota: Long.fromString('0'),
        primarySpAddress: sp.operatorAddress,
        paymentAddress: creator,
      });
      const sim = await tx.simulate({ denom: 'BNB' });
      const res = await tx.broadcast({
        denom: 'BNB',
        gasLimit: Number(sim.gasLimit),
        gasPrice: sim.gasPrice,
        payer: creator,
        granter: '',
        // Browser wallet signing: SDK hands us the EIP-712 payload, we
        // sign it via the wallet's eth_signTypedData_v4 (documented flow).
        signTypedDataCallback: makeSignTypedDataCallback(provider),
      });
      return { txHash: res.transactionHash || null };
    },

    async uploadObject({ bucketName, objectKey, data, contentType, creator, visibility }) {
      const a = await ensureAuth(creator);
      const body =
        typeof data === 'string' ? new TextEncoder().encode(data) : data;
      await client.object.delegateUploadObject(
        {
          bucketName,
          objectName: objectKey,
          body: {
            name: objectKey,
            type: contentType || 'application/octet-stream',
            size: body.length,
            content: body,
          },
          delegatedOpts: {
            visibility: vis(visibility === 'private' ? 'private' : 'public'),
          },
        },
        a,
      );
      return { txHash: null };
    },
  };
}
