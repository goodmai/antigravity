/**
 * Publish a course to Greenfield testnet WITH Chipotle access control.
 *
 * Uses the local Chipotle mock (or live api.chipotle.litprotocol.com) as
 * the Lit replacement: the bucket master key is AES-GCM encrypted by the
 * Chipotle PKP; the browser decrypts by proving address ownership via a
 * MetaMask signature, which the Chipotle server verifies against the ACC.
 *
 * Usage:
 *   # Start the mock server first (in a separate terminal):
 *   node write-testnet-chipotle.mjs  # starts Chipotle mock if CHIPOTLE_URL not set
 *
 *   # Or explicitly:
 *   export CHIPOTLE_URL=http://localhost:8000       # default
 *   export CHIPOTLE_PKP_KEY=0x...                   # optional, keeps key across restarts
 *   export GREENFIELD_TESTNET_PRIVATE_KEY=0x...
 *   export GREENFIELD_TESTNET_ADDRESS=0x...
 *   export GF_BUCKET=my-drm-course                  # optional
 *   export LIT_ALLOWED_ADDRESS=0xABC,...             # optional extra addresses
 *   node write-testnet-chipotle.mjs
 *
 *   Or via docker compose:
 *   docker compose -f smartcontracts/greenfield-testnet/docker-compose.yml \
 *     run --rm testnet-writer node write-testnet-chipotle.mjs
 */

import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);
const { Client, Long, VisibilityType } = _require('@bnb-chain/greenfield-js-sdk');

import { createGreenfieldClient } from '../buckets/greenfield-core.js';
import { planCoursePublish } from '../buckets/course-publish.js';
import { createLitAccess } from '../buckets/lit-access.js';
import { createChipotleClient } from '../buckets/lit-sdk-chipotle.js';
import { createSdkBackend } from './sdk-backend.mjs';

const PK   = process.env.GREENFIELD_TESTNET_PRIVATE_KEY;
const ADDR = process.env.GREENFIELD_TESTNET_ADDRESS;
if (!PK || !ADDR) {
  console.error('Set GREENFIELD_TESTNET_PRIVATE_KEY and GREENFIELD_TESTNET_ADDRESS');
  process.exit(2);
}

