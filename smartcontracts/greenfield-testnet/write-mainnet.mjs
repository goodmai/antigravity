/**
 * Publish a course to Greenfield MAINNET with Lit Protocol access control & Capacity Credits.
 *
 * Usage:
 *   export GREENFIELD_MAINNET_PRIVATE_KEY=0x...
 *   export GREENFIELD_MAINNET_ADDRESS=0x...
 *   export LIT_CAPACITY_DELEGATION_AUTH_SIG='{...}'  # JSON-serialized capacity credit delegation signature
 *   export GF_BUCKET=my-mainnet-course              # optional
 *   export LIT_ALLOWED_ADDRESS=0xABC,...             # optional extra addresses
 *   docker compose -f smartcontracts/docker-compose.yml \
 *     run --rm mainnet-writer
 *
 *   Or directly:
 *   cd smartcontracts/greenfield-testnet && npm install && node write-mainnet.mjs
 */

import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);
const { Client, Long, VisibilityType } = _require('@bnb-chain/greenfield-js-sdk');

import { createGreenfieldClient } from '../buckets/greenfield-core.js';
import { planCoursePublish } from '../buckets/course-publish.js';
import { createLitAccess } from '../buckets/lit-access.js';
import { createSdkBackend } from './sdk-backend.mjs';

const PK   = process.env.GREENFIELD_MAINNET_PRIVATE_KEY;
const ADDR = process.env.GREENFIELD_MAINNET_ADDRESS;
if (!PK || !ADDR) {
  console.error('Set GREENFIELD_MAINNET_PRIVATE_KEY and GREENFIELD_MAINNET_ADDRESS');
  process.exit(2);
}

const GF_BUCKET = process.env.GF_BUCKET || `daskibo-${Date.now().toString(36)}`;
const EXTRA_ALLOWED = (process.env.LIT_ALLOWED_ADDRESS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const RPC      = 'https://greenfield-chain.bnbchain.org:443';
const SP       = 'https://greenfield-sp.bnbchain.org';
const CHAIN_ID = '1017';

async function main() {
  console.log('→ Loading Lit Protocol SDK (datil, production paid network)…');
  const { LitNodeClient } = _require('@lit-protocol/lit-node-client');
  const { encryptString } = _require('@lit-protocol/encryption');
  const { LitActionResource } = _require('@lit-protocol/auth-helpers');
  const { LIT_ABILITY } = _require('@lit-protocol/constants');
  const { createSiweMessage, generateAuthSig } = _require('@lit-protocol/auth-helpers');
  const ethers = _require('ethers');

  const litNode = new LitNodeClient({ litNetwork: 'datil', debug: false });
  await litNode.connect();
  console.log('✓ Lit connected to datil');

  // Generate session signatures using publisher wallet + capacity delegation signature
  const wallet = new ethers.Wallet(PK);
  let capAuthSigs = undefined;
  if (process.env.LIT_CAPACITY_DELEGATION_AUTH_SIG) {
    try {
      capAuthSigs = [JSON.parse(process.env.LIT_CAPACITY_DELEGATION_AUTH_SIG)];
      console.log('✓ Loaded Lit Capacity Credits Delegation Signature');
    } catch (e) {
      console.warn('Failed to parse LIT_CAPACITY_DELEGATION_AUTH_SIG:', e.message);
    }
  } else {
    console.warn('WARNING: LIT_CAPACITY_DELEGATION_AUTH_SIG is not set. Requests on mainnet (datil) will fail due to rate limits.');
  }

  console.log('→ Requesting Lit Session Signatures with Capacity Credits...');
  const sessionSigs = await litNode.getSessionSigs({
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
    title: 'Daskibo Academy — Введение в Web3 Storage (Mainnet)',
    litNetwork: 'datil',
    lessons: [
      {
        key: 'lessons/01/intro.md',
        title: 'Урок 1 — Архитектура DRM: Greenfield + Lit Protocol Mainnet',
        contentType: 'text/markdown',
        body: [
          `# Daskibo Academy — DRM на BNB Greenfield Mainnet`,
          ``,
          `Этот контент зашифрован и защищён Lit Protocol на Mainnet.`,
          ``,
          `Bucket:    ${GF_BUCKET}`,
          `Published: ${new Date().toISOString()}`,
          `Chain:     BNB Greenfield mainnet 1017`,
          `Lit:       datil (платная основная сеть с Capacity Credits)`,
          `Deployer:  ${ADDR}`,
          ``,
          `## Безопасность и оплата`,
          `Мастер-ключ зашифрован и привязан к Capacity Credits NFT на сети Chronicle.`,
          `Клиент авторизуется через сессионную подпись и оплачивает доступ.`
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

  console.log(`✓ Master key Lit-wrapped on Mainnet`);
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
  console.log(`→ Creating bucket "${plan.bucketName}" on Greenfield Mainnet…`);
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

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('ALL DONE — Lit-protected course published to Greenfield MAINNET');
  console.log(`Bucket:   ${plan.bucketName}`);
  console.log('═══════════════════════════════════════════════════════════');

  await litNode.disconnect?.();
}

main().catch(e => {
  console.error('FAILED:', e?.message ?? e);
  process.exit(1);
});
