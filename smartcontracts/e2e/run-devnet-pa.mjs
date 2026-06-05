/**
 * Daskibo Academy — Devnet P-A Scheme E2E Test
 *
 * Tests the full P-A (PKP Vault + wrap-on-purchase) DRM scheme on a local
 * Anvil chain (BSC fork or standalone chain-id 97) with chipotle-mock.
 * Greenfield uses mock-sp (no real testnet required).
 *
 * Exercises:
 *   1. Course metadata (platform / author / title / timestamps) in manifest
 *   2. Alice registers course → Bob purchases → AccessPass minted + wrapNonce issued
 *   3. wrap_for_buyer: address-bound ACC + timestamp condition for timed access
 *   4. setEncryptedKey stores buyer ciphertext, consumes wrapNonce atomically
 *   5. Decrypt succeeds for Bob (address + timestamp ACC)
 *   6. Eve decrypt fails (address mismatch)
 *   7. Double-wrap blocked: wrapNonce=0 after setEncryptedKey
 *   8. Expired timestamp: decrypt fails after expiry
 *
 * Actors (anvil deterministic):
 *   Deployer  anvil #0  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
 *   Alice     anvil #1  0x70997970C51812dc3A010C7d01b50e0d17dc79C8  author
 *   Bob       anvil #2  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC  buyer
 *   Eve       anvil #3  0x90F79bf6EB2c4f870365E785982E1f101E93b906  freeloader
 */

