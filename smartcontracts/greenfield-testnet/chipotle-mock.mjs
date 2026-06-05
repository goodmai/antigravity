/**
 * Local Chipotle mock server for Flow C testing.
 *
 * Provides the same REST API shape as api.chipotle.litprotocol.com but
 * runs locally using Node.js crypto instead of a real TEE + blockchain.
 * Suitable for end-to-end DRM testing without paying for credits or
 * fighting port-7470 firewalls.
 *
 * API surface implemented:
 *   GET  /core/v1/version        — server info
 *   POST /core/v1/new_account    — returns mock api_key + wallet_address
 *   GET  /core/v1/create_wallet  — returns PKP wallet address
 *   POST /core/v1/lit_action     — executes encrypt/decrypt action
 *
 * lit_action dispatch (via js_params.action):
 *   { action: 'encrypt', masterKey, accessControlConditions }
 *     → { ciphertext, dataToEncryptHash, pkpId }
 *   { action: 'decrypt', ciphertext, accessControlConditions, userAddress, signedProof? }
 *     → { decrypted }
 *
 * NOTE: signedProof is OPTIONAL in mock mode. When present, the mock
 * verifies the Ethereum signature (ecrecover) to match userAddress. When
 * absent, only the ACC address check is enforced. Real Chipotle TEE
 * always requires a valid signature — this relaxation is intentional for
 * dev/test convenience (no MetaMask needed in Node.js test harnesses).
 *
 * Usage:
 *   export CHIPOTLE_PKP_KEY=0x...   # optional; generated if missing
 *   node chipotle-mock.mjs
 *
 * The mock logs the PKP key on first run so you can set CHIPOTLE_PKP_KEY to
 * reuse the same key across restarts (keeps existing encrypted manifests decryptable).
 */

import http from 'node:http';
import { createRequire } from 'node:module';
import { evaluateAcc, makeFetchEthCall } from '../buckets/lit-acc-eval.js';

const _require = createRequire(import.meta.url);
const ethers = _require('ethers');

const PORT = Number(process.env.CHIPOTLE_PORT ?? 8000);

// ── PKP key setup ──────────────────────────────────────────────────────────
let PKP_PRIVATE_KEY = process.env.CHIPOTLE_PKP_KEY;
if (!PKP_PRIVATE_KEY) {
  // Node.js 24 global crypto
  const rand = new Uint8Array(32);
  crypto.getRandomValues(rand);
  PKP_PRIVATE_KEY = '0x' + Buffer.from(rand).toString('hex');
  console.log('┌─ Generated new PKP key (not persisted across restarts)');
  console.log(`│  Set CHIPOTLE_PKP_KEY=${PKP_PRIVATE_KEY}`);
  console.log('│  to reuse across restarts (needed if manifests are already published).');
  console.log('└─────────────────────────────────────────────────────────────────');
}

const pkpWallet = new ethers.Wallet(PKP_PRIVATE_KEY);
const PKP_ADDRESS = pkpWallet.address;

// 32-byte AES key derived from PKP private key
const PKP_KEY_BYTES = Buffer.from(PKP_PRIVATE_KEY.slice(2), 'hex');

console.log(`PKP address: ${PKP_ADDRESS}`);

// ── Crypto helpers (node:crypto.subtle, globally available in Node 22+) ───

async function importAesKey(usage) {
  return crypto.subtle.importKey(
    'raw', PKP_KEY_BYTES,
    { name: 'AES-GCM' }, false, [usage],
  );
}

function toB64(buf) {
  return Buffer.from(buf).toString('base64');
}
function fromB64(s) {
  return Buffer.from(s, 'base64');
}

async function encryptMasterKey(masterKey) {
  const key = await importAesKey('encrypt');
  const iv  = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const enc = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key,
    new TextEncoder().encode(masterKey),
  );
  const hashBuf = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(masterKey),
  );
  return {
    ciphertext: toB64(iv) + ':' + toB64(enc),
    dataToEncryptHash: Buffer.from(hashBuf).toString('hex'),
    pkpId: PKP_ADDRESS,
  };
}

