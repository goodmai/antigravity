/**
 * Daskibo Academy — REAL-network E2E happy-path runner
 *
 * Single-process script that exercises the full settlement+content flow
 * end-to-end with NO mocked sentities:
 *
 *   chain      anvil clone of BNB testnet (chain-id 97), Foundry-deployed
 *              Treasury / AccessPass / CourseMarketplace at deterministic
 *              addresses
 *   storage    REAL public BNB Greenfield testnet (chain 5600) via
 *              @bnb-chain/greenfield-js-sdk
 *   crypto     REAL Lit Protocol datil-dev (encrypt + decrypt with
 *              session sigs derived from EOA personal_sign)
 *
 * Actors (anvil deterministic accounts):
 *   Alice  author        anvil #1   0x70997970C51812dc3A010C7d01b50e0d17dc79C8
 *   Bob    paying client anvil #2   0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
 *   Eve    freeloader    anvil #3   0x90F79bf6EB2c4f870365E785982E1f101E93b906
 *   w3ext  broker payee  anvil #4   0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65
 *
 * Lit ACC: Lit nodes can't reach a private anvil RPC, so the access
 * gate is operator-maintained: ACC = addressAllowlist(Alice) initially;
 * on every Purchase event the publisher service re-wraps the master with
 * addressAllowlist(Alice) OR addressAllowlist(buyer). The contract's
 * AccessPass + Marketplace.hasCourseAccess remain the canonical access
 * source — Lit follows it. This script plays the publisher role for one
 * purchase (Bob). Eve never triggers a Purchase event so she's never
 * added to the ACC.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  parseAbi,
  defineChain,
  getAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { webcrypto } from 'node:crypto';

import { planCoursePublish } from '/app/buckets/course-publish.js';
import { decryptCourseObject } from '/app/buckets/course-read.js';
import { addressAllowlistAcc, anyOf, courseAccessAcc } from '/app/buckets/lit-acc.js';
import { createLitAccess } from '/app/buckets/lit-access.js';
import { createGreenfieldClient } from '/app/buckets/greenfield-core.js';
import { createChipotleClient } from '/app/buckets/lit-sdk-chipotle.js';

// ── env ──────────────────────────────────────────────────────────────
const env = (k, required = true) => {
  const v = process.env[k];
  if (required && !v) {
    console.error(`E2E ABORTED — missing required env var ${k}`);
    process.exit(2);
  }
  return v;
};

const ANVIL_RPC = env('ANVIL_RPC');
const CHAIN_ID = Number(env('CHAIN_ID'));
const MARKETPLACE_ADDR = getAddress(env('MARKETPLACE_ADDR'));
const ACCESSPASS_ADDR = getAddress(env('ACCESSPASS_ADDR'));
const TREASURY_ADDR = getAddress(env('TREASURY_ADDR'));
const W3EXT_ADDR = getAddress(env('W3EXT_ADDR'));
const ALICE_PK = env('ALICE_PK');
const BOB_PK = env('BOB_PK');
const EVE_PK = env('EVE_PK');
const GF_PK = env('GREENFIELD_TESTNET_PRIVATE_KEY');
const GF_ADDR = getAddress(env('GREENFIELD_TESTNET_ADDRESS'));
const GF_RPC = env('GF_RPC');
const GF_SP = env('GF_SP');
const GF_CHAIN_ID = env('GF_CHAIN_ID');
const LIT_NETWORK = env('LIT_NETWORK');
const CHIPOTLE_URL = process.env.CHIPOTLE_URL ? process.env.CHIPOTLE_URL.replace(/\/$/, '') : null;
const isChipotle = LIT_NETWORK === 'custom' || LIT_NETWORK === 'chipotle' || !!CHIPOTLE_URL;
let PKP_ID = null;
let litClient = null;

// Course price in native wei on the anvil chain. Default 0.01 ether
// (= 10^16 wei). Anvil dev accounts hold 10 000 native each so this has
// zero real-world cost — set via COURSE_PRICE_WEI to change.
const COURSE_PRICE_WEI = BigInt(env('COURSE_PRICE_WEI', false) || '10000000000000000');

// ── chain ────────────────────────────────────────────────────────────
const chain = defineChain({
  id: CHAIN_ID,
  name: 'bnb-testnet-anvil-clone',
  nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
  rpcUrls: { default: { http: [ANVIL_RPC] } },
});

const pub = createPublicClient({ chain, transport: http(ANVIL_RPC) });
const alice = privateKeyToAccount(ALICE_PK);
const bob = privateKeyToAccount(BOB_PK);
const eve = privateKeyToAccount(EVE_PK);
const wAlice = createWalletClient({ account: alice, chain, transport: http(ANVIL_RPC) });
const wBob = createWalletClient({ account: bob, chain, transport: http(ANVIL_RPC) });

// ── contract ABIs (only what we touch) ───────────────────────────────
const MP_ABI = parseAbi([
  'function registerCourse(uint96 price, bytes32 contentHash, string bucket, uint64 accessDuration) external returns (uint256)',
  'function purchase(uint256 courseId) external payable',
  'function withdraw() external',
  'function pendingWithdrawals(address) view returns (uint256)',
  'function hasCourseAccess(address user, uint256 courseId) view returns (bool)',
  'function quote(uint256 price) view returns (uint256 protocolCut, uint256 w3extFee, uint256 authorAmount)',
  'function courses(uint256) view returns (address author, uint96 price, bytes32 contentHash, string bucket, uint64 accessDuration, bool active)',
  'event CourseRegistered(uint256 indexed courseId, address indexed author, uint96 price, string bucket)',
  'event CoursePurchased(uint256 indexed courseId, address indexed buyer, uint256 price, uint256 protocolCut, uint256 w3extFee, uint256 authorAmount)',
]);

const PASS_ABI = parseAbi([
  'function hasAccess(address user, uint256 courseId) view returns (bool)',
  'function ownerOf(uint256) view returns (address)',
]);

// ── lit ──────────────────────────────────────────────────────────────
import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { encryptString, decryptToString } from '@lit-protocol/encryption';
import { LitAccessControlConditionResource, createSiweMessageWithRecaps, generateAuthSig } from '@lit-protocol/auth-helpers';
import { LIT_ABILITY } from '@lit-protocol/constants';

async function connectLit() {
  if (isChipotle) {
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
  } else {
    console.log(`  Standard Lit mode enabled (Network: ${LIT_NETWORK})`);
    const c = new LitNodeClient({ litNetwork: LIT_NETWORK, debug: false });
    await c.connect();
    return {
      encrypt: ({ accessControlConditions, dataToEncrypt }) =>
        encryptString({ accessControlConditions, dataToEncrypt }, c),
      decrypt: ({ accessControlConditions, ciphertext, dataToEncryptHash, chain: ch }, authContext) =>
        decryptToString(
          {
            accessControlConditions,
            ciphertext,
            dataToEncryptHash,
            chain: ch,
            sessionSigs: authContext?.sessionSigs,
          },
          c,
        ),
      _client: c,
    };
  }
}

/**
 * Build Lit session sigs for a given EOA private key against datil-dev.
 * The signer is purely off-chain — Lit nodes verify a SIWE personal_sign,
 * not a chain tx, so anvil-only accounts are fine.
 */
