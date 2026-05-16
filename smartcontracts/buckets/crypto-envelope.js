/**
 * Daskibo Academy — efficient non-Lit bucket encryption (envelope scheme)
 *
 * Used when access is NOT delegated to the Lit network. Hybrid design:
 *
 *   plaintext --AES-256-GCM(DEK)--> ciphertext        (fast bulk AEAD)
 *   DEK       --AES-256-GCM(MASTER)--> wrappedDek      (32-byte key wrap)
 *   MASTER    --AES-GCM(PBKDF2(passphrase))--> wrapped (optional, portable)
 *
 * Why it is efficient:
 *   - Bulk data uses symmetric AEAD only (orders of magnitude faster than
 *     per-object asymmetric crypto).
 *   - Only the 32-byte DEK is ever key-wrapped.
 *   - ONE bucket master key covers every object; rotating/destroying it
 *     crypto-shreds the whole bucket in O(1) instead of re-touching each
 *     object.
 *
 * Pure & DOM-free. WebCrypto is injectable (`cryptoImpl`, default
 * `globalThis.crypto`) so it runs in the browser and is deterministic
 * under tests.
 */

const ENVELOPE_SCHEMA = 'daskibo.cryptobox.envelope/1';
const WRAP_SCHEMA = 'daskibo.cryptobox.wrap/1';
const DEFAULT_PBKDF2_ITERATIONS = 210000;

function cryptoError(message, code) {
  return Object.assign(new Error(message), { code });
}

function getCrypto(cryptoImpl) {
  const c = cryptoImpl || (typeof globalThis !== 'undefined' ? globalThis.crypto : undefined);
  if (!c || !c.subtle) {
    throw cryptoError('WebCrypto (crypto.subtle) is unavailable', 'NO_CRYPTO');
  }
  return c;
}

// ── base64 <-> bytes (no Buffer dependency in the browser) ────────────────

function b64encode(bytes) {
  let bin = '';
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  if (typeof btoa === 'function') return btoa(bin);
  return Buffer.from(u8).toString('base64');
}

