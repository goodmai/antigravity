/**
 * DRM publisher (Chipotle / Lit v3) — encrypt a course, store it on the REAL
 * BNB Greenfield testnet, and gate the master-key release on a **soulbound NFT
 * balance** held on the REAL BSC testnet.
 *
 * One script, two targets (Lit has no testnets — only local build & mainnet):
 *   • LOCAL build  : CHIPOTLE_URL=http://localhost:8000  (chipotle-mock / dstack-sim)
 *   • MAINNET (Lit): CHIPOTLE_URL=https://api.chipotle.litprotocol.com (Base 8453)
 *                    + CHIPOTLE_API_KEY=<key from /core/v1/new_account, Stripe-funded>
 *
 * Always-real testnet pieces (independent of the Lit mode):
 *   • Contracts → BSC testnet (chain 97)             — deployed by the deploy step
 *   • Storage   → BNB Greenfield testnet (chain 5600)
 *
 * Because the NFT is soulbound it cannot be transferred/flash-loaned, so a spot
 * balanceOf gate is safe (lit-acc.js header / Audit 3.2). Chipotle removed
 * `checkConditions`, so the ACC is enforced app-side by the adapter
 * (lit-sdk-chipotle.js: ethers → BSC testnet RPC).
 *
 * Required env:
 *   GREENFIELD_TESTNET_PRIVATE_KEY=0x...   # funded tBNB on Greenfield 5600
 *   GREENFIELD_TESTNET_ADDRESS=0x...
 *   NFT_GATING_CONTRACT=0x...              # deployed ClientNft (or AuthorNft) on BSC testnet
 *
 * Optional env:
 *   CHIPOTLE_URL=http://localhost:8000     # mock (default) or https://api.chipotle.litprotocol.com
 *   CHIPOTLE_API_KEY=dummy-api-key         # required for real Chipotle (mock ignores it)
 *   NFT_GATING_CHAIN=bscTestnet            # Lit chain identifier for the NFT contract
 *   NFT_STANDARD=ERC721 · NFT_MIN_BALANCE=1
 *   GF_BUCKET=my-course                    # defaults to random
 */

import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);
_require('@bnb-chain/greenfield-js-sdk'); // CJS preload (same as sibling writers)

import { createGreenfieldClient } from '../buckets/greenfield-core.js';
import { planCoursePublish } from '../buckets/course-publish.js';
import { createLitAccess } from '../buckets/lit-access.js';
import { createChipotleClient } from '../buckets/lit-sdk-chipotle.js';
import { tokenBalanceAcc, courseAccessAcc } from '../buckets/lit-acc.js';
import { createSdkBackend } from './sdk-backend.mjs';
import { loadCourse, buildPublishSpec, humanBytes } from './course-loader.mjs';

// Which real course to publish (same content as goodmai.github.io):
//   COURSE=lessons               (default — the flat lessons/ course)
//   COURSE=academy/web3-genesis  (a named academy course)
const COURSE = process.env.COURSE || 'lessons';

const PK   = process.env.GREENFIELD_TESTNET_PRIVATE_KEY;
const ADDR = process.env.GREENFIELD_TESTNET_ADDRESS;
if (!PK || !ADDR) {
  console.error('Set GREENFIELD_TESTNET_PRIVATE_KEY and GREENFIELD_TESTNET_ADDRESS');
  process.exit(2);
}

// Gate selection — two modes:
//   • course (demo-style): release iff CourseMarketplace.hasCourseAccess(user,
//     courseId) — a buyer gains access by PURCHASING (soulbound AccessPass).
//     Enabled when MARKETPLACE_ADDR + COURSE_ID are set.
//   • nft: release iff NFT_GATING_CONTRACT.balanceOf(user) >= N (fallback).
const MARKETPLACE_ADDR = process.env.MARKETPLACE_ADDR;
const COURSE_ID        = process.env.COURSE_ID;
const NFT_CONTRACT     = process.env.NFT_GATING_CONTRACT;
const GATE_COURSE      = Boolean(MARKETPLACE_ADDR && COURSE_ID);
if (!GATE_COURSE && !NFT_CONTRACT) {
  console.error('Set MARKETPLACE_ADDR + COURSE_ID (purchase-gated, demo-style) OR NFT_GATING_CONTRACT (balanceOf-gated).');
  console.error('  → written to devnet-addresses.env by the deploy step');
  process.exit(2);
}

