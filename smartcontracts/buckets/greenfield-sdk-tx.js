/**
 * Daskibo Academy — shared Greenfield SDK create-bucket orchestrator
 *
 * One implementation of the on-chain create-bucket flow, used by BOTH the
 * Node (`sdk-backend.mjs`, ECDSA private key) and browser
 * (`greenfield-wallet-sdk.js`, wallet `signTypedDataCallback`) paths. The
 * SDK objects are injected, so the orchestration is pure and unit-tested
 * with fakes; only the caller's signer-specific broadcast fields differ.
 *
 * @typedef {{ privateKey: string } | { signTypedDataCallback: (address: string, message: string) => Promise<string> }} BroadcastSigner
 *
 * @typedef {Object} GreenfieldSdkClient
 * @property {{ getStorageProviders: () => Promise<import('./greenfield-sp.js').SpEntry[]> }} sp
 * @property {{ createBucket: (msg: Record<string, unknown>) => Promise<{ simulate: (o: { denom: string }) => Promise<{ gasLimit: number|string, gasPrice: string }>, broadcast: (o: Record<string, unknown>) => Promise<{ transactionHash?: string }> }> }} bucket
 *
 * @typedef {{ fromString: (s: string) => unknown }} LongLike
 * @typedef {{ VISIBILITY_TYPE_PUBLIC_READ: unknown, VISIBILITY_TYPE_PRIVATE: unknown }} VisibilityEnum
 */

import { pickPrimarySp } from './greenfield-sp.js';

/**
 * @param {{
 *   client: GreenfieldSdkClient,
 *   Long: LongLike,
 *   VisibilityType: VisibilityEnum,
 *   bucketName: string,
 *   creator: string,
 *   visibility: string,
 *   broadcastSigner: BroadcastSigner,
 * }} args
 * @returns {Promise<{ txHash: string|null }>}
 */
export async function sdkCreateBucket({
  client,
  Long,
  VisibilityType,
  bucketName,
  creator,
  visibility,
  broadcastSigner,
}) {
  const sp = pickPrimarySp(await client.sp.getStorageProviders());
  const tx = await client.bucket.createBucket({
    bucketName,
    creator,
    visibility:
      visibility === 'private'
        ? VisibilityType.VISIBILITY_TYPE_PRIVATE
        : VisibilityType.VISIBILITY_TYPE_PUBLIC_READ,
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
    ...broadcastSigner,
  });
  return { txHash: res.transactionHash || null };
}
