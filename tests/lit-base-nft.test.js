/**
 * Local Base NFT Gated DRM — in-process integration test.
 *
 * Runs two in-process HTTP mock servers:
 *   1. Chipotle mock REST server (gating decrypt request)
 *   2. Base Network JSON-RPC mock provider (answering `balanceOf` query)
 *
 * This allows testing the full Lit NFT-gating logic locally, without needing
 * external networks, real mainnet NFT holdings, or heavy Docker setups.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { webcrypto } from 'node:crypto';
import http from 'node:http';
import { createChipotleClient } from '../smartcontracts/buckets/lit-sdk-chipotle.js';
import { createLitAccess } from '../smartcontracts/buckets/lit-access.js';

// ── Test fixtures ────────────────────────────────────────────────────────────

const ALLOWED_NFT_HOLDER = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // Vitalik's address
const INTRUDER           = '0x0000000000000000000000000000000000000001';
const NFT_CONTRACT       = '0xa5b123456789abcdef0123456789abcdef012345';

// Access Control Condition for NFT ownership on Base
const BASE_NFT_ACC = [
  {
    contractAddress: NFT_CONTRACT,
    standardContractType: 'ERC721',
    chain: 'base',
    method: 'balanceOf',
    parameters: [':userAddress'],
    returnValueTest: { comparator: '>=', value: '1' },
  },
];

// ── Fixed cryptographic PKP key (AES) ───────────────────────────────────────
const TEST_PKP_BYTES = Buffer.from('cd'.repeat(32), 'hex');
const TEST_PKP_ID    = '0xMockBaseNftPKP';

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

// ── JSON helpers ─────────────────────────────────────────────────────────────

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

// ── In-process Mock RPC Provider ─────────────────────────────────────────────

let rpcServer;
let rpcUrl;

// ── In-process Chipotle Mock Server ──────────────────────────────────────────

let chipotleServer;
let chipotleUrl;

beforeAll(async () => {
  // 1. Start Simulated Base RPC Server
  rpcServer = http.createServer(async (req, res) => {
    const body = await readJson(req);

    if (body.method === 'eth_chainId') {
      return sendJson(res, 200, { jsonrpc: '2.0', id: body.id, result: '0x2105' }); // Base: 8453 (0x2105)
    }

    if (body.method === 'eth_call') {
      const callData = body.params[0]?.data ?? '';
      // balanceOf selector is 0x70a08231
      if (callData.startsWith('0x70a08231')) {
        // Extract the padded address parameter (last 40 hex chars of 64 hex block)
        const userAddress = '0x' + callData.slice(callData.length - 40).toLowerCase();
        
        if (userAddress === ALLOWED_NFT_HOLDER.toLowerCase()) {
          // Return balance of 1 (0x0000000000000000000000000000000000000000000000000000000000000001)
          const result = '0x' + '1'.padStart(64, '0');
          return sendJson(res, 200, { jsonrpc: '2.0', id: body.id, result });
        } else {
          // Return balance of 0
          const result = '0x' + '0'.padStart(64, '0');
          return sendJson(res, 200, { jsonrpc: '2.0', id: body.id, result });
        }
      }
    }

    // Default response for blockNumber, gasPrice, etc.
    sendJson(res, 200, { jsonrpc: '2.0', id: body.id, result: '0x0' });
  });

  await new Promise(resolve => rpcServer.listen(0, '127.0.0.1', resolve));
  const rpcPort = rpcServer.address().port;
  rpcUrl = `http://127.0.0.1:${rpcPort}`;
  process.env.ANVIL_RPC = rpcUrl;

  // 2. Start Chipotle Mock Server
  chipotleServer = http.createServer(async (req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0];

    if (req.method === 'GET' && urlPath === '/core/v1/version') {
      return sendJson(res, 200, { name: 'chipotle-test', mode: 'test', pkp: TEST_PKP_ID });
    }

    if (req.method === 'GET' && urlPath === '/core/v1/create_wallet') {
      return sendJson(res, 200, { wallet_address: TEST_PKP_ID });
    }

    if (req.method === 'POST' && urlPath === '/core/v1/lit_action') {
      const body = await readJson(req);
      const jsParams = body.js_params ?? {};
      const { action } = jsParams;

      try {
        if (action === 'encrypt') {
          const result = await serverEncrypt(jsParams.masterKey);
          return sendJson(res, 200, { response: result, logs: '', has_error: false });
        }

        if (action === 'decrypt') {
          const { ciphertext, userAddress } = jsParams;
          // In real TEE execution, this is done on-chain or inside the action.
          // But our client adapter simulates the check dynamically using ethers,
          // so this server-side mockup just decrypts when requested.
          return sendJson(res, 200, { response: { decrypted: await serverDecrypt(ciphertext) }, logs: '', has_error: false });
        }

        throw new Error(`Unknown action "${action}"`);
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

  await new Promise(resolve => chipotleServer.listen(0, '127.0.0.1', resolve));
  const chipotlePort = chipotleServer.address().port;
  chipotleUrl = `http://127.0.0.1:${chipotlePort}`;
});

afterAll(() => {
  rpcServer?.close();
  chipotleServer?.close();
  delete process.env.ANVIL_RPC;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Base NFT-Gated DRM access verification', () => {
  it('allows access and recovers the key for an NFT holder on Base chain', async () => {
    const client = createChipotleClient({ chipotleUrl, pkpId: TEST_PKP_ID });
    const { encryptMasterKey, decryptMasterKey } = createLitAccess({ litClient: client, chain: 'base' });

    const MASTER_SECRET = 'super-secret-course-master-key';
    
    // Encrypt master key under the Base NFT ACC
    const envelope = await encryptMasterKey(MASTER_SECRET, BASE_NFT_ACC);

    expect(envelope.schema).toBe('daskibo.lit.acc/1');
    expect(envelope.chain).toBe('base');
    expect(envelope.accessControlConditions[0].standardContractType).toBe('ERC721');

    // Decrypt as the allowed NFT holder -> Should succeed
    const recovered = await decryptMasterKey(envelope, { userAddress: ALLOWED_NFT_HOLDER });
    expect(recovered).toBe(MASTER_SECRET);
  });

  it('blocks access and throws ACCESS_DENIED for non-NFT holders', async () => {
    const client = createChipotleClient({ chipotleUrl, pkpId: TEST_PKP_ID });
    const { encryptMasterKey, decryptMasterKey } = createLitAccess({ litClient: client, chain: 'base' });

    const MASTER_SECRET = 'super-secret-course-master-key';
    const envelope = await encryptMasterKey(MASTER_SECRET, BASE_NFT_ACC);

    // Decrypt as intruder (returns balance of 0) -> Should fail
    let error;
    try {
      await decryptMasterKey(envelope, { userAddress: INTRUDER });
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.code).toBe('ACCESS_DENIED');
    expect(error.message).toContain('Access denied');
  });
});