async function decryptMasterKey(ciphertext) {
  const [ivB64, ctB64] = ciphertext.split(':');
  if (!ivB64 || !ctB64) throw new Error('Invalid ciphertext format (expected "ivB64:ctB64")');
  const key = await importAesKey('decrypt');
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(ivB64) }, key, fromB64(ctB64),
  );
  return new TextDecoder().decode(plain);
}

// ── Access-control evaluation ─────────────────────────────────────────────────
// Delegated to the canonical evaluator (buckets/lit-acc-eval.js) — the SAME
// two-pass logic used by the real-Chipotle adapter and the browser readers, so
// the mock can never diverge from production enforcement again.

// ── lit_action handler ──────────────────────────────────────────────────────

async function handleLitAction({ js_params = {} }) {
  const { action } = js_params;

  if (action === 'encrypt') {
    const { masterKey, accessControlConditions } = js_params;
    if (!masterKey) throw new Error('js_params.masterKey required for encrypt action');
    return await encryptMasterKey(masterKey);
  }

  // ── wrap_for_buyer: re-encrypt vault MK under buyer's address ─────────────
  // Anti-drain: reads wrapNonce[buyer][courseId] on-chain before spending any
  // crypto. If nonce is zero (already consumed) or encryptedKey already set →
  // refuses without touching the PKP key.
  if (action === 'wrap_for_buyer') {
    const { buyer, courseId, nonce, vaultCiphertext, accessPassAddress, signedProof } = js_params;
    if (!buyer)           throw new Error('js_params.buyer required');
    if (!vaultCiphertext) throw new Error('js_params.vaultCiphertext required');

    // 1. Verify buyer's MetaMask signature (prevents drain from other addresses)
    if (signedProof) {
      const { message, signature } = signedProof;
      const recovered = ethers.utils.verifyMessage(message, signature);
      if (recovered.toLowerCase() !== buyer.toLowerCase()) {
        throw new Error(`wrap_for_buyer: signature mismatch — recovered ${recovered}, expected ${buyer}`);
      }
    }

    // 2. On-chain guards: wrapNonce must be non-zero; encryptedKey must be empty.
    //    Also read expiryOf so we can embed it in the buyer ACC (step 3).
    let expiryTs = 0;
    if (accessPassAddress) {
      const rpc = process.env.ANVIL_RPC || process.env.BSC_TESTNET_RPC || 'http://127.0.0.1:8545';
      const provider = new ethers.providers.JsonRpcProvider(rpc);
      const apAbi = [
        'function wrapNonce(address,uint256) view returns (uint256)',
        'function encryptedKey(uint256) view returns (bytes)',
        'function tokenIdOf(address,uint256) view returns (uint256)',
        'function expiryOf(address,uint256) view returns (uint64)',
      ];
      const ap = new ethers.Contract(accessPassAddress, apAbi, provider);

      const onchainNonce = await ap.wrapNonce(buyer, courseId);
      if (onchainNonce.isZero()) {
        throw new Error('wrap_for_buyer: wrapNonce is zero — already wrapped or not purchased');
      }
      if (nonce !== undefined && !onchainNonce.eq(ethers.BigNumber.from(String(nonce)))) {
        throw new Error(`wrap_for_buyer: nonce mismatch — on-chain ${onchainNonce}, provided ${nonce}`);
      }

      const tokenId = await ap.tokenIdOf(buyer, courseId);
      if (!tokenId.isZero()) {
        const storedKey = await ap.encryptedKey(tokenId);
        if (storedKey && storedKey !== '0x') {
          throw new Error('wrap_for_buyer: already_wrapped — encryptedKey already set for this token');
        }
      }

      expiryTs = (await ap.expiryOf(buyer, courseId)).toNumber(); // 0 = perpetual
    }

    // Build buyer ACC: address-bound + optional expiry timestamp (AND-combined).
    // This ACC is embedded in the returned ciphertext metadata so that Chipotle
    // enforces BOTH conditions on every subsequent decrypt call.
    const buyerAcc = [
      {
        contractAddress: '',
        standardContractType: '',
        chain: 'bscTestnet',
        method: '',
        parameters: [':userAddress'],
        returnValueTest: { comparator: '=', value: buyer },
      },
    ];
    if (expiryTs > 0) {
      buyerAcc.push({ operator: 'and' });
      buyerAcc.push({
        contractAddress: '',
        standardContractType: 'timestamp',
        chain: 'bscTestnet',
        method: 'eth_getBlockByNumber',
        parameters: ['latest'],
        returnValueTest: { comparator: '<=', value: String(expiryTs) },
      });
    }

    // 3. Decrypt vault → MK, then re-encrypt bound to buyer address
    const mk = await decryptMasterKey(vaultCiphertext);
    const wrapped = await encryptMasterKey(mk);

    console.log(`[wrap_for_buyer] wrapped MK for ${buyer} (courseId=${courseId}, expiry=${expiryTs || 'perpetual'})`);
    return {
      ciphertext:        wrapped.ciphertext,
      dataToEncryptHash: wrapped.dataToEncryptHash,
      acc:               buyerAcc,
      buyer,
      courseId:          String(courseId),
      expiryTs,
    };
  }

  if (action === 'decrypt') {
    const { ciphertext, accessControlConditions, userAddress, signedProof } = js_params;
    if (!ciphertext)   throw new Error('js_params.ciphertext required for decrypt action');
    if (!userAddress)  throw new Error('js_params.userAddress required for decrypt action');

    // Verify Ethereum signature if provided
    if (signedProof) {
      const { message, signature } = signedProof;
      const recovered = ethers.utils.verifyMessage(message, signature);
      if (recovered.toLowerCase() !== userAddress.toLowerCase()) {
        throw new Error(
          `Signature mismatch — recovered ${recovered}, expected ${userAddress}`,
        );
      }
    }

    // Check ACC — supports both an address allowlist (returnValueTest.value is
    // the user's address) AND contract conditions (NFT balanceOf /
    // CourseMarketplace.hasCourseAccess) evaluated on-chain. The latter is what
    // makes key release genuinely gated by NFT ownership.
    const rpc = process.env.EVM_RPC || process.env.ANVIL_RPC || 'http://127.0.0.1:8545';
    const verdict = await evaluateAcc({
      accessControlConditions,
      userAddress,
      ethCall: makeFetchEthCall(rpc),
    });
    if (!verdict.ok) {
      throw new Error(`Access denied: ${userAddress} — ${verdict.reason}`);
    }

    const decrypted = await decryptMasterKey(ciphertext);
    return { decrypted };
  }

  throw new Error(
    `Unknown action "${action}". Set js_params.action to "encrypt" or "decrypt".`,
  );
}

