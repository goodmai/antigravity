/**
 * Publish the REAL Daskibo course (repo `lessons/` — the same tree served at
 * https://goodmai.github.io/antigravity/lessons/) to the BNB Greenfield public
 * testnet, and MEASURE: total course size, per-lesson sizes, the createBucket
 * gas, and the account's BNB balance delta (gas + storage settlement).
 *
 * ⚠️ Real testnet transactions, real (test) BNB. Opt-in. Fund first:
 *   https://gnfd-testnet-faucet.bnbchain.org
 *
 * Env:
 *   GREENFIELD_TESTNET_PRIVATE_KEY  (required) 0x… funded testnet key
 *   GREENFIELD_TESTNET_ADDRESS      (required) matching 0x… address
 *   GREENFIELD_RPC   (default testnet tendermint fullnode)
 *   GREENFIELD_SP    (default testnet SP1)
 *   GREENFIELD_REST  (optional cosmos LCD; enables BNB balance delta)
 *   GF_BUCKET        (optional bucket name; default daskibo-course-<ts>)
 *   LESSONS_DIR      (optional; default repo lessons/)
 */
import { createSdkBackend } from './sdk-backend.mjs';
import { loadCourse, readLessonFile, humanBytes } from './course-loader.mjs';

const COURSE = process.env.COURSE || 'lessons'; // "lessons" or "academy/<name>"

const RPC = process.env.GREENFIELD_RPC || 'https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org';
const SP = process.env.GREENFIELD_SP || 'https://gnfd-testnet-sp1.bnbchain.org';
const REST = process.env.GREENFIELD_REST || '';
const CHAIN_ID = process.env.GREENFIELD_CHAIN_ID || '5600';
const PK = process.env.GREENFIELD_TESTNET_PRIVATE_KEY;
const ADDR = process.env.GREENFIELD_TESTNET_ADDRESS;
const BUCKET = process.env.GF_BUCKET || `daskibo-course-${Date.now().toString(36)}`;

if (!PK || !ADDR) {
  console.error('Refusing to run: set GREENFIELD_TESTNET_PRIVATE_KEY and GREENFIELD_TESTNET_ADDRESS (funded testnet account).');
  process.exit(2);
}

// BNB balance (wei, 18 decimals) via cosmos LCD — optional/graceful.
async function bnbBalance() {
  if (!REST) return null;
  try {
    const r = await fetch(`${REST.replace(/\/$/, '')}/cosmos/bank/v1beta1/balances/${ADDR}`);
    if (!r.ok) return null;
    const j = await r.json();
    const bnb = (j.balances || []).find((b) => b.denom === 'BNB');
    return bnb ? BigInt(bnb.amount) : 0n;
  } catch { return null; }
}

// createBucket tx gas via tendermint /tx — reliable across SDK versions.
async function txGas(txHash) {
  if (!txHash) return null;
  const hash = txHash.startsWith('0x') ? txHash : `0x${txHash}`;
  try {
    const r = await fetch(`${RPC.replace(/\/$/, '')}/tx?hash=${hash}`);
    if (!r.ok) return null;
    const j = await r.json();
    const tr = j?.result?.tx_result;
    if (!tr) return null;
    return { gasUsed: tr.gas_used, gasWanted: tr.gas_wanted, code: tr.code };
  } catch { return null; }
}

const fmtBNB = (wei) => (wei == null ? 'n/a' : `${(Number(wei) / 1e18).toFixed(8)} BNB`);

// Preflight: surface the real reason a createBucket would fail BEFORE we try.
async function preflight() {
  // 1. RPC reachable?
  try {
    const r = await fetch(`${RPC.replace(/\/$/, '')}/status`);
    if (!r.ok) console.warn(`  ⚠ RPC ${RPC} returned HTTP ${r.status}`);
    else console.log('  ✓ RPC reachable');
  } catch (e) { throw new Error(`RPC ${RPC} unreachable: ${e.message} — check egress/URL`); }
  // 2. Account funding — informational only. NEVER abort on this: GREENFIELD_REST
  // may point at the wrong network (a MAINNET LCD reports 0 for a testnet-funded
  // account) or be unreachable. The authoritative funding check is createBucket
  // itself — if gas is missing it fails with a clear message below. Verify your
  // real balance on the explorer: https://testnet.greenfieldscan.com/account/<addr>
  const bal = await bnbBalance();
  if (bal != null) {
    console.log(`  account BNB (per GREENFIELD_REST): ${fmtBNB(bal)}`);
    if (bal === 0n) console.warn('  ⚠ LCD reports 0 — if greenfieldscan shows funds, your GREENFIELD_REST is a MAINNET/wrong LCD; ignore (createBucket uses the RPC, not the LCD).');
  } else {
    console.log('  account BNB: (not probed — set GREENFIELD_REST to a TESTNET cosmos LCD to display it)');
  }
}

