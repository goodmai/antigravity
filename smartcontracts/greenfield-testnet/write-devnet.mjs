/**
 * DEVNET publisher — encrypt a course, store it on the REAL BNB Greenfield
 * testnet, and gate the Lit master-key release on a **soulbound NFT balance**
 * held on the REAL BSC testnet.
 *
 * This is the devnet sibling of write-testnet-lit.mjs. The only difference is
 * the Access Control Condition: instead of an address allowlist, the bucket is
 * gated on `balanceOf(:userAddress) >= NFT_MIN_BALANCE` of the deployed
 * soulbound role NFT (ClientNft by default). Because the NFT is soulbound it
 * cannot be transferred or flash-loaned, so a spot `balanceOf` gate is safe
 * here (see lit-acc.js header / Audit 3.2).
 *
 * Wiring (all REAL testnets, no mocks):
 *   • Contracts  → BSC testnet (chain 97)            — deployed by devnet-deploy
 *   • Storage    → BNB Greenfield testnet (chain 5600)
 *   • Key release→ Lit Protocol datil-dev (free; no capacity credits)
 *
 * Required env:
 *   GREENFIELD_TESTNET_PRIVATE_KEY=0x...   # funded tBNB on Greenfield 5600
 *   GREENFIELD_TESTNET_ADDRESS=0x...
 *   NFT_GATING_CONTRACT=0x...              # deployed ClientNft (or AuthorNft)
 *
 * Optional env:
 *   NFT_GATING_CHAIN=bscTestnet            # Lit chain identifier for the NFT
 *   NFT_STANDARD=ERC721                    # Lit standardContractType
 *   NFT_MIN_BALANCE=1                      # minimum balance to unlock
 *   GF_BUCKET=my-devnet-course             # defaults to random
 *   LIT_CAPACITY_DELEGATION_AUTH_SIG=...   # switch to paid datil-test
 *
 * Usage:
 *   docker compose -f smartcontracts/docker-compose.devnet.yml up
 *   # or directly:
 *   cd smartcontracts/greenfield-testnet && npm install && \
 *     NFT_GATING_CONTRACT=0x... node write-devnet.mjs
 */

import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);
// Greenfield SDK — CJS workaround (same as the other writers).
_require('@bnb-chain/greenfield-js-sdk');

import { createGreenfieldClient } from '../buckets/greenfield-core.js';
import { planCoursePublish } from '../buckets/course-publish.js';
import { createLitAccess } from '../buckets/lit-access.js';
import { tokenBalanceAcc } from '../buckets/lit-acc.js';
import { createSdkBackend } from './sdk-backend.mjs';

const PK   = process.env.GREENFIELD_TESTNET_PRIVATE_KEY;
const ADDR = process.env.GREENFIELD_TESTNET_ADDRESS;
if (!PK || !ADDR) {
  console.error('Set GREENFIELD_TESTNET_PRIVATE_KEY and GREENFIELD_TESTNET_ADDRESS');
  process.exit(2);
}

const NFT_CONTRACT = process.env.NFT_GATING_CONTRACT;
if (!NFT_CONTRACT) {
  console.error('Set NFT_GATING_CONTRACT (the deployed ClientNft/AuthorNft address on BSC testnet)');
  console.error('  → it is written to devnet-addresses.env by the devnet-deploy step');
  process.exit(2);
}

const NFT_CHAIN    = process.env.NFT_GATING_CHAIN || 'bscTestnet';
const NFT_STANDARD = process.env.NFT_STANDARD || 'ERC721';
const NFT_MIN      = process.env.NFT_MIN_BALANCE || '1';
const GF_BUCKET    = process.env.GF_BUCKET || `daskibo-devnet-${Date.now().toString(36)}`;

const RPC      = 'https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org';
const SP       = 'https://gnfd-testnet-sp1.bnbchain.org';
const CHAIN_ID = '5600';

