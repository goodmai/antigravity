/**
 * Chipotle DRM — in-process integration test.
 *
 * Spins up a minimal Chipotle mock HTTP server on a random free port (no
 * Docker, no external network) then exercises the full DRM stack:
 *
 *   1. createChipotleClient.encrypt() → envelope with correct fields
 *   2. createChipotleClient.decrypt() → master key for allowed address
 *   3. Wrong address → ACCESS_DENIED code via createLitAccess / classify()
 *   4. encrypt + decrypt round-trip via createLitAccess envelope schema
 *
 * WebCrypto is provided explicitly from node:crypto (not the jsdom shim).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { webcrypto } from 'node:crypto';
import http from 'node:http';
import { createChipotleClient } from '../smartcontracts/buckets/lit-sdk-chipotle.js';
import { createLitAccess } from '../smartcontracts/buckets/lit-access.js';

// ── Test fixtures ────────────────────────────────────────────────────────────

const ALLOWED = '0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF';
const OTHER   = '0x0000000000000000000000000000000000000001';

const ACC = [
  {
    contractAddress: '',
    standardContractType: '',
    chain: 'ethereum',
    method: 'eth_getBalance',
    parameters: [':userAddress'],
    returnValueTest: { comparator: '>=', value: ALLOWED },
  },
];

// ── In-process Chipotle mock ─────────────────────────────────────────────────

// Fixed 32-byte test PKP key — deterministic across runs.
const TEST_PKP_BYTES = Buffer.from('ab'.repeat(32), 'hex');
const TEST_PKP_ID    = '0xMockPKPForTest';

function toB64(buf) { return Buffer.from(buf).toString('base64'); }
function fromB64(s)  { return Buffer.from(s, 'base64'); }

async function importKey(usage) {
  return webcrypto.subtle.importKey(
    'raw', TEST_PKP_BYTES, { name: 'AES-GCM' }, false, [usage],
  );
}

async function serverEncrypt(masterKey) {
  const key = await importKey('encrypt');
  const iv  = new Uint8Array(12);
  webcrypto.getRandomValues(iv);
  const enc = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(masterKey),
  );
  const hashBuf = await webcrypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(masterKey),
  );
  return {
    ciphertext: toB64(iv) + ':' + toB64(enc),
    dataToEncryptHash: Buffer.from(hashBuf).toString('hex'),
    pkpId: TEST_PKP_ID,
  };
}

async function serverDecrypt(ciphertext) {
  const [ivB64, ctB64] = ciphertext.split(':');
  const key = await importKey('decrypt');
  const plain = await webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(ivB64) }, key, fromB64(ctB64),
  );
  return new TextDecoder().decode(plain);
}

async function handleLitAction(jsParams) {
  const { action } = jsParams;

  if (action === 'encrypt') {
    if (!jsParams.masterKey) throw new Error('js_params.masterKey required');
    return serverEncrypt(jsParams.masterKey);
  }

  if (action === 'decrypt') {
    const { ciphertext, accessControlConditions, userAddress } = jsParams;
    if (!ciphertext)  throw new Error('js_params.ciphertext required');
    if (!userAddress) throw new Error('js_params.userAddress required');

    const conditions = (accessControlConditions || []).filter(c => !c.operator);
    const ok = conditions.some(
      c => c.returnValueTest?.value?.toLowerCase() === userAddress.toLowerCase(),
    );
    if (!ok) {
      throw new Error(
        `Address ${userAddress} is not in the access control conditions`,
      );
    }
    return { decrypted: await serverDecrypt(ciphertext) };
  }

  throw new Error(`Unknown action "${action}"`);
}

function readJson(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch { resolve({}); }
    });
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(obj));
}

// ── Server lifecycle ─────────────────────────────────────────────────────────

let mockServer;
let chipotleUrl;

beforeAll(async () => {
  mockServer = http.createServer(async (req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0];

    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
      res.end();
      return;
    }

    if (req.method === 'GET' && urlPath === '/core/v1/version') {
      return sendJson(res, 200, { name: 'chipotle-test', mode: 'test', pkp: TEST_PKP_ID });
    }

    if (req.method === 'GET' && urlPath === '/core/v1/create_wallet') {
      return sendJson(res, 200, { wallet_address: TEST_PKP_ID });
    }

    if (req.method === 'POST' && urlPath === '/core/v1/lit_action') {
      const body = await readJson(req);
      try {
        const result = await handleLitAction(body.js_params ?? {});
        return sendJson(res, 200, { response: result, logs: '', has_error: false });
      } catch (err) {
        return sendJson(res, 200, {
          response: null,
          logs: err.message,
          has_error: true,
          error: err.message,
        });
      }
    }

    sendJson(res, 404, { error: 'not found' });
  });

  await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const { port } = mockServer.address();
  chipotleUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  mockServer?.close();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Chipotle DRM — encrypt', () => {
  it('returns envelope with ciphertext, hash, and pkpId', async () => {
    const client = createChipotleClient({ chipotleUrl, pkpId: TEST_PKP_ID });
    const result = await client.encrypt({
      accessControlConditions: ACC,
      dataToEncrypt: 'my-master-key-32bytes-base64==',
    });
    expect(typeof result.ciphertext).toBe('string');
    expect(result.ciphertext).toMatch(/^[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/);
    expect(typeof result.dataToEncryptHash).toBe('string');
    expect(result.dataToEncryptHash).toHaveLength(64); // sha256 hex
    expect(result.pkpId).toBe(TEST_PKP_ID);
  });

  it('produces distinct ciphertext for same plaintext (random IV)', async () => {
    const client = createChipotleClient({ chipotleUrl });
    const a = await client.encrypt({ accessControlConditions: ACC, dataToEncrypt: 'same-key' });
    const b = await client.encrypt({ accessControlConditions: ACC, dataToEncrypt: 'same-key' });
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.dataToEncryptHash).toBe(b.dataToEncryptHash); // same plaintext → same hash
  });
});

describe('Chipotle DRM — decrypt', () => {
  it('recovers master key for the allowed address', async () => {
    const client = createChipotleClient({ chipotleUrl });
    const MASTER = 'secret-master-key-for-test';
    const enc = await client.encrypt({ accessControlConditions: ACC, dataToEncrypt: MASTER });
    const dec = await client.decrypt(
      { accessControlConditions: ACC, ciphertext: enc.ciphertext, dataToEncryptHash: enc.dataToEncryptHash, chain: 'ethereum' },
      { userAddress: ALLOWED },
    );
    expect(dec).toBe(MASTER);
  });

  it('throws for an address not in ACC', async () => {
    const client = createChipotleClient({ chipotleUrl });
    const enc = await client.encrypt({ accessControlConditions: ACC, dataToEncrypt: 'key' });
    await expect(
      client.decrypt(
        { accessControlConditions: ACC, ciphertext: enc.ciphertext, dataToEncryptHash: enc.dataToEncryptHash, chain: 'ethereum' },
        { userAddress: OTHER },
      ),
    ).rejects.toThrow();
  });
});

describe('Chipotle DRM — classify() via createLitAccess', () => {
  it('maps wrong-address error to ACCESS_DENIED code', async () => {
    const client = createChipotleClient({ chipotleUrl });
    const { encryptMasterKey, decryptMasterKey } = createLitAccess({ litClient: client });
    const envelope = await encryptMasterKey('test-master', ACC);

    let error;
    try {
      await decryptMasterKey(envelope, { userAddress: OTHER });
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.code).toBe('ACCESS_DENIED');
  });

  it('full encrypt + decrypt round-trip via createLitAccess', async () => {
    const client = createChipotleClient({ chipotleUrl });
    const { encryptMasterKey, decryptMasterKey } = createLitAccess({ litClient: client });

    const MASTER = 'round-trip-master-key';
    const envelope = await encryptMasterKey(MASTER, ACC);

    expect(envelope.schema).toBe('daskibo.lit.acc/1');
    expect(envelope.chain).toBe('ethereum');
    expect(Array.isArray(envelope.accessControlConditions)).toBe(true);

    const recovered = await decryptMasterKey(envelope, { userAddress: ALLOWED });
    expect(recovered).toBe(MASTER);
  });
});