// ── HTTP server ─────────────────────────────────────────────────────────────

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key, Authorization');
}

function sendJson(res, status, obj) {
  setCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

async function readJson(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const { method, url } = req;
  const path = (url ?? '/').split('?')[0];

  if (method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (path === '/core/v1/version' && method === 'GET') {
      return sendJson(res, 200, {
        name: 'chipotle-mock',
        version: '0.1.0',
        mode: 'local-test',
        pkp: PKP_ADDRESS,
      });
    }

    if (path === '/core/v1/new_account' && method === 'POST') {
      return sendJson(res, 200, {
        api_key: 'mock-api-key-' + Date.now(),
        wallet_address: PKP_ADDRESS,
      });
    }

    if (path === '/core/v1/create_wallet' && method === 'GET') {
      return sendJson(res, 200, { wallet_address: PKP_ADDRESS });
    }

    if (path === '/core/v1/lit_action' && method === 'POST') {
      const body = await readJson(req);
      try {
        const result = await handleLitAction(body);
        console.log(`[lit_action] ${body.js_params?.action ?? '?'} OK`);
        return sendJson(res, 200, { response: result, logs: '', has_error: false });
      } catch (err) {
        console.error(`[lit_action] ${body.js_params?.action ?? '?'} ERR: ${err.message}`);
        return sendJson(res, 200, {
          response: null,
          logs: err.message,
          has_error: true,
          error: err.message,
        });
      }
    }

    sendJson(res, 404, { error: 'Not found', path });
  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌶  Chipotle mock server → http://localhost:${PORT}`);
  console.log('   POST /core/v1/lit_action  { js_params: { action:"encrypt"|"decrypt", ... } }');
  console.log('   GET  /core/v1/create_wallet');
  console.log('   GET  /core/v1/version\n');
});
