/**
 * Daskibo Academy — Lit Protocol access control core (TDD)
 *
 * Real Lit threshold encryption of the *bucket master key* (the efficient
 * compose from lit.md §12: AES does bulk, Lit guards the 32-byte master
 * behind on-chain Access Control Conditions). Pure & injectable — the Lit
 * network client is injected so the orchestration is unit-tested with a
 * fake; the real CDN-loaded SDK adapter lives in lit-sdk.js.
 */

import { describe, it, expect, vi } from 'vitest';
import { createLitAccess } from '../smartcontracts/buckets/lit-access.js';

const ACC = [
  {
    contractAddress: '',
    standardContractType: '',
    chain: 'ethereum',
    method: '',
    parameters: [':userAddress'],
    returnValueTest: { comparator: '=', value: '0xReader' },
  },
];

function fakeLitClient() {
  return {
    encrypt: vi.fn(async ({ dataToEncrypt }) => ({
      ciphertext: `CT(${dataToEncrypt})`,
      dataToEncryptHash: 'HASH',
    })),
    decrypt: vi.fn(async ({ ciphertext }) =>
      String(ciphertext).replace(/^CT\(|\)$/g, ''),
    ),
  };
}

describe('createLitAccess.encryptMasterKey', () => {
  it('wraps the master key into a Lit envelope (acc + hash, no plaintext)', async () => {
    const litClient = fakeLitClient();
    const lit = createLitAccess({ litClient });
    const env = await lit.encryptMasterKey('bWFzdGVy', ACC);

    expect(env).toMatchObject({
      schema: 'daskibo.lit.acc/1',
      chain: 'ethereum',
      accessControlConditions: ACC,
      ciphertext: 'CT(bWFzdGVy)',
      dataToEncryptHash: 'HASH',
    });
    // the envelope carries no raw master field — only Lit ciphertext/hash
    expect(Object.values(env)).not.toContain('bWFzdGVy');
    expect(litClient.encrypt).toHaveBeenCalledWith({
      accessControlConditions: ACC,
      dataToEncrypt: 'bWFzdGVy',
    });
  });

  it('rejects an empty / missing access control condition set', async () => {
    const lit = createLitAccess({ litClient: fakeLitClient() });
    await expect(lit.encryptMasterKey('k', [])).rejects.toMatchObject({
      code: 'INVALID_ACC',
    });
    await expect(lit.encryptMasterKey('k')).rejects.toMatchObject({
      code: 'INVALID_ACC',
    });
  });

  it('rejects a missing master key', async () => {
    const lit = createLitAccess({ litClient: fakeLitClient() });
    await expect(lit.encryptMasterKey('', ACC)).rejects.toMatchObject({
      code: 'INVALID_MASTER',
    });
  });

  it('maps a Lit network failure to LIT_UNAVAILABLE', async () => {
    const litClient = fakeLitClient();
    litClient.encrypt.mockRejectedValueOnce(new Error('failed to connect to lit nodes'));
    const lit = createLitAccess({ litClient });
    await expect(lit.encryptMasterKey('k', ACC)).rejects.toMatchObject({
      code: 'LIT_UNAVAILABLE',
    });
  });
});

describe('createLitAccess.decryptMasterKey', () => {
  it('round-trips the master key for an authorized reader', async () => {
    const litClient = fakeLitClient();
    const lit = createLitAccess({ litClient });
    const env = await lit.encryptMasterKey('bWFzdGVy', ACC);
    const back = await lit.decryptMasterKey(env, { sessionSigs: {} });
    expect(back).toBe('bWFzdGVy');
    expect(litClient.decrypt).toHaveBeenCalledWith(
      expect.objectContaining({
        accessControlConditions: ACC,
        ciphertext: 'CT(bWFzdGVy)',
        dataToEncryptHash: 'HASH',
        chain: 'ethereum',
      }),
      { sessionSigs: {} },
    );
  });

  it('maps an unsatisfied ACC to ACCESS_DENIED', async () => {
    const litClient = fakeLitClient();
    litClient.decrypt.mockRejectedValueOnce(
      new Error('user is not authorized: access control conditions check failed'),
    );
    const lit = createLitAccess({ litClient });
    const env = await lit.encryptMasterKey('k', ACC);
    await expect(
      lit.decryptMasterKey(env, { sessionSigs: {} }),
    ).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });

  it('rejects a malformed Lit envelope', async () => {
    const lit = createLitAccess({ litClient: fakeLitClient() });
    await expect(
      lit.decryptMasterKey({ schema: 'nope' }, {}),
    ).rejects.toMatchObject({ code: 'INVALID_LIT_ENVELOPE' });
  });
});
