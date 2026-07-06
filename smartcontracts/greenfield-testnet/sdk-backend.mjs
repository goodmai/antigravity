/**
 * REAL Greenfield signer backend — implements the greenfield-core
 * `GreenfieldBackend` write interface via the official
 * @bnb-chain/greenfield-js-sdk: on-chain MsgCreateBucket (with SP
 * approval) and signed object upload.
 */
// Use dynamic import for CJS entry point to bypass broken ESM resolution
const sdk = (await import('./node_modules/@bnb-chain/greenfield-js-sdk/dist/cjs/index.js')).default || (await import('./node_modules/@bnb-chain/greenfield-js-sdk/dist/cjs/index.js'));
const { Client, VisibilityType, Long } = sdk;
import { sdkCreateBucket } from '../buckets/greenfield-sdk-tx.js';
import { ethers } from 'ethers';

/**
 * @param {object} params
 * @param {string} params.rpcUrl
 * @param {string|number} params.chainId
 * @param {string} params.privateKey
 * @param {string} [params.address] - Optional creator address override
 * @param {number} [params.globalVirtualGroupFamilyId] - Optional explicit GVG family
 * @param {string} [params.spEndpoint] - Optional SP gateway URL to upload through
 *   directly. Overrides the on-chain endpoint lookup, which on the local network
 *   returns http://127.0.0.1:903x — reachable between SPs inside the node container
 *   but NOT from other containers. Pass the docker-resolvable URL (GF_SP) instead.
 */
export function createSdkBackend({
  rpcUrl,
  chainId,
  privateKey,
  address,
  globalVirtualGroupFamilyId,
  spEndpoint,
}) {
  const chainStr = String(chainId);
  const isLocalChain = chainStr === '9000' || chainStr.startsWith('greenfield_9000-');
  const sdkChainId = chainId;
  const normalizedPrivateKey = privateKey?.startsWith?.('0x')
    ? privateKey
    : `0x${privateKey}`;

  const broadcastSigner = { type: 'ECDSA', privateKey: normalizedPrivateKey };

  // Greenfield SDK EIP-712 types use uint256 for both domain.chainId and
  // message.chain_id. The local Cosmos chain-id is `greenfield_9000-1`, but
  // the signer must use the numeric EVM chain id that the node verifies.
  const client = Client.create(rpcUrl, sdkChainId);

  // On fresh local chains (greenfield_9000-*) the GVG family statistics
  // don't exist yet because no objects have been sealed. The SDK's
  // internal QuerySpOptimalGlobalVirtualGroupFamily (called by createBucket)
  // will fail. We knowledge-inject a monkey-patch to bypass this query
  // and return family ID 1 directly on local chains.
  
  if (isLocalChain) {
    console.log('[Greenfield] Applying local-chain monkey-patch to bypass GVG statistics query');
    const patchTarget = (obj) => {
      if (obj && obj.getSpOptimalGlobalVirtualGroupFamily) {
        const originalGetVgf = obj.getSpOptimalGlobalVirtualGroupFamily.bind(obj);
        obj.getSpOptimalGlobalVirtualGroupFamily = async (params) => {
          try {
            return await originalGetVgf(params);
          } catch (e) {
            if (e.message && (e.message.includes('statistics not exist') || e.message.includes('unknown request'))) {
              console.warn('[Greenfield] GVG statistics query failed, defaulting to family 1');
              return { globalVirtualGroupFamilyId: 1 };
            }
            throw e;
          }
        };
        return true;
      }
      return false;
    };

    const p1 = patchTarget(client.virtualGroup);
    const p2 = patchTarget(client.bucket.virtualGroup);
    console.log(`[Greenfield] Monkey-patch status: client.virtualGroup=${p1}, client.bucket.virtualGroup=${p2}`);
  }

  const gvgFamilyId = typeof globalVirtualGroupFamilyId === 'number'
    ? globalVirtualGroupFamilyId
    : (isLocalChain ? 1 : undefined);

  const vis = (v) =>
    v === 'private'
      ? VisibilityType.VISIBILITY_TYPE_PRIVATE
      : VisibilityType.VISIBILITY_TYPE_PUBLIC_READ;

  return {
    async createBucket({ bucketName, owner, visibility }) {
      console.log(`[Greenfield] Creating bucket "${bucketName}" for owner ${address || owner}`);
      const { txHash } = await sdkCreateBucket({
        client,
        Long,
        VisibilityType,
        bucketName,
        creator: owner,
        visibility,
        broadcastSigner: broadcastSigner,
        feePayer: undefined,
        globalVirtualGroupFamilyId: gvgFamilyId,
        fixedGas: undefined,
      });
      return { bucketName, txHash };
    },

    async putObject({ bucketName, objectKey, data, contentType, visibility }) {
      const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
      await client.object.delegateUploadObject(
        {
          endpoint: spEndpoint,
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
        { type: 'ECDSA', privateKey: normalizedPrivateKey },
      );
      return { bucketName, objectKey, txHash: null };
    },
  };
}
