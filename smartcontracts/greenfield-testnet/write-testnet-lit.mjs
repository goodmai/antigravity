/**
 * ⛔ DEPRECATED (2026-07-06): this writer targets Lit datil-dev/datil-test —
 * the datil P2P networks were SHUT DOWN 2026-02-25 (Naga sunset 2026-04-01),
 * so it cannot work against live Lit anymore. Kept for reference only.
 * Use the shared Chipotle pipeline instead:
 *   node write-devnet.mjs    (testnet target — `testnets` compose profile)
 *   node write-mainnet.mjs   (mainnet target — `prod` compose profile)
 * FORCE_DATIL=1 bypasses the guard below (archival/debug only).
 *
 * Publish a course to Greenfield testnet WITH Lit Protocol access control.
 *
 * Differences from write-testnet.mjs:
 *   - Connects to Lit Protocol (datil-dev, free remote testnet) and wraps the
 *     AES bucket master key under on-chain Access Control Conditions (ACC).
 *   - datil-dev: бесплатная сеть Lit, capacity credits не нужны.
 *   - datil (mainnet): платная, требует NFT Capacity Credits на Chronicle Yellowstone.
 *   - The ACC grants decryption to the deployer address. Additional addresses
 *     can be added via LIT_ALLOWED_ADDRESS (comma-separated).
 *   - The manifest carries manifest.lit — a LitEnvelope the browser frontend
 *     can use to recover the master key via MetaMask + session sigs.
 *   - Encryption requires only LitNodeClient.connect() (no private key needed
 *     for the Lit encrypt step — auth is only needed for decrypt in browser).
 *
 * Usage:
 *   export GREENFIELD_TESTNET_PRIVATE_KEY=0x...
 *   export GREENFIELD_TESTNET_ADDRESS=0x...
 *   export GF_BUCKET=my-drm-course        # optional, defaults to random
 *   export LIT_ALLOWED_ADDRESS=0xABC,...   # optional extra addresses
 *   docker compose -f smartcontracts/greenfield-testnet/docker-compose.yml \
 *     run --rm testnet-writer node write-testnet-lit.mjs
 *
 *   Or directly (requires npm install first):
 *   cd smartcontracts/greenfield-testnet && npm install && node write-testnet-lit.mjs
 */

if (process.env.FORCE_DATIL !== '1') {
  console.error(
    'DEPRECATED: write-testnet-lit.mjs targets Lit datil, which was shut down 2026-02-25.\n' +
      'Use write-devnet.mjs (testnets) / write-mainnet.mjs (prod) — Chipotle pipeline.\n' +
      'Set FORCE_DATIL=1 to run anyway (will fail against live Lit).',
  );
  process.exit(2);
}

import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);
// Greenfield SDK — CJS workaround (same issue as before)
const { Client, Long, VisibilityType } = _require('@bnb-chain/greenfield-js-sdk');

import { createGreenfieldClient } from '../buckets/greenfield-core.js';
import { planCoursePublish } from '../buckets/course-publish.js';
import { createLitAccess } from '../buckets/lit-access.js';
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

const RPC      = 'https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org';
const SP       = 'https://gnfd-testnet-sp1.bnbchain.org';
const CHAIN_ID = '5600';

