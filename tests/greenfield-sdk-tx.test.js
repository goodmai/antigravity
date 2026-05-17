/**
 * Daskibo Academy — shared Greenfield SDK create-bucket orchestrator (TDD)
 *
 * The on-chain create-bucket flow was duplicated in the Node
 * (`sdk-backend.mjs`, ECDSA key) and browser (`greenfield-wallet-sdk.js`,
 * wallet signTypedData) paths — exactly the divergence that hid the C1
 * casing bug. This is the single shared, *injectable* orchestration:
 * pick SP → createBucket msg → simulate → broadcast (caller supplies the
 * signer-specific broadcast fields). SDK pieces are injected so it is
 * pure and unit-tested with fakes.
 */

import { describe, it, expect, vi } from 'vitest';
import { sdkCreateBucket } from '../smartcontracts/buckets/greenfield-sdk-tx.js';

const SPS = [{ operatorAddress: '0xSP', endpoint: 'https://sp.one' }];

function fakeSdk(txHash = '0xtx') {
  const broadcast = vi.fn(async () => ({ transactionHash: txHash }));
  const simulate = vi.fn(async () => ({ gasLimit: 1234, gasPrice: '5' }));
  const createBucket = vi.fn(async () => ({ simulate, broadcast }));
  return {
    client: {
      sp: { getStorageProviders: vi.fn(async () => SPS) },
      bucket: { createBucket },
    },
    Long: { fromString: (s) => ({ __long: s }) },
    VisibilityType: {
      VISIBILITY_TYPE_PUBLIC_READ: 1,
      VISIBILITY_TYPE_PRIVATE: 2,
    },
    _spies: { createBucket, simulate, broadcast },
  };
}

describe('sdkCreateBucket', () => {
  it('picks the SP, builds the msg and returns the tx hash', async () => {
    const f = fakeSdk('0xabc');
    const res = await sdkCreateBucket({
      client: f.client,
      Long: f.Long,
      VisibilityType: f.VisibilityType,
      bucketName: 'b',
      creator: '0xCreator',
      visibility: 'public',
      broadcastSigner: { privateKey: '0xpk' },
    });
    expect(res).toEqual({ txHash: '0xabc' });
    expect(f._spies.createBucket).toHaveBeenCalledWith(
      expect.objectContaining({
        bucketName: 'b',
        creator: '0xCreator',
        visibility: f.VisibilityType.VISIBILITY_TYPE_PUBLIC_READ,
        primarySpAddress: '0xSP',
        paymentAddress: '0xCreator',
      }),
    );
  });

  it('merges the caller-supplied signer fields into broadcast', async () => {
    const f = fakeSdk();
    const cb = async () => '0xsig';
    await sdkCreateBucket({
      client: f.client,
      Long: f.Long,
      VisibilityType: f.VisibilityType,
      bucketName: 'b',
      creator: '0xC',
      visibility: 'private',
      broadcastSigner: { signTypedDataCallback: cb },
    });
    const opts = f._spies.broadcast.mock.calls[0][0];
    expect(opts.signTypedDataCallback).toBe(cb);
    expect(opts.payer).toBe('0xC');
    expect(opts.gasLimit).toBe(1234);
  });

  it('maps private visibility correctly', async () => {
    const f = fakeSdk();
    await sdkCreateBucket({
      client: f.client,
      Long: f.Long,
      VisibilityType: f.VisibilityType,
      bucketName: 'b',
      creator: '0xC',
      visibility: 'private',
      broadcastSigner: { privateKey: '0xpk' },
    });
    expect(f._spies.createBucket).toHaveBeenCalledWith(
      expect.objectContaining({
        visibility: f.VisibilityType.VISIBILITY_TYPE_PRIVATE,
      }),
    );
  });

  it('propagates SP_UNAVAILABLE when no usable SP exists', async () => {
    const f = fakeSdk();
    f.client.sp.getStorageProviders = vi.fn(async () => []);
    await expect(
      sdkCreateBucket({
        client: f.client,
        Long: f.Long,
        VisibilityType: f.VisibilityType,
        bucketName: 'b',
        creator: '0xC',
        visibility: 'public',
        broadcastSigner: { privateKey: '0xpk' },
      }),
    ).rejects.toMatchObject({ code: 'SP_UNAVAILABLE' });
  });
});
