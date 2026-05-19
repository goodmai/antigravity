/**
 * Daskibo Academy — Greenfield network integration (docker-compose).
 *
 * Brings up the real static frontend (nginx) + a deterministic mock
 * Storage Provider, then drives the *actual shipped* greenfield-core
 * client over real HTTP for the full lifecycle:
 *   serving · saving · access/retrieval · indexing (encrypted course
 *   manifest crawl + decrypt round-trip) · benchmark · negative cases.
 *
 * Skipped automatically when Docker is unavailable so the hermetic
 * `npm run test:unit` stays offline; the dedicated CI `integration` job
 * runs it for real.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { execSync, execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createGreenfieldClient } from '../smartcontracts/buckets/greenfield-core.js';
import { createSpEmulationBackend } from '../smartcontracts/integration/sp-emulation-backend.js';
import { planCoursePublish } from '../smartcontracts/buckets/course-publish.js';
import { decryptObject } from '../smartcontracts/buckets/crypto-envelope.js';
import {
  crawlCourseIndex,
  searchCourseIndex,
} from '../smartcontracts/buckets/course-index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE = ['compose', '-f', 'smartcontracts/docker-compose.yml'];

function dockerAvailable() {
  try {
    execSync('docker compose version', { stdio: 'ignore' });
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const HAVE_DOCKER = dockerAvailable();
const d = HAVE_DOCKER ? describe : describe.skip;

function compose(args) {
  return execFileSync('docker', [...COMPOSE, ...args], {
    cwd: ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
  });
}

async function nodeTransport({ method, url, headers, body }) {
  const res = await fetch(url, { method, headers, body: body || undefined });
  const text = await res.text();
  const hdrs = {};
  res.headers.forEach((v, k) => (hdrs[k.toLowerCase()] = v));
  return { status: res.status, headers: hdrs, body: text };
}

const FRONTEND = 'http://localhost:8080';
const MOCK_SP = 'http://localhost:9000';
const OWNER = '0xAbCd1234567890abcdef1234567890AbCd123456';

function newClient(owner = OWNER) {
  return createGreenfieldClient({
    transport: nodeTransport,
    owner,
    endpoint: MOCK_SP,
    backend: createSpEmulationBackend({
      transport: nodeTransport,
      endpoint: MOCK_SP,
    }),
  });
}

d('Greenfield network integration', () => {
  beforeAll(() => {
    compose(['up', '-d', '--wait']);
  }, 180_000);

  afterAll(() => {
    try {
      compose(['down', '-v']);
    } catch {
      /* best effort */
    }
  }, 60_000);

  // ── Serving ──────────────────────────────────────────────────────────
  describe('serving (nginx)', () => {
    it('serves the bucket console + ES modules + 3 course stubs', async () => {
      const html = await (await fetch(`${FRONTEND}/index.html`)).text();
      expect(html).toContain('Greenfield Testnet');
      expect(html).toContain('id="gf-create-form"');
      const core = await fetch(`${FRONTEND}/buckets/greenfield-core.js`);
      expect(core.status).toBe(200);
      expect(await core.text()).toContain('GREENFIELD_TESTNET');
      for (const n of ['01', '02', '03']) {
        const c = await fetch(`${FRONTEND}/courses/course-${n}/index.html`);
        expect(c.status).toBe(200);
        expect(await c.text()).toContain(`Course ${n}`);
      }
    });
  });

  // ── Saving + access/retrieval (positive) ─────────────────────────────
  describe('saving + retrieval', () => {
    it('create → search → save → read round-trips exact content', async () => {
      const c = newClient();
      const created = await c.createBucket('rt-bucket', { visibility: 'public' });
      expect(created.txHash).toMatch(/^0x/);
      expect((await c.searchBuckets('rt')).map((b) => b.name)).toContain(
        'rt-bucket',
      );
      await c.saveObject('rt-bucket', 'courses/01/intro.md', '# Hello', {
        contentType: 'text/markdown',
      });
      expect(await c.readObject('rt-bucket', 'courses/01/intro.md')).toBe(
        '# Hello',
      );
    }, 30_000);

    it('handles nested + special-char keys and overwrite', async () => {
      const c = newClient();
      await c.createBucket('keys-bucket', { visibility: 'public' });
      const key = 'a b/секция/файл (1).md';
      await c.saveObject('keys-bucket', key, 'v1', { contentType: 'text/plain' });
      expect(await c.readObject('keys-bucket', key)).toBe('v1');
      await c.saveObject('keys-bucket', key, 'v2', { contentType: 'text/plain' });
      expect(await c.readObject('keys-bucket', key)).toBe('v2'); // overwrite
    }, 30_000);
  });

  // ── Indexing: encrypted-course manifest crawl + decrypt round-trip ───
  describe('indexing (encrypted course)', () => {
    it('publishes, an indexer resolves the manifest, content decrypts', async () => {
      const c = newClient();
      const master = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='; // 32B
      const fakeAccess = {
        encryptMasterKey: vi.fn(async (_m, acc) => ({
          schema: 'daskibo.lit.acc/1',
          chain: 'ethereum',
          accessControlConditions: acc,
          ciphertext: 'OPAQUE',
          dataToEncryptHash: 'H',
        })),
      };
      const plan = await planCoursePublish({
        spec: {
          slug: 'idx-course',
          title: 'Indexed',
          lessons: [
            { key: 'lessons/01.md', title: 'L1', contentType: 'text/markdown', body: '# Secret 1' },
            { key: 'lessons/02.md', title: 'L2', contentType: 'text/markdown', body: '# Secret 2' },
          ],
        },
        pricing: { litSaveCost: 0n },
        crypto: webcrypto,
        masterKey: master,
        lit: { access: fakeAccess, accessControlConditions: [{ x: 1 }] },
      });

      await c.createBucket(plan.bucketName, { visibility: 'public' });
      for (const o of plan.objects) {
        await c.saveObject(plan.bucketName, o.key, o.body, {
          contentType: o.contentType,
        });
      }

      // ── Indexer: read the public manifest, resolve every entry ──
      const manifest = JSON.parse(
        await c.readObject(plan.bucketName, '_lit/manifest.json'),
      );
      expect(manifest.lit).toMatchObject({ schema: 'daskibo.lit.acc/1' });
      for (const entry of manifest.objects) {
        expect(entry.key.endsWith('.enc')).toBe(true);
        // both the .enc payload and the indexer-safe sidecar must resolve
        const encBody = await c.readObject(plan.bucketName, entry.key);
        const sidecar = JSON.parse(
          await c.readObject(plan.bucketName, entry.sidecar),
        );
        expect(sidecar.ciphertext).toBeUndefined(); // indexer-safe
        // ── Retrieval + decrypt round-trip over real HTTP ──
        const out = await decryptObject(master, JSON.parse(encBody), webcrypto);
        expect(out.text).toMatch(/# Secret [12]/);
      }
    }, 60_000);

    it('crawls manifests across buckets and searches by title (real HTTP)', async () => {
      const c = newClient();
      // bucket without a course manifest must be skipped, not fail
      await c.createBucket('plain-bucket', { visibility: 'public' });
      await c.saveObject('plain-bucket', 'readme.txt', 'hi', {
        contentType: 'text/plain',
      });

      const idx = await crawlCourseIndex({
        client: c,
        buckets: ['idx-course', 'plain-bucket', 'does-not-exist'],
      });
      // only the real course manifest is indexed
      expect(idx.courses.map((co) => co.bucket)).toEqual(['idx-course']);
      expect(searchCourseIndex(idx, 'Indexed').map((co) => co.bucket)).toEqual([
        'idx-course',
      ]);
      expect(searchCourseIndex(idx, 'zzz-nope')).toEqual([]);
    }, 60_000);
  });

  // ── Negative cases ───────────────────────────────────────────────────
  describe('negative cases', () => {
    it('missing object → NOT_FOUND', async () => {
      const c = newClient();
      await c.createBucket('neg-bucket', { visibility: 'public' });
      await expect(
        c.readObject('neg-bucket', 'nope.md'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }, 20_000);

    it('duplicate bucket → BUCKET_EXISTS (SP 409 mapped)', async () => {
      const c = newClient();
      await c.createBucket('dup-bucket', { visibility: 'public' });
      await expect(
        c.createBucket('dup-bucket', { visibility: 'public' }),
      ).rejects.toMatchObject({ code: 'BUCKET_EXISTS' });
    }, 20_000);

    it('invalid bucket name fails before any network call', async () => {
      const c = newClient();
      await expect(c.createBucket('BAD NAME')).rejects.toMatchObject({
        code: 'INVALID_BUCKET_NAME',
      });
    });

    it('write without an owner/signer is refused', async () => {
      const noOwner = createGreenfieldClient({
        transport: nodeTransport,
        endpoint: MOCK_SP,
        backend: createSpEmulationBackend({
          transport: nodeTransport,
          endpoint: MOCK_SP,
        }),
      });
      await expect(
        noOwner.saveObject('rt-bucket', 'x.md', 'data'),
      ).rejects.toMatchObject({ code: 'NO_OWNER' });
    });
  });

  // ── Benchmark (perf smoke, not flaky) ────────────────────────────────
  describe('benchmark', () => {
    it('25 save+read ops complete within a generous bound', async () => {
      const c = newClient();
      await c.createBucket('bench-bucket', { visibility: 'public' });
      const N = 25;
      const t0 = Date.now();
      for (let i = 0; i < N; i++) {
        await c.saveObject('bench-bucket', `obj/${i}.txt`, `payload-${i}`, {
          contentType: 'text/plain',
        });
        expect(await c.readObject('bench-bucket', `obj/${i}.txt`)).toBe(
          `payload-${i}`,
        );
      }
      const ms = Date.now() - t0;
      // localhost mock SP: ~hundreds of ms; 20s is a very loose CI ceiling
      expect(ms).toBeLessThan(20_000);
      // eslint-disable-next-line no-console
      console.log(
        `[bench] ${N} save+read in ${ms}ms (avg ${(ms / N).toFixed(1)}ms/op)`,
      );
    }, 60_000);
  });
});
