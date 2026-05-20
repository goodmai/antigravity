/**
 * Daskibo Academy — E2E happy-path: encrypt → publish → sell → read
 *
 * Wires every off-chain seam into one hermetic flow with three named
 * actors and asserts every commission split AND every access boundary:
 *
 *   Alice   the course author    (publishes + free decrypt of her own)
 *   Bob     paying client        (purchases → AccessPass → can decrypt)
 *   Eve     freeloader           (never pays → contract denies + Lit denies)
 *
 * Layers exercised end-to-end:
 *   course-template + crypto-envelope   real AES-256-GCM round-trip
 *   lit-acc + lit-access (fake LitClient)   ACC-gated master rewrap
 *   greenfield-core client (in-memory)  manifest + .enc + .lit.json upload
 *   CourseMarketplace simulator        20% treasury + 20% w3ext split,
 *                                      pull-payments, AccessPass mint
 *   course-read                         Lit-recover master + AES-decrypt
 *
 * Everything is in-process — no docker, no chain, no network. The
 * marketplace simulator mirrors the on-chain CourseMarketplace.sol so the
 * money math (DEFAULT_TREASURY_BPS=2000 + DEFAULT_W3EXT_FEE_BPS=2000) is
 * asserted against the same constants the Solidity contracts and
 * `lit-pricing.js` use.
 */

