/**
 * Daskibo Academy — Solidity contracts via the Foundry container.
 *
 * The host has no solidity toolchain; smartcontracts/contracts/
 * docker-compose.yml carries forge/anvil/cast. This drives the `forge`
 * service to `forge build && forge test` the settlement layer.
 *
 * Heavy (pulls the Foundry image, fetches forge-std over the network).
 * Skipped unless BOTH the Docker daemon is reachable AND
 * RUN_CONTRACTS=1 — so the default `npm test` stays fast and hermetic.
 */

import { describe, it, expect } from 'vitest';
import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE = [
  'compose',
  '-f',
  'smartcontracts/contracts/docker-compose.yml',
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

const ENABLED = dockerAvailable() && process.env.RUN_CONTRACTS === '1';
const d = ENABLED ? describe : describe.skip;

d('Foundry contracts (docker-compose)', () => {
  it('forge build + test passes for the settlement layer', () => {
    const out = execFileSync(
      'docker',
      [...COMPOSE, 'run', '--rm', 'forge'],
      {
        cwd: ROOT,
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 900_000,
      },
    );
    // forge prints a per-suite line and a final summary
    expect(out).toMatch(/Suite result: ok/);
    expect(out).not.toMatch(/Suite result: FAILED/);
    expect(out).toMatch(/Compiler run successful|No files changed/);
  }, 900_000);

  it('deploys + wires the layer against anvil (cast smoke)', () => {
    const out = execFileSync(
      'docker',
      [...COMPOSE, 'run', '--rm', 'deploy'],
      {
        cwd: ROOT,
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 600_000,
      },
    );
    expect(out).toMatch(/CourseMarketplace/);
    expect(out).toMatch(/ONCHAIN EXECUTION COMPLETE|Script ran successfully/);
  }, 600_000);
});
