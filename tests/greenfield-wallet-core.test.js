/**
 * Daskibo Academy — wallet backend ↔ greenfield-core composition (TDD / D1)
 *
 * Exercises the seam most likely to break: the *real* createWalletBackend
 * feeding greenfield-core's owner resolution, end-to-end, with only the
 * wallet provider + SDK client faked.
 */

import { describe, it, expect, vi } from 'vitest';
import { createGreenfieldClient } from '../smartcontracts/buckets/greenfield-core.js';
import { createWalletBackend } from '../smartcontracts/buckets/greenfield-wallet-backend.js';

const ACCOUNT = '0xWalletAccount000000000000000000000000aa';

function wire(walletClient) {
  const provider = {
    request: vi.fn(async ({ method }) =>
      method === 'eth_requestAccounts' ? [ACCOUNT] : null,
    ),
  };
  const backend = createWalletBackend({
    provider,
    makeClient: async () => walletClient,
  });
  const client = createGreenfieldClient({
    transport: vi.fn(async () => ({ status: 200, headers: {}, body: '' })),
    backend,
  });
  return { client, provider };
}

describe('wallet backend through greenfield-core', () => {
  it('derives owner from the wallet when none is supplied', async () => {
    const walletClient = {
      createBucket: vi.fn(async () => ({ txHash: '0xb' })),
      uploadObject: vi.fn(async () => ({ txHash: '0xo' })),
    };
    const { client } = wire(walletClient);

    const res = await client.createBucket('wallet-bucket', {
      visibility: 'public',
    });
    expect(res).toMatchObject({ bucketName: 'wallet-bucket', txHash: '0xb' });
    expect(walletClient.createBucket).toHaveBeenCalledWith({
      bucketName: 'wallet-bucket',
      creator: ACCOUNT, // resolved from the wallet, not a typed field
      visibility: 'public',
    });
  });

  it('saveObject also flows the wallet account through as creator', async () => {
    const walletClient = {
      createBucket: vi.fn(async () => ({ txHash: '0xb' })),
      uploadObject: vi.fn(async () => ({ txHash: '0xo' })),
    };
    const { client } = wire(walletClient);
    await client.saveObject('wallet-bucket', 'lessons/01.md', '# Hi', {
      contentType: 'text/markdown',
    });
    expect(walletClient.uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({ creator: ACCOUNT, objectKey: 'lessons/01.md' }),
    );
  });

  it('rejects an explicit owner that mismatches the wallet (OWNER_MISMATCH)', async () => {
    const walletClient = {
      createBucket: vi.fn(async () => ({ txHash: '0xb' })),
      uploadObject: vi.fn(async () => ({ txHash: '0xo' })),
    };
    const { client } = wire(walletClient);
    await expect(
      client.createBucket('wallet-bucket', {
        owner: '0xSomeoneElse00000000000000000000000000bb',
      }),
    ).rejects.toMatchObject({ code: 'OWNER_MISMATCH' });
    expect(walletClient.createBucket).not.toHaveBeenCalled();
  });
});
