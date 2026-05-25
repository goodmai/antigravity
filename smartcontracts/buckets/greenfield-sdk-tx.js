/**
 * Daskibo Academy — shared Greenfield SDK create-bucket orchestrator
 *
 * One implementation of the on-chain create-bucket flow, used by BOTH the
 * Node (`sdk-backend.mjs`, ECDSA private key) and browser
 * (`greenfield-wallet-sdk.js`, wallet `signTypedDataCallback`) paths. The
 * SDK objects are injected, so the orchestration is pure and unit-tested
 * with fakes; only the caller's signer-specific broadcast fields differ.
 *
 * @typedef {Object} BroadcastSigner
 * @property {string} [type]
 * @property {string} [privateKey]
 * @property {(address: string, message: string) => Promise<string>} [signTypedDataCallback]
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
 *   globalVirtualGroupFamilyId?: number,
 *   fixedGas?: { gasLimit: number|string, gasPrice: string },
 *   feePayer?: string,
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
  globalVirtualGroupFamilyId,
  fixedGas,
  feePayer,
}) {
  const sps = await client.sp.getStorageProviders();
  console.log(`[sdkCreateBucket] Found ${sps.length} Storage Providers`);
  const sp = pickPrimarySp(sps);
  console.log(`[sdkCreateBucket] Picked Primary SP: ${sp.operatorAddress} @ ${sp.endpoint}`);
  
  /** @type {Record<string, unknown>} */
  const createBucketMsg = {
    bucketName,
    creator,
    visibility:
      visibility === 'private'
        ? VisibilityType.VISIBILITY_TYPE_PRIVATE
        : VisibilityType.VISIBILITY_TYPE_PUBLIC_READ,
    chargedReadQuota: Long.fromString('0'),
    primarySpAddress: sp.operatorAddress,
    paymentAddress: creator,
  };
  
  if (typeof globalVirtualGroupFamilyId === 'number') {
    createBucketMsg.globalVirtualGroupFamilyId = globalVirtualGroupFamilyId;
  }
  
  console.log(`[sdkCreateBucket] Message: bucket=${createBucketMsg.bucketName}, creator=${createBucketMsg.creator}, sp=${createBucketMsg.primarySpAddress}, gvgFamily=${createBucketMsg.globalVirtualGroupFamilyId}`);
  console.log(`[sdkCreateBucket] Signer: type=${broadcastSigner.type}, pk_len=${broadcastSigner.privateKey ? broadcastSigner.privateKey.length : 'N/A'}`);

  const tx = await client.bucket.createBucket(createBucketMsg);
  let gasLimit;
  let gasPrice;
  if (fixedGas) {
    gasLimit = fixedGas.gasLimit;
    gasPrice = fixedGas.gasPrice;
    console.log(`[sdkCreateBucket] Transaction created, using fixed gas: gasLimit=${gasLimit}, gasPrice=${gasPrice}`);
  } else {
    console.log(`[sdkCreateBucket] Transaction created, simulating gas...`);
    const sim = await tx.simulate({ denom: 'BNB' });
    gasLimit = sim.gasLimit;
    gasPrice = sim.gasPrice;
    console.log(`[sdkCreateBucket] Simulation successful: gasLimit=${gasLimit}, gasPrice=${gasPrice}`);
  }
  
  console.log(`[sdkCreateBucket] Broadcasting...`);
  const res = await tx.broadcast({
    denom: 'BNB',
    gasLimit,
    gasPrice,
    payer: feePayer ?? creator,
    granter: '',
    ...broadcastSigner,
  });
  return { txHash: res.transactionHash || null };
}
