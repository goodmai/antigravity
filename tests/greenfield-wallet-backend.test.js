/**
 * Daskibo Academy — browser wallet Greenfield backend (TDD)
 *
 * Implements the greenfield-core `GreenfieldBackend` write interface using
 * the user's in-browser wallet (EIP-1193) as the signer. The heavy
 * Greenfield protocol (SDK, off-chain auth) is an INJECTED `makeClient`
 * so this module stays pure, DOM-free and unit-testable with fakes — the
 * real CDN-SDK glue lives in the (non-strict) UI layer.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createWalletBackend,
  makeSignTypedDataCallback,
} from '../smartcontracts/buckets/greenfield-wallet-backend.js';

const ADDR = '0xAbCd1234567890abcdef1234567890abCd123456';

function fakeProvider(accounts = [ADDR], err) {
  return {
    request: vi.fn(async ({ method }) => {
      if (err) throw err;
      if (method === 'eth_requestAccounts') return accounts;
      return null;
    }),
  };
}

function fakeClient() {
  return {
    createBucket: vi.fn(async () => ({ txHash: '0xbucket' })),
    uploadObject: vi.fn(async () => ({ txHash: '0xobj' })),
  };
}

describe('createWalletBackend', () => {
  it('connects the wallet and delegates createBucket (signer = account)', async () => {
    const provider = fakeProvider();
    const client = fakeClient();
    const be = createWalletBackend({
      provider,
      makeClient: async () => client,
    });

    const res = await be.createBucket({
      bucketName: 'my-bucket',
      owner: ADDR,
      visibility: 'public',
    });

    expect(provider.request).toHaveBeenCalledWith({
      method: 'eth_requestAccounts',
    });
    expect(client.createBucket).toHaveBeenCalledWith({
      bucketName: 'my-bucket',
      creator: ADDR,
      visibility: 'public',
    });
    expect(res).toEqual({ bucketName: 'my-bucket', txHash: '0xbucket' });
  });

  it('delegates putObject with the connected account as creator', async () => {
    const client = fakeClient();
    const be = createWalletBackend({
      provider: fakeProvider(),
      makeClient: async () => client,
    });
    const res = await be.putObject({
      bucketName: 'b',
      objectKey: 'a.md',
      data: '# Hi',
      contentType: 'text/markdown',
      owner: ADDR,
      visibility: 'inherit',
    });
    expect(client.uploadObject).toHaveBeenCalledWith({
      bucketName: 'b',
      objectKey: 'a.md',
      data: '# Hi',
      contentType: 'text/markdown',
      creator: ADDR,
      visibility: 'inherit',
    });
    expect(res).toEqual({ bucketName: 'b', objectKey: 'a.md', txHash: '0xobj' });
  });

  it('connects once and caches the account + client across calls', async () => {
    const provider = fakeProvider();
    const make = vi.fn(async () => fakeClient());
    const be = createWalletBackend({ provider, makeClient: make });
    await be.createBucket({ bucketName: 'b1', owner: ADDR });
    await be.createBucket({ bucketName: 'b2', owner: ADDR });
    expect(
      provider.request.mock.calls.filter(
        (c) => c[0].method === 'eth_requestAccounts',
      ),
    ).toHaveLength(1);
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('maps a missing provider to NO_WALLET', async () => {
    const be = createWalletBackend({ makeClient: async () => fakeClient() });
    await expect(
      be.createBucket({ bucketName: 'b', owner: ADDR }),
    ).rejects.toMatchObject({ code: 'NO_WALLET' });
  });

  it('maps wallet rejection (EIP-1193 4001) to USER_REJECTED', async () => {
    const provider = fakeProvider([], { code: 4001, message: 'denied' });
    const be = createWalletBackend({
      provider,
      makeClient: async () => fakeClient(),
    });
    await expect(
      be.createBucket({ bucketName: 'b', owner: ADDR }),
    ).rejects.toMatchObject({ code: 'USER_REJECTED' });
  });

  it('maps an empty account list to NO_ACCOUNTS', async () => {
    const be = createWalletBackend({
      provider: fakeProvider([]),
      makeClient: async () => fakeClient(),
    });
    await expect(
      be.putObject({ bucketName: 'b', objectKey: 'k', data: 'x' }),
    ).rejects.toMatchObject({ code: 'NO_ACCOUNTS' });
  });

  it('requires a client factory (NO_WALLET_CLIENT when absent)', async () => {
    const be = createWalletBackend({ provider: fakeProvider() });
    await expect(
      be.createBucket({ bucketName: 'b', owner: ADDR }),
    ).rejects.toMatchObject({ code: 'NO_WALLET_CLIENT' });
  });

  it('resolveOwner returns the connected account (cached)', async () => {
    const provider = fakeProvider();
    const be = createWalletBackend({
      provider,
      makeClient: async () => fakeClient(),
    });
    expect(await be.resolveOwner()).toBe(ADDR);
    await be.resolveOwner();
    expect(
      provider.request.mock.calls.filter(
        (c) => c[0].method === 'eth_requestAccounts',
      ),
    ).toHaveLength(1);
  });
});

describe('makeSignTypedDataCallback', () => {
  it('signs via eth_signTypedData_v4 with [address, message]', async () => {
    const provider = {
      request: vi.fn(async () => '0xsig'),
    };
    const cb = makeSignTypedDataCallback(provider);
    const sig = await cb('0xAddr', '{"typed":"data"}');
    expect(sig).toBe('0xsig');
    expect(provider.request).toHaveBeenCalledWith({
      method: 'eth_signTypedData_v4',
      params: ['0xAddr', '{"typed":"data"}'],
    });
  });

  it('maps wallet rejection 4001 to USER_REJECTED', async () => {
    const provider = {
      request: vi.fn(async () => {
        throw { code: 4001, message: 'denied' };
      }),
    };
    const cb = makeSignTypedDataCallback(provider);
    await expect(cb('0xA', 'm')).rejects.toMatchObject({
      code: 'USER_REJECTED',
    });
  });

  it('throws NO_WALLET without a provider', () => {
    expect(() => makeSignTypedDataCallback(undefined)).toThrowError(
      expect.objectContaining({ code: 'NO_WALLET' }),
    );
  });
});
