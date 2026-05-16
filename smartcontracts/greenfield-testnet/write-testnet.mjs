/**
 * Write a bucket + object to the REAL BNB Greenfield public testnet.
 *
 * Chain id 5600 · RPC https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org
 * SDK: @bnb-chain/greenfield-js-sdk  (Client.create(rpcUrl, chainId))
 *
 * Requires a FUNDED testnet account. Fund it first:
 *   1. Claim test tBNB on BSC testnet, bridge to Greenfield, or
 *   2. Use the Greenfield faucet / DCellar testnet.
 *      https://docs.bnbchain.org/bnb-greenfield/getting-started/get-test-bnb/
 *
 * Env:
 *   GREENFIELD_TESTNET_PRIVATE_KEY  (required) 0x… funded testnet key
 *   GREENFIELD_TESTNET_ADDRESS      (required) the matching 0x… address
 *   GF_BUCKET                       (optional) override bucket name
 *
 * This performs REAL on-chain transactions and consumes real testnet gas.
 * It is never run by the default `npm test`.
 */

import { Client, Long, VisibilityType } from '@bnb-chain/greenfield-js-sdk';

const RPC = 'https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org';
const CHAIN_ID = '5600';

const PK = process.env.GREENFIELD_TESTNET_PRIVATE_KEY;
const ADDR = process.env.GREENFIELD_TESTNET_ADDRESS;
if (!PK || !ADDR) {
  console.error(
    'Refusing to run: set GREENFIELD_TESTNET_PRIVATE_KEY and ' +
      'GREENFIELD_TESTNET_ADDRESS (a funded testnet account).',
  );
  process.exit(2);
}

const bucketName =
  process.env.GF_BUCKET || `daskibo-${Date.now().toString(36)}`;
const objectName = 'courses/01/intro.md';
const payload = Buffer.from(
  `# Daskibo · Greenfield testnet write\nbucket: ${bucketName}\nat: ${new Date().toISOString()}\n`,
);

const client = Client.create(RPC, CHAIN_ID);

async function main() {
  console.log(`→ testnet ${CHAIN_ID} as ${ADDR}`);

  const sps = await client.sp.getStorageProviders();
  const primarySp = sps.find((s) => s.endpoint?.startsWith('https'));
  if (!primarySp) throw new Error('no usable storage provider on testnet');
  console.log(`→ primary SP ${primarySp.operatorAddress} ${primarySp.endpoint}`);

  // 1. Create bucket (on-chain tx, SP approval handled by the SDK)
  const createBucketTx = await client.bucket.createBucket({
    bucketName,
    creator: ADDR,
    visibility: VisibilityType.VISIBILITY_TYPE_PUBLIC_READ,
    chargedReadQuota: Long.fromString('0'),
    primarySpAddress: primarySp.operatorAddress,
    paymentAddress: ADDR,
  });
  const bSim = await createBucketTx.simulate({ denom: 'BNB' });
  const bRes = await createBucketTx.broadcast({
    denom: 'BNB',
    gasLimit: Number(bSim.gasLimit),
    gasPrice: bSim.gasPrice,
    payer: ADDR,
    granter: '',
    privateKey: PK,
  });
  console.log(`✓ bucket "${bucketName}" created — tx ${bRes.transactionHash}`);

  // 2. Upload object via the SP delegate path
  await client.object.delegateUploadObject(
    {
      bucketName,
      objectName,
      body: {
        name: objectName,
        type: 'text/markdown',
        size: payload.length,
        content: payload,
      },
      delegatedOpts: { visibility: VisibilityType.VISIBILITY_TYPE_PUBLIC_READ },
    },
    { type: 'ECDSA', privateKey: PK },
  );
  console.log(`✓ object "${objectName}" uploaded to ${bucketName}`);

  // 3. Read it back from the SP universal endpoint
  const url = `${primarySp.endpoint}/view/${bucketName}/${objectName}`;
  const res = await fetch(url);
  const text = await res.text();
  console.log(`✓ read back (${res.status}) from ${url}`);
  if (!text.includes(bucketName)) {
    throw new Error('round-trip mismatch: read content did not match');
  }
  console.log('ALL GOOD — real testnet round-trip succeeded.');
}

main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