async function main() {
  // ── 1. Connect Lit ────────────────────────────────────────────────────────
  const usePaid = !!process.env.LIT_CAPACITY_DELEGATION_AUTH_SIG;
  const network = usePaid ? 'datil-test' : 'datil-dev';
  console.log(`→ Loading Lit Protocol SDK (${network})…`);
  // Lit v7.4.0 is CJS — same createRequire workaround as Greenfield SDK
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
      console.log('✓ Loaded Lit Capacity Credits Delegation Signature');
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
          uri,
          expiration,
          resources: resourceAbilityRequests,
          walletAddress: wallet.address,
          nonce: await litNode.getLatestBlockhash(),
          litNodeClient: litNode,
        });
        return generateAuthSig({
          signer: wallet,
          toSign,
        });
      },
    });
    console.log('✓ Session Signatures obtained successfully');
  }

  // ── 2. Build Lit access adapter (write path: encrypt only) ────────────────
  const litClient = {
    async encrypt({ accessControlConditions, dataToEncrypt }) {
      return encryptString(
        { accessControlConditions, dataToEncrypt, sessionSigs },
        litNode
      );
    },
    async decrypt() { throw new Error('decrypt not needed server-side'); },
  };
  const litAccess = createLitAccess({ litClient, chain: 'ethereum' });

  // ── 3. Build ACC ──────────────────────────────────────────────────────────
  // Each address entry: { contractAddress:'', standardContractType:'', chain:'ethereum',
  //   method:'', parameters:[':userAddress'], returnValueTest:{ comparator:'=', value:addr } }
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

  // ── 4. Course spec ────────────────────────────────────────────────────────
  const spec = {
    slug: GF_BUCKET,
    title: 'Daskibo Academy — Введение в Web3 Storage',
    litNetwork: network,
    lessons: [
      {
        key: 'lessons/01/intro.md',
        title: 'Урок 1 — Архитектура DRM: Greenfield + Lit Protocol',
        contentType: 'text/markdown',
        body: [
          `# Daskibo Academy — DRM на BNB Greenfield`,
          ``,
          `Этот контент зашифрован и защищён Lit Protocol.`,
          ``,
          `Bucket:    ${GF_BUCKET}`,
          `Published: ${new Date().toISOString()}`,
          `Chain:     BNB Greenfield testnet 5600`,
          `Lit:       datil-dev (бесплатная сеть)`,
          `Deployer:  ${ADDR}`,
          ``,
          `## Архитектура шифрования`,
          ``,
          `  plaintext ──AES-256-GCM(DEK)──▶ ciphertext     (.enc файл)`,
          `  DEK       ──AES-256-GCM(master)──▶ wrappedDek  (.lit.json sайдкар)`,
          `  master    ──Lit threshold enc──▶ manifest.lit.ciphertext`,
          ``,
          `## Доступ`,
          ``,
          `Только адреса из ACC могут восстановить мастер-ключ через Lit.`,
          `Клиент оплачивает курс в BNB, получает право на расшифровку.`,
          `Ключ выдаётся на 1 час, затем контент автоматически очищается из памяти.`,
          ``,
          `## Как расшифровать`,
          ``,
          `  1. Connect MetaMask (адрес из ACC)`,
          `  2. Connect Lit (datil-dev)`,
          `  3. Get Session → MetaMask подписывает SIWE`,
          `  4. Unlock на уроке → Lit проверяет ACC → AES-GCM расшифровка`,
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

  console.log(`✓ Master key Lit-wrapped`);
  console.log(`  schema:            ${litEnv.schema}`);
  console.log(`  chain:             ${litEnv.chain}`);
  console.log(`  dataToEncryptHash: ${litEnv.dataToEncryptHash}`);
  console.log(`  ACC conditions:    ${litEnv.accessControlConditions.filter(c => !c.operator).length}`);

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
    await client.saveObject(plan.bucketName, o.key, o.body, {
      contentType: o.contentType,
      owner: ADDR,
    });
    console.log(`  ✓ saved`);
  }

  // ── 8. Verify manifest round-trip ─────────────────────────────────────────
  const back = await client.readObject(plan.bucketName, '_lit/manifest.json');
  const parsedBack = JSON.parse(back);
  if (!parsedBack.lit) throw new Error('Round-trip check failed: manifest.lit missing from SP');
  console.log('✓ Manifest round-trip verified — manifest.lit present on SP');

  // ── 9. Summary ────────────────────────────────────────────────────────────
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('ALL DONE — Lit-protected course published to Greenfield');
  console.log('');
  console.log(`Bucket:   ${plan.bucketName}`);
  console.log(`SP URL:   ${SP}/${plan.bucketName}/_lit/manifest.json`);
  console.log('');
  console.log('Open the DRM reader and enter the bucket name above:');
  console.log(`  http://localhost:8099/bucket-reader.html?bucket=${plan.bucketName}&owner=${ADDR}`);
  console.log('');
  console.log('Then: Connect MetaMask → Connect Lit → Get Session → Unlock lessons');
  console.log('═══════════════════════════════════════════════════════════');

  await litNode.disconnect?.();
}

main().catch(e => {
  console.error('FAILED:', e?.message ?? e);
  process.exit(1);
});
