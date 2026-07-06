/**
 * Daskibo Academy — shared GreenfieldBackend conformance suite (TDD / D2)
 *
 * One contract, run against every unit-testable backend implementation,
 * so divergence (e.g. a missing/renamed method, wrong return shape) is
 * caught structurally instead of slipping between implementations.
 * `sdk-backend.mjs` needs the live SDK/network and is intentionally out
 * of scope here (covered by the opt-in Flow-C live test).
 */

import { describe, it, expect, vi } from 'vitest';
import { createSpEmulationBackend } from '../smartcontracts/integration/sp-emulation-backend.js';
import { createWalletBackend } from '../smartcontracts/buckets/greenfield-wallet-backend.js';

const OWNER = '0xAbCd1234567890abcdef1234567890abCd123456';

/**
 * @param {string} name
 * @param {() => import('../smartcontracts/buckets/greenfield-core.js').GreenfieldBackend} make
 */
function runContract(name, make) {
  describe(`GreenfieldBackend contract — ${name}`, () => {
    it('exposes createBucket / putObject as functions', () => {
      const be = make();
      expect(typeof be.createBucket).toBe('function');
      expect(typeof be.putObject).toBe('function');
    });

    it('createBucket returns { bucketName, txHash }', async () => {
      const r = await make().createBucket({
        bucketName: 'contract-bucket',
        owner: OWNER,
        visibility: 'public',
      });
      expect(r.bucketName).toBe('contract-bucket');
      expect('txHash' in r).toBe(true);
      expect(r.txHash === null || typeof r.txHash === 'string').toBe(true);
    });

    it('putObject returns { bucketName, objectKey, txHash }', async () => {
      const r = await make().putObject({
        bucketName: 'contract-bucket',
        objectKey: 'a/b.md',
        data: '# Hi',
        contentType: 'text/markdown',
        owner: OWNER,
        visibility: 'inherit',
      });
      expect(r.bucketName).toBe('contract-bucket');
      expect(r.objectKey).toBe('a/b.md');
      expect(r.txHash === null || typeof r.txHash === 'string').toBe(true);
    });

    it('resolveOwner, if present, resolves to a string account', async () => {
      const be = make();
      if (typeof be.resolveOwner !== 'function') return; // optional
      expect(typeof (await be.resolveOwner())).toBe('string');
    });
  });
}

runContract('sp-emulation', () =>
  createSpEmulationBackend({
    endpoint: 'http://sp.local',
    transport: vi.fn(async () => ({
      status: 200,
      headers: { 'x-gnfd-txn-hash': '0xsp' },
      body: '',
    })),
  }),
);

runContract('wallet', () =>
  createWalletBackend({
    provider: {
      request: vi.fn(async ({ method }) =>
        method === 'eth_requestAccounts' ? [OWNER] : null,
      ),
    },
    makeClient: async () => ({
      createBucket: vi.fn(async () => ({ txHash: '0xw' })),
      uploadObject: vi.fn(async () => ({ txHash: '0xwo' })),
    }),
  }),
);
