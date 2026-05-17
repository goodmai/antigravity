/**
 * Daskibo Academy — BNB Greenfield buckets core tests (TDD)
 *
 * The frontend stores/reads files on the BNB Greenfield **testnet** through
 * a Storage Provider (SP) HTTP gateway. `greenfield-core.js` is a pure,
 * DOM-free module with an injectable transport so the whole create / search /
 * save / read flow is unit-testable without a wallet or a live network —
 * mirroring the academy/js/web3-core.js philosophy.
 *
 * Suites:
 *   1. Testnet configuration
 *   2. Bucket-name validation (S3-style rules)
 *   3. Object-key validation
 *   4. URL builders
 *   5. createBucket
 *   6. listBuckets / searchBuckets
 *   7. saveObject / readObject
 *   8. Transport / network error mapping
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GREENFIELD_TESTNET,
  isValidBucketName,
  assertBucketName,
  isValidObjectKey,
  buildViewUrl,
  buildDownloadUrl,
  buildListBucketsRequest,
  createGreenfieldClient,
} from '../smartcontracts/buckets/greenfield-core.js';

// ── Mock transport ────────────────────────────────────────────────────────
// Contract: async ({ method, url, headers, body }) => { status, headers, body }

function mockTransport(handler) {
  return vi.fn(handler);
}

const OWNER = '0xAbCd1234567890abcdef1234567890AbCd123456';

describe('1. Testnet configuration', () => {
  it('targets the BNB Greenfield testnet (chain 5600)', () => {
    expect(GREENFIELD_TESTNET.chainId).toBe(5600);
    expect(GREENFIELD_TESTNET.chainIdHex.toLowerCase()).toBe('0x15e0');
  });

  it('exposes a tendermint RPC and an SP gateway over https', () => {
    expect(GREENFIELD_TESTNET.rpcUrl).toMatch(/^https:\/\//);
    expect(GREENFIELD_TESTNET.spEndpoint).toMatch(/^https:\/\//);
    expect(GREENFIELD_TESTNET.explorer).toMatch(/^https:\/\//);
  });
});

describe('2. Bucket-name validation', () => {
  it('accepts valid lowercase names', () => {
    expect(isValidBucketName('my-bucket')).toBe(true);
    expect(isValidBucketName('course01')).toBe(true);
    expect(isValidBucketName('a1b')).toBe(true);
  });

  it('rejects names that are too short or too long', () => {
    expect(isValidBucketName('ab')).toBe(false);
    expect(isValidBucketName('a'.repeat(64))).toBe(false);
    expect(isValidBucketName('a'.repeat(63))).toBe(true);
  });

  it('rejects uppercase, spaces and illegal characters', () => {
    expect(isValidBucketName('MyBucket')).toBe(false);
    expect(isValidBucketName('my bucket')).toBe(false);
    expect(isValidBucketName('my_bucket')).toBe(false);
    expect(isValidBucketName('my..bucket')).toBe(false);
  });

  it('rejects names not starting/ending alphanumeric', () => {
    expect(isValidBucketName('-bucket')).toBe(false);
    expect(isValidBucketName('bucket-')).toBe(false);
    expect(isValidBucketName('.bucket')).toBe(false);
  });

  it('rejects IP-address-formatted names', () => {
    expect(isValidBucketName('192.168.0.1')).toBe(false);
  });

  it('assertBucketName throws a coded error for bad input', () => {
    expect(() => assertBucketName('AB')).toThrowError(
      expect.objectContaining({ code: 'INVALID_BUCKET_NAME' }),
    );
    expect(() => assertBucketName('ok-bucket')).not.toThrow();
  });
});

describe('3. Object-key validation', () => {
  it('accepts non-empty keys up to 1024 chars', () => {
    expect(isValidObjectKey('a')).toBe(true);
    expect(isValidObjectKey('courses/01/intro.md')).toBe(true);
    expect(isValidObjectKey('x'.repeat(1024))).toBe(true);
  });

  it('rejects empty or oversized keys', () => {
    expect(isValidObjectKey('')).toBe(false);
    expect(isValidObjectKey('x'.repeat(1025))).toBe(false);
  });
});

describe('4. URL builders', () => {
  it('builds public view + download URLs against the SP', () => {
    const sp = GREENFIELD_TESTNET.spEndpoint;
    expect(buildViewUrl(sp, 'my-bucket', 'a/b.txt')).toBe(
      `${sp}/view/my-bucket/a/b.txt`,
    );
    expect(buildDownloadUrl(sp, 'my-bucket', 'a/b.txt')).toBe(
      `${sp}/download/my-bucket/a/b.txt`,
    );
  });

  it('url-encodes each object-key path segment', () => {
    const sp = GREENFIELD_TESTNET.spEndpoint;
    expect(buildViewUrl(sp, 'b', 'a file/x?y.txt')).toBe(
      `${sp}/view/b/a%20file/x%3Fy.txt`,
    );
  });

  it('builds an owner-scoped list-buckets request', () => {
    const req = buildListBucketsRequest(GREENFIELD_TESTNET.spEndpoint, OWNER);
    expect(req.method).toBe('GET');
    expect(req.url).toBe(`${GREENFIELD_TESTNET.spEndpoint}/`);
    expect(req.headers['X-Gnfd-User-Address']).toBe(OWNER);
  });
});

describe('5. createBucket (delegates to a signer backend)', () => {
  let transport, backend, client;
  beforeEach(() => {
    transport = mockTransport(async () => ({ status: 200, headers: {}, body: '' }));
    backend = {
      createBucket: vi.fn(async () => ({ bucketName: 'my-bucket', txHash: '0xtx' })),
      putObject: vi.fn(async () => ({
        bucketName: 'my-bucket',
        objectKey: 'k',
        txHash: '0xobj',
      })),
    };
    client = createGreenfieldClient({ transport, owner: OWNER, backend });
  });

  it('validates the name before any backend/network call', async () => {
    await expect(client.createBucket('BAD NAME')).rejects.toMatchObject({
      code: 'INVALID_BUCKET_NAME',
    });
    expect(backend.createBucket).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it('refuses to fake a write when no signer backend is configured', async () => {
    const noBackend = createGreenfieldClient({ transport, owner: OWNER });
    await expect(noBackend.createBucket('my-bucket')).rejects.toMatchObject({
      code: 'NO_BACKEND',
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it('delegates the real on-chain create to the backend', async () => {
    const res = await client.createBucket('my-bucket', { visibility: 'public' });
    expect(res).toMatchObject({ bucketName: 'my-bucket', txHash: '0xtx' });
    expect(backend.createBucket).toHaveBeenCalledWith({
      bucketName: 'my-bucket',
      owner: OWNER,
      visibility: 'public',
    });
  });

  it('propagates a backend BUCKET_EXISTS error', async () => {
    backend.createBucket.mockRejectedValueOnce(
      Object.assign(new Error('exists'), { code: 'BUCKET_EXISTS' }),
    );
    await expect(client.createBucket('dup-bucket')).rejects.toMatchObject({
      code: 'BUCKET_EXISTS',
    });
  });
});

describe('6. listBuckets / searchBuckets', () => {
  let client;
  const buckets = [
    { bucket_name: 'course-01', visibility: 'public' },
    { bucket_name: 'course-02', visibility: 'public' },
    { bucket_name: 'private-notes', visibility: 'private' },
  ];

  beforeEach(() => {
    const transport = mockTransport(async () => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ buckets }),
    }));
    client = createGreenfieldClient({ transport, owner: OWNER });
  });

  it('lists all buckets for the owner (normalized shape)', async () => {
    const out = await client.listBuckets();
    expect(out.map((b) => b.name)).toEqual([
      'course-01',
      'course-02',
      'private-notes',
    ]);
  });

  it('searchBuckets filters by case-insensitive substring', async () => {
    const out = await client.searchBuckets('COURSE');
    expect(out.map((b) => b.name)).toEqual(['course-01', 'course-02']);
  });

  it('searchBuckets with empty query returns everything', async () => {
    expect(await client.searchBuckets('')).toHaveLength(3);
  });
});

describe('6b. listBuckets pagination (continuation token)', () => {
  it('follows next_continuation_token across pages', async () => {
    const transport = mockTransport(async ({ url }) => {
      const u = new URL(url);
      const tok = u.searchParams.get('continuation-token');
      if (!tok) {
        return {
          status: 200,
          headers: {},
          body: JSON.stringify({
            buckets: [{ bucket_name: 'a' }, { bucket_name: 'b' }],
            next_continuation_token: 'PAGE2',
          }),
        };
      }
      if (tok === 'PAGE2') {
        return {
          status: 200,
          headers: {},
          body: JSON.stringify({
            buckets: [{ bucket_name: 'c' }],
            next_continuation_token: '',
          }),
        };
      }
      throw new Error(`unexpected token ${tok}`);
    });
    const client = createGreenfieldClient({ transport, owner: OWNER });
    const out = await client.listBuckets();
    expect(out.map((b) => b.name)).toEqual(['a', 'b', 'c']);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('stops after a bounded number of pages (no infinite loop)', async () => {
    const transport = mockTransport(async () => ({
      status: 200,
      headers: {},
      body: JSON.stringify({
        buckets: [{ bucket_name: 'x' }],
        next_continuation_token: 'ALWAYS', // server never ends
      }),
    }));
    const client = createGreenfieldClient({ transport, owner: OWNER });
    const out = await client.listBuckets();
    expect(Array.isArray(out)).toBe(true);
    expect(transport.mock.calls.length).toBeLessThanOrEqual(1000);
  });
});

describe('7. saveObject / readObject', () => {
  let transport, backend, client;
  beforeEach(() => {
    transport = mockTransport(async () => ({ status: 200, headers: {}, body: '' }));
    backend = {
      createBucket: vi.fn(async () => ({ bucketName: 'b', txHash: '0xb' })),
      putObject: vi.fn(async () => ({
        bucketName: 'my-bucket',
        objectKey: 'courses/01.md',
        txHash: '0xobj',
      })),
    };
    client = createGreenfieldClient({ transport, owner: OWNER, backend });
  });

  it('rejects an invalid object key before any backend/network call', async () => {
    await expect(client.saveObject('my-bucket', '', 'data')).rejects.toMatchObject(
      { code: 'INVALID_OBJECT_KEY' },
    );
    expect(backend.putObject).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it('refuses to fake an object write without a signer backend', async () => {
    const noBackend = createGreenfieldClient({ transport, owner: OWNER });
    await expect(
      noBackend.saveObject('my-bucket', 'a.md', 'x'),
    ).rejects.toMatchObject({ code: 'NO_BACKEND' });
  });

  it('delegates the real signed object write to the backend', async () => {
    const res = await client.saveObject('my-bucket', 'courses/01.md', '# Hi', {
      contentType: 'text/markdown',
    });
    expect(res).toMatchObject({
      bucketName: 'my-bucket',
      objectKey: 'courses/01.md',
      txHash: '0xobj',
    });
    expect(backend.putObject).toHaveBeenCalledWith({
      bucketName: 'my-bucket',
      objectKey: 'courses/01.md',
      data: '# Hi',
      contentType: 'text/markdown',
      owner: OWNER,
      visibility: 'inherit',
    });
  });

  it('reads object data back via the download URL', async () => {
    transport.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'text/markdown' },
      body: '# Hi',
    });
    const out = await client.readObject('my-bucket', 'courses/01.md');
    expect(out).toBe('# Hi');
    const call = transport.mock.calls[0][0];
    expect(call.method).toBe('GET');
    expect(call.url).toBe(
      `${GREENFIELD_TESTNET.spEndpoint}/download/my-bucket/courses/01.md`,
    );
  });

  it('maps a 404 on read to a NOT_FOUND error', async () => {
    transport.mockResolvedValueOnce({ status: 404, headers: {}, body: '' });
    await expect(
      client.readObject('my-bucket', 'missing.md'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('7b. owner derived from the signer backend', () => {
  const transport = () =>
    mockTransport(async () => ({ status: 200, headers: {}, body: '' }));

  function signerBackend() {
    return {
      resolveOwner: vi.fn(async () => OWNER),
      createBucket: vi.fn(async () => ({ bucketName: 'b', txHash: '0xb' })),
      putObject: vi.fn(async () => ({
        bucketName: 'b',
        objectKey: 'k',
        txHash: '0xo',
      })),
    };
  }

  it('uses the backend account when no owner is provided', async () => {
    const backend = signerBackend();
    const client = createGreenfieldClient({ transport: transport(), backend });
    await client.createBucket('my-bucket', { visibility: 'public' });
    expect(backend.resolveOwner).toHaveBeenCalled();
    expect(backend.createBucket).toHaveBeenCalledWith({
      bucketName: 'my-bucket',
      owner: OWNER,
      visibility: 'public',
    });
  });

  it('accepts an explicit owner that matches the signer account', async () => {
    const backend = signerBackend();
    const client = createGreenfieldClient({ transport: transport(), backend });
    await client.saveObject('my-bucket', 'a.md', 'x', { owner: OWNER });
    expect(backend.putObject).toHaveBeenCalled();
  });

  it('rejects an explicit owner that mismatches the signer (OWNER_MISMATCH)', async () => {
    const backend = signerBackend();
    const client = createGreenfieldClient({ transport: transport(), backend });
    await expect(
      client.createBucket('my-bucket', { owner: '0xDEADbeef' }),
    ).rejects.toMatchObject({ code: 'OWNER_MISMATCH' });
    expect(backend.createBucket).not.toHaveBeenCalled();
  });

  it('still requires an owner when the backend cannot resolve one', async () => {
    const backend = {
      createBucket: vi.fn(async () => ({ bucketName: 'b', txHash: '0xb' })),
      putObject: vi.fn(async () => ({ bucketName: 'b', objectKey: 'k', txHash: null })),
    };
    const client = createGreenfieldClient({ transport: transport(), backend });
    await expect(client.createBucket('my-bucket')).rejects.toMatchObject({
      code: 'NO_OWNER',
    });
    expect(backend.createBucket).not.toHaveBeenCalled();
  });
});

describe('8. Transport / network error mapping', () => {
  it('maps a thrown transport error to NETWORK_ERROR', async () => {
    const transport = mockTransport(async () => {
      throw new Error('failed to fetch');
    });
    const client = createGreenfieldClient({ transport, owner: OWNER });
    await expect(client.listBuckets()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });

  it('maps a 5xx from the SP to SP_UNAVAILABLE', async () => {
    const transport = mockTransport(async () => ({
      status: 503,
      headers: {},
      body: 'unavailable',
    }));
    const client = createGreenfieldClient({ transport, owner: OWNER });
    await expect(client.listBuckets()).rejects.toMatchObject({
      code: 'SP_UNAVAILABLE',
    });
  });

  it('requires an owner address for owner-scoped operations', async () => {
    const transport = mockTransport(async () => ({ status: 200, headers: {}, body: '{}' }));
    const client = createGreenfieldClient({ transport });
    await expect(client.listBuckets()).rejects.toMatchObject({
      code: 'NO_OWNER',
    });
  });
});
