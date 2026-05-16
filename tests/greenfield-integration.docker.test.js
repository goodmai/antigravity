/**
 * Daskibo Academy — Greenfield frontend integration test (docker-compose).
 *
 * Brings up the real static frontend (nginx) and a deterministic mock
 * Storage Provider, then drives the *actual shipped* greenfield-core client
 * over real HTTP against the mock SP: create → search → save → read.
 *
 * Skipped automatically when Docker / docker-compose is unavailable so the
 * default `npm test` stays hermetic; CI with Docker runs it for real.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createGreenfieldClient } from '../smartcontracts/buckets/greenfield-core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE = ['compose', '-f', 'smartcontracts/docker-compose.yml'];

function dockerAvailable() {
  try {
    // Both the compose plugin AND a reachable daemon are required; a present
    // CLI with no running daemon must skip cleanly, not fail the suite.
    execSync('docker compose version', { stdio: 'ignore' });
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const HAVE_DOCKER = dockerAvailable();
const d = HAVE_DOCKER ? describe : describe.skip;

function compose(args) {
  return execFileSync('docker', [...COMPOSE, ...args], {
    cwd: ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
  });
}

async function nodeTransport({ method, url, headers, body }) {
  const res = await fetch(url, { method, headers, body: body || undefined });
  const text = await res.text();
  const hdrs = {};
  res.headers.forEach((v, k) => (hdrs[k.toLowerCase()] = v));
  return { status: res.status, headers: hdrs, body: text };
}

const FRONTEND = 'http://localhost:8080';
const MOCK_SP = 'http://localhost:9000';

d('Greenfield frontend integration (docker-compose)', () => {
  beforeAll(() => {
    compose(['up', '-d', '--wait']);
  }, 180_000);

  afterAll(() => {
    try {
      compose(['down', '-v']);
    } catch {
      /* best effort */
    }
  }, 60_000);

  it('serves the bucket-console landing page via nginx', async () => {
    const res = await fetch(`${FRONTEND}/index.html`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Greenfield Testnet');
    expect(html).toContain('id="gf-create-form"');
    expect(html).toContain('id="gf-search-form"');
  });

  it('serves the ES modules and the 3 course stubs', async () => {
    const core = await fetch(`${FRONTEND}/buckets/greenfield-core.js`);
    expect(core.status).toBe(200);
    expect(await core.text()).toContain('GREENFIELD_TESTNET');

    for (const n of ['01', '02', '03']) {
      const c = await fetch(`${FRONTEND}/courses/course-${n}/index.html`);
      expect(c.status).toBe(200);
      expect(await c.text()).toContain(`Course ${n}`);
    }
  });

  it('runs create → search → save → read against the SP', async () => {
    const owner = '0xAbCd1234567890abcdef1234567890AbCd123456';
    const client = createGreenfieldClient({
      transport: nodeTransport,
      owner,
      endpoint: MOCK_SP,
    });

    const created = await client.createBucket('course-bucket', {
      visibility: 'public',
    });
    expect(created.bucketName).toBe('course-bucket');
    expect(created.txHash).toMatch(/^0x/);

    const found = await client.searchBuckets('course');
    expect(found.map((b) => b.name)).toContain('course-bucket');

    await client.saveObject('course-bucket', 'courses/01/intro.md', '# Hello', {
      contentType: 'text/markdown',
    });
    const back = await client.readObject('course-bucket', 'courses/01/intro.md');
    expect(back).toBe('# Hello');
  }, 30_000);

  it('maps a missing object to NOT_FOUND end-to-end', async () => {
    const client = createGreenfieldClient({
      transport: nodeTransport,
      owner: '0xAbCd1234567890abcdef1234567890AbCd123456',
      endpoint: MOCK_SP,
    });
    await expect(
      client.readObject('course-bucket', 'nope.md'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