import { createPublicClient, createWalletClient, http, parseAbi, defineChain, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';

import { planCoursePublish } from '/app/buckets/course-publish.js';
import { decryptCourseObject } from '/app/buckets/course-read.js';
import { addressAllowlistAcc } from '/app/buckets/lit-acc.js';
import { createLitAccess } from '/app/buckets/lit-access.js';
import { createGreenfieldClient } from '/app/buckets/greenfield-core.js';
import { createChipotleClient } from '/app/buckets/lit-sdk-chipotle.js';

const _require = createRequire(import.meta.url);
const { Wallet } = _require('ethers');

// ── env ──────────────────────────────────────────────────────────────────────
const env = (k, fallback) => {
  const v = process.env[k];
  if (!v && fallback === undefined) { console.error(`PA-E2E ABORTED — missing ${k}`); process.exit(2); }
  return v ?? fallback;
};

const ANVIL_RPC        = env('ANVIL_RPC',        'http://anvil:8545');
const CHAIN_ID         = Number(env('CHAIN_ID',  '31337'));
const CHIPOTLE_URL     = env('CHIPOTLE_URL',     'http://chipotle-mock:8000');
const GF_SP            = env('GF_SP',            'http://mock-sp:9000');
const GF_ADDR          = getAddress(env('GREENFIELD_TESTNET_ADDRESS'));
const GF_PK            = env('GREENFIELD_TESTNET_PRIVATE_KEY');
const MARKETPLACE_ADDR = getAddress(env('MARKETPLACE_ADDR'));
const ACCESSPASS_ADDR  = getAddress(env('ACCESSPASS_ADDR'));
const TREASURY_ADDR    = getAddress(env('TREASURY_ADDR'));
const DEPLOYER_PK      = env('DEPLOYER_PK');
const ALICE_PK         = env('ALICE_PK');
const BOB_PK           = env('BOB_PK');
const EVE_PK           = env('EVE_PK');
const COURSE_PRICE     = BigInt(env('COURSE_PRICE_WEI', '10000000000000000')); // 0.01 native

// ── chain / accounts ─────────────────────────────────────────────────────────
const chain = defineChain({
  id: CHAIN_ID,
  name: 'devnet-anvil',
  nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
  rpcUrls: { default: { http: [ANVIL_RPC] } },
});

const pub      = createPublicClient({ chain, transport: http(ANVIL_RPC) });
const alice    = privateKeyToAccount(ALICE_PK);
const bob      = privateKeyToAccount(BOB_PK);
const eve      = privateKeyToAccount(EVE_PK);
const wAlice   = createWalletClient({ account: alice,   chain, transport: http(ANVIL_RPC) });
const wBob     = createWalletClient({ account: bob,     chain, transport: http(ANVIL_RPC) });
const wDeploy  = createWalletClient({ account: privateKeyToAccount(DEPLOYER_PK), chain, transport: http(ANVIL_RPC) });

// ── ABIs ──────────────────────────────────────────────────────────────────────
const MP_ABI = parseAbi([
  'function registerCourse(uint96 price, bytes32 contentHash, string bucket, uint64 accessDuration) external returns (uint256)',
  'function purchase(uint256 courseId) external payable',
  'function hasCourseAccess(address user, uint256 courseId) view returns (bool)',
  'function quote(uint256 price) view returns (uint256 protocolCut, uint256 w3extFee, uint256 authorAmount)',
  'event CourseRegistered(uint256 indexed courseId, address indexed author, uint96 price, string bucket)',
  'event CoursePurchased(uint256 indexed courseId, address indexed buyer, uint256 price, uint256 protocolCut, uint256 w3extFee, uint256 authorAmount)',
  'function accessPass() view returns (address)',
]);

const AP_ABI = parseAbi([
  'function hasAccess(address user, uint256 courseId) view returns (bool)',
  'function wrapNonce(address buyer, uint256 courseId) view returns (uint256)',
  'function encryptedKey(uint256 tokenId) view returns (bytes)',
  'function tokenIdOf(address buyer, uint256 courseId) view returns (uint256)',
  'function expiryOf(address buyer, uint256 courseId) view returns (uint64)',
  'function setEncryptedKey(uint256 tokenId, bytes ct) external',
]);

// ── Greenfield (mock-sp) ──────────────────────────────────────────────────────
async function fetchTransport({ method, url, headers, body }) {
  const res = await fetch(url, { method, headers, body: body || undefined });
  const text = await res.text();
  const h = {};
  res.headers.forEach((v, k) => (h[k.toLowerCase()] = v));
  return { status: res.status, headers: h, body: text };
}

async function makeGfClient() {
  const { createSpEmulationBackend } = await import('/app/integration/sp-emulation-backend.js');
  const backend = createSpEmulationBackend({ transport: fetchTransport, endpoint: GF_SP });
  return createGreenfieldClient({ transport: fetchTransport, owner: GF_ADDR, endpoint: GF_SP, backend });
}

// ── helpers ───────────────────────────────────────────────────────────────────
const eq = (label, actual, expected) => {
  const ok = String(actual) === String(expected);
  console.log(`  ${ok ? '✓' : '✗'} ${label}: ${actual} ${ok ? '==' : '!='} ${expected}`);
  if (!ok) throw new Error(`assert: ${label}`);
};

async function expectFail(label, fn, match) {
  try { await fn(); }
  catch (err) {
    const msg = String(err?.message || err);
    const ok  = match instanceof RegExp ? match.test(msg) : msg.includes(match);
    console.log(`  ${ok ? '✓' : '✗'} ${label}: rejected (${msg.slice(0, 90)})`);
    if (!ok) throw new Error(`assert: ${label} — expected ${match}, got ${msg}`);
    return;
  }
  throw new Error(`assert: ${label} — should have rejected but resolved`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Chipotle direct call helpers ──────────────────────────────────────────────
async function chipotleAction(js_params) {
  const r = await fetch(`${CHIPOTLE_URL}/core/v1/lit_action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ js_params }),
  });
  const d = await r.json();
  if (d.has_error) throw new Error(`Chipotle ${js_params.action} error: ${d.logs || d.error}`);
  return d.response;
}

async function signedProof(pkHex, address) {
  const w = new Wallet(pkHex);
  const message = `Daskibo devnet\nAddr: ${address}\nNonce: ${Date.now()}`;
  const signature = await w.signMessage(message);
  return { message, signature };
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n━━ Daskibo Devnet P-A E2E ━━');
  console.log(`  Anvil:       ${ANVIL_RPC}`);
  console.log(`  Chipotle:    ${CHIPOTLE_URL}`);
  console.log(`  Mock SP:     ${GF_SP}`);
  console.log(`  Marketplace: ${MARKETPLACE_ADDR}`);
  console.log(`  AccessPass:  ${ACCESSPASS_ADDR}`);
  console.log(`  Alice:       ${alice.address}`);
  console.log(`  Bob:         ${bob.address}`);
  console.log(`  Eve:         ${eve.address}`);

  // ── 0. Chipotle PKP ────────────────────────────────────────────────────────
  console.log('\n[0] Connect Chipotle mock + get PKP…');
  const vRes = await fetch(`${CHIPOTLE_URL}/core/v1/version`);
  if (!vRes.ok) throw new Error(`Chipotle unreachable: HTTP ${vRes.status}`);
  const wRes = await fetch(`${CHIPOTLE_URL}/core/v1/create_wallet`);
  const { wallet_address: PKP_ADDR } = await wRes.json();
  console.log(`  ✓ PKP: ${PKP_ADDR}`);

  const litClient = createChipotleClient({ chipotleUrl: CHIPOTLE_URL, pkpId: PKP_ADDR });
  const litAccess = createLitAccess({ litClient });

  // ── 1. Encrypt + publish course to mock-sp ────────────────────────────────
  console.log('\n[1] Encrypt course + publish to mock-sp…');
  const now = new Date().toISOString();
  const slug = `devnet-pa-${Date.now().toString(36)}`;
  const SECRET = `# P-A devnet secret\nSlug: ${slug}`;
  const spec = {
    slug,
    title: 'Devnet P-A Test Course',
    litNetwork: 'chipotle',
    lessons: [{ key: 'lessons/01/secret.md', title: 'Secret', contentType: 'text/markdown', body: SECRET }],
  };
  const meta = {
    platform:      'prosol',
    author:        'Alice',
    authorAddress: alice.address,
    title:         spec.title,
    publishedAt:   now,
    updatedAt:     now,
  };

  const vaultAcc = addressAllowlistAcc(PKP_ADDR); // only PKP can decrypt vault
  const plan = await planCoursePublish({
    spec,
    pricing: { litSaveCost: 800n, storageCost: 200n, w3extPayee: alice.address },
    crypto: webcrypto,
    lit: { access: litAccess, accessControlConditions: vaultAcc, author: alice.address },
    meta,
  });

  const litEnv   = { ...plan.manifest.lit, litNetwork: 'chipotle', chipotleUrl: CHIPOTLE_URL, pkpId: PKP_ADDR };
  const manifest = { ...plan.manifest, lit: litEnv, meta };
  const objects  = plan.objects.map(o => o.kind === 'manifest' ? { ...o, body: JSON.stringify(manifest) } : o);

  const gf = await makeGfClient();
  await gf.createBucket(plan.bucketName, { visibility: 'public', owner: GF_ADDR });
  for (const o of objects) {
    await gf.saveObject(plan.bucketName, o.key, o.body, { contentType: o.contentType, owner: GF_ADDR });
  }

  // Verify meta in manifest
  const mText = await gf.readObject(plan.bucketName, '_lit/manifest.json');
  const mParsed = JSON.parse(mText);
  eq('manifest.meta.platform',      mParsed.meta?.platform, 'prosol');
  eq('manifest.meta.authorAddress', mParsed.meta?.authorAddress, alice.address);
  eq('manifest.meta.title',         mParsed.meta?.title, spec.title);
  if (!mParsed.meta?.publishedAt) throw new Error('manifest.meta.publishedAt missing');
  console.log(`  ✓ bucket ${plan.bucketName} with meta written`);

  // ── 2. Alice registers course on Marketplace (perpetual) ─────────────────
  console.log('\n[2] Alice registers perpetual course (courseId 1)…');
  const txReg = await wAlice.writeContract({
    address: MARKETPLACE_ADDR, abi: MP_ABI, functionName: 'registerCourse',
    args: [COURSE_PRICE, '0x' + '00'.repeat(32), plan.bucketName, 0n],
  });
  const rReg  = await pub.waitForTransactionReceipt({ hash: txReg });
  const regLog = rReg.logs.find(l => l.address.toLowerCase() === MARKETPLACE_ADDR.toLowerCase());
  const courseId = BigInt(regLog.topics[1]);
  console.log(`  ✓ courseId=${courseId}`);

  // ── 3. Alice registers time-limited course (2 s) ─────────────────────────
  console.log('\n[3] Alice registers 2-second time-limited course (courseId 2)…');
  const txReg2 = await wAlice.writeContract({
    address: MARKETPLACE_ADDR, abi: MP_ABI, functionName: 'registerCourse',
    args: [COURSE_PRICE, '0x' + '00'.repeat(32), plan.bucketName, 2n], // 2-second subscription
  });
  const rReg2   = await pub.waitForTransactionReceipt({ hash: txReg2 });
  const regLog2 = rReg2.logs.find(l => l.address.toLowerCase() === MARKETPLACE_ADDR.toLowerCase());
  const courseId2 = BigInt(regLog2.topics[1]);
  console.log(`  ✓ courseId=${courseId2} (2s expiry)`);

  // ── 4. Bob purchases perpetual course ────────────────────────────────────
  console.log('\n[4] Bob purchases perpetual course…');
  const txBuy = await wBob.writeContract({
    address: MARKETPLACE_ADDR, abi: MP_ABI, functionName: 'purchase',
    args: [courseId], value: COURSE_PRICE,
  });
  await pub.waitForTransactionReceipt({ hash: txBuy });

  const bobAccess = await pub.readContract({
    address: ACCESSPASS_ADDR, abi: AP_ABI, functionName: 'hasAccess',
    args: [bob.address, courseId],
  });
  eq('Bob hasAccess perpetual', bobAccess, true);

  const wrapNonce = await pub.readContract({
    address: ACCESSPASS_ADDR, abi: AP_ABI, functionName: 'wrapNonce',
    args: [bob.address, courseId],
  });
  if (wrapNonce === 0n) throw new Error('wrapNonce should be > 0 after mint');
  console.log(`  ✓ wrapNonce=${wrapNonce}`);

  const tokenId = await pub.readContract({
    address: ACCESSPASS_ADDR, abi: AP_ABI, functionName: 'tokenIdOf',
    args: [bob.address, courseId],
  });
  console.log(`  ✓ tokenId=${tokenId}`);

  // ── 5. wrap_for_buyer (perpetual — no timestamp condition) ────────────────
  console.log('\n[5] wrap_for_buyer for Bob (perpetual)…');
  const proof5 = await signedProof(BOB_PK, bob.address);
  const wrap5 = await chipotleAction({
    action:            'wrap_for_buyer',
    buyer:             bob.address,
    courseId:          String(courseId),
    nonce:             wrapNonce.toString(),
    vaultCiphertext:   manifest.lit.ciphertext,
    accessPassAddress: ACCESSPASS_ADDR,
    signedProof:       proof5,
  });
  if (!wrap5.ciphertext) throw new Error('wrap_for_buyer returned no ciphertext');
  console.log(`  ✓ buyerCiphertext received (expiry=${wrap5.expiryTs})`);
  // perpetual: acc should be address-only (no timestamp entry)
  const tsEntries = (wrap5.acc || []).filter(c => c.standardContractType === 'timestamp');
  eq('perpetual: no timestamp condition in ACC', tsEntries.length, 0);

  // ── 6. setEncryptedKey on-chain (consumes nonce) ─────────────────────────
  console.log('\n[6] Bob calls setEncryptedKey…');
  const ctBytes = '0x' + Buffer.from(wrap5.ciphertext).toString('hex');
  const txSet = await wBob.writeContract({
    address: ACCESSPASS_ADDR, abi: AP_ABI, functionName: 'setEncryptedKey',
    args: [tokenId, ctBytes],
  });
  await pub.waitForTransactionReceipt({ hash: txSet });

  const nonceAfter = await pub.readContract({
    address: ACCESSPASS_ADDR, abi: AP_ABI, functionName: 'wrapNonce',
    args: [bob.address, courseId],
  });
  eq('wrapNonce consumed (==0)', nonceAfter, 0n);
  const storedKey = await pub.readContract({
    address: ACCESSPASS_ADDR, abi: AP_ABI, functionName: 'encryptedKey',
    args: [tokenId],
  });
  if (!storedKey || storedKey === '0x') throw new Error('encryptedKey not stored');
  console.log('  ✓ encryptedKey stored, nonce consumed');

  // ── 7. Bob decrypts (perpetual ACC = address only) ───────────────────────
  console.log('\n[7] Bob decrypts via Chipotle mock (address ACC)…');
  const proof7 = await signedProof(BOB_PK, bob.address);
  const dec7 = await chipotleAction({
    action:                  'decrypt',
    ciphertext:              wrap5.ciphertext,
    accessControlConditions: wrap5.acc,
    userAddress:             bob.address,
    signedProof:             proof7,
  });
  if (!dec7.decrypted) throw new Error('decrypt returned no key');
  eq('Bob decrypted == master key', dec7.decrypted, plan.masterKey);

  // ── 8. Eve decrypt fails (address mismatch) ──────────────────────────────
  console.log('\n[8] Eve tries Bob\'s ciphertext → must be denied…');
  const proof8 = await signedProof(EVE_PK, eve.address);
  await expectFail('Eve decrypt denied',
    () => chipotleAction({
      action:                  'decrypt',
      ciphertext:              wrap5.ciphertext,
      accessControlConditions: wrap5.acc,
      userAddress:             eve.address,
      signedProof:             proof8,
    }),
    /access denied|does not satisfy/i,
  );

  // ── 9. Double-wrap blocked by wrapNonce=0 ─────────────────────────────────
  console.log('\n[9] Double-wrap attempt → chipotle refuses (nonce=0)…');
  const proof9 = await signedProof(BOB_PK, bob.address);
  await expectFail('double-wrap blocked',
    () => chipotleAction({
      action:            'wrap_for_buyer',
      buyer:             bob.address,
      courseId:          String(courseId),
      vaultCiphertext:   manifest.lit.ciphertext,
      accessPassAddress: ACCESSPASS_ADDR,
      signedProof:       proof9,
    }),
    /wrapNonce is zero|already_wrapped/i,
  );

  // ── 10. Time-limited course: wrap then expire ─────────────────────────────
  console.log('\n[10] Bob purchases 2-second course + verifies expiry enforcement…');
  const txBuy2 = await wBob.writeContract({
    address: MARKETPLACE_ADDR, abi: MP_ABI, functionName: 'purchase',
    args: [courseId2], value: COURSE_PRICE,
  });
  await pub.waitForTransactionReceipt({ hash: txBuy2 });

  const wrapNonce2 = await pub.readContract({
    address: ACCESSPASS_ADDR, abi: AP_ABI, functionName: 'wrapNonce',
    args: [bob.address, courseId2],
  });
  const tokenId2 = await pub.readContract({
    address: ACCESSPASS_ADDR, abi: AP_ABI, functionName: 'tokenIdOf',
    args: [bob.address, courseId2],
  });

  const proof10 = await signedProof(BOB_PK, bob.address);
  const wrap10 = await chipotleAction({
    action:            'wrap_for_buyer',
    buyer:             bob.address,
    courseId:          String(courseId2),
    nonce:             wrapNonce2.toString(),
    vaultCiphertext:   manifest.lit.ciphertext,
    accessPassAddress: ACCESSPASS_ADDR,
    signedProof:       proof10,
  });
  const tsEntries10 = (wrap10.acc || []).filter(c => c.standardContractType === 'timestamp');
  if (tsEntries10.length === 0) throw new Error('timestamp condition missing in ACC for timed course');
  console.log(`  ✓ timestamp condition in ACC: expiry=${wrap10.expiryTs}`);

  // Verify ACC timestamp matches the on-chain expiryOf (Chipotle reads the chain)
  const onchainExpiry10 = await pub.readContract({
    address: ACCESSPASS_ADDR, abi: AP_ABI, functionName: 'expiryOf',
    args: [bob.address, courseId2],
  });
  const accExpiry10 = Number(tsEntries10[0].returnValueTest.value);
  eq('ACC expiry == on-chain expiryOf', String(accExpiry10), String(Number(onchainExpiry10)));

  // Also verify hasAccess is still true before we expire
  const bobAccessBefore = await pub.readContract({
    address: ACCESSPASS_ADDR, abi: AP_ABI, functionName: 'hasAccess',
    args: [bob.address, courseId2],
  });
  eq('hasAccess true before expiry', bobAccessBefore, true);

  // Decrypt immediately — should succeed
  const proof10b = await signedProof(BOB_PK, bob.address);
  const dec10 = await chipotleAction({
    action:                  'decrypt',
    ciphertext:              wrap10.ciphertext,
    accessControlConditions: wrap10.acc,
    userAddress:             bob.address,
    signedProof:             proof10b,
  });
  eq('Bob timed: decrypt before expiry OK', !!dec10.decrypted, true);

  // Wait for expiry (2 s) + 1 s buffer
  console.log('  …waiting 3 s for subscription to expire…');
  await sleep(3000);

  const proof10c = await signedProof(BOB_PK, bob.address);
  await expectFail('Bob timed: decrypt after expiry fails',
    () => chipotleAction({
      action:                  'decrypt',
      ciphertext:              wrap10.ciphertext,
      accessControlConditions: wrap10.acc,
      userAddress:             bob.address,
      signedProof:             proof10c,
    }),
    /expired|timestamp/i,
  );

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PA-E2E OK — purchase→wrap→setKey→decrypt✓ Eve✗ double-wrap✗ expiry✗');
}

main().catch(e => { console.error('\nPA-E2E FAILED:', e?.stack || e?.message || e); process.exit(1); });
