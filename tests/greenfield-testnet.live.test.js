/**
 * Daskibo Academy — REAL public Greenfield testnet write test.
 *
 * Drives smartcontracts/greenfield-testnet (the official
 * @bnb-chain/greenfield-js-sdk) via docker-compose to create a bucket and
 * upload + read back an object on the REAL Greenfield testnet (chain 5600).
 *
 * Spends real testnet gas, so it is strictly opt-in. Skipped unless ALL:
 *   - the Docker daemon is reachable, AND
 *   - GREENFIELD_TESTNET_PRIVATE_KEY is set, AND
 *   - GREENFIELD_TESTNET_ADDRESS is set.
 * The default `npm test` never touches the live network.
 */

import { describe, it, expect } from 'vitest';
import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE = [
  'compose',
  '-f',
  'smartcontracts/greenfield-testnet/docker-compose.yml',
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

const ENABLED =
  dockerAvailable() &&
  !!process.env.GREENFIELD_TESTNET_PRIVATE_KEY &&
  !!process.env.GREENFIELD_TESTNET_ADDRESS;

const d = ENABLED ? describe : describe.skip;

d('REAL Greenfield testnet write (docker-compose, chain 5600)', () => {
  it('creates a bucket and round-trips an object on testnet', () => {
    const out = execFileSync(
      'docker',
      [...COMPOSE, 'run', '--rm', 'testnet-writer'],
      {
        cwd: ROOT,
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 600_000,
        env: { ...process.env },
      },
    );
    expect(out).toContain('bucket');
    expect(out).toContain('ALL GOOD');
  }, 600_000);
});