const CHIPOTLE_URL = (process.env.CHIPOTLE_URL || 'http://localhost:8000').replace(/\/$/, '');
const CHIPOTLE_API_KEY = process.env.CHIPOTLE_API_KEY || 'dummy-api-key';
const NFT_CHAIN    = process.env.NFT_GATING_CHAIN || 'bscTestnet';
const NFT_STANDARD = process.env.NFT_STANDARD || 'ERC721';
const NFT_MIN      = process.env.NFT_MIN_BALANCE || '1';
const GF_BUCKET    = process.env.GF_BUCKET || `daskibo-${Date.now().toString(36)}`;

const RPC      = process.env.GREENFIELD_RPC || 'https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org';
const SP       = process.env.GREENFIELD_SP || 'https://gnfd-testnet-sp1.bnbchain.org';
const CHAIN_ID = process.env.GREENFIELD_CHAIN_ID || '5600';

const isMainnetLit = /api\.chipotle\.litprotocol\.com/.test(CHIPOTLE_URL);

async function main() {
  // ── 1. Connect Chipotle + provision PKP ───────────────────────────────────
  const authHeaders = { 'X-Api-Key': CHIPOTLE_API_KEY };
  console.log(`→ Connecting to Chipotle at ${CHIPOTLE_URL} (${isMainnetLit ? 'REAL Base-mainnet' : 'local'})…`);
  const vRes = await fetch(`${CHIPOTLE_URL}/core/v1/version`, { headers: authHeaders });
  if (!vRes.ok) throw new Error(`Cannot reach Chipotle at ${CHIPOTLE_URL} (HTTP ${vRes.status})`);
  const version = await vRes.json().catch(() => ({}));
  console.log(`✓ Chipotle: ${version.name ?? '?'} v${version.version ?? '?'} mode=${version.mode ?? '?'}`);
  if (isMainnetLit && CHIPOTLE_API_KEY === 'dummy-api-key') {
    throw new Error('Real Chipotle requires a funded CHIPOTLE_API_KEY (Stripe credits) — got dummy-api-key');
  }

  const wRes = await fetch(`${CHIPOTLE_URL}/core/v1/create_wallet`, { headers: authHeaders });
  if (!wRes.ok) throw new Error(`create_wallet failed: HTTP ${wRes.status} ${await wRes.text()}`);
  const wallet = await wRes.json();
  const PKP_ID = wallet.wallet_address;
  console.log(`  PKP address: ${PKP_ID}`);

  // ── 2. ACC — purchase-gated (demo-style) or NFT-balance gate on BSC testnet ─
  const acc = GATE_COURSE
    ? courseAccessAcc({ contractAddress: MARKETPLACE_ADDR, chain: NFT_CHAIN, courseId: COURSE_ID })
    : tokenBalanceAcc({ contractAddress: NFT_CONTRACT, standardContractType: NFT_STANDARD, chain: NFT_CHAIN, min: NFT_MIN });
  console.log(GATE_COURSE
    ? `→ ACC: CourseMarketplace.hasCourseAccess(:userAddress, ${COURSE_ID}) == true @ ${NFT_CHAIN} (${MARKETPLACE_ADDR})`
    : `→ ACC: ${NFT_STANDARD}.balanceOf(:userAddress) >= ${NFT_MIN} @ ${NFT_CHAIN} (${NFT_CONTRACT})`);

  // ── 3. Chipotle litClient + litAccess ─────────────────────────────────────
  const chipotleClient = createChipotleClient({ chipotleUrl: CHIPOTLE_URL, pkpId: PKP_ID, apiKey: CHIPOTLE_API_KEY });
  const litAccess      = createLitAccess({ litClient: chipotleClient, chain: NFT_CHAIN });

  // ── 4. Course spec — the REAL course (repo lessons/ or academy/<name>) ────
  const course = loadCourse({ id: COURSE });
  const spec = buildPublishSpec(course, { slug: GF_BUCKET, litNetwork: 'chipotle' });
  console.log(
    `→ Course "${course.id}" — ${course.title}: ${spec.lessons.length} text lessons ` +
    `(${humanBytes(course.totalBytes)} total incl. ${course.files.length - spec.lessons.length} assets)`,
  );

  // ── 5. Plan (encrypt + Chipotle-wrap master key) ──────────────────────────
  console.log(`→ Planning publish for bucket "${GF_BUCKET}"…`);
  const plan = await planCoursePublish({
    spec,
    pricing: { litSaveCost: 800n, storageCost: 200n },
    lit: { access: litAccess, accessControlConditions: acc },
  });
  if (!plan.manifest.lit) throw new Error('planCoursePublish did not produce a lit envelope');

  // Augment manifest with Chipotle routing (reader needs url + pkp). NB: the
  // manifest URL must be reachable from the BROWSER, not from inside Docker —
  // the writer talks to http://chipotle-mock:8000, but the reader runs on the
  // host, so store the published URL (http://localhost:8000) instead.
  const CHIPOTLE_PUBLIC_URL = process.env.CHIPOTLE_PUBLIC_URL
    || (isMainnetLit ? CHIPOTLE_URL : 'http://localhost:8000');
  const litEnv  = { ...plan.manifest.lit, litNetwork: 'chipotle', chipotleUrl: CHIPOTLE_PUBLIC_URL, pkpId: PKP_ID };
  const manifest = { ...plan.manifest, lit: litEnv };
  const objects  = plan.objects.map(o => o.kind === 'manifest' ? { ...o, body: JSON.stringify(manifest) } : o);
  console.log(`✓ Master key Chipotle-wrapped (pkp ${PKP_ID}, hash ${litEnv.dataToEncryptHash})`);

  // ── 6. Greenfield upload ──────────────────────────────────────────────────
  function fetchTransport({ method, url, headers, body }) {
    return fetch(url, { method, headers, body: body || undefined }).then(async res => {
      const text = await res.text(); const hh = {};
      res.headers.forEach((v, k) => { hh[k.toLowerCase()] = v; });
      return { status: res.status, headers: hh, body: text };
    });
  }
  const backend = createSdkBackend({ rpcUrl: RPC, chainId: CHAIN_ID, privateKey: PK, address: ADDR });
  const client  = createGreenfieldClient({ transport: fetchTransport, owner: ADDR, endpoint: SP, backend });

  console.log(`→ Creating bucket "${plan.bucketName}"…`);
  await client.createBucket(plan.bucketName, { visibility: 'public', owner: ADDR });
  for (const o of objects) {
    console.log(`→ Uploading ${o.key} (${o.kind})…`);
    await client.saveObject(plan.bucketName, o.key, o.body, { contentType: o.contentType, owner: ADDR });
  }

  const back = JSON.parse(await client.readObject(plan.bucketName, '_lit/manifest.json'));
  if (!back.lit?.pkpId) throw new Error('Round-trip check failed: manifest.lit missing from SP');
  console.log('✓ Manifest round-trip verified');

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`DONE — gated course on Greenfield testnet (Chipotle ${isMainnetLit ? 'mainnet' : 'local'})`);
  console.log(`Bucket:   ${plan.bucketName}`);
  console.log(GATE_COURSE
    ? `Gate:     buy CourseMarketplace.purchase(${COURSE_ID}) @ ${NFT_CHAIN} (${MARKETPLACE_ADDR}) → access`
    : `Gate:     ${NFT_STANDARD}.balanceOf >= ${NFT_MIN} @ ${NFT_CHAIN} (${NFT_CONTRACT})`);
  console.log(`Reader:   http://localhost:8099/bucket-reader.html?bucket=${plan.bucketName}&owner=${ADDR}`);
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch(e => { console.error('FAILED:', e?.message ?? e); process.exit(1); });
