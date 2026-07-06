/**
 * Shared course-publish pipeline (Chipotle DRM + BNB Greenfield + optional
 * Pinata IPFS mirror). One flow, env-selected targets:
 *
 *   testnet — Greenfield testnet 5600, gate on BSC testnet 97 / opBNB 5611
 *   mainnet — Greenfield mainnet 1017, gate on BSC 56 / opBNB 204
 *
 * DRM is always Chipotle (Lit v3, REST): the local mock in dev, the REAL
 * api.chipotle.litprotocol.com in prod AND testnets (Lit has no testnet —
 * Chipotle runs on Base mainnet only). Datil/Naga are dead; see
 * skills/lit/SKILL.md §7.
 *
 * `resolvePublishEnv` is pure (env → config, throws on misconfig) and
 * `runPublish` takes injectable deps, so both are covered by unit and
 * backend-integration tests without real networks.
 */

import { createGreenfieldClient } from '../buckets/greenfield-core.js';
import { planCoursePublish } from '../buckets/course-publish.js';
import { createLitAccess } from '../buckets/lit-access.js';
import { createChipotleClient } from '../buckets/lit-sdk-chipotle.js';
import { tokenBalanceAcc, courseAccessAcc } from '../buckets/lit-acc.js';
import { loadCourse, buildPublishSpec, humanBytes } from './course-loader.mjs';
import { ipfsMirrorConfigFromEnv, mirrorPlanObjects, pinManifest } from './ipfs-mirror.mjs';

/** Greenfield endpoints + key env names per target. */
export const GF_TARGETS = {
  testnet: {
    label: 'Greenfield testnet',
    rpc: 'https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org',
    sp: 'https://gnfd-testnet-sp1.bnbchain.org',
    chainId: '5600',
    keyEnv: 'GREENFIELD_TESTNET_PRIVATE_KEY',
    addrEnv: 'GREENFIELD_TESTNET_ADDRESS',
    gateChain: 'bscTestnet',
  },
  mainnet: {
    label: 'Greenfield MAINNET',
    rpc: 'https://greenfield-chain.bnbchain.org:443',
    sp: 'https://greenfield-sp.bnbchain.org',
    chainId: '1017',
    keyEnv: 'GREENFIELD_MAINNET_PRIVATE_KEY',
    addrEnv: 'GREENFIELD_MAINNET_ADDRESS',
    gateChain: 'bsc',
  },
};

export function isRealChipotle(url) {
  return /api\.chipotle\.litprotocol\.com/.test(url || '');
}

/**
 * Resolve the full pipeline config from the environment. Throws Error with a
 * `.exitCode` on misconfiguration (callers `process.exit(e.exitCode)`).
 * @param {Record<string,string|undefined>} env
 * @param {'testnet'|'mainnet'} target
 */
export function resolvePublishEnv(env = process.env, target = 'testnet') {
  const t = GF_TARGETS[target];
  if (!t) throw Object.assign(new Error(`unknown target "${target}"`), { exitCode: 2 });

  const fail = (msg) => {
    throw Object.assign(new Error(msg), { exitCode: 2 });
  };

  const pk = env[t.keyEnv];
  const addr = env[t.addrEnv];
  if (!pk || !addr) fail(`Set ${t.keyEnv} and ${t.addrEnv}`);

  // Gate selection — course (purchase-gated) or NFT balance (fallback).
  const marketplace = env.MARKETPLACE_ADDR;
  const courseId = env.COURSE_ID;
  const nftContract = env.NFT_GATING_CONTRACT;
  const gateCourse = Boolean(marketplace && courseId);
  if (!gateCourse && !nftContract) {
    fail(
      'Set MARKETPLACE_ADDR + COURSE_ID (purchase-gated, demo-style) OR NFT_GATING_CONTRACT (balanceOf-gated).\n' +
        '  → written to the addresses env file by the deploy step',
    );
  }

  const chipotleUrl = (env.CHIPOTLE_URL || 'http://localhost:8000').replace(/\/$/, '');
  const chipotleApiKey = env.CHIPOTLE_API_KEY || 'dummy-api-key';
  if (target === 'mainnet' && !isRealChipotle(chipotleUrl)) {
    fail(`mainnet publish requires the REAL Chipotle (got CHIPOTLE_URL=${chipotleUrl})`);
  }
  if (isRealChipotle(chipotleUrl) && chipotleApiKey === 'dummy-api-key') {
    fail('Real Chipotle requires a funded CHIPOTLE_API_KEY (Stripe credits) — got dummy-api-key');
  }

  const pin = ipfsMirrorConfigFromEnv(env);
  if (pin.enabled && !pin.jwt && !(pin.apiKey && pin.apiSecret)) {
    fail('PIN_TO_IPFS=1 requires PINATA_JWT or PINATA_API_KEY + PINATA_API_SECRET');
  }

  return {
    target,
    label: t.label,
    pk,
    addr,
    rpc: env.GREENFIELD_RPC || t.rpc,
    sp: env.GREENFIELD_SP || t.sp,
    chainId: env.GREENFIELD_CHAIN_ID || t.chainId,
    chipotleUrl,
    chipotleApiKey,
    chipotlePublicUrl:
      env.CHIPOTLE_PUBLIC_URL || (isRealChipotle(chipotleUrl) ? chipotleUrl : 'http://localhost:8000'),
    course: env.COURSE || 'lessons',
    bucket: env.GF_BUCKET || `daskibo-${Date.now().toString(36)}`,
    gate: {
      course: gateCourse,
      marketplace,
      courseId,
      nftContract,
      chain: env.NFT_GATING_CHAIN || t.gateChain,
      standard: env.NFT_STANDARD || 'ERC721',
      min: env.NFT_MIN_BALANCE || '1',
    },
    meta: {
      platform: env.PLATFORM || 'prosol',
      author: env.AUTHOR_NAME || addr,
      authorAddress: env.AUTHOR_ADDRESS || addr,
    },
    pin,
  };
}

