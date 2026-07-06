/**
 * Backend integration test for the shared publish pipeline (prod/testnets
 * profiles): Chipotle encrypt → Pinata IPFS mirror → Greenfield (SP) upload →
 * manifest round-trip. Everything runs in-process / as local child processes:
 *
 *   - Chipotle  : inline HTTP mock (version / create_wallet / lit_action)
 *   - Pinata    : inline HTTP mock of the v3 upload endpoint (deterministic CIDs)
 *   - SP        : the real integration/mock-sp.mjs spawned as a child
 *   - GF chain  : SP-emulation backend (no cosmos tx — SP HTTP writes only)
 *
 * This is the same wiring the `testnets`/`prod` compose writers use, minus
 * real funds — it proves the pipeline logic (encryption, CID mirror embedding,
 * upload, verification), not the external services.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolvePublishEnv, runPublish } from '../smartcontracts/greenfield-testnet/publish-course-run.mjs';
import { loadCourse } from '../smartcontracts/greenfield-testnet/course-loader.mjs';
import { createSpEmulationBackend } from '../smartcontracts/integration/sp-emulation-backend.js';

const PKP = '0x1234567890abcdef1234567890abcdef12345678';

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

/** Minimal Chipotle mock: encrypt-only lit_action, fixed PKP. */
function makeChipotleMock() {
  return http.createServer(async (req, res) => {
    const send = (code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (req.url.endsWith('/core/v1/version')) return send(200, { name: 'chipotle-inline-mock', version: '0.0.0', mode: 'test' });
    if (req.url.endsWith('/core/v1/create_wallet')) return send(200, { wallet_address: PKP });
    if (req.url.endsWith('/core/v1/lit_action') && req.method === 'POST') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const { js_params: p } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (p.action !== 'encrypt') return send(400, { has_error: true, error: `unsupported action ${p.action}` });
      const ciphertext = Buffer.from(`ct:${p.masterKey}`).toString('base64');
      const dataToEncryptHash = createHash('sha256').update(p.masterKey).digest('hex');
      return send(200, { has_error: false, response: JSON.stringify({ ciphertext, dataToEncryptHash }) });
    }
    send(404, { has_error: true, error: 'not found' });
  });
}

/** Minimal Pinata v3 upload mock: deterministic CID per upload body. */
function makePinataMock(uploads) {
  return http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    if (req.method !== 'POST') {
      res.writeHead(405);
      return res.end();
    }
    if (!req.headers.authorization?.startsWith('Bearer ')) {
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'no auth' }));
    }
    const cid = 'bafy' + createHash('sha256').update(body).digest('hex').slice(0, 16);
    uploads.push({ cid, size: body.length });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: { cid } }));
  });
}

async function freePort() {
  // mock-sp logs the PORT env verbatim, so reserve a real free port first.
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((r) => probe.close(r));
  return port;
}

async function spawnMockSp() {
  const port = await freePort();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['smartcontracts/integration/mock-sp.mjs'], {
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    child.stdout.on('data', (d) => {
      if (String(d).includes('listening')) resolve({ child, port });
    });
    child.on('exit', (code) => reject(new Error(`mock-sp exited early (${code})`)));
    setTimeout(() => reject(new Error('mock-sp start timeout')), 10_000).unref();
  });
}

describe('publish pipeline integration (Chipotle + Pinata + SP)', () => {
  let chipotle, pinata, sp, courseDir;
  const uploads = [];
  const LESSON_1 = '# Lesson one\n\nSecret plaintext body 1.\n';
  const LESSON_2 = '# Lesson two\n\nSecret plaintext body 2.\n';

  beforeAll(async () => {
    chipotle = makeChipotleMock();
    pinata = makePinataMock(uploads);
    chipotle.port = await listen(chipotle);
    pinata.port = await listen(pinata);
    sp = await spawnMockSp();

    courseDir = mkdtempSync(join(tmpdir(), 'daskibo-course-'));
    mkdirSync(join(courseDir, '1'));
    mkdirSync(join(courseDir, '2'));
    writeFileSync(join(courseDir, 'index.html'), '<title>Integration Course</title>');
    writeFileSync(join(courseDir, '1', 'README.md'), LESSON_1);
    writeFileSync(join(courseDir, '2', 'README.md'), LESSON_2);
  }, 30_000);

  afterAll(() => {
    chipotle?.close();
    pinata?.close();
    sp?.child.kill();
    if (courseDir) rmSync(courseDir, { recursive: true, force: true });
  });

  it('publishes an encrypted course with an IPFS mirror and verifies round-trip', async () => {
    const spUrl = `http://127.0.0.1:${sp.port}`;
    const env = {
      GREENFIELD_TESTNET_PRIVATE_KEY: '0x' + '1'.padStart(64, '0'),
      GREENFIELD_TESTNET_ADDRESS: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
      GREENFIELD_SP: spUrl,
      MARKETPLACE_ADDR: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
      COURSE_ID: '1',
      NFT_GATING_CHAIN: 'bscTestnet',
      CHIPOTLE_URL: `http://127.0.0.1:${chipotle.port}`,
      GF_BUCKET: 'daskibo-inttest',
      PIN_TO_IPFS: '1',
      PINATA_JWT: 'test-jwt',
      PINATA_GATEWAY: 'test.gateway.example',
      PINATA_UPLOAD_URL: `http://127.0.0.1:${pinata.port}/v3/files`,
    };
    const cfg = resolvePublishEnv(env, 'testnet');
    const course = loadCourse({ dir: courseDir });

    const result = await runPublish(cfg, {
      course,
      makeBackend: ({ transport }) => createSpEmulationBackend({ transport, endpoint: spUrl }),
    });

    // Chipotle wrap landed in the manifest.
    expect(result.bucketName).toBe('daskibo-inttest');
    expect(result.pkpId).toBe(PKP);
    expect(result.manifest.lit.pkpId).toBe(PKP);
    expect(result.manifest.lit.litNetwork).toBe('chipotle');

    // IPFS mirror: every non-manifest object pinned + the manifest itself.
    const items = result.manifest.ipfsMirror.items;
    const itemKeys = Object.keys(items);
    expect(itemKeys.length).toBeGreaterThanOrEqual(2);
    for (const cid of Object.values(items)) expect(cid).toMatch(/^bafy/);
    expect(result.manifest.ipfsMirror.gateway).toBe('test.gateway.example');
    expect(result.manifestPin.cid).toMatch(/^bafy/);
    expect(result.manifestPin.url).toBe(`https://test.gateway.example/ipfs/${result.manifestPin.cid}`);
    expect(uploads.length).toBe(itemKeys.length + 1); // objects + manifest

    // SP round-trip: manifest stored with the mirror embedded.
    const back = await fetch(`${spUrl}/view/daskibo-inttest/_lit/manifest.json`).then((r) => r.json());
    expect(back.ipfsMirror.items).toEqual(items);
    expect(back.lit.chipotleUrl).toBeTruthy();

    // DRM invariant: lesson bodies on the SP are ciphertext, never plaintext.
    const lessonKey = itemKeys.find((k) => k !== 'index.json' && !k.startsWith('_'));
    const stored = await fetch(`${spUrl}/view/daskibo-inttest/${lessonKey}`).then((r) => r.text());
    expect(stored).not.toContain('Secret plaintext');
  }, 30_000);
});
