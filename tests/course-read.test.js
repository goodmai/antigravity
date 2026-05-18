/**
 * Daskibo Academy — Lit-protected course reader (TDD)
 *
 * Completes the round-trip: recover the Lit-guarded AES master from the
 * manifest (only if the reader satisfies the ACC), then AES-decrypt a
 * stored `.enc` object. Pure orchestration + a thin IO wrapper over a
 * greenfield-core read client.
 */

import { describe, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  recoverCourseMasterKey,
  decryptCourseObject,
  openCourseObject,
} from '../smartcontracts/buckets/course-read.js';
import {
  createBucketMasterKey,
  encryptObject,
} from '../smartcontracts/buckets/crypto-envelope.js';

const ACC = [{ chain: 'ethereum', returnValueTest: { comparator: '=', value: '0xR' } }];

function manifestWithLit() {
  return {
    schema: 'daskibo.lit.manifest/1',
    bucket: 'course-01',
    lit: {
      schema: 'daskibo.lit.acc/1',
      chain: 'ethereum',
      accessControlConditions: ACC,
      ciphertext: 'OPAQUE',
      dataToEncryptHash: 'H',
    },
  };
}

describe('recoverCourseMasterKey', () => {
  it('recovers the master via Lit when the manifest is protected', async () => {
    const access = {
      decryptMasterKey: vi.fn(async () => 'THE_MASTER'),
    };
    const m = await recoverCourseMasterKey(manifestWithLit(), {
      access,
      authContext: { sessionSigs: {} },
    });
    expect(m).toBe('THE_MASTER');
    expect(access.decryptMasterKey).toHaveBeenCalledWith(
      expect.objectContaining({ schema: 'daskibo.lit.acc/1' }),
      { sessionSigs: {} },
    );
  });

  it('throws NO_LIT when the manifest has no lit block', async () => {
    await expect(
      recoverCourseMasterKey(
        { schema: 'daskibo.lit.manifest/1' },
        { access: { decryptMasterKey: vi.fn() } },
      ),
    ).rejects.toMatchObject({ code: 'NO_LIT' });
  });

  it('propagates ACCESS_DENIED from Lit', async () => {
    const access = {
      decryptMasterKey: vi.fn(async () => {
        throw Object.assign(new Error('nope'), { code: 'ACCESS_DENIED' });
      }),
    };
    await expect(
      recoverCourseMasterKey(manifestWithLit(), { access, authContext: {} }),
    ).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
});

describe('decryptCourseObject (real AES round-trip)', () => {
  it('decrypts a stored .enc envelope with the Lit-recovered master', async () => {
    const master = await createBucketMasterKey(webcrypto);
    const env = await encryptObject(
      master,
      '# Secret lesson',
      { contentType: 'text/markdown', originalKey: 'l1.md' },
      webcrypto,
    );
    const access = { decryptMasterKey: vi.fn(async () => master) };

    const out = await decryptCourseObject(
      manifestWithLit(),
      JSON.stringify(env),
      { access, authContext: {}, crypto: webcrypto },
    );
    expect(out.text).toBe('# Secret lesson');
  });

  it('surfaces DECRYPT_FAILED for a tampered envelope', async () => {
    const master = await createBucketMasterKey(webcrypto);
    const env = await encryptObject(master, 'hi', {}, webcrypto);
    const bad = { ...env, ciphertext: 'AAAA' };
    const access = { decryptMasterKey: vi.fn(async () => master) };
    await expect(
      decryptCourseObject(manifestWithLit(), JSON.stringify(bad), {
        access,
        authContext: {},
        crypto: webcrypto,
      }),
    ).rejects.toMatchObject({ code: 'DECRYPT_FAILED' });
  });

  it('rejects an unparseable object body', async () => {
    const access = { decryptMasterKey: vi.fn(async () => 'm') };
    await expect(
      decryptCourseObject(manifestWithLit(), 'not-json', {
        access,
        authContext: {},
        crypto: webcrypto,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ENVELOPE' });
  });
});

describe('openCourseObject (IO wrapper over a read client)', () => {
  it('reads manifest + .enc from the client, then decrypts', async () => {
    const master = await createBucketMasterKey(webcrypto);
    const env = await encryptObject(master, 'lesson body', {}, webcrypto);
    const manifest = manifestWithLit();
    const client = {
      readObject: vi.fn(async (bucket, key) =>
        key === '_lit/manifest.json'
          ? JSON.stringify(manifest)
          : JSON.stringify(env),
      ),
    };
    const access = { decryptMasterKey: vi.fn(async () => master) };

    const out = await openCourseObject({
      client,
      bucketName: 'course-01',
      objectKey: 'lessons/01/intro.md',
      lit: { access, authContext: { sessionSigs: {} } },
      crypto: webcrypto,
    });
    expect(out.text).toBe('lesson body');
    expect(client.readObject).toHaveBeenCalledWith('course-01', '_lit/manifest.json');
    expect(client.readObject).toHaveBeenCalledWith(
      'course-01',
      'lessons/01/intro.md.enc',
    );
  });
});