/**
 * Run the pipeline: Chipotle PKP → ACC → encrypt/plan → (Pinata mirror) →
 * Greenfield upload → round-trip verify.
 * @param {ReturnType<typeof resolvePublishEnv>} cfg
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   makeBackend?: (cfg: object) => Promise<object>|object,  // Greenfield tx backend
 *   course?: object,                                        // preloaded course (tests)
 *   pin?: Function,                                         // pinFile override (tests)
 * }} [deps]
 */
export async function runPublish(cfg, deps = {}) {
  const f = deps.fetchImpl || fetch;
  const real = isRealChipotle(cfg.chipotleUrl);

  // ── 1. Connect Chipotle + provision PKP ───────────────────────────────────
  const authHeaders = { 'X-Api-Key': cfg.chipotleApiKey };
  console.log(`→ Connecting to Chipotle at ${cfg.chipotleUrl} (${real ? 'REAL Base-mainnet' : 'local'})…`);
  const vRes = await f(`${cfg.chipotleUrl}/core/v1/version`, { headers: authHeaders });
  if (!vRes.ok) throw new Error(`Cannot reach Chipotle at ${cfg.chipotleUrl} (HTTP ${vRes.status})`);
  const version = await vRes.json().catch(() => ({}));
  console.log(`✓ Chipotle: ${version.name ?? '?'} v${version.version ?? '?'} mode=${version.mode ?? '?'}`);

  const wRes = await f(`${cfg.chipotleUrl}/core/v1/create_wallet`, { headers: authHeaders });
  if (!wRes.ok) throw new Error(`create_wallet failed: HTTP ${wRes.status} ${await wRes.text()}`);
  const wallet = await wRes.json();
  const PKP_ID = wallet.wallet_address;
  console.log(`  PKP address: ${PKP_ID}`);

  // ── 2. ACC — purchase-gated (demo-style) or NFT-balance gate ──────────────
  const g = cfg.gate;
  const acc = g.course
    ? courseAccessAcc({ contractAddress: g.marketplace, chain: g.chain, courseId: g.courseId })
    : tokenBalanceAcc({ contractAddress: g.nftContract, standardContractType: g.standard, chain: g.chain, min: g.min });
  console.log(
    g.course
      ? `→ ACC: CourseMarketplace.hasCourseAccess(:userAddress, ${g.courseId}) == true @ ${g.chain} (${g.marketplace})`
      : `→ ACC: ${g.standard}.balanceOf(:userAddress) >= ${g.min} @ ${g.chain} (${g.nftContract})`,
  );

  // ── 3. Chipotle litClient + litAccess ─────────────────────────────────────
  const chipotleClient = createChipotleClient({ chipotleUrl: cfg.chipotleUrl, pkpId: PKP_ID, apiKey: cfg.chipotleApiKey });
  const litAccess = createLitAccess({ litClient: chipotleClient, chain: g.chain });

  // ── 4. Course spec ─────────────────────────────────────────────────────────
  const course = deps.course || loadCourse({ id: cfg.course });
  const spec = buildPublishSpec(course, { slug: cfg.bucket, litNetwork: 'chipotle' });
  console.log(
    `→ Course "${course.id}" — ${course.title}: ${spec.lessons.length} text lessons ` +
      `(${humanBytes(course.totalBytes)} total incl. ${course.files.length - spec.lessons.length} assets)`,
  );

  // ── 5. Plan (encrypt + Chipotle-wrap master key) ──────────────────────────
  const now = new Date().toISOString();
  const meta = { ...cfg.meta, title: course.title, publishedAt: now, updatedAt: now };
  console.log(`→ Planning publish for bucket "${cfg.bucket}"…`);
  const plan = await planCoursePublish({
    spec,
    pricing: { litSaveCost: 800n, storageCost: 200n },
    lit: { access: litAccess, accessControlConditions: acc },
    meta,
  });
  if (!plan.manifest.lit) throw new Error('planCoursePublish did not produce a lit envelope');

  // Augment manifest with Chipotle routing (reader needs url + pkp). The URL
  // must be reachable from the BROWSER, not from inside Docker.
  const litEnv = { ...plan.manifest.lit, litNetwork: 'chipotle', chipotleUrl: cfg.chipotlePublicUrl, pkpId: PKP_ID };
  let manifest = { ...plan.manifest, lit: litEnv };
  console.log(`✓ Master key Chipotle-wrapped (pkp ${PKP_ID}, hash ${litEnv.dataToEncryptHash})`);

  // ── 5b. Pinata IPFS mirror (prod/testnets profiles) ───────────────────────
  let manifestPin = null;
  if (cfg.pin.enabled) {
    console.log(`→ Pinning ${plan.objects.length - 1} bucket objects to IPFS via Pinata…`);
    const pinDeps = deps.pin ? { pin: deps.pin } : {};
    const mirror = await mirrorPlanObjects({ objects: plan.objects, bucket: plan.bucketName, cfg: cfg.pin }, pinDeps);
    manifest = { ...manifest, ipfsMirror: mirror };
    manifestPin = await pinManifest({ manifest, bucket: plan.bucketName, cfg: cfg.pin }, pinDeps);
    console.log(`✓ IPFS mirror: ${Object.keys(mirror.items).length} objects pinned, manifest cid ${manifestPin.cid}`);
    console.log(`  ${manifestPin.url}`);
  }
  const objects = plan.objects.map((o) => (o.kind === 'manifest' ? { ...o, body: JSON.stringify(manifest) } : o));

  // ── 6. Greenfield upload ──────────────────────────────────────────────────
  function fetchTransport({ method, url, headers, body }) {
    return f(url, { method, headers, body: body || undefined }).then(async (res) => {
      const text = await res.text();
      const hh = {};
      res.headers.forEach((v, k) => {
        hh[k.toLowerCase()] = v;
      });
      return { status: res.status, headers: hh, body: text };
    });
  }
  const backend = deps.makeBackend
    ? await deps.makeBackend({ ...cfg, transport: fetchTransport })
    : await (async () => {
        // Lazy: @bnb-chain/greenfield-js-sdk is heavy and only needed for the
        // real chain path (tests inject an SP-emulation backend instead).
        const { createSdkBackend } = await import('./sdk-backend.mjs');
        return createSdkBackend({ rpcUrl: cfg.rpc, chainId: cfg.chainId, privateKey: cfg.pk, address: cfg.addr });
      })();
  const client = createGreenfieldClient({ transport: fetchTransport, owner: cfg.addr, endpoint: cfg.sp, backend });

  console.log(`→ Creating bucket "${plan.bucketName}" on ${cfg.label} (${cfg.chainId})…`);
  await client.createBucket(plan.bucketName, { visibility: 'public', owner: cfg.addr });
  for (const o of objects) {
    console.log(`→ Uploading ${o.key} (${o.kind})…`);
    await client.saveObject(plan.bucketName, o.key, o.body, { contentType: o.contentType, owner: cfg.addr });
  }

  const back = JSON.parse(await client.readObject(plan.bucketName, '_lit/manifest.json'));
  if (!back.lit?.pkpId) throw new Error('Round-trip check failed: manifest.lit missing from SP');
  if (cfg.pin.enabled && !back.ipfsMirror?.items) throw new Error('Round-trip check failed: manifest.ipfsMirror missing from SP');
  console.log('✓ Manifest round-trip verified');

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`DONE — gated course on ${cfg.label} (Chipotle ${real ? 'mainnet' : 'local'})`);
  console.log(`Bucket:   ${plan.bucketName}`);
  console.log(
    g.course
      ? `Gate:     buy CourseMarketplace.purchase(${g.courseId}) @ ${g.chain} (${g.marketplace}) → access`
      : `Gate:     ${g.standard}.balanceOf >= ${g.min} @ ${g.chain} (${g.nftContract})`,
  );
  if (manifestPin) console.log(`IPFS:     manifest ${manifestPin.cid}`);
  console.log(`Reader:   http://localhost:8099/bucket-reader.html?bucket=${plan.bucketName}&owner=${cfg.addr}`);
  console.log('═══════════════════════════════════════════════════════════');

  return { bucketName: plan.bucketName, pkpId: PKP_ID, manifest, manifestPin };
}
