/**
 * Daskibo Academy — course discovery index (TDD)
 *
 * Real search: aggregate the public `_lit/manifest.json` of many buckets
 * into one searchable index and query by bucket / course title / lesson
 * title / tags — not just a bucket-name substring.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildCourseIndex,
  searchCourseIndex,
  crawlCourseIndex,
} from '../smartcontracts/buckets/course-index.js';

const MANIFEST_A = {
  schema: 'daskibo.lit.manifest/1',
  bucket: 'course-greenfield',
  title: 'Greenfield Basics',
  objects: [
    { key: 'l1.md.enc', title: 'Intro to Buckets', tags: ['free'] },
    { key: 'l2.md.enc', title: 'Storage Providers' },
  ],
};
const MANIFEST_B = {
  schema: 'daskibo.lit.manifest/1',
  bucket: 'course-lit',
  title: 'Lit Access Control',
  objects: [{ key: 'a.md.enc', title: 'ACC patterns', tags: ['advanced'] }],
};

describe('buildCourseIndex', () => {
  it('flattens manifests into course + lesson records', () => {
    const idx = buildCourseIndex([
      { bucket: 'course-greenfield', manifest: MANIFEST_A },
      { bucket: 'course-lit', manifest: MANIFEST_B },
    ]);
    expect(idx.courses.map((c) => c.title)).toEqual([
      'Greenfield Basics',
      'Lit Access Control',
    ]);
    expect(idx.courses[0].lessons).toHaveLength(2);
    expect(idx.courses[0].bucket).toBe('course-greenfield');
  });

  it('skips malformed / wrong-schema manifests defensively', () => {
    const idx = buildCourseIndex([
      { bucket: 'x', manifest: { schema: 'nope' } },
      { bucket: 'y', manifest: null },
      { bucket: 'course-lit', manifest: MANIFEST_B },
    ]);
    expect(idx.courses.map((c) => c.bucket)).toEqual(['course-lit']);
  });
});

describe('searchCourseIndex', () => {
  const idx = buildCourseIndex([
    { bucket: 'course-greenfield', manifest: MANIFEST_A },
    { bucket: 'course-lit', manifest: MANIFEST_B },
  ]);

  it('matches course title (case-insensitive)', () => {
    expect(searchCourseIndex(idx, 'GREENFIELD').map((c) => c.bucket)).toEqual([
      'course-greenfield',
    ]);
  });

  it('matches a lesson title or tag, returns the owning course', () => {
    expect(searchCourseIndex(idx, 'acc patterns').map((c) => c.title)).toEqual([
      'Lit Access Control',
    ]);
    expect(searchCourseIndex(idx, 'advanced').map((c) => c.bucket)).toEqual([
      'course-lit',
    ]);
  });

  it('matches bucket name and returns everything for empty query', () => {
    expect(searchCourseIndex(idx, 'course-lit')).toHaveLength(1);
    expect(searchCourseIndex(idx, '')).toHaveLength(2);
  });

  it('returns [] for no match', () => {
    expect(searchCourseIndex(idx, 'zzz-nope')).toEqual([]);
  });
});

describe('crawlCourseIndex (reads manifests via a client)', () => {
  it('fetches _lit/manifest.json per bucket, tolerates failures', async () => {
    const client = {
      readObject: vi.fn(async (bucket) => {
        if (bucket === 'course-greenfield') return JSON.stringify(MANIFEST_A);
        if (bucket === 'course-lit') return JSON.stringify(MANIFEST_B);
        throw Object.assign(new Error('nf'), { code: 'NOT_FOUND' });
      }),
    };
    const idx = await crawlCourseIndex({
      client,
      buckets: ['course-greenfield', 'course-lit', 'missing-bucket'],
    });
    expect(client.readObject).toHaveBeenCalledWith(
      'course-greenfield',
      '_lit/manifest.json',
    );
    expect(idx.courses.map((c) => c.bucket)).toEqual([
      'course-greenfield',
      'course-lit',
    ]); // missing bucket skipped, no throw
    expect(searchCourseIndex(idx, 'storage')).toHaveLength(1);
  });
});