function b64decode(str) {
  if (typeof atob === 'function') {
    const bin = atob(str);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  return new Uint8Array(Buffer.from(str, 'base64'));
}

const enc = new TextEncoder();
const dec = new TextDecoder();

// ── Keys ──────────────────────────────────────────────────────────────────

/** Random 256-bit bucket master key, returned base64. */
export async function createBucketMasterKey(cryptoImpl) {
  const c = getCrypto(cryptoImpl);
  const raw = c.getRandomValues(new Uint8Array(32));
  return b64encode(raw);
}

async function importAesKey(c, rawBytes, usages) {
  if (!(rawBytes instanceof Uint8Array) || rawBytes.length !== 32) {
    throw cryptoError('Key must be 32 raw bytes', 'INVALID_KEY');
  }
  return c.subtle.importKey('raw', rawBytes, { name: 'AES-GCM' }, false, usages);
}

function masterBytes(masterKeyB64) {
  let raw;
  try {
    raw = b64decode(masterKeyB64);
  } catch {
    throw cryptoError('Master key is not valid base64', 'INVALID_KEY');
  }
  if (raw.length !== 32) {
    throw cryptoError('Master key must decode to 32 bytes', 'INVALID_KEY');
  }
  return raw;
}

// ── Object encryption ─────────────────────────────────────────────────────

/**
 * Encrypt one object with a fresh DEK, wrapping the DEK under the bucket
 * master key.
 * @param {string} masterKeyB64
 * @param {string|Uint8Array} data
 * @param {{contentType?:string, originalKey?:string}} meta
 */
export async function encryptObject(masterKeyB64, data, meta = {}, cryptoImpl) {
  const c = getCrypto(cryptoImpl);
  const master = await importAesKey(c, masterBytes(masterKeyB64), [
    'encrypt',
    'decrypt',
  ]);

  const isBinary = data instanceof Uint8Array;
  const payload = isBinary ? data : enc.encode(String(data));

  // Per-object data key + IVs
  const dekRaw = c.getRandomValues(new Uint8Array(32));
  const dek = await importAesKey(c, dekRaw, ['encrypt', 'decrypt']);
  const iv = c.getRandomValues(new Uint8Array(12));
  const dekIv = c.getRandomValues(new Uint8Array(12));

  const ct = new Uint8Array(
    await c.subtle.encrypt({ name: 'AES-GCM', iv }, dek, payload),
  );
  const wrappedDek = new Uint8Array(
    await c.subtle.encrypt({ name: 'AES-GCM', iv: dekIv }, master, dekRaw),
  );

  return {
    schema: ENVELOPE_SCHEMA,
    alg: 'AES-256-GCM',
    iv: b64encode(iv),
    ciphertext: b64encode(ct),
    dekIv: b64encode(dekIv),
    wrappedDek: b64encode(wrappedDek),
    meta: {
      contentType: meta.contentType || 'application/octet-stream',
      originalKey: meta.originalKey,
      encoding: isBinary ? 'binary' : 'utf-8',
    },
  };
}

/** Decrypt an envelope produced by {@link encryptObject}. */
export async function decryptObject(masterKeyB64, env, cryptoImpl) {
  const c = getCrypto(cryptoImpl);
  if (!env || env.schema !== ENVELOPE_SCHEMA) {
    throw cryptoError('Unrecognized envelope schema', 'INVALID_ENVELOPE');
  }
  const master = await importAesKey(c, masterBytes(masterKeyB64), [
    'encrypt',
    'decrypt',
  ]);

  let bytes;
  try {
    const dekRaw = new Uint8Array(
      await c.subtle.decrypt(
        { name: 'AES-GCM', iv: b64decode(env.dekIv) },
        master,
        b64decode(env.wrappedDek),
      ),
    );
    const dek = await importAesKey(c, dekRaw, ['decrypt']);
    bytes = new Uint8Array(
      await c.subtle.decrypt(
        { name: 'AES-GCM', iv: b64decode(env.iv) },
        dek,
        b64decode(env.ciphertext),
      ),
    );
  } catch (err) {
    if (err?.code === 'INVALID_KEY') throw err;
    throw cryptoError(
      'Decryption failed (wrong key or tampered data)',
      'DECRYPT_FAILED',
    );
  }

  return {
    bytes,
    text: env.meta?.encoding === 'binary' ? undefined : dec.decode(bytes),
    meta: env.meta || {},
  };
}

// ── Optional passphrase wrapping of the master key ────────────────────────

async function deriveKek(c, passphrase, salt, iterations) {
  const base = await c.subtle.importKey(
    'raw',
    enc.encode(String(passphrase)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return c.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function wrapMasterWithPassphrase(
  masterKeyB64,
  passphrase,
  opts = {},
  cryptoImpl,
) {
  const c = getCrypto(cryptoImpl);
  const master = masterBytes(masterKeyB64);
  const iterations = opts.iterations || DEFAULT_PBKDF2_ITERATIONS;
  const salt = c.getRandomValues(new Uint8Array(16));
  const iv = c.getRandomValues(new Uint8Array(12));
  const kek = await deriveKek(c, passphrase, salt, iterations);
  const wrapped = new Uint8Array(
    await c.subtle.encrypt({ name: 'AES-GCM', iv }, kek, master),
  );
  return {
    schema: WRAP_SCHEMA,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: b64encode(salt),
    iv: b64encode(iv),
    wrapped: b64encode(wrapped),
  };
}

export async function unwrapMasterWithPassphrase(wrap, passphrase, cryptoImpl) {
  const c = getCrypto(cryptoImpl);
  if (!wrap || wrap.schema !== WRAP_SCHEMA) {
    throw cryptoError('Unrecognized wrap schema', 'INVALID_ENVELOPE');
  }
  try {
    const kek = await deriveKek(
      c,
      passphrase,
      b64decode(wrap.salt),
      wrap.iterations,
    );
    const master = new Uint8Array(
      await c.subtle.decrypt(
        { name: 'AES-GCM', iv: b64decode(wrap.iv) },
        kek,
        b64decode(wrap.wrapped),
      ),
    );
    return b64encode(master);
  } catch {
    throw cryptoError(
      'Master unwrap failed (wrong passphrase or tampered wrap)',
      'DECRYPT_FAILED',
    );
  }
}