const GF_BUCKET = process.env.GF_BUCKET || `daskibo-${Date.now().toString(36)}`;
const EXTRA_ALLOWED = (process.env.LIT_ALLOWED_ADDRESS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const CHIPOTLE_URL = (process.env.CHIPOTLE_URL || 'http://localhost:8000').replace(/\/$/, '');

const RPC      = process.env.GREENFIELD_RPC || 'https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org';
const SP       = process.env.GREENFIELD_SP || 'https://gnfd-testnet-sp1.bnbchain.org';
const CHAIN_ID = process.env.GREENFIELD_CHAIN_ID || '5600';

async function main() {
  // ── 1. Connect Chipotle + get PKP ─────────────────────────────────────────
  console.log(`→ Connecting to Chipotle at ${CHIPOTLE_URL}…`);
  const versionRes = await fetch(`${CHIPOTLE_URL}/core/v1/version`);
  if (!versionRes.ok) {
    throw new Error(
      `Cannot reach Chipotle at ${CHIPOTLE_URL} — start chipotle-mock.mjs first`,
    );
  }
  const version = await versionRes.json();
  console.log(`✓ Chipotle: ${version.name} v${version.version} mode=${version.mode}`);

  const walletRes = await fetch(`${CHIPOTLE_URL}/core/v1/create_wallet`);
  const wallet    = await walletRes.json();
  const PKP_ID    = wallet.wallet_address;
  console.log(`  PKP address: ${PKP_ID}`);

  // ── 2. Build ACC ───────────────────────────────────────────────────────────
  function addressCondition(addr) {
    return {
      contractAddress: '',
      standardContractType: '',
      chain: 'ethereum',
      method: '',
      parameters: [':userAddress'],
      returnValueTest: { comparator: '=', value: addr },
    };
  }

  const acc = [addressCondition(ADDR)];
  for (const extra of EXTRA_ALLOWED) {
    acc.push({ operator: 'or' });
    acc.push(addressCondition(extra));
  }

  console.log(`→ ACC: ${acc.filter(c => !c.operator).length} allowed address(es)`);
  acc.filter(c => !c.operator).forEach(c => console.log(`   • ${c.returnValueTest.value}`));

  // ── 3. Build Chipotle litClient + litAccess ────────────────────────────────
  const chipotleClient = createChipotleClient({ chipotleUrl: CHIPOTLE_URL, pkpId: PKP_ID });
  const litAccess      = createLitAccess({ litClient: chipotleClient, chain: 'ethereum' });

  // ── 4. Course spec ─────────────────────────────────────────────────────────
  const spec = {
    slug: GF_BUCKET,
    title: 'Daskibo Academy — DRM Demo с Chipotle',
    litNetwork: 'chipotle',
    lessons: [
      {
        key: 'lessons/01/intro.md',
        title: 'Урок 1 — Архитектура DRM: Greenfield + Chipotle',
        contentType: 'text/markdown',
        body: [
          `# Daskibo Academy — DRM на BNB Greenfield + Chipotle`,
          ``,
          `Этот контент зашифрован и защищён через Chipotle PKP.`,
          ``,
          `Bucket:    ${GF_BUCKET}`,
          `Published: ${new Date().toISOString()}`,
          `Chain:     BNB Greenfield testnet 5600`,
          `Chipotle:  ${CHIPOTLE_URL}`,
          `PKP:       ${PKP_ID}`,
          `Deployer:  ${ADDR}`,
          ``,
          `## Архитектура шифрования`,
          ``,
          `  plaintext ──AES-256-GCM(DEK)──▶ ciphertext     (.enc файл)`,
          `  DEK       ──AES-256-GCM(master)──▶ wrappedDek  (.lit.json сайдкар)`,
          `  master    ──PKP AES-GCM──▶ manifest.lit.ciphertext`,
          ``,
          `## Доступ`,
          ``,
          `Только адреса из ACC могут получить мастер-ключ через Chipotle.`,
          `Chipotle проверяет подпись MetaMask — signature доказывает владение адресом.`,
          ``,
          `## Как расшифровать`,
          ``,
          `  1. Connect MetaMask (адрес из ACC)`,
          `  2. Sign nonce (MetaMask личная подпись — бесплатно)`,
          `  3. Unlock на уроке → Chipotle проверяет ACC → AES-GCM расшифровка`,
        ].join('\n'),
      },
    ],
  };

  // ── 5. Plan + encrypt master key via Chipotle ─────────────────────────────
  console.log(`→ Planning publish for bucket "${GF_BUCKET}"…`);
  const plan = await planCoursePublish({
    spec,
    pricing: { litSaveCost: 800n, storageCost: 200n },
    lit: { access: litAccess, accessControlConditions: acc },
  });

  if (!plan.manifest.lit) {
    throw new Error('planCoursePublish did not produce a lit envelope');
  }

  // Augment the lit envelope with Chipotle-specific routing metadata
  const litEnv = {
    ...plan.manifest.lit,
    litNetwork:  'chipotle',
    chipotleUrl: CHIPOTLE_URL,
    pkpId:       PKP_ID,
  };
  const manifest = { ...plan.manifest, lit: litEnv };
  const objects  = plan.objects.map(o =>
    o.kind === 'manifest' ? { ...o, body: JSON.stringify(manifest) } : o,
  );

  console.log(`✓ Master key Chipotle-wrapped`);
  console.log(`  pkpId:             ${litEnv.pkpId}`);
  console.log(`  chipotleUrl:       ${litEnv.chipotleUrl}`);
  console.log(`  dataToEncryptHash: ${litEnv.dataToEncryptHash}`);
  console.log(`  ACC conditions:    ${litEnv.accessControlConditions.filter(c => !c.operator).length}`);

  // ── 6. Greenfield backend ─────────────────────────────────────────────────
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

  for (const o of objects) {
    console.log(`→ Uploading ${o.key} (${o.kind})…`);
    await client.saveObject(plan.bucketName, o.key, o.body, {
      contentType: o.contentType,
      owner: ADDR,
    });
    console.log(`  ✓ saved`);
  }

  // ── 8. Verify manifest round-trip ─────────────────────────────────────────
  const back       = await client.readObject(plan.bucketName, '_lit/manifest.json');
  const parsedBack = JSON.parse(back);
  if (!parsedBack.lit?.litNetwork) {
    throw new Error('Round-trip check failed: manifest.lit.litNetwork missing from SP');
  }
  console.log('✓ Manifest round-trip verified');

  // ── 9. Summary ────────────────────────────────────────────────────────────
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('ALL DONE — Chipotle-protected course published to Greenfield');
  console.log('');
  console.log(`Bucket:    ${plan.bucketName}`);
  console.log(`Chipotle:  ${CHIPOTLE_URL}`);
  console.log(`PKP:       ${PKP_ID}`);
  console.log(`SP URL:    ${SP}/${plan.bucketName}/_lit/manifest.json`);
  console.log('');
  console.log('Open the DRM reader (with mock server running on :8000):');
  console.log(`  http://localhost:8099/bucket-reader.html?bucket=${plan.bucketName}&owner=${ADDR}`);
  console.log('');
  console.log('Then: Connect MetaMask → Sign Proof → Unlock lessons');
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch(e => {
  console.error('FAILED:', e?.message ?? e);
  process.exit(1);
});
