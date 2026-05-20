/**
 * Daskibo Academy — REAL-network E2E happy-path (THE main check).
 *
 * Drives `smartcontracts/e2e/docker-compose.yml` to bring up:
 *
 *   anvil   BNB-testnet clone (chain-id 97) with deterministic accounts
 *   deploy  Foundry container deploying Treasury / AccessPass /
 *           CourseMarketplace at deterministic addresses
 *   e2e     Node container running run-e2e.mjs against REAL Greenfield
 *           testnet (5600) and REAL Lit datil-test
 *
 * No mocks: real chain, real storage, real threshold encryption. This is
 * the canonical pre-release verification — every other suite is a
 * subset / faster gate.
 *
 * STRICTLY OPT-IN. Skipped unless ALL of:
 *   - the Docker daemon is reachable, AND
 *   - RUN_E2E=1 is set, AND
 *   - GREENFIELD_TESTNET_PRIVATE_KEY is set (funded tBNB on 5600), AND
 *   - GREENFIELD_TESTNET_ADDRESS is set.
 *
 * The default `npm test` and CI `test:unit` job never trigger this — it
 * spends real testnet gas and minutes.
 */

import { describe, it, expect } from 'vitest';
import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE = ['compose', '-f', 'smartcontracts/e2e/docker-compose.yml'];

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
  process.env.RUN_E2E === '1' &&
  !!process.env.GREENFIELD_TESTNET_PRIVATE_KEY &&
  !!process.env.GREENFIELD_TESTNET_ADDRESS;

const d = ENABLED ? describe : describe.skip;

d('REAL-network E2E (anvil-BNB + Greenfield-testnet + Lit-datil-test)', () => {
  it(
    'encrypts → publishes → sells → decrypts; Eve denied at both layers',
    () => {
      let out = '';
      try {
        out = execFileSync(
          'docker',
          [
            ...COMPOSE,
            'up',
            '--build',
            '--abort-on-container-exit',
            '--exit-code-from',
            'e2e',
          ],
          {
            cwd: ROOT,
            stdio: 'pipe',
            encoding: 'utf8',
            timeout: 1_500_000,
            env: { ...process.env },
          },
        );
      } finally {
        // Always tear the stack down so anvil + the deploy logs don't leak.
        try {
          execFileSync('docker', [...COMPOSE, 'down', '-v', '--remove-orphans'], {
            cwd: ROOT,
            stdio: 'ignore',
            timeout: 60_000,
          });
        } catch {
          /* best-effort */
        }
      }
      // The runner prints a single "E2E OK" line on success and exits 0;
      // any assertion failure exits non-zero and execFileSync throws.
      expect(out).toMatch(/E2E OK/);
    },
    1_500_000,
  );
});
