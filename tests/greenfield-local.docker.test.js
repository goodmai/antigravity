/**
 * Daskibo Academy — REAL local private Greenfield network test.
 *
 * Builds + boots the official bnb-chain/greenfield node from source via
 * docker-compose (validators + SPs, chain-id greenfield_9000-1) with a
 * fresh genesis (clean state), then asserts the Tendermint RPC reports
 * the private chain id.
 *
 * Heavy (Go build + multi-process chain). Skipped unless BOTH:
 *   - the Docker daemon is reachable, AND
 *   - RUN_GREENFIELD_LOCAL=1 is set (opt-in; the build takes minutes).
 * So the default `npm test` stays fast and hermetic.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GREENFIELD_LOCAL } from '../smartcontracts/buckets/greenfield-core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE = [
  'compose',
  '-f',
  'smartcontracts/greenfield-local/docker-compose.yml',
];

function dockerAvailable() {
  try {
    execSync('docker compose version', { stdio: 'ignore' });
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const ENABLED = dockerAvailable() && process.env.RUN_GREENFIELD_LOCAL === '1';
const d = ENABLED ? describe : describe.skip;

function compose(args, timeout = 600_000) {
  return execFileSync('docker', [...COMPOSE, ...args], {
    cwd: ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
    timeout,
  });
}

d('REAL local private Greenfield (docker-compose, clean state)', () => {
  beforeAll(() => {
    compose(['up', '-d', '--build', '--wait'], 900_000);
  }, 900_000);

  afterAll(() => {
    try {
      compose(['down', '-v']);
    } catch {
      /* best effort */
    }
  }, 120_000);

  it(`runs a real private chain with id ${GREENFIELD_LOCAL.cosmosChainId}`, async () => {
    const res = await fetch(`${GREENFIELD_LOCAL.rpcUrl}/status`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.node_info.network).toBe(GREENFIELD_LOCAL.cosmosChainId);
    expect(json.result.node_info.network).toContain(`${GREENFIELD_LOCAL.chainId}`);
  }, 60_000);

  it('produces blocks (height advances → real consensus, not a mock)', async () => {
    const h = async () => {
      const r = await fetch(`${GREENFIELD_LOCAL.rpcUrl}/status`);
      const j = await r.json();
      return Number(j.result.sync_info.latest_block_height);
    };
    const h1 = await h();
    await new Promise((r) => setTimeout(r, 6000));
    const h2 = await h();
    expect(h2).toBeGreaterThan(h1);
  }, 30_000);
});