async function main() {
  // ── 1. Connect Lit ────────────────────────────────────────────────────────
  const usePaid = !!process.env.LIT_CAPACITY_DELEGATION_AUTH_SIG;
  const network = usePaid ? 'datil-test' : 'datil-dev';
  console.log(`→ Loading Lit Protocol SDK (${network})…`);
  const { LitNodeClient } = _require('@lit-protocol/lit-node-client');
  const { encryptString } = _require('@lit-protocol/encryption');
  const { LitActionResource } = _require('@lit-protocol/auth-helpers');
  const { LIT_ABILITY } = _require('@lit-protocol/constants');
  const { createSiweMessage, generateAuthSig } = _require('@lit-protocol/auth-helpers');
  const ethers = _require('ethers');

  const litNode = new LitNodeClient({ litNetwork: network, debug: false });
  await litNode.connect();
  console.log(`✓ Lit connected to ${network}`);

  let sessionSigs = undefined;
  if (usePaid) {
    console.log('→ Requesting Lit Session Signatures with Capacity Credits...');
    const wallet = new ethers.Wallet(PK);
    let capAuthSigs = undefined;
    try {
      capAuthSigs = [JSON.parse(process.env.LIT_CAPACITY_DELEGATION_AUTH_SIG)];
    } catch (e) {
      console.warn('Failed to parse LIT_CAPACITY_DELEGATION_AUTH_SIG:', e.message);
    }
    sessionSigs = await litNode.getSessionSigs({
      chain: 'ethereum',
      resourceAbilityRequests: [
        { resource: new LitActionResource('*'), ability: LIT_ABILITY.LitActionExecution },
      ],
      capabilityAuthSigs: capAuthSigs,
      authNeededCallback: async ({ uri, expiration, resourceAbilityRequests }) => {
        const toSign = await createSiweMessage({
          uri, expiration, resources: resourceAbilityRequests,
          walletAddress: wallet.address,
          nonce: await litNode.getLatestBlockhash(),
          litNodeClient: litNode,
        });
        return generateAuthSig({ signer: wallet, toSign });
      },
    });
    console.log('✓ Session Signatures obtained');
  }

  // ── 2. Build Lit access adapter (write path: encrypt only) ────────────────
  const litClient = {
    async encrypt({ accessControlConditions, dataToEncrypt }) {
      return encryptString({ accessControlConditions, dataToEncrypt, sessionSigs }, litNode);
    },
    async decrypt() { throw new Error('decrypt not needed server-side'); },
  };
  // The envelope's `chain` must match the chain the NFT lives on so the
  // reader's decrypt request asks Lit to read state on BSC testnet.
  const litAccess = createLitAccess({ litClient, chain: NFT_CHAIN });

  // ── 3. Build ACC — soulbound NFT balance gate on BSC testnet ──────────────
  const acc = tokenBalanceAcc({
    contractAddress: NFT_CONTRACT,
    standardContractType: NFT_STANDARD,
    chain: NFT_CHAIN,
    min: NFT_MIN,
  });

  console.log('→ ACC: soulbound NFT balance gate');
  console.log(`   contract: ${NFT_CONTRACT}`);
  console.log(`   chain:    ${NFT_CHAIN}`);
  console.log(`   rule:     ${NFT_STANDARD}.balanceOf(:userAddress) >= ${NFT_MIN}`);

  // ── 4. Course spec ────────────────────────────────────────────────────────
  const spec = {
    slug: GF_BUCKET,
    title: 'Daskibo Academy — Devnet (NFT-gated course)',
    litNetwork: network,
    lessons: [
      {
        key: 'lessons/01/intro.md',
        title: 'Урок 1 — DRM devnet: BSC testnet + Greenfield + Lit',
        contentType: 'text/markdown',
        body: [
          `# Daskibo Academy — Devnet`,
          ``,
          `Контент зашифрован (AES-256-GCM), мастер-ключ обёрнут Lit Protocol.`,
          `Доступ выдаётся только держателям soulbound NFT.`,
          ``,
          `Bucket:    ${GF_BUCKET}`,
          `Published: ${new Date().toISOString()}`,
          `Storage:   BNB Greenfield testnet 5600`,
          `Gate:      ${NFT_STANDARD}.balanceOf >= ${NFT_MIN} @ ${NFT_CHAIN}`,
          `NFT:       ${NFT_CONTRACT}`,
          `Lit:       ${network}`,
          ``,
          `## Как расшифровать`,
          `  1. Connect MetaMask (адрес, держащий NFT-доступ)`,
          `  2. Connect Lit (${network})`,
          `  3. Get Session → MetaMask подписывает SIWE`,
          `  4. Unlock → Lit читает balanceOf на BSC testnet → AES-GCM decrypt`,
        ].join('\n'),
      },
    ],
  };

  // ── 5. Plan (encrypt + Lit-wrap master key) ───────────────────────────────
  console.log(`→ Planning publish for bucket "${GF_BUCKET}"…`);
  const plan = await planCoursePublish({
    spec,
    pricing: { litSaveCost: 800n, storageCost: 200n },
    lit: { access: litAccess, accessControlConditions: acc },
  });

  const litEnv = plan.manifest.lit;
  if (!litEnv) throw new Error('planCoursePublish did not produce a lit envelope — check acc');

  console.log('✓ Master key Lit-wrapped');
  console.log(`  schema:            ${litEnv.schema}`);
  console.log(`  chain:             ${litEnv.chain}`);
  console.log(`  dataToEncryptHash: ${litEnv.dataToEncryptHash}`);

  // ── 6. Greenfield backend ──────────────────────────────────────────────────
  function fetchTransport({ method, url, headers, body }) {
    return fetch(url, { method, headers, body: body || undefined }).then(async res => {
      const text = await res.text();
      const h = {};
      res.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
      return { status: res.status, headers: h, body: text };
    });
  }

  const backend = createSdkBackend({ rpcUrl: RPC, chainId: CHAIN_ID, privateKey: PK, address: ADDR });
  const client  = createGreenfieldClient({ transport: fetchTransport, owner: ADDR, endpoint: SP, backend });

  // ── 7. Create bucket + upload objects ─────────────────────────────────────
  console.log(`→ Creating bucket "${plan.bucketName}"…`);
  await client.createBucket(plan.bucketName, { visibility: 'public', owner: ADDR });
  console.log('✓ Bucket created');

  for (const o of plan.objects) {
    console.log(`→ Uploading ${o.key} (${o.kind})…`);
    await client.saveObject(plan.bucketName, o.key, o.body, { contentType: o.contentType, owner: ADDR });
    console.log('  ✓ saved');
  }

  // ── 8. Verify manifest round-trip ─────────────────────────────────────────
  const back = JSON.parse(await client.readObject(plan.bucketName, '_lit/manifest.json'));
  if (!back.lit) throw new Error('Round-trip check failed: manifest.lit missing from SP');
  console.log('✓ Manifest round-trip verified — manifest.lit present on SP');

  // ── 9. Summary ────────────────────────────────────────────────────────────
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('DEVNET PUBLISH DONE — NFT-gated course live on Greenfield testnet');
  console.log('');
  console.log(`Bucket:   ${plan.bucketName}`);
  console.log(`SP URL:   ${SP}/${plan.bucketName}/_lit/manifest.json`);
  console.log(`Gate:     ${NFT_STANDARD}.balanceOf >= ${NFT_MIN} @ ${NFT_CHAIN} (${NFT_CONTRACT})`);
  console.log('');
  console.log('Open the DRM reader (frontend container serves it on :8099):');
  console.log(`  http://localhost:8099/bucket-reader.html?bucket=${plan.bucketName}&owner=${ADDR}`);
  console.log('');
  console.log('Then: Connect MetaMask (holds the NFT) → Connect Lit → Get Session → Unlock');
  console.log('═══════════════════════════════════════════════════════════');

  await litNode.disconnect?.();
}

main().catch(e => {
  console.error('FAILED:', e?.message ?? e);
  process.exit(1);
});