async function main() {
  const course = loadCourse({ id: COURSE });
  console.log('━━ Daskibo course → Greenfield testnet (measure size + gas) ━━');
  console.log(`  course id   : ${course.id} — ${course.title}`);
  console.log(`  course root : ${course.root}`);
  console.log(`  files       : ${course.files.length}`);
  console.log(`  total size  : ${humanBytes(course.totalBytes)} (${course.totalBytes} bytes)`);
  console.log(`  testnet     : chain ${CHAIN_ID} as ${ADDR}`);
  console.log(`  bucket      : ${BUCKET}\n`);

  console.log('→ preflight…');
  await preflight();

  const backend = createSdkBackend({ rpcUrl: RPC, chainId: CHAIN_ID, privateKey: PK, address: ADDR });

  const balBefore = await bnbBalance();

  // 1. Create the bucket (the one on-chain tx we sign + pay gas for).
  console.log('→ createBucket…');
  let txHash = null;
  try {
    ({ txHash } = await backend.createBucket({ bucketName: BUCKET, owner: ADDR, visibility: 'public' }));
  } catch (e) {
    const msg = e?.message || String(e);
    console.error('\n✗ createBucket FAILED. Likely causes:');
    console.error('   • account not funded with testnet BNB (gas) →  https://gnfd-testnet-faucet.bnbchain.org');
    console.error('   • picked Storage Provider down / no GVG family — try another GREENFIELD_SP');
    console.error(`   • bucket name "${BUCKET}" already exists — set a different GF_BUCKET`);
    console.error('   • RPC/SP egress blocked from this host');
    console.error(`\n   underlying error: ${msg}`);
    process.exit(1);
  }
  console.log(`  bucket tx: ${txHash || '(no hash)'}`);
  // Give the node a moment to index the tx before querying gas.
  await new Promise((r) => setTimeout(r, 4000));
  const gas = await txGas(txHash);

  // 2. Upload every lesson file (delegated upload via the SP).
  console.log(`→ uploading ${course.files.length} objects…`);
  let uploaded = 0, bytes = 0, failed = 0;
  const t0 = Date.now();
  for (const f of course.files) {
    try {
      await backend.putObject({
        bucketName: BUCKET,
        objectKey: f.key,
        data: readLessonFile(f.abs),
        contentType: f.contentType,
        visibility: 'public',
      });
      uploaded++; bytes += f.size;
      if (uploaded % 10 === 0) console.log(`  …${uploaded}/${course.files.length}`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${f.key}: ${e?.message || e}`);
    }
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const balAfter = await bnbBalance();

  // 3. Per-lesson size breakdown (group by top-level dir).
  const byLesson = {};
  for (const f of course.files) {
    const top = f.key.includes('/') ? f.key.split('/')[0] : '(root)';
    byLesson[top] = (byLesson[top] || 0) + f.size;
  }

  console.log('\n══════════════════ REPORT ══════════════════');
  console.log(`Course size       : ${humanBytes(course.totalBytes)} (${course.totalBytes} bytes), ${course.files.length} files`);
  console.log(`Uploaded          : ${uploaded} objects (${humanBytes(bytes)})${failed ? `, ${failed} FAILED` : ''} in ${secs}s`);
  console.log(`Bucket            : ${BUCKET}`);
  console.log(`createBucket tx   : ${txHash || 'n/a'}`);
  if (gas) console.log(`  gasUsed=${gas.gasUsed}  gasWanted=${gas.gasWanted}  code=${gas.code}`);
  else console.log('  (gas: query the tx on the explorer — /tx not available here)');
  if (balBefore != null && balAfter != null) {
    console.log(`BNB spent (Δ)     : ${fmtBNB(balBefore - balAfter)}  (gas + storage settlement)`);
    console.log(`  before=${fmtBNB(balBefore)}  after=${fmtBNB(balAfter)}`);
  } else {
    console.log('BNB spent (Δ)     : set GREENFIELD_REST (cosmos LCD) to measure');
  }
  console.log('\nPer-lesson size:');
  for (const [k, v] of Object.entries(byLesson).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(10)} ${humanBytes(v)}`);
  }
  console.log('\nNote: objects are uploaded via SP-delegated upload, so per-object');
  console.log('on-chain creation is performed by the SP and storage is billed as a');
  console.log('BNB payment stream from the bucket owner — not per-object gas. The');
  console.log('gas you sign directly is the createBucket tx above; the BNB Δ is the');
  console.log('full economic cost (gas + storage prepay).');
  console.log(`\nExplorer: https://testnet.greenfieldscan.com/account/${ADDR}`);

  if (failed) process.exit(1);
}

main().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
