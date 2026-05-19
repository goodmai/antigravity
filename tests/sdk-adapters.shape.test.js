/**
 * Daskibo Academy — SDK adapter call-shape tests (TDD).
 *
 * The CDN-loaded `@lit-protocol` / `@bnb-chain` adapters were
 * "integration-only / unverified". They now take an injectable SDK
 * loader, so we assert OUR call graph matches the *documented* SDK API
 * (catches the C1-class casing / argument-shape regressions) without any
 * network. This is not a substitute for a live run, but it pins the
 * contract our code expects.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  makeLitClient,
  makeLitAuth,
} from '../smartcontracts/buckets/lit-sdk.js';
import { makeWalletGreenfieldClient } from '../smartcontracts/buckets/greenfield-wallet-sdk.js';

// ── lit-sdk: makeLitClient ───────────────────────────────────────────────
describe('makeLitClient call-shape', () => {
  function fakeLitSdk() {
    const connect = vi.fn(async () => {});
    const LitNodeClient = vi.fn(function (cfg) {
      this.litNetwork = cfg.litNetwork;
      this.connect = connect;
    });
    const encryptString = vi.fn(async () => ({
      ciphertext: 'CT',
      dataToEncryptHash: 'H',
    }));
    const decryptToString = vi.fn(async () => 'PLAINTEXT');
    return {
      mod: { LitNodeClient, encryptString, decryptToString },
      _: { connect, LitNodeClient, encryptString, decryptToString },
    };
  }

  it('connects to the network and maps encrypt/decrypt to the SDK', async () => {
    const f = fakeLitSdk();
    const client = await makeLitClient({
      network: 'datil-test',
      loadSdk: async () => f.mod,
    });
    expect(f._.LitNodeClient).toHaveBeenCalledWith({ litNetwork: 'datil-test' });
    expect(f._.connect).toHaveBeenCalled();

    const enc = await client.encrypt({
      accessControlConditions: [{ a: 1 }],
      dataToEncrypt: 'master',
    });
    expect(enc).toEqual({ ciphertext: 'CT', dataToEncryptHash: 'H' });
    expect(f._.encryptString).toHaveBeenCalledWith(
      { accessControlConditions: [{ a: 1 }], dataToEncrypt: 'master' },
      expect.any(Object),
    );

    const pt = await client.decrypt(
      { accessControlConditions: [{ a: 1 }], ciphertext: 'CT', dataToEncryptHash: 'H', chain: 'ethereum' },
      { sessionSigs: { s: 1 } },
    );
    expect(pt).toBe('PLAINTEXT');
    expect(f._.decryptToString).toHaveBeenCalledWith(
      expect.objectContaining({ chain: 'ethereum', sessionSigs: { s: 1 } }),
      expect.any(Object),
    );
  });
});

// ── lit-sdk: makeLitAuth ─────────────────────────────────────────────────
describe('makeLitAuth call-shape', () => {
  it('builds session sigs; authNeededCallback uses SIWE + wallet sign', async () => {
    const getSessionSigs = vi.fn(async (opts) => {
      // exercise the callback the way Lit would
      await opts.authNeededCallback({
        uri: 'u',
        expiration: 'e',
        resourceAbilityRequests: opts.resourceAbilityRequests,
      });
      return { node1: 'sig' };
    });
    const connect = vi.fn(async () => {});
    const getLatestBlockhash = vi.fn(async () => '0xblock');
    const LitNodeClient = vi.fn(function () {
      this.connect = connect;
      this.getSessionSigs = getSessionSigs;
      this.getLatestBlockhash = getLatestBlockhash;
    });
    const createSiweMessage = vi.fn(async () => 'SIWE');
    const generateAuthSig = vi.fn(async ({ signer }) => {
      await signer.getAddress();
      await signer.signMessage('SIWE');
      return { sig: 1 };
    });
    const provider = {
      request: vi.fn(async ({ method }) =>
        method === 'eth_requestAccounts' ? ['0xWallet'] : '0xpersonalsig',
      ),
    };

    const out = await makeLitAuth({
      provider,
      loadSdk: async () => ({
        LitNodeClient,
        LitActionResource: vi.fn(function () {}),
        createSiweMessage,
        generateAuthSig,
        LIT_ABILITY: { LitActionExecution: 'lit-action' },
      }),
    });

    expect(out).toEqual({ sessionSigs: { node1: 'sig' } });
    const opts = getSessionSigs.mock.calls[0][0];
    expect(opts.chain).toBe('ethereum');
    expect(Array.isArray(opts.resourceAbilityRequests)).toBe(true);
    expect(createSiweMessage).toHaveBeenCalled();
    expect(provider.request).toHaveBeenCalledWith({
      method: 'personal_sign',
      params: ['SIWE', '0xWallet'],
    });
  });
});

// ── greenfield-wallet-sdk: makeWalletGreenfieldClient ────────────────────
describe('makeWalletGreenfieldClient call-shape', () => {
  function fakeGnfd() {
    const broadcast = vi.fn(async () => ({ transactionHash: '0xtx' }));
    const simulate = vi.fn(async () => ({ gasLimit: 1, gasPrice: '1' }));
    const createBucket = vi.fn(async () => ({ simulate, broadcast }));
    const getStorageProviders = vi.fn(async () => [
      { operatorAddress: '0xSP', endpoint: 'https://sp.one' },
    ]);
    const genOffChainAuthKeyPairAndUpload = vi.fn(async () => ({
      seedString: 'SEED',
    }));
    const delegateUploadObject = vi.fn(async () => ({}));
    const client = {
      sp: { getStorageProviders },
      bucket: { createBucket },
      // NOTE: SDK property is all-lowercase `offchainauth` (the C1 bug)
      offchainauth: { genOffChainAuthKeyPairAndUpload },
      object: { delegateUploadObject },
    };
    return {
      mod: {
        Client: { create: vi.fn(() => client) },
        Long: { fromString: (s) => ({ __long: s }) },
        VisibilityType: {
          VISIBILITY_TYPE_PUBLIC_READ: 1,
          VISIBILITY_TYPE_PRIVATE: 2,
        },
      },
      _: { client, createBucket, broadcast, genOffChainAuthKeyPairAndUpload, delegateUploadObject },
    };
  }

  const provider = {
    request: vi.fn(async ({ method }) =>
      method === 'eth_signTypedData_v4' ? '0xsig' : null,
    ),
  };

  it('createBucket broadcasts with a wallet signTypedDataCallback', async () => {
    const f = fakeGnfd();
    const c = await makeWalletGreenfieldClient({
      provider,
      rpcUrl: 'rpc',
      chainId: 5600,
      spEndpoint: 'https://sp.one',
      loadSdk: async () => f.mod,
    });
    const res = await c.createBucket({
      bucketName: 'b',
      creator: '0xC',
      visibility: 'public',
    });
    expect(res).toEqual({ txHash: '0xtx' });
    expect(f.mod.Client.create).toHaveBeenCalledWith('rpc', '5600');
    const bcast = f._.broadcast.mock.calls[0][0];
    expect(typeof bcast.signTypedDataCallback).toBe('function');
    expect(bcast.privateKey).toBeUndefined(); // wallet, not key
  });

  it('uploadObject uses lowercase offchainauth + EDDSA delegate auth', async () => {
    const f = fakeGnfd();
    const c = await makeWalletGreenfieldClient({
      provider,
      rpcUrl: 'rpc',
      chainId: 5600,
      spEndpoint: 'https://sp.one',
      loadSdk: async () => f.mod,
    });
    await c.uploadObject({
      bucketName: 'b',
      objectKey: 'k.md',
      data: 'hello',
      contentType: 'text/markdown',
      creator: '0xC',
      visibility: 'public',
    });
    expect(f._.genOffChainAuthKeyPairAndUpload).toHaveBeenCalled();
    const [, authArg] = f._.delegateUploadObject.mock.calls[0];
    expect(authArg).toMatchObject({ type: 'EDDSA', seed: 'SEED', address: '0xC' });
  });
});