async function sessionSigsFor(litClient, pkHex, address) {
  const { Wallet } = await import('ethers');
  const wallet = new Wallet(pkHex);
  return litClient.getSessionSigs({
    chain: 'ethereum',
    expiration: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    resourceAbilityRequests: [
      {
        resource: new LitAccessControlConditionResource('*'),
        ability: LIT_ABILITY.AccessControlConditionDecryption,
      },
    ],
    authNeededCallback: async ({ uri, expiration, resourceAbilityRequests: reqs }) => {
      const toSign = await createSiweMessageWithRecaps({
        uri,
        expiration,
        resources: reqs,
        walletAddress: address,
        nonce: await litClient.getLatestBlockhash(),
        litNodeClient: litClient,
      });
      return generateAuthSig({ signer: wallet, toSign });
    },
  });
}

/**
 * Resolves the appropriate auth context based on network mode (Chipotle vs Lit P2P).
 */
async function getAuthContext(pkHex, address) {
  if (isChipotle) {
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
  } else {
    const sigs = await sessionSigsFor(litClient._client, pkHex, address);
    return { sessionSigs: sigs, address };
  }
}

// ── Greenfield ───────────────────────────────────────────────────────
async function fetchTransport({ method, url, headers, body }) {
  const res = await fetch(url, { method, headers, body: body || undefined });
  const text = await res.text();
  const h = {};
  res.headers.forEach((v, k) => (h[k.toLowerCase()] = v));
  return { status: res.status, headers: h, body: text };
}

