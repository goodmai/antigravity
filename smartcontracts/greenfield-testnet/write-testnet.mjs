/**
 * Publish a REAL encrypted course to the BNB Greenfield public testnet,
 * end-to-end through the same orchestrator the app uses:
 *
 *   course-publish.publishCourse
 *     → course-template (build + encrypt)  → crypto-envelope
 *     → lit-pricing (w3ext 20% save settlement)
 *     → greenfield-core client + REAL sdk-backend (on-chain tx + SP upload)
 *   then reads an object back via the SP to prove the round-trip.
 *
 * This performs real on-chain testnet transactions and consumes real
 * gas. Strictly opt-in. Fund a testnet account first:
 *   https://docs.bnbchain.org/bnb-greenfield/getting-started/get-test-bnb/
 *
 * Env:
 *   GREENFIELD_TESTNET_PRIVATE_KEY  (required) 0x… funded testnet key
 *   GREENFIELD_TESTNET_ADDRESS      (required) matching 0x… address
 */

import { createGreenfieldClient } from '../buckets/greenfield-core.js';
import { publishCourse, quoteCourseSale } from '../buckets/course-publish.js';
import { createSdkBackend } from './sdk-backend.mjs';

const RPC = process.env.GREENFIELD_RPC || 'https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org';
const SP = process.env.GREENFIELD_SP || 'https://gnfd-testnet-sp1.bnbchain.org';
const CHAIN_ID = process.env.GREENFIELD_CHAIN_ID || '5600';

const PK = process.env.GREENFIELD_TESTNET_PRIVATE_KEY;
const ADDR = process.env.GREENFIELD_TESTNET_ADDRESS;
if (!PK || !ADDR) {
  console.error(
    'Refusing to run: set GREENFIELD_TESTNET_PRIVATE_KEY and ' +
      'GREENFIELD_TESTNET_ADDRESS (a funded testnet account).',
  );
  process.exit(2);
}

async function fetchTransport({ method, url, headers, body }) {
  const res = await fetch(url, { method, headers, body: body || undefined });
  const text = await res.text();
  const h = {};
  res.headers.forEach((v, k) => (h[k.toLowerCase()] = v));
  return { status: res.status, headers: h, body: text };
}

const slug = `daskibo-${Date.now().toString(36)}`;
const spec = {
  slug,
  title: 'Daskibo · Greenfield Testnet Course',
  litNetwork: 'datil-test',
  lessons: [
    {
      key: 'lessons/01/intro.md',
      title: 'Intro',
      contentType: 'text/markdown',
      body: `# Real testnet course\nbucket: ${slug}\nat: ${new Date().toISOString()}\n`,
    },
  ],
};

async function main() {
  console.log(`→ testnet ${CHAIN_ID} as ${ADDR}, bucket ${slug}`);

  const backend = createSdkBackend({
    rpcUrl: RPC,
    chainId: CHAIN_ID,
    privateKey: PK,
    address: ADDR,
  });
  const client = createGreenfieldClient({
    transport: fetchTransport,
    owner: ADDR,
    endpoint: SP,
    backend,
  });

  const res = await publishCourse({
    client,
    spec,
    pricing: { litSaveCost: 800n, storageCost: 200n },
    owner: ADDR,
  });
  console.log(`✓ published ${res.savedKeys.length} objects`);
  console.log(
    `  w3ext save settlement: base=${res.settlement.base} ` +
      `fee=${res.settlement.w3extFee} total=${res.settlement.total}`,
  );

  const sale = quoteCourseSale({
    salePrice: 100000n,
    treasury: '0xTREASURY',
    seller: ADDR,
  });
  console.log(
    `  sale split: treasury=${sale.treasuryAmount} seller=${sale.sellerAmount}`,
  );

  // Read an encrypted object back from the SP (public-read, no signer).
  const encKey = 'lessons/01/intro.md.enc';
  const back = await client.readObject(slug, encKey);
  if (!back || !back.includes('ciphertext')) {
    throw new Error('round-trip mismatch: could not read back the envelope');
  }
  console.log(`✓ read back ${encKey} from SP`);
  console.log('ALL GOOD — real testnet publish + round-trip succeeded.');
}

main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
