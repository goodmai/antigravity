/**
 * Daskibo Academy — Same-Network Paid Soulbound NFT Lit Gating E2E Test
 *
 * Implements the paid subscription DRM scenario gating access via a real,
 * paid, non-transferable (soulbound) NFT minted by the CourseMarketplace.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  defineChain,
  getAddress,
  parseEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';

import { planCoursePublish } from '/app/buckets/course-publish.js';
import { decryptCourseObject } from '/app/buckets/course-read.js';
import { createLitAccess } from '/app/buckets/lit-access.js';
import { createGreenfieldClient } from '/app/buckets/greenfield-core.js';
import { createChipotleClient } from '/app/buckets/lit-sdk-chipotle.js';

// ── env ──────────────────────────────────────────────────────────────
const env = (k, required = true) => {
  const v = process.env[k];
  if (required && !v) {
    console.error(`E2E-LIT-NFT ABORTED — missing required env var ${k}`);
    process.exit(2);
  }
  return v;
};

const CHIPOTLE_RPC = env('CHIPOTLE_RPC'); // e.g. http://chipotle-anvil:8545
const CHIPOTLE_URL = env('CHIPOTLE_URL'); // e.g. http://chipotle-real:8000
const DEPLOYER_PK  = env('DEPLOYER_PK');
const ALICE_PK     = env('ALICE_PK');
const BOB_PK       = env('BOB_PK');
const EVE_PK       = env('EVE_PK');

const GF_PK        = env('GREENFIELD_TESTNET_PRIVATE_KEY');
const GF_ADDR      = getAddress(env('GREENFIELD_TESTNET_ADDRESS'));
const GF_RPC       = env('GF_RPC');
const GF_SP        = env('GF_SP');
const GF_CHAIN_ID  = env('GF_CHAIN_ID');

console.log(`[E2E-LIT-NFT] Greenfield Signer: ADDR=${GF_ADDR}, PK=${GF_PK.slice(0, 6)}..., RPC=${GF_RPC}`);

let PKP_ID = null;
let litClient = null;

// Define simulated Chain corresponding to chipotle-anvil
const chain = defineChain({
  id: 31337,
  name: 'chipotle-anvil',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [CHIPOTLE_RPC] } },
});

const pub = createPublicClient({ chain, transport: http(CHIPOTLE_RPC) });
const deployer = privateKeyToAccount(DEPLOYER_PK);
const alice = privateKeyToAccount(ALICE_PK);
const bob = privateKeyToAccount(BOB_PK);
const eve = privateKeyToAccount(EVE_PK);

const wAlice = createWalletClient({ account: alice, chain, transport: http(CHIPOTLE_RPC) });
const wBob   = createWalletClient({ account: bob, chain, transport: http(CHIPOTLE_RPC) });

// human-readable ABIs
const MARKETPLACE_ABI = parseAbi([
  'function registerCourse(uint96 price, bytes32 contentHash, string calldata bucket, uint64 accessDuration) external returns (uint256)',
  'function purchase(uint256 courseId) external payable',
  'function hasCourseAccess(address user, uint256 courseId) view returns (bool)',
  'function courses(uint256 id) view returns (address author, uint96 price, bytes32 contentHash, string bucket, uint64 accessDuration, bool active)',
]);

const ACCESSPASS_ABI = parseAbi([
  'function transferFrom(address from, address to, uint256 tokenId) external',
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'error Soulbound()',
]);

// ── Lit / Chipotle Connection ───────────────────────────────────────────
async function connectLit() {
  console.log(`  Chipotle mode enabled (URL: ${CHIPOTLE_URL})`);
  const walletRes = await fetch(`${CHIPOTLE_URL}/core/v1/create_wallet`, {
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
  console.log('━━ Daskibo E2E Paid Soulbound NFT Gating Integration Test ━━');
  console.log(`  Chipotle RPC: ${CHIPOTLE_RPC}`);
  console.log(`  Chipotle TEE: ${CHIPOTLE_URL}`);
  console.log(`  Alice author: ${alice.address}`);
  console.log(`  Bob buyer   : ${bob.address}`);
  console.log(`  Eve intruder: ${eve.address}`);

  // 1. Address Resolution from broadcast
  console.log('\n[1/10] Dynamically resolving deployed contract addresses...');
  const latestRunPath = '/app/contracts/broadcast/Deploy.s.sol/31337/run-latest.json';
  if (!fs.existsSync(latestRunPath)) {
    throw new Error(`Deployment broadcast file not found at ${latestRunPath}`);
  }
  const runData = JSON.parse(fs.readFileSync(latestRunPath, 'utf8'));

  let marketplaceAddr = null;
  let accessPassAddr = null;

  for (const tx of runData.transactions) {
    if (tx.transactionType === 'CREATE') {
      if (tx.contractName === 'CourseMarketplace') {
        marketplaceAddr = getAddress(tx.contractAddress);
      } else if (tx.contractName === 'AccessPass') {
        accessPassAddr = getAddress(tx.contractAddress);
      }
    }
  }

  if (!marketplaceAddr || !accessPassAddr) {
    throw new Error('Could not resolve CourseMarketplace or AccessPass addresses from deployment logs');
  }
  console.log(`  Resolved CourseMarketplace: ${marketplaceAddr}`);
  console.log(`  Resolved AccessPass: ${accessPassAddr}`);

  // 2. Connect to Lit Chipotle (TEE)
  console.log('\n[2/10] Connecting Lit (simulated TEE)...');
  litClient = await connectLit();
  const lit = createLitAccess({ litClient });
  console.log('  ✓ Lit connected successfully');

  // 3. Alice registers course on Marketplace
  console.log('\n[3/10] Alice registering paid subscription course on Marketplace...');
  const price = parseEther('0.01'); // 10 finney / 0.01 ETH
  const contentHash = '0x1234567890123456789012345678901234567890123456789012345678901234';
  const durationSeconds = 300n; // 5 minutes subscription duration

  const txReg = await wAlice.writeContract({
    address: marketplaceAddr,
    abi: MARKETPLACE_ABI,
    functionName: 'registerCourse',
    args: [price, contentHash, 'course-bucket', durationSeconds],
  });
  const rReg = await pub.waitForTransactionReceipt({ hash: txReg });
  eq('  Register transaction status', rReg.status, 'success');

  const courseId = 1n; // Fresh anvil, first registered course is 1
  const courseDetails = await pub.readContract({
    address: marketplaceAddr,
    abi: MARKETPLACE_ABI,
    functionName: 'courses',
    args: [courseId],
  });
  eq('  Registered Course Price', courseDetails[1], price);
  eq('  Registered Course Duration', courseDetails[4], durationSeconds);
  console.log(`  ✓ Course successfully registered with ID: ${courseId}`);

  // 4. Set up Custom Access Control Condition gating by our CourseMarketplace
  console.log('\n[4/10] Preparing Custom Access Control Condition on CourseMarketplace...');
  const customAcc = [
    {
      contractAddress: marketplaceAddr,
      standardContractType: 'customContract',
      chain: 'ethereum',
      method: 'hasCourseAccess',
      parameters: [':userAddress', courseId.toString()],
      returnValueTest: { comparator: '==', value: 'true' },
    }
  ];

  // 5. Encrypt course master key under this condition
  console.log('\n[5/10] Encrypting course master key under Custom Access Control Condition...');
  const slug = `daskibo-paid-lit-${Date.now().toString(36)}`;
  const SECRET = `# Same-network Paid Subscription Soulbound NFT secret!\nSlug: ${slug}`;
  const spec = {
    slug,
    title: 'E2E Same-Network Paid Subscription Gated Course',
    litNetwork: 'chipotle',
    lessons: [
      {
        key: 'lessons/01/secret.md',
        title: 'Paid subscription Lesson',
        contentType: 'text/markdown',
        body: SECRET,
      },
    ],
  };

  let plan = await planCoursePublish({
    spec,
    pricing: { litSaveCost: 800n, storageCost: 200n, w3extPayee: alice.address },
    crypto: webcrypto,
    lit: { access: lit, accessControlConditions: customAcc, author: alice.address },
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

  // Upload encrypted course to Greenfield
  console.log('  Uploading course encrypted payload to Greenfield...');
  const gf = await makeGreenfieldClient();
  await gf.createBucket(plan.bucketName, { visibility: 'public', owner: GF_ADDR });
  for (const o of plan.objects) {
    await gf.saveObject(plan.bucketName, o.key, o.body, {
      contentType: o.contentType,
      owner: GF_ADDR,
    });
  }
  console.log(`  ✓ Published course to Greenfield bucket: ${plan.bucketName}`);

  // A freshly uploaded object is in CREATED state; the SP universal /download
  // endpoint only serves it once it is SEALED (EC pieces replicated across the
  // GVG + seal tx committed), which takes a few seconds. Poll until readable.
  // Sealing (EC replication across the GVG + seal tx commit) is dispatched by
  // the SP manager and observed ~100s after upload on this single-host stack,
  // so allow up to ~5 min. The loop exits as soon as the object is downloadable.
  const readObjectWithRetry = async (key, { tries = 150, delayMs = 2000 } = {}) => {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        return await gf.readObject(plan.bucketName, key);
      } catch (err) {
        lastErr = err;
        const msg = err?.message || String(err);
        if (!/not found|not sealed|no such|ACCESS_DENIED|404/i.test(msg)) throw err;
        if (i % 10 === 0) console.log(`    waiting for "${key}" to seal... (${i * delayMs / 1000}s)`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw lastErr;
  };

  // Fetch manifest and encrypted payload back
  const manifestText = await readObjectWithRetry('_lit/manifest.json');
  const parsedManifest = JSON.parse(manifestText);
  const encText = await readObjectWithRetry('lessons/01/secret.md.enc');

  // 6. Verify Bob (pre-purchase) is denied decryption
  console.log('\n[6/10] Verifying Bob (pre-purchase) is DENIED decryption...');
  const bobAuth0 = await getAuthContext(BOB_PK, bob.address);
  process.env.ANVIL_RPC = CHIPOTLE_RPC;

  const hasAccessBefore = await pub.readContract({
    address: marketplaceAddr,
    abi: MARKETPLACE_ABI,
    functionName: 'hasCourseAccess',
    args: [bob.address, courseId],
  });
  eq('  Bob hasAccess (pre-purchase)', hasAccessBefore, false);

  await expectRejected(
    '  Bob decrypt pre-purchase',
    decryptCourseObject(parsedManifest, encText, {
      access: lit,
      authContext: bobAuth0,
      crypto: webcrypto,
    }),
    /not authorized|access denied|access control conditions|ACCESS_DENIED/i,
  );

  // 7. Bob purchases the course subscription pass via the marketplace
  console.log('\n[7/10] Bob purchasing course subscription pass on Marketplace...');
  const txPurchase = await wBob.writeContract({
    address: marketplaceAddr,
    abi: MARKETPLACE_ABI,
    functionName: 'purchase',
    args: [courseId],
    value: price,
  });
  const rPurchase = await pub.waitForTransactionReceipt({ hash: txPurchase });
  eq('  Purchase transaction status', rPurchase.status, 'success');

  const hasAccessAfter = await pub.readContract({
    address: marketplaceAddr,
    abi: MARKETPLACE_ABI,
    functionName: 'hasCourseAccess',
    args: [bob.address, courseId],
  });
  eq('  Bob hasAccess (post-purchase, active)', hasAccessAfter, true);

  const nftOwnerPost = await pub.readContract({
    address: accessPassAddr,
    abi: ACCESSPASS_ABI,
    functionName: 'ownerOf',
    args: [1n],
  });
  eq('  AccessPass owner matches Bob', nftOwnerPost, bob.address);
  console.log('  ✓ Bob purchased course pass and minted subscription NFT successfully');

  // 8. Bob (post-purchase, active) successfully decrypts
  console.log('\n[8/10] Verifying Bob (post-purchase, active) is ALLOWED decryption...');
  const bobAuth = await getAuthContext(BOB_PK, bob.address);
  const bobRead = await decryptCourseObject(parsedManifest, encText, {
    access: lit,
    authContext: bobAuth,
    crypto: webcrypto,
  });
  eq('  Bob decrypted plaintext matches original secret', bobRead.text, SECRET);

  // 9. Verify AccessPass NFT is soulbound (transfers are strictly blocked)
  console.log('\n[9/10] Verifying NFT is non-transferable (soulbound)...');
  // AccessPass tokenId for courseId 1 is tokenId 1
  const tokenId = 1n;
  const nftOwner = await pub.readContract({
    address: accessPassAddr,
    abi: ACCESSPASS_ABI,
    functionName: 'ownerOf',
    args: [tokenId],
  });
  eq('  AccessPass owner matches Bob', nftOwner, bob.address);

  await expectRejected(
    '  Bob attempting to transfer AccessPass NFT to Eve',
    wBob.writeContract({
      address: accessPassAddr,
      abi: ACCESSPASS_ABI,
      functionName: 'transferFrom',
      args: [bob.address, eve.address, tokenId],
    }),
    /Soulbound/i,
  );
  console.log('  ✓ Verified soulbound behavior: all token transfers revert by design');

  // 10. Fast-forward Anvil time by 5 minutes and 1 second
  console.log('\n[10/10] Fast-forwarding Anvil block time by 5 minutes & 1 second...');
  await pub.request({
    method: 'evm_increaseTime',
    params: [301], // 301 seconds
  });
  await pub.request({
    method: 'evm_mine',
  });

  const hasAccessExpired = await pub.readContract({
    address: marketplaceAddr,
    abi: MARKETPLACE_ABI,
    functionName: 'hasCourseAccess',
    args: [bob.address, courseId],
  });
  eq('  Bob hasAccess (post-expiry)', hasAccessExpired, false);

  await expectRejected(
    '  Bob decrypt post-expiry',
    decryptCourseObject(parsedManifest, encText, {
      access: lit,
      authContext: bobAuth,
      crypto: webcrypto,
    }),
    /not authorized|access denied|access control conditions|ACCESS_DENIED/i,
  );

  const eveAuth = await getAuthContext(EVE_PK, eve.address);
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
  console.log('E2E-LIT-NFT OK — Paid subscription NFT E2E scenario successfully verified!');
}

main().catch((e) => {
  console.error('\nE2E-LIT-NFT FAILED:', e?.stack || e?.message || e);
  process.exit(1);
});
