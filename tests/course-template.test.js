/**
 * Daskibo Academy — course bucket template (TDD)
 *
 * A canonical, deterministic course-bucket layout used both by the app
 * and as a reusable test fixture. Aligns with the lit.md manifest/sidecar
 * schema and reuses greenfield-core validation.
 */

import { describe, it, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  COURSE_TEMPLATE,
  buildCourseBucket,
  sampleCourseBucket,
  encryptCourseBucket,
} from '../smartcontracts/buckets/course-template.js';
import { isValidBucketName, isValidObjectKey } from '../smartcontracts/buckets/greenfield-core.js';
import { decryptObject } from '../smartcontracts/buckets/crypto-envelope.js';

describe('1. COURSE_TEMPLATE constant', () => {
  it('is a 3-lesson sample matching the 3 course stubs', () => {
    expect(COURSE_TEMPLATE.lessons).toHaveLength(3);
    expect(COURSE_TEMPLATE.slug).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('2. buildCourseBucket', () => {
  const spec = {
    slug: 'course-01',
    title: 'Greenfield Basics',
    litNetwork: 'datil-test',
    lessons: [
      { key: 'lessons/01/intro.md', title: 'Intro', contentType: 'text/markdown', body: '# Intro' },
      { key: 'lessons/02/buckets.md', title: 'Buckets', contentType: 'text/markdown', body: '# Buckets' },
    ],
  };

  it('produces a valid public bucket name + object keys', () => {
    const b = buildCourseBucket(spec);
    expect(isValidBucketName(b.bucketName)).toBe(true);
    expect(b.visibility).toBe('public');
    for (const o of b.objects) expect(isValidObjectKey(o.key)).toBe(true);
  });

  it('emits a manifest as the first object, then per-lesson payloads', () => {
    const b = buildCourseBucket(spec);
    expect(b.objects[0].key).toBe('_lit/manifest.json');
    expect(b.objects[0].kind).toBe('manifest');
    const payloads = b.objects.filter((o) => o.kind === 'payload');
    expect(payloads.map((o) => o.key)).toEqual([
      'lessons/01/intro.md',
      'lessons/02/buckets.md',
    ]);
  });

  it('manifest body parses and lists every lesson', () => {
    const b = buildCourseBucket(spec);
    const m = JSON.parse(b.objects[0].body);
    expect(m.schema).toBe('daskibo.lit.manifest/1');
    expect(m.bucket).toBe(b.bucketName);
    expect(m.litNetwork).toBe('datil-test');
    expect(m.objects).toHaveLength(2);
    expect(m.objects[0]).toMatchObject({
      key: 'lessons/01/intro.md',
      title: 'Intro',
      contentType: 'text/markdown',
    });
  });

  it('is deterministic for a fixed spec (stable test fixture)', () => {
    expect(JSON.stringify(buildCourseBucket(spec))).toBe(
      JSON.stringify(buildCourseBucket(spec)),
    );
  });

  it('rejects an invalid slug / empty lessons', () => {
    expect(() => buildCourseBucket({ ...spec, slug: 'BAD SLUG' })).toThrowError(
      expect.objectContaining({ code: 'INVALID_BUCKET_NAME' }),
    );
    expect(() => buildCourseBucket({ ...spec, lessons: [] })).toThrowError(
      expect.objectContaining({ code: 'EMPTY_COURSE' }),
    );
  });
});

describe('3. sampleCourseBucket fixture', () => {
  it('returns a ready-to-store canonical bucket', () => {
    const b = sampleCourseBucket();
    expect(isValidBucketName(b.bucketName)).toBe(true);
    expect(b.objects.length).toBeGreaterThanOrEqual(4); // manifest + 3 lessons
  });

  it('accepts a slug override and stays deterministic', () => {
    const a = sampleCourseBucket('course-02');
    const c = sampleCourseBucket('course-02');
    expect(a.bucketName).toContain('course-02');
    expect(JSON.stringify(a)).toBe(JSON.stringify(c));
  });
});

describe('4. encryptCourseBucket (envelope + public sidecar)', () => {
  it('replaces payloads with .enc envelopes + .lit.json sidecars', async () => {
    const plain = sampleCourseBucket();
    const out = await encryptCourseBucket(plain, { crypto: webcrypto });

    const enc = out.objects.filter((o) => o.kind === 'payload');
    const side = out.objects.filter((o) => o.kind === 'sidecar');
    expect(enc.length).toBe(3);
    expect(side.length).toBe(3);
    expect(enc[0].key.endsWith('.enc')).toBe(true);
    expect(side[0].key.endsWith('.lit.json')).toBe(true);

    // sidecar must NOT carry ciphertext (indexer-safe)
    const sc = JSON.parse(side[0].body);
    expect(sc.ciphertext).toBeUndefined();
    expect(typeof sc.dataToEncryptHash === 'undefined').toBe(false);

    // round-trip a payload back to plaintext with the returned master key
    const env = JSON.parse(enc[0].body);
    const dec = await decryptObject(out.masterKey, env, webcrypto);
    expect(dec.text).toContain('#');
  });

  it('keeps the manifest object intact and public', async () => {
    const out = await encryptCourseBucket(sampleCourseBucket(), {
      crypto: webcrypto,
    });
    expect(out.objects[0].kind).toBe('manifest');
    expect(out.visibility).toBe('public');
  });
});
