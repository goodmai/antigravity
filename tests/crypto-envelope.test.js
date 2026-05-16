/**
 * Daskibo Academy — efficient non-Lit bucket encryption (TDD)
 *
 * Envelope (hybrid) scheme used when Lit is NOT the gatekeeper:
 *   - bulk content  → AES-256-GCM with a random per-object data key (DEK)
 *   - DEK           → wrapped (AES-GCM key-wrap) by a bucket MASTER key
 *   - master key    → optionally wrapped by a PBKDF2 passphrase KEK
 *
 * Efficient: only the 32-byte DEK is ever asymmetrically/KDF-protected;
 * bulk data uses fast symmetric AEAD. One master key covers a whole
 * bucket; rotating it crypto-shreds every object at once.
 *
 * WebCrypto is injected (node:crypto) so the suite is deterministic
 * regardless of the jsdom global.
 */

import { describe, it, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  createBucketMasterKey,
  encryptObject,
  decryptObject,
  wrapMasterWithPassphrase,
  unwrapMasterWithPassphrase,
} from '../smartcontracts/buckets/crypto-envelope.js';

const C = webcrypto;

describe('1. Bucket master key', () => {
  it('generates a 256-bit base64 key, unique each call', async () => {
    const a = await createBucketMasterKey(C);
    const b = await createBucketMasterKey(C);
    expect(typeof a).toBe('string');
    expect(Buffer.from(a, 'base64').length).toBe(32);
    expect(a).not.toBe(b);
  });
});

describe('2. Object encrypt / decrypt round-trip', () => {
  it('round-trips a UTF-8 string', async () => {
    const m = await createBucketMasterKey(C);
    const env = await encryptObject(
      m,
      '# Course 01 — secret',
      { contentType: 'text/markdown', originalKey: 'c01.md' },
      C,
    );
    expect(env.schema).toBe('daskibo.cryptobox.envelope/1');
    expect(env.alg).toBe('AES-256-GCM');
    expect(env.meta).toMatchObject({
      contentType: 'text/markdown',
      originalKey: 'c01.md',
    });
    const out = await decryptObject(m, env, C);
    expect(out.text).toBe('# Course 01 — secret');
    expect(out.meta.contentType).toBe('text/markdown');
  });

  it('round-trips binary data (Uint8Array)', async () => {
    const m = await createBucketMasterKey(C);
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 13, 10]);
    const env = await encryptObject(m, bytes, {}, C);
    const out = await decryptObject(m, env, C);
    expect(Array.from(out.bytes)).toEqual(Array.from(bytes));
  });

  it('uses a fresh DEK + IV per object (ciphertexts differ)', async () => {
    const m = await createBucketMasterKey(C);
    const e1 = await encryptObject(m, 'same', {}, C);
    const e2 = await encryptObject(m, 'same', {}, C);
    expect(e1.ciphertext).not.toBe(e2.ciphertext);
    expect(e1.iv).not.toBe(e2.iv);
    expect(e1.wrappedDek).not.toBe(e2.wrappedDek);
  });
});

describe('3. Integrity & key separation', () => {
  it('a tampered ciphertext fails AEAD auth', async () => {
    const m = await createBucketMasterKey(C);
    const env = await encryptObject(m, 'top secret', {}, C);
    const buf = Buffer.from(env.ciphertext, 'base64');
    buf[0] ^= 0xff;
    const tampered = { ...env, ciphertext: buf.toString('base64') };
    await expect(decryptObject(m, tampered, C)).rejects.toMatchObject({
      code: 'DECRYPT_FAILED',
    });
  });

  it('the wrong master key cannot unwrap the DEK', async () => {
    const m1 = await createBucketMasterKey(C);
    const m2 = await createBucketMasterKey(C);
    const env = await encryptObject(m1, 'secret', {}, C);
    await expect(decryptObject(m2, env, C)).rejects.toMatchObject({
      code: 'DECRYPT_FAILED',
    });
  });

  it('rejects malformed input', async () => {
    await expect(encryptObject('not-base64-32', 'x', {}, C)).rejects.toMatchObject(
      { code: 'INVALID_KEY' },
    );
  });
});

describe('4. Passphrase-wrapped master (portable, no Lit)', () => {
  it('wraps and unwraps the master via PBKDF2', async () => {
    const m = await createBucketMasterKey(C);
    const wrapped = await wrapMasterWithPassphrase(m, 'correct horse', {}, C);
    expect(wrapped.schema).toBe('daskibo.cryptobox.wrap/1');
    expect(wrapped.kdf).toBe('PBKDF2-SHA256');
    expect(wrapped.iterations).toBeGreaterThanOrEqual(100000);
    const back = await unwrapMasterWithPassphrase(wrapped, 'correct horse', C);
    expect(back).toBe(m);
  });

  it('a wrong passphrase fails to unwrap', async () => {
    const m = await createBucketMasterKey(C);
    const wrapped = await wrapMasterWithPassphrase(m, 'right', {}, C);
    await expect(
      unwrapMasterWithPassphrase(wrapped, 'wrong', C),
    ).rejects.toMatchObject({ code: 'DECRYPT_FAILED' });
  });

  it('end-to-end: passphrase → master → object round-trip', async () => {
    const m = await createBucketMasterKey(C);
    const wrapped = await wrapMasterWithPassphrase(m, 'pw', {}, C);
    const env = await encryptObject(m, 'lesson body', {}, C);

    const recovered = await unwrapMasterWithPassphrase(wrapped, 'pw', C);
    const out = await decryptObject(recovered, env, C);
    expect(out.text).toBe('lesson body');
  });
});
