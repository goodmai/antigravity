/**
 * REAL Greenfield signer backend — implements the greenfield-core
 * `GreenfieldBackend` write interface via the official
 * @bnb-chain/greenfield-js-sdk: on-chain MsgCreateBucket (with SP
 * approval) and signed object upload. This is the genuine path; it
 * performs real testnet transactions and needs a funded key.
 *
 * Node-only (heavy SDK, runs bundled in Node); never imported by the
 * browser bucket console.
 */

import { Client, Long, VisibilityType } from '@bnb-chain/greenfield-js-sdk';

/**
 * @param {{ rpcUrl: string, chainId: string|number, privateKey: string, address: string }} cfg
 */
export function createSdkBackend({ rpcUrl, chainId, privateKey, address }) {
  if (!privateKey || !address) {
    throw Object.assign(
      new Error('createSdkBackend requires a funded privateKey + address'),
      { code: 'NO_SIGNER' },
    );
  }
  const client = Client.create(rpcUrl, String(chainId));

  let spCache;
  async function primarySp() {
    if (spCache) return spCache;
    const sps = await client.sp.getStorageProviders();
    const sp = sps.find((s) => s.endpoint && s.endpoint.startsWith('https'));
    if (!sp) {
      throw Object.assign(new Error('no usable storage provider'), {
        code: 'SP_UNAVAILABLE',
      });
    }
    spCache = sp;
    return sp;
  }

  const vis = (v) =>
    v === 'private'
      ? VisibilityType.VISIBILITY_TYPE_PRIVATE
      : VisibilityType.VISIBILITY_TYPE_PUBLIC_READ;

  return {
    async createBucket({ bucketName, owner, visibility }) {
      const sp = await primarySp();
      const tx = await client.bucket.createBucket({
        bucketName,
        creator: owner,
        visibility: vis(visibility),
        chargedReadQuota: Long.fromString('0'),
        primarySpAddress: sp.operatorAddress,
        paymentAddress: owner,
      });
      const sim = await tx.simulate({ denom: 'BNB' });
      const res = await tx.broadcast({
        denom: 'BNB',
        gasLimit: Number(sim.gasLimit),
        gasPrice: sim.gasPrice,
        payer: owner,
        granter: '',
        privateKey,
      });
      return { bucketName, txHash: res.transactionHash || null };
    },

    async putObject({ bucketName, objectKey, data, contentType, visibility }) {
      const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
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
        { type: 'ECDSA', privateKey },
      );
      return { bucketName, objectKey, txHash: null };
    },
  };
}