import { describe, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { planCoursePublish, publishCourse } from '../smartcontracts/buckets/course-publish.js';
import { openCourseObject } from '../smartcontracts/buckets/course-read.js';
import { createLitAccess } from '../smartcontracts/buckets/lit-access.js';
import { addressAllowlistAcc, anyOf } from '../smartcontracts/buckets/lit-acc.js';
import {
  computeSaleSplit,
  DEFAULT_TREASURY_BPS,
  DEFAULT_W3EXT_FEE_BPS,
  BPS_DENOMINATOR,
} from '../smartcontracts/buckets/lit-pricing.js';

// ── Actors ────────────────────────────────────────────────────────────
const ALICE = '0xAuthorAlice';
const BOB = '0xBuyerBob';
const EVE = '0xFreeloaderEve';
const W3EXT = '0xW3ext';
const TREASURY = '0xTreasury';

// ── Course fixture (one lesson is enough; round-trip equality is the proof) ──
const COURSE = {
  slug: 'e2e-happy-course',
  title: 'E2E Happy Course',
  litNetwork: 'datil-test',
  lessons: [
    {
      key: 'lessons/01/secret.md',
      title: 'Secret Lesson',
      contentType: 'text/markdown',
      body: '# The actual secret payload — only paying readers may see this.',
    },
  ],
};
const SECRET_PLAINTEXT = COURSE.lessons[0].body;

const PRICING = {
  litSaveCost: 800n,
  storageCost: 200n,
  litPayee: 'lit',
  storagePayee: 'sp',
  w3extPayee: W3EXT,
};

const SALE_PRICE = 1000n;

// ── In-memory Greenfield client (real surface; no network) ────────────
function inMemoryGreenfield() {
  /** @type {Map<string, Map<string, string>>} */
  const buckets = new Map();
  return {
    createBucket: vi.fn(async (name) => {
      if (!buckets.has(name)) buckets.set(name, new Map());
      return { bucketName: name, txHash: '0xbucket' };
    }),
    saveObject: vi.fn(async (bucket, key, body) => {
      const b = buckets.get(bucket);
      if (!b) throw Object.assign(new Error('no bucket'), { code: 'NO_BUCKET' });
      b.set(key, String(body));
      return { bucketName: bucket, objectKey: key, txHash: '0xobj' };
    }),
    readObject: vi.fn(async (bucket, key) => {
      const b = buckets.get(bucket);
      if (!b || !b.has(key)) {
        throw Object.assign(new Error(`missing ${bucket}/${key}`), { code: 'NOT_FOUND' });
      }
      return /** @type {string} */ (b.get(key));
    }),
    _bucketCount: () => buckets.size,
    _objectCount: (name) => buckets.get(name)?.size ?? 0,
  };
}

// ── ACC-evaluating fake LitClient ─────────────────────────────────────
// Mirrors the real Lit threshold service: the ciphertext is opaque (we
// keep the wrapped plaintext in an internal map, keyed by a random
// token), and `decrypt` only releases it if the caller's address (proven
// by session sigs in production) satisfies the supplied ACC. We consult
// the same `marketplace` simulator used for purchases so the on-chain
// `hasCourseAccess(user, courseId)` ACC condition resolves correctly.
function makeFakeLitClient(marketplace) {
  /** @type {Map<string, string>} */
  const vault = new Map();
  let n = 0;
  return {
    encrypt: vi.fn(async ({ accessControlConditions, dataToEncrypt }) => {
      const token = `lit-ct-${++n}`;
      vault.set(token, dataToEncrypt);
      // hash is opaque + bound to the ACC; we tag it so the test can
      // verify the manifest carries the right envelope shape.
      const accLen = JSON.stringify(accessControlConditions).length;
      return { ciphertext: token, dataToEncryptHash: `h_${token}_${accLen}` };
    }),
    decrypt: vi.fn(async ({ accessControlConditions, ciphertext }, authContext) => {
      const address = (authContext && /** @type {{address?: string}} */ (authContext).address) || '';
      const ok = accessControlConditions.some((cond) => {
        // operator joiner — never satisfies on its own
        if (cond && typeof cond === 'object' && 'operator' in cond) return false;
        const c = /** @type {Record<string, unknown>} */ (cond);
        const params = /** @type {string[] | undefined} */ (c.parameters);
        const rvt = /** @type {{comparator?: string, value?: string} | undefined} */ (
          c.returnValueTest
        );
        // address allowlist (Alice's free-access OR-branch)
        if (
          Array.isArray(params) &&
          params[0] === ':userAddress' &&
          rvt &&
          rvt.comparator === '=' &&
          typeof rvt.value === 'string' &&
          rvt.value !== 'true'
        ) {
          return rvt.value.toLowerCase() === address.toLowerCase();
        }
        // on-chain `hasCourseAccess(user, courseId) == true` — the
        // contract-backed buyer/holder rule.
        if (c.method === 'hasCourseAccess' && Array.isArray(params)) {
          const courseId = Number(params[1]);
          return marketplace.hasCourseAccess(address, courseId);
        }
        return false;
      });
      if (!ok) throw new Error('not authorized: access control conditions not met');
      const plain = vault.get(/** @type {string} */ (ciphertext));
      if (plain === undefined) throw new Error('unknown ciphertext token');
      return plain;
    }),
  };
}

// ── CourseMarketplace simulator (mirrors src/CourseMarketplace.sol) ───
// Same bps + pull-payments + AccessPass behaviour. Exists so the JS-side
// e2e can assert the same money math as the Solidity tests do on-chain.
function makeMarketplace() {
  let nextCourseId = 1;
  /** @type {Map<number, {author: string, price: bigint, active: boolean}>} */
  const courses = new Map();
  /** @type {Map<number, Set<string>>} */
  const passByCourse = new Map();
  /** @type {Map<string, bigint>} */
  const pending = new Map();
  const credit = (to, amt) => pending.set(to, (pending.get(to) ?? 0n) + amt);

  return {
    registerCourse(author, price) {
      const id = nextCourseId++;
      courses.set(id, { author, price, active: true });
      return id;
    },
    /** Pull-payment purchase mirroring CourseMarketplace.purchase. */
    purchase(buyer, courseId, paidValue) {
      const c = courses.get(courseId);
      if (!c) throw new Error('NoCourse');
      if (!c.active) throw new Error('Inactive');
      if (paidValue !== c.price) throw new Error('BadPrice');
      if (this.hasCourseAccess(buyer, courseId)) throw new Error('AlreadyOwned');
      // Same split off-chain (lit-pricing) and on-chain (Marketplace) use:
      const split = computeSaleSplit({
        salePrice: c.price,
        treasury: TREASURY,
        seller: c.author,
        treasuryBps: DEFAULT_TREASURY_BPS,
      });
      // w3ext fee taken from the seller's share at 20% of price (matches
      // CourseMarketplace.quote: treasuryBps + w3extBps + author remainder)
      const w3extFee = (c.price * DEFAULT_W3EXT_FEE_BPS) / BPS_DENOMINATOR;
      const authorAmount = split.sellerAmount - w3extFee;
      // credit pull-payments — NO push during purchase
      credit(c.author, authorAmount);
      credit(W3EXT, w3extFee);
      credit(TREASURY, split.treasuryAmount);
      // mint AccessPass (soulbound, non-transferable in the JS sim too)
      if (!passByCourse.has(courseId)) passByCourse.set(courseId, new Set());
      /** @type {Set<string>} */ (passByCourse.get(courseId)).add(buyer);
      return {
        courseId,
        paid: paidValue,
        protocolCut: split.treasuryAmount,
        w3extFee,
        authorAmount,
      };
    },
    hasCourseAccess(user, courseId) {
      const c = courses.get(courseId);
      if (!c) return false;
      if (c.author === user) return true; // author always has free access
      return passByCourse.get(courseId)?.has(user) ?? false;
    },
    pendingOf(addr) {
      return pending.get(addr) ?? 0n;
    },
    /** Pull-payments withdraw — CEI: zero before transfer. */
    withdraw(addr) {
      const amt = pending.get(addr) ?? 0n;
      if (amt === 0n) throw new Error('NothingToWithdraw');
      pending.set(addr, 0n);
      return amt;
    },
  };
}

describe('E2E happy-path: encrypt → publish → buy → read → reject Eve', () => {
  it('Alice publishes encrypted, Bob pays and decrypts, Eve is denied at both layers', async () => {
    // ── 0. Setup actors + ACC. ACC is the on-chain rule the Lit nodes
    //      evaluate: (Alice address allowlist) OR (hasCourseAccess(user,
    //      courseId) == true). courseId is registered next so we wire it
    //      up after registerCourse.
    const marketplace = makeMarketplace();
    const litClient = makeFakeLitClient(marketplace);
    const lit = createLitAccess({ litClient });
    const gf = inMemoryGreenfield();

    // ── 1. Alice registers the course on the marketplace. ──────────────
    const courseId = marketplace.registerCourse(ALICE, SALE_PRICE);
    expect(courseId).toBe(1);

    // Author and any holder of the AccessPass for this course may decrypt.
    const buyerAcc = [
      {
        contractAddress: '0xCourseMarketplaceMock',
        standardContractType: '',
        chain: 'ethereum',
        method: 'hasCourseAccess',
        parameters: [':userAddress', String(courseId)],
        returnValueTest: { comparator: '=', value: 'true' },
      },
    ];
    // Alice gets free access via her address allowlist OR-ed in
    // (course-publish does this automatically when `lit.author` is set).

    // ── 2. Plan the publish — author-OR-ed ACC, Lit-wrap the master. ──
    const plan = await planCoursePublish({
      spec: COURSE,
      pricing: PRICING,
      crypto: webcrypto,
      lit: {
        access: lit,
        accessControlConditions: buyerAcc,
        author: ALICE,
      },
    });

    // Settlement: w3ext takes 20% of (lit 800 + storage 200) = 200; total 1200.
    expect(plan.settlement.base).toBe(1000n);
    expect(plan.settlement.w3extFee).toBe(200n);
    expect(plan.settlement.total).toBe(1200n);
    const sumOfPayouts = plan.settlement.payouts.reduce((a, p) => a + p.amount, 0n);
    expect(sumOfPayouts).toBe(plan.settlement.total);

    // The raw AES master must NEVER appear in any stored object body.
    for (const o of plan.objects) {
      expect(o.body).not.toContain(plan.masterKey);
    }
    // Manifest carries the Lit envelope (so a reader can recover the master).
    expect(plan.manifest.lit).toBeDefined();
    expect(plan.manifest.lit?.schema).toBe('daskibo.lit.acc/1');

    // ── 3. Alice publishes the (encrypted) bucket to Greenfield. ──────
    const pub = await publishCourse({
      client: gf,
      spec: COURSE,
      pricing: PRICING,
      crypto: webcrypto,
      // re-use the same master so the manifest we asserted above matches;
      // publishCourse re-plans internally — re-derive its key set via plan
      masterKey: plan.masterKey,
    });
    // publishCourse re-plans WITHOUT lit (it's an unprotected path), so
    // we instead re-upload the lit-protected manifest from `plan` so the
    // reader sees the lit envelope on chain-store.
    await gf.saveObject(
      pub.bucketName,
      '_lit/manifest.json',
      /** @type {string} */ (plan.objects.find((o) => o.kind === 'manifest')?.body),
      { contentType: 'application/json' },
    );
    expect(gf.createBucket).toHaveBeenCalledWith(
      COURSE.slug,
      expect.objectContaining({ visibility: 'public' }),
    );
    // manifest + .enc + .lit.json for the one lesson
    expect(gf._objectCount(COURSE.slug)).toBe(3);

    // ── 4. Author can decrypt for free (no purchase required). ────────
    const aliceRead = await openCourseObject({
      client: gf,
      bucketName: COURSE.slug,
      objectKey: 'lessons/01/secret.md',
      lit: { access: lit, authContext: { address: ALICE } },
      crypto: webcrypto,
    });
    expect(aliceRead.text).toBe(SECRET_PLAINTEXT);

    // ── 5. Before payment, Bob has NO access on either layer. ─────────
    expect(marketplace.hasCourseAccess(BOB, courseId)).toBe(false);
    await expect(
      openCourseObject({
        client: gf,
        bucketName: COURSE.slug,
        objectKey: 'lessons/01/secret.md',
        lit: { access: lit, authContext: { address: BOB } },
        crypto: webcrypto,
      }),
    ).rejects.toMatchObject({ code: 'ACCESS_DENIED' });

    // ── 6. Bob purchases — split is exact, AccessPass minted. ─────────
    const receipt = marketplace.purchase(BOB, courseId, SALE_PRICE);
    // 20% treasury / 20% w3ext / 60% author — sums back to SALE_PRICE
    expect(receipt.protocolCut).toBe(200n);
    expect(receipt.w3extFee).toBe(200n);
    expect(receipt.authorAmount).toBe(600n);
    expect(receipt.protocolCut + receipt.w3extFee + receipt.authorAmount).toBe(SALE_PRICE);
    // pending pull-payment ledger matches
    expect(marketplace.pendingOf(ALICE)).toBe(600n);
    expect(marketplace.pendingOf(W3EXT)).toBe(200n);
    expect(marketplace.pendingOf(TREASURY)).toBe(200n);
    // double-buy guard
    expect(() => marketplace.purchase(BOB, courseId, SALE_PRICE)).toThrow('AlreadyOwned');

    // ── 7. Bob now decrypts (Lit consults marketplace.hasCourseAccess). ─
    expect(marketplace.hasCourseAccess(BOB, courseId)).toBe(true);
    const bobRead = await openCourseObject({
      client: gf,
      bucketName: COURSE.slug,
      objectKey: 'lessons/01/secret.md',
      lit: { access: lit, authContext: { address: BOB } },
      crypto: webcrypto,
    });
    expect(bobRead.text).toBe(SECRET_PLAINTEXT);

    // ── 8. Eve never paid → marketplace AND Lit BOTH deny her. ────────
    expect(marketplace.hasCourseAccess(EVE, courseId)).toBe(false);
    expect(() => marketplace.withdraw(EVE)).toThrow('NothingToWithdraw');
    await expect(
      openCourseObject({
        client: gf,
        bucketName: COURSE.slug,
        objectKey: 'lessons/01/secret.md',
        lit: { access: lit, authContext: { address: EVE } },
        crypto: webcrypto,
      }),
    ).rejects.toMatchObject({ code: 'ACCESS_DENIED' });

    // ── 9. Pull-payments: each payee withdraws exactly their credit. ──
    expect(marketplace.withdraw(ALICE)).toBe(600n);
    expect(marketplace.withdraw(W3EXT)).toBe(200n);
    expect(marketplace.withdraw(TREASURY)).toBe(200n);
    expect(marketplace.pendingOf(ALICE)).toBe(0n);
    expect(marketplace.pendingOf(W3EXT)).toBe(0n);
    expect(marketplace.pendingOf(TREASURY)).toBe(0n);
    // empty withdraws revert (mirrors NothingToWithdraw on-chain)
    expect(() => marketplace.withdraw(ALICE)).toThrow('NothingToWithdraw');
  });
});
