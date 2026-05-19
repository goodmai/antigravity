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

import * as gnfdSdk from '@bnb-chain/greenfield-js-sdk';
import { sdkCreateBucket } from '../buckets/greenfield-sdk-tx.js';

/**
 * @param {{ rpcUrl: string, chainId: string|number, privateKey: string, address: string, sdk?: any }} cfg
 */
export function createSdkBackend({ rpcUrl, chainId, privateKey, address, sdk }) {
  if (!privateKey || !address) {
    throw Object.assign(
      new Error('createSdkBackend requires a funded privateKey + address'),
      { code: 'NO_SIGNER' },
    );
  }
  // `sdk` injectable so the call-shapes are unit-tested with a fake.
  const { Client, Long, VisibilityType } = sdk || gnfdSdk;
  const client = Client.create(rpcUrl, String(chainId));

  const vis = (v) =>
    v === 'private'
      ? VisibilityType.VISIBILITY_TYPE_PRIVATE
      : VisibilityType.VISIBILITY_TYPE_PUBLIC_READ;

  return {
    async createBucket({ bucketName, owner, visibility }) {
      const { txHash } = await sdkCreateBucket({
        client,
        Long,
        VisibilityType,
        bucketName,
        creator: owner,
        visibility,
        broadcastSigner: { privateKey },
      });
      return { bucketName, txHash };
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
