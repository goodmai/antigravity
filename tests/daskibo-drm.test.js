import { describe, it, expect, vi } from 'vitest';
import { createDaskiboDRM } from '../smartcontracts/buckets/daskibo-drm.js';
import { tokenBalanceAcc } from '../smartcontracts/buckets/lit-acc.js';

// Fake LitClient: encrypt wraps the master; decrypt returns it only when the
// (test) authContext is authorized — so we exercise the ACCESS_DENIED path too.
function fakeLit() {
  return {
    encrypt: vi.fn(async ({ accessControlConditions, dataToEncrypt }) => ({
      ciphertext: `ct:${dataToEncrypt.length}`,
      dataToEncryptHash: 'hash',
      _acc: accessControlConditions,
    })),
    decrypt: vi.fn(async (_env, authContext) => {
      if (!authContext || !authContext.ok) throw new Error('not authorized');
      return 'MASTER_KEY_B64';
    }),
  };
}

// Fake Greenfield client backed by an in-memory store.
function fakeClient() {
  const store = new Map();
  return {
    store,
    createBucket: vi.fn(async (name) => {
      if (!store.has(name)) store.set(name, new Map());
      return { bucketName: name, txHash: null };
    }),
    saveObject: vi.fn(async (bucket, key, body) => {
      if (!store.has(bucket)) store.set(bucket, new Map());
      store.get(bucket).set(key, body);
      return { bucketName: bucket, objectKey: key, txHash: null };
    }),
    readObject: vi.fn(async (bucket, key) => store.get(bucket)?.get(key)),
  };
}

const spec = {
  slug: 'daskibo-test',
  title: 'Test course',
  litNetwork: 'chipotle',
  lessons: [
    { key: 'lessons/01/intro.md', title: 'L1', contentType: 'text/markdown', body: 'secret lesson body' },
  ],
};
const acc = tokenBalanceAcc({ contractAddress: '0xabc0000000000000000000000000000000000001', chain: 'bscTestnet', min: '1' });

describe('DaskiboDRM facade (G-01)', () => {
  it('requires both a Greenfield client and a Lit client', () => {
    expect(() => createDaskiboDRM({ litClient: fakeLit() })).toThrow(/Greenfield client/);
    expect(() => createDaskiboDRM({ client: fakeClient() })).toThrow(/Lit client/);
  });

  it('publishCourse: encrypts under ACC, creates bucket, uploads objects, returns manifest URL', async () => {
    const client = fakeClient();
    const litClient = fakeLit();
    const drm = createDaskiboDRM({ client, litClient, owner: '0xowner', spUrl: 'https://sp.example/' });

    const res = await drm.publishCourse({ spec, accessControlConditions: acc });

    expect(client.createBucket).toHaveBeenCalledOnce();
    expect(client.saveObject).toHaveBeenCalled();
    expect(litClient.encrypt).toHaveBeenCalledOnce(); // master key Lit-wrapped exactly once
    expect(res.manifest.lit).toBeTruthy();
    expect(res.manifest.lit.ciphertext).toMatch(/^ct:/);
    expect(res.manifestUrl).toBe(`https://sp.example/${res.bucketName}/_lit/manifest.json`);
    expect(res.savedKeys).toContain('_lit/manifest.json');

    // The stored manifest carries the Lit envelope; no object stores the raw master.
    const stored = client.store.get(res.bucketName);
    const manifestBody = stored.get('_lit/manifest.json');
    expect(JSON.parse(manifestBody).lit.ciphertext).toMatch(/^ct:/);
    for (const [, body] of stored) {
      expect(String(body)).not.toContain('MASTER_KEY_B64');
    }
  });

  it('publishCourse rejects an empty ACC', async () => {
    const drm = createDaskiboDRM({ client: fakeClient(), litClient: fakeLit() });
    await expect(drm.publishCourse({ spec, accessControlConditions: [] })).rejects.toThrow();
  });

  it('getCourseKey: returns the master when ACC satisfied, ACCESS_DENIED otherwise', async () => {
    const client = fakeClient();
    const drm = createDaskiboDRM({ client, litClient: fakeLit(), owner: '0xowner' });
    const { bucketName } = await drm.publishCourse({ spec, accessControlConditions: acc });

    await expect(
      drm.getCourseKey({ bucket: bucketName, authContext: { ok: false } }),
    ).rejects.toMatchObject({ code: 'ACCESS_DENIED' });

    const key = await drm.getCourseKey({ bucket: bucketName, authContext: { ok: true } });
    expect(key).toBe('MASTER_KEY_B64');
  });
});
