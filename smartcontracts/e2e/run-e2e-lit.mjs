/**
 * Daskibo Academy — Same-Network Lit NFT Gating E2E Test
 *
 * This script runs in a unified docker stack (docker-compose.lit.yml).
 * It verifies that Lit Protocol (Chipotle) correctly evaluates on-chain
 * Access Control Conditions (ERC-721 balanceOf) against an NFT contract
 * deployed on the SAME network as the Lit TEE simulator (chipotle-anvil).
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  defineChain,
  getAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { webcrypto } from 'node:crypto';

import { planCoursePublish } from '/app/buckets/course-publish.js';
import { decryptCourseObject } from '/app/buckets/course-read.js';
import { createLitAccess } from '/app/buckets/lit-access.js';
import { createGreenfieldClient } from '/app/buckets/greenfield-core.js';
import { createChipotleClient, fetchWithRetry } from '/app/buckets/lit-sdk-chipotle.js';

// ── env ──────────────────────────────────────────────────────────────
const env = (k, required = true) => {
  const v = process.env[k];
  if (required && !v) {
    console.error(`E2E-LIT ABORTED — missing required env var ${k}`);
    process.exit(2);
  }
  return v;
};

const CHIPOTLE_RPC = env('CHIPOTLE_RPC'); // e.g. http://chipotle-anvil:8545
const CHIPOTLE_URL = env('CHIPOTLE_URL'); // e.g. http://chipotle-real:8000 or http://chipotle-anvil:8000
const DEPLOYER_PK  = env('DEPLOYER_PK');
const ALICE_PK     = env('ALICE_PK');
const BOB_PK       = env('BOB_PK');
const EVE_PK       = env('EVE_PK');

const GF_PK        = env('GREENFIELD_TESTNET_PRIVATE_KEY');
const GF_ADDR      = getAddress(env('GREENFIELD_TESTNET_ADDRESS'));
const GF_RPC       = env('GF_RPC');
const GF_SP        = env('GF_SP');
const GF_CHAIN_ID  = env('GF_CHAIN_ID');

const NFT_CONTRACT_ADDR = getAddress(env('NFT_CONTRACT_ADDR'));

let PKP_ID = null;
let litClient = null;

// Define simulated Chain corresponding to chipotle-anvil
const chain = defineChain({
  id: 31337, // Anvil standard Chain ID
  name: 'chipotle-anvil',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [CHIPOTLE_RPC] } },
});

const pub = createPublicClient({ chain, transport: http(CHIPOTLE_RPC) });
const deployer = privateKeyToAccount(DEPLOYER_PK);
const alice = privateKeyToAccount(ALICE_PK);
const bob = privateKeyToAccount(BOB_PK);
const eve = privateKeyToAccount(EVE_PK);

const wDeployer = createWalletClient({ account: deployer, chain, transport: http(CHIPOTLE_RPC) });
const wAlice    = createWalletClient({ account: alice, chain, transport: http(CHIPOTLE_RPC) });

// ABI for the soulbound ClientNft (deployed at NFT_CONTRACT_ADDR, nonce 1).
// `mint(to, expiry)` — expiry 0 = perpetual; Lit gates on `balanceOf >= 1`.
const NFT_ABI = parseAbi([
  'function mint(address to, uint64 expiry) external returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function hasAccess(address user) view returns (bool)',
]);

// ── Lit / Chipotle Connection ───────────────────────────────────────────
async function connectLit() {
  console.log(`  Chipotle mode enabled (URL: ${CHIPOTLE_URL})`);
  // The TEE node (Rocket) may 429/5xx while warming up — retry with backoff.
  const walletRes = await fetchWithRetry(`${CHIPOTLE_URL}/core/v1/create_wallet`, {
    headers: { 'X-Api-Key': 'dummy-api-key' }
  });
  if (!walletRes.ok) {
    throw new Error(`Failed to fetch Chipotle PKP wallet: ${walletRes.status} ${await walletRes.text()}`);
  }
  const wallet = await walletRes.json();
  PKP_ID = wallet.wallet_address;
  console.log(`  Chipotle PKP: ${PKP_ID}`);

  return createChipotleClient({ chipotleUrl: CHIPOTLE_URL, pkpId: PKP_ID });
}

async function getAuthContext(pkHex, address) {
  const { Wallet } = await import('ethers');
  const wallet = new Wallet(pkHex);
  const nonce = 'Daskibo-DRM-Auth-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  const message =
    `Daskibo Academy — Verify ownership of ${address}\n\nNonce: ${nonce}\n\nThis signature is used only for local DRM access verification.`;
  const signature = await wallet.signMessage(message);
  return {
    userAddress: address,
    signedProof: { message, signature },
  };
}

// ── Greenfield ──────────────────────────────────────────────────────────
async function fetchTransport({ method, url, headers, body }) {
  const res = await fetch(url, { method, headers, body: body || undefined });
  const text = await res.text();
  const h = {};
  res.headers.forEach((v, k) => (h[k.toLowerCase()] = v));
  return { status: res.status, headers: h, body: text };
}

async function makeGreenfieldClient() {
  // Mock SP is used only when GF_SP explicitly points to a mock or is absent.
  // A real local chain on greenfield_9000-1 with RPC on :26750 is NOT a mock.
  const isMock = !GF_RPC || GF_SP.includes('mock-sp');

  let backend;
  if (isMock) {
    console.log('  [Greenfield] Using local mock SP emulation backend...');
    const { createSpEmulationBackend } = await import('/app/integration/sp-emulation-backend.js');
    backend = createSpEmulationBackend({
      transport: fetchTransport,
      endpoint: GF_SP,
    });
  } else {
    console.log(`  [Greenfield] Using real SDK backend on RPC ${GF_RPC} (chain ${GF_CHAIN_ID})...`);
    const { createSdkBackend } = await import('./greenfield-testnet/sdk-backend.mjs');
    backend = createSdkBackend({
      rpcUrl: GF_RPC,
      chainId: GF_CHAIN_ID,
      privateKey: GF_PK,
      address: GF_ADDR,
      spEndpoint: GF_SP,
    });
  }

  return createGreenfieldClient({
    transport: fetchTransport,
    owner: GF_ADDR,
    endpoint: GF_SP,
    backend,
  });
}

// ── Assert Helpers ────────────────────────────────────────────────────────
const eq = (label, actual, expected) => {
  const ok = actual === expected;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${actual} ${ok ? '==' : '!='} ${expected}`);
  if (!ok) throw new Error(`assert failed: ${label}`);
};

async function expectRejected(label, p, codeOrMatch) {
  try {
    await p;
  } catch (err) {
    const msg = err?.message || String(err);
    const code = err?.code;
    const matched =
      codeOrMatch instanceof RegExp ? codeOrMatch.test(msg) : code === codeOrMatch || msg.includes(codeOrMatch);
    console.log(`${matched ? '✓' : '✗'} ${label}: rejected (${code || msg.slice(0, 80)})`);
    if (!matched) throw new Error(`assert failed: ${label} — expected ${codeOrMatch}, got ${code || msg}`);
    return;
  }
  throw new Error(`assert failed: ${label} — promise resolved but should have rejected`);
}

// ── Main E2E Lit Run ─────────────────────────────────────────────────────
async function main() {
  console.log('━━ Daskibo E2E LIT — same-network NFT-Gated Decryption E2E ━━');
  console.log(`  Chipotle RPC: ${CHIPOTLE_RPC}`);
  console.log(`  Chipotle TEE: ${CHIPOTLE_URL}`);
  console.log(`  NFT Contract: ${NFT_CONTRACT_ADDR}`);
  console.log(`  Alice author: ${alice.address}`);
  console.log(`  Bob buyer   : ${bob.address}`);
  console.log(`  Eve intruder: ${eve.address}`);

  // 1. Connect to Lit Chipotle (TEE)
  console.log('\n[1/7] Connecting Lit (simulated TEE)...');
  litClient = await connectLit();
  const lit = createLitAccess({ litClient });
  console.log('  ✓ Lit connected successfully');

  // 2. Set up Access Control Condition gating by our NFT contract on the same network
  console.log('\n[2/7] Preparing Access Control Condition gating by NFT contract...');
  const nftAcc = [
    {
      contractAddress: NFT_CONTRACT_ADDR,
      standardContractType: 'ERC721',
      chain: 'ethereum', // Evaluates on the default EVM chain configured inside the TEE (chipotle-anvil)
      method: 'balanceOf',
      parameters: [':userAddress'],
      returnValueTest: { comparator: '>=', value: '1' },
    }
  ];

  // 3. Encrypt the master key under the NFT condition
  console.log('\n[3/7] Encrypting course master key under NFT Access Control Condition...');
  const slug = `daskibo-e2e-lit-${Date.now().toString(36)}`;
  const SECRET = `# Same-network NFT printed secret!\nSlug: ${slug}`;
  const spec = {
    slug,
    title: 'E2E Same-Network NFT-Gated Course',
    litNetwork: 'chipotle',
    lessons: [
      {
        key: 'lessons/01/secret.md',
        title: 'NFT Secret Lesson',
        contentType: 'text/markdown',
        body: SECRET,
      },
    ],
  };

  let plan = await planCoursePublish({
    spec,
    pricing: { litSaveCost: 800n, storageCost: 200n, w3extPayee: alice.address },
    crypto: webcrypto,
    lit: { access: lit, accessControlConditions: nftAcc, author: alice.address },
  });

  // Inject Chipotle-specific sidecar fields so the reader uses Chipotle Client
  const litEnv = {
    ...plan.manifest.lit,
    litNetwork: 'chipotle',
    chipotleUrl: CHIPOTLE_URL,
    pkpId: PKP_ID,
  };
  const manifest = { ...plan.manifest, lit: litEnv };
  const objects = plan.objects.map(o =>
    o.kind === 'manifest' ? { ...o, body: JSON.stringify(manifest) } : o,
  );
  plan = { ...plan, manifest, objects };
  console.log('  ✓ Course encrypted successfully');

  // 4. Save/publish the encrypted course to Greenfield local
  console.log('\n[4/7] Uploading encrypted course to Greenfield...');
  const gf = await makeGreenfieldClient();
  await gf.createBucket(plan.bucketName, { visibility: 'public', owner: GF_ADDR });
  for (const o of plan.objects) {
    await gf.saveObject(plan.bucketName, o.key, o.body, {
      contentType: o.contentType,
      owner: GF_ADDR,
    });
    console.log(`    + ${o.key}`);
  }
  console.log(`  ✓ published course to bucket: ${plan.bucketName}`);

  // Fetch manifest and encrypted payload back
  const manifestText = await gf.readObject(plan.bucketName, '_lit/manifest.json');
  const parsedManifest = JSON.parse(manifestText);
  const encText = await gf.readObject(plan.bucketName, 'lessons/01/secret.md.enc');

  // 5. Assert that Bob (pre-mint) fails decryption
  console.log('\n[5/7] Verifying Bob (pre-mint) is DENIED decryption...');
  const bobAuth0 = await getAuthContext(BOB_PK, bob.address);
  
  // We mock process.env.ANVIL_RPC to chipotle-anvil so lit-sdk-chipotle performs check there
  process.env.ANVIL_RPC = CHIPOTLE_RPC;

  const bobBeforeBalance = await pub.readContract({
    address: NFT_CONTRACT_ADDR,
    abi: NFT_ABI,
    functionName: 'balanceOf',
    args: [bob.address],
  });
  eq('  Bob NFT Balance (pre-mint)', bobBeforeBalance, 0n);

  await expectRejected(
    '  Bob decrypt pre-mint',
    decryptCourseObject(parsedManifest, encText, {
      access: lit,
      authContext: bobAuth0,
      crypto: webcrypto,
    }),
    /not authorized|access denied|access control conditions|ACCESS_DENIED/i,
  );

  // 6. Print (Mint) the soulbound ClientNft to Bob (perpetual: expiry 0).
  console.log('\n[6/7] Printing (minting) the gating NFT to Bob on the same network...');
  const txMint = await wDeployer.writeContract({
    address: NFT_CONTRACT_ADDR,
    abi: NFT_ABI,
    functionName: 'mint',
    args: [bob.address, 0n],
  });
  const rMint = await pub.waitForTransactionReceipt({ hash: txMint });
  eq('  Mint transaction status', rMint.status, 'success');

  const bobAfterBalance = await pub.readContract({
    address: NFT_CONTRACT_ADDR,
    abi: NFT_ABI,
    functionName: 'balanceOf',
    args: [bob.address],
  });
  eq('  Bob NFT Balance (post-mint)', bobAfterBalance, 1n);

  // 7. Assert that Bob (post-mint) succeeds decryption, and Eve is rejected
  console.log('\n[7/7] Verifying Bob (post-mint) is ALLOWED decryption, and Eve is DENIED...');
  const bobAuth = await getAuthContext(BOB_PK, bob.address);
  const bobRead = await decryptCourseObject(parsedManifest, encText, {
    access: lit,
    authContext: bobAuth,
    crypto: webcrypto,
  });
  eq('  Bob decrypted plaintext matches original secret', bobRead.text, SECRET);

  const eveAuth = await getAuthContext(EVE_PK, eve.address);
  const eveBalance = await pub.readContract({
    address: NFT_CONTRACT_ADDR,
    abi: NFT_ABI,
    functionName: 'balanceOf',
    args: [eve.address],
  });
  eq('  Eve NFT Balance', eveBalance, 0n);

  await expectRejected(
    '  Eve decrypt attempt',
    decryptCourseObject(parsedManifest, encText, {
      access: lit,
      authContext: eveAuth,
      crypto: webcrypto,
    }),
    /not authorized|access denied|access control conditions|ACCESS_DENIED/i,
  );

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('E2E-LIT OK — Same-Network NFT printed and verified; Bob decrypted, Eve denied.');
}

main().catch((e) => {
  console.error('\nE2E-LIT FAILED:', e?.stack || e?.message || e);
  process.exit(1);
});