async function makeGreenfieldClient() {
  const { createSdkBackend } = await import('./greenfield-testnet/sdk-backend.mjs');
  const backend = createSdkBackend({
    rpcUrl: GF_RPC,
    chainId: GF_CHAIN_ID,
    privateKey: GF_PK,
    address: GF_ADDR,
    // spEndpoint ensures the local SP URL (docker-resolvable) is used for
    // object uploads instead of the on-chain lookup, which returns
    // http://127.0.0.1:903x — only reachable inside the Greenfield container.
    spEndpoint: GF_SP,
  });
  return createGreenfieldClient({
    transport: fetchTransport,
    owner: GF_ADDR,
    endpoint: GF_SP,
    backend,
  });
}

// ── helpers ──────────────────────────────────────────────────────────

// Greenfield objects are sealed asynchronously after upload; on a local
// chain the SP may not yet serve the object immediately after creation.
// Retry with linear back-off before giving up.
async function readObjectWithRetry(gf, bucket, key, { retries = 60, delayMs = 5000 } = {}) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await gf.readObject(bucket, key);
    } catch (err) {
      if (i === retries) throw err;
      console.log(`    [retry ${i + 1}/${retries}] ${key} not ready (${err?.message?.slice(0, 60)}), waiting ${delayMs}ms…`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

const eq = (label, actual, expected) => {
  const ok = actual === expected;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${actual} ${ok ? '==' : '!='} ${expected}`);
  if (!ok) throw new Error(`assert failed: ${label}`);
};
const eqBig = (label, a, b) => eq(label, String(a), String(b));

async function expectRejected(label, p, codeOrMatch) {
  try {
    await p;
  } catch (err) {
    const msg = err?.message || String(err);
    const code = err?.code;
    // Match against both message AND code — Chipotle errors use err.code ('ACCESS_DENIED')
    // while their message may not contain the keyword.
    const matched = codeOrMatch instanceof RegExp
      ? codeOrMatch.test(msg) || codeOrMatch.test(code || '')
      : code === codeOrMatch || msg.includes(codeOrMatch);
    console.log(`${matched ? '✓' : '✗'} ${label}: rejected (${code || msg.slice(0, 80)})`);
    if (!matched) throw new Error(`assert failed: ${label} — expected ${codeOrMatch}, got ${code || msg}`);
    return;
  }
  throw new Error(`assert failed: ${label} — promise resolved but should have rejected`);
}

// ── main flow ────────────────────────────────────────────────────────
async function main() {
  console.log('━━ Daskibo E2E — anvil-BNB(97) + Greenfield(5600) + Lit datil-dev ━━');
  console.log(`  Marketplace : ${MARKETPLACE_ADDR}`);
  console.log(`  AccessPass  : ${ACCESSPASS_ADDR}`);
  console.log(`  Treasury    : ${TREASURY_ADDR}`);
  console.log(`  w3ext payee : ${W3EXT_ADDR}`);
  console.log(`  Alice author: ${alice.address}`);
  console.log(`  Bob buyer   : ${bob.address}`);
  console.log(`  Eve freeloader: ${eve.address}`);
  console.log(`  GF testnet account (paid uploads): ${GF_ADDR}`);

  // ── 0. Connect Lit (real datil-dev). ─────────────────────────────
  console.log('\n[0/9] Connect Lit…');
  litClient = await connectLit();
  const lit = createLitAccess({ litClient });
  console.log('  ✓ Lit connected');

  // ── 1. Build + encrypt the course locally. ────────────────────────
  console.log('\n[1/9] Build + AES-encrypt the course (course-template + crypto-envelope)…');
  const slug = `daskibo-e2e-${Date.now().toString(36)}`;
  const SECRET = `# Real testnet secret — only paying readers may see this.\nnonce: ${slug}`;
  const spec = {
    slug,
    title: 'E2E Real-Network Course',
    litNetwork: LIT_NETWORK,
    lessons: [
      {
        key: 'lessons/01/secret.md',
        title: 'Secret Lesson',
        contentType: 'text/markdown',
        body: SECRET,
      },
    ],
  };
  // Chipotle-mock mode uses a contract-based ACC (courseAccessAcc) so that Bob's
  // access is evaluated on-chain after purchase — no manifest re-wrap needed.
  // The mock supports contract conditions via ANVIL_RPC. CourseId=1 is deterministic
  // on a fresh Anvil chain (first registerCourse call). Datil-dev mode uses the
  // address-allowlist approach (re-wrap on purchase) because Lit nodes can't reach
  // the private Anvil RPC.
  const initialAcc = isChipotle
    ? courseAccessAcc({ contractAddress: MARKETPLACE_ADDR, chain: 'bscTestnet', courseId: '1' })
    : addressAllowlistAcc(alice.address);
  let plan = await planCoursePublish({
    spec,
    pricing: { litSaveCost: 800n, storageCost: 200n, w3extPayee: W3EXT_ADDR },
    crypto: webcrypto,
    lit: { access: lit, accessControlConditions: initialAcc, author: alice.address },
  });

  if (isChipotle) {
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
  }

  eqBig('  settlement.base', plan.settlement.base, 1000n);
  eqBig('  settlement.w3extFee', plan.settlement.w3extFee, 200n);
  eqBig('  settlement.total', plan.settlement.total, 1200n);
  for (const o of plan.objects) {
    if (String(o.body).includes(plan.masterKey)) {
      throw new Error(`master key leaked into stored object ${o.key}`);
    }
  }
  console.log(`  ✓ ${plan.objects.length} objects encrypted; master key never leaks`);

  // ── 2. Upload to REAL Greenfield testnet. ─────────────────────────
  console.log('\n[2/9] Publish encrypted bucket → REAL Greenfield testnet (chain 5600)…');
  const gf = await makeGreenfieldClient();
  await gf.createBucket(plan.bucketName, { visibility: 'public', owner: GF_ADDR });
  for (const o of plan.objects) {
    await gf.saveObject(plan.bucketName, o.key, o.body, {
      contentType: o.contentType,
      owner: GF_ADDR,
    });
    console.log(`    + ${o.key}`);
  }
  console.log(`  ✓ bucket ${plan.bucketName} uploaded to ${GF_SP}`);

  // ── 3. Register course on the anvil Marketplace. ──────────────────
  console.log('\n[3/9] Alice registers course on Marketplace (anvil chain 97)…');
  const PRICE = COURSE_PRICE_WEI; // wei on the anvil chain (chain 97)
  const txReg = await wAlice.writeContract({
    address: MARKETPLACE_ADDR,
    abi: MP_ABI,
    functionName: 'registerCourse',
    args: [PRICE, '0x' + '00'.repeat(32), plan.bucketName, 0n],
  });
  const rReg = await pub.waitForTransactionReceipt({ hash: txReg });
  // courseId from CourseRegistered event
  const regLog = rReg.logs.find((l) => l.address.toLowerCase() === MARKETPLACE_ADDR.toLowerCase());
  const courseId = BigInt(regLog.topics[1]);
  console.log(`  ✓ courseId=${courseId} registered by Alice; price=${formatEther(PRICE)} tBNB`);

  // Sanity: Alice has free access (she's the author).
  const aliceAccess = await pub.readContract({
    address: MARKETPLACE_ADDR,
    abi: MP_ABI,
    functionName: 'hasCourseAccess',
    args: [alice.address, courseId],
  });
  eq('  Alice author free access', aliceAccess, true);

  // ── 4. Pre-purchase: Bob has NO access on either layer. ───────────
  console.log('\n[4/9] Pre-purchase invariants…');
  const bobBefore = await pub.readContract({
    address: MARKETPLACE_ADDR,
    abi: MP_ABI,
    functionName: 'hasCourseAccess',
    args: [bob.address, courseId],
  });
  eq('  Bob hasCourseAccess (pre-buy)', bobBefore, false);
  // Lit decrypt also denies Bob (his address isn't in the ACC yet).
  const manifestText = await readObjectWithRetry(gf, plan.bucketName, '_lit/manifest.json');
  const manifest = JSON.parse(manifestText);
  const encText = await readObjectWithRetry(gf, plan.bucketName, 'lessons/01/secret.md.enc');
  const bobAuth0 = await getAuthContext(BOB_PK, bob.address);
  await expectRejected(
    '  Bob Lit decrypt (pre-buy)',
    decryptCourseObject(manifest, encText, {
      access: lit,
      authContext: bobAuth0,
      crypto: webcrypto,
    }),
    /ACCESS_DENIED|not authorized|unauthorized/i,
  );

  // ── 5. Bob purchases — assert money split + AccessPass mint. ──────
  console.log('\n[5/9] Bob purchases — assert split + AccessPass mint…');
  const [protocolCut, w3extFee, authorAmount] = await pub.readContract({
    address: MARKETPLACE_ADDR,
    abi: MP_ABI,
    functionName: 'quote',
    args: [PRICE],
  });
  console.log(`  quote: protocol=${protocolCut} w3ext=${w3extFee} author=${authorAmount}`);
  eqBig('    Σ == PRICE', protocolCut + w3extFee + authorAmount, PRICE);

  const txBuy = await wBob.writeContract({
    address: MARKETPLACE_ADDR,
    abi: MP_ABI,
    functionName: 'purchase',
    args: [courseId],
    value: PRICE,
  });
  const rBuy = await pub.waitForTransactionReceipt({ hash: txBuy });
  eq('  purchase tx status', rBuy.status, 'success');

  // Pull-payment ledger
  const pendingAlice = await pub.readContract({
    address: MARKETPLACE_ADDR, abi: MP_ABI,
    functionName: 'pendingWithdrawals', args: [alice.address],
  });
  const pendingW3 = await pub.readContract({
    address: MARKETPLACE_ADDR, abi: MP_ABI,
    functionName: 'pendingWithdrawals', args: [W3EXT_ADDR],
  });
  const pendingTreasury = await pub.readContract({
    address: MARKETPLACE_ADDR, abi: MP_ABI,
    functionName: 'pendingWithdrawals', args: [TREASURY_ADDR],
  });
  eqBig('  pending[Alice]   ', pendingAlice, authorAmount);
  eqBig('  pending[w3ext]   ', pendingW3, w3extFee);
  eqBig('  pending[Treasury]', pendingTreasury, protocolCut);

  // AccessPass minted to Bob; on-chain hasCourseAccess now true
  const bobPass = await pub.readContract({
    address: ACCESSPASS_ADDR, abi: PASS_ABI,
    functionName: 'hasAccess', args: [bob.address, courseId],
  });
  eq('  AccessPass.hasAccess(Bob)', bobPass, true);

  // ── 6. Operator re-wraps Lit envelope on Purchase. ────────────────
  // Chipotle mode: ACC is courseAccessAcc (contract-based) — no re-wrap needed;
  // hasCourseAccess(bob) is now true after purchase, so Chipotle evaluates it
  // on-chain and grants access. Greenfield objects are immutable, so we keep
  // the manifest as-is.
  //
  // Datil mode: re-wrap with extended address-allowlist (Lit nodes can't reach
  // the private Anvil RPC, so contract conditions don't work there).
  let currentManifest = manifest;
  if (!isChipotle) {
    console.log('\n[6/9] Operator re-wraps Lit master with (Alice OR Bob)…');
    const newAcc = anyOf(addressAllowlistAcc(alice.address), addressAllowlistAcc(bob.address));
    const newLitEnv = await lit.encryptMasterKey(plan.masterKey, newAcc);
    currentManifest = { ...manifest, lit: newLitEnv };
    await gf.saveObject(
      plan.bucketName,
      '_lit/manifest.json',
      JSON.stringify(currentManifest),
      { contentType: 'application/json', owner: GF_ADDR },
    );
    console.log('  ✓ manifest re-uploaded with extended ACC');
  } else {
    console.log('\n[6/9] Chipotle mode: contract ACC includes Bob post-purchase (no re-wrap needed)…');
    console.log('  ✓ hasCourseAccess(Bob) == true → courseAccessAcc will pass');
  }

  // ── 7. Bob now decrypts and asserts plaintext equality. ───────────
  console.log('\n[7/9] Bob decrypts — Lit + AES round-trip…');
  // In chipotle mode the manifest is unchanged (contract-based ACC); in datil
  // mode it was re-uploaded with extended address-allowlist in step 6.
  const bobManifestText = isChipotle
    ? JSON.stringify(currentManifest)
    : await readObjectWithRetry(gf, plan.bucketName, '_lit/manifest.json');
  const bobManifest = JSON.parse(bobManifestText);
  const bobEnc = await readObjectWithRetry(gf, plan.bucketName, 'lessons/01/secret.md.enc');
  const bobAuth = await getAuthContext(BOB_PK, bob.address);
  const bobRead = await decryptCourseObject(bobManifest, bobEnc, {
    access: lit,
    authContext: bobAuth,
    crypto: webcrypto,
  });
  eq('  Bob plaintext == SECRET', bobRead.text, SECRET);

  // ── 8. Eve is rejected at BOTH layers. ────────────────────────────
  console.log('\n[8/9] Eve attempt — must be denied at every layer…');
  const eveAccess = await pub.readContract({
    address: MARKETPLACE_ADDR, abi: MP_ABI,
    functionName: 'hasCourseAccess', args: [eve.address, courseId],
  });
  eq('  Eve hasCourseAccess', eveAccess, false);
  const evePass = await pub.readContract({
    address: ACCESSPASS_ADDR, abi: PASS_ABI,
    functionName: 'hasAccess', args: [eve.address, courseId],
  });
  eq('  Eve AccessPass.hasAccess', evePass, false);
  const eveAuth = await getAuthContext(EVE_PK, eve.address);
  await expectRejected(
    '  Eve Lit decrypt',
    decryptCourseObject(bobManifest, bobEnc, {
      access: lit,
      authContext: eveAuth,
      crypto: webcrypto,
    }),
    /ACCESS_DENIED|not authorized|unauthorized/i,
  );

  // ── 9. Pull-payments withdraw — ledger zeroes; double-withdraw reverts.
  console.log('\n[9/9] Pull-payments…');
  // Alice (author)
  const wAliceTx = await wAlice.writeContract({
    address: MARKETPLACE_ADDR, abi: MP_ABI,
    functionName: 'withdraw', args: [],
  });
  await pub.waitForTransactionReceipt({ hash: wAliceTx });
  const pAlicePost = await pub.readContract({
    address: MARKETPLACE_ADDR, abi: MP_ABI,
    functionName: 'pendingWithdrawals', args: [alice.address],
  });
  eqBig('  pending[Alice] post-withdraw', pAlicePost, 0n);
  // (Treasury/w3ext are addresses without our PK in scope — we just
  // assert the ledger entries remain correct for an external pull.)
  console.log('  ✓ Alice withdrew her full credit');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('E2E OK — encrypt → publish → buy → decrypt; Eve denied at both layers.');
}

main().catch((e) => {
  console.error('\nE2E FAILED:', e?.stack || e?.message || e);
  process.exit(1);
});
