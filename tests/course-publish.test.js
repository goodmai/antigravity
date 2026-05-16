/**
 * Daskibo Academy — course publish orchestrator (TDD)
 *
 * Ties the previously orphaned modules together into one tested seam:
 *   course-template (build+encrypt) → crypto-envelope → lit-pricing
 *   (w3ext save fee) → greenfield-core client (createBucket/saveObject),
 *   plus a sale-quote that routes 20% to the treasury.
 */

import { describe, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  planCoursePublish,
  publishCourse,
  quoteCourseSale,
} from '../smartcontracts/buckets/course-publish.js';

const SPEC = {
  slug: 'course-01',
  title: 'Greenfield Basics',
  litNetwork: 'datil-test',
  lessons: [
    { key: 'lessons/01/intro.md', title: 'Intro', contentType: 'text/markdown', body: '# Intro' },
    { key: 'lessons/02/buckets.md', title: 'Buckets', contentType: 'text/markdown', body: '# Buckets' },
  ],
};

const PRICING = {
  litSaveCost: 800n,
  storageCost: 200n,
  litPayee: '0xLIT',
  storagePayee: '0xSP',
  w3extPayee: '0xW3EXT',
};

function mockClient() {
  return {
    createBucket: vi.fn(async (name) => ({ bucketName: name, txHash: '0xb' })),
    saveObject: vi.fn(async (bucket, key) => ({
      bucketName: bucket,
      objectKey: key,
      txHash: '0xo',
    })),
  };
}

describe('1. planCoursePublish (pure, no client)', () => {
  it('encrypts the course and computes the w3ext save settlement', async () => {
    const plan = await planCoursePublish({
      spec: SPEC,
      pricing: PRICING,
      crypto: webcrypto,
    });

    expect(plan.bucketName).toBe('course-01');
    expect(plan.visibility).toBe('public');
    expect(typeof plan.masterKey).toBe('string');

    // manifest + 2×(.enc + .lit.json)
    expect(plan.objects[0].kind).toBe('manifest');
    expect(plan.objects.some((o) => o.key.endsWith('.enc'))).toBe(true);
    expect(plan.objects.some((o) => o.key.endsWith('.lit.json'))).toBe(true);

    // w3ext takes 20% of (lit 800 + storage 200) = 200; total 1200
    expect(plan.settlement.base).toBe(1000n);
    expect(plan.settlement.w3extFee).toBe(200n);
    expect(plan.settlement.total).toBe(1200n);
    expect(
      plan.settlement.payouts.reduce((a, p) => a + p.amount, 0n),
    ).toBe(plan.settlement.total);
  });
});

describe('2. publishCourse (drives a greenfield client)', () => {
  it('creates the public bucket then saves every object', async () => {
    const client = mockClient();
    const res = await publishCourse({
      client,
      spec: SPEC,
      pricing: PRICING,
      crypto: webcrypto,
    });

    expect(client.createBucket).toHaveBeenCalledWith(
      'course-01',
      expect.objectContaining({ visibility: 'public' }),
    );

    const plan = await planCoursePublish({
      spec: SPEC,
      pricing: PRICING,
      crypto: webcrypto,
    });
    expect(client.saveObject).toHaveBeenCalledTimes(plan.objects.length);
    expect(res.savedKeys).toEqual(plan.objects.map((o) => o.key));
    expect(res.bucketName).toBe('course-01');
    expect(res.settlement.total).toBe(1200n);
    expect(typeof res.masterKey).toBe('string');
  });

  it('propagates a client failure (no partial-success swallow)', async () => {
    const client = mockClient();
    client.saveObject.mockRejectedValueOnce(
      Object.assign(new Error('sp down'), { code: 'SP_UNAVAILABLE' }),
    );
    await expect(
      publishCourse({ client, spec: SPEC, pricing: PRICING, crypto: webcrypto }),
    ).rejects.toMatchObject({ code: 'SP_UNAVAILABLE' });
  });
});

describe('3. quoteCourseSale (treasury split seam)', () => {
  it('routes 20% of the sale to the treasury, remainder to seller', () => {
    const q = quoteCourseSale({
      salePrice: 1000n,
      treasury: '0xTREASURY',
      seller: '0xSELLER',
    });
    expect(q.treasuryAmount).toBe(200n);
    expect(q.sellerAmount).toBe(800n);
    expect(q.treasuryAmount + q.sellerAmount).toBe(1000n);
  });
});
