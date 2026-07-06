/**
 * Daskibo Academy — local SP-emulation backend (TDD)
 *
 * Honest naming: this backend speaks the simplified PUT-to-SP protocol
 * the mock SP understands. It is a *local development / Flow-A emulator*,
 * NOT the real Greenfield on-chain write path (that is the SDK backend).
 * greenfield-core never fakes writes itself — a backend must be injected.
 */

import { describe, it, expect, vi } from 'vitest';
import { createSpEmulationBackend } from '../smartcontracts/integration/sp-emulation-backend.js';

const SP = 'http://sp.local';
const OWNER = '0xAbCd';

describe('createSpEmulationBackend', () => {
  it('createBucket PUTs to the SP and returns the tx hash header', async () => {
    const transport = vi.fn(async () => ({
      status: 200,
      headers: { 'x-gnfd-txn-hash': '0xtx' },
      body: '',
    }));
    const be = createSpEmulationBackend({ transport, endpoint: SP });
    const res = await be.createBucket({
      bucketName: 'my-bucket',
      owner: OWNER,
      visibility: 'public',
    });
    expect(res).toEqual({ bucketName: 'my-bucket', txHash: '0xtx' });
    const call = transport.mock.calls[0][0];
    expect(call.method).toBe('PUT');
    expect(call.url).toBe(`${SP}/my-bucket`);
    expect(call.headers['X-Gnfd-User-Address']).toBe(OWNER);
    expect(call.headers['X-Gnfd-Visibility']).toBe('public');
  });

  it('maps a 409 to BUCKET_EXISTS', async () => {
    const transport = vi.fn(async () => ({ status: 409, headers: {}, body: '' }));
    const be = createSpEmulationBackend({ transport, endpoint: SP });
    await expect(
      be.createBucket({ bucketName: 'dup', owner: OWNER }),
    ).rejects.toMatchObject({ code: 'BUCKET_EXISTS' });
  });

  it('putObject PUTs data, encodes key segments, returns metadata', async () => {
    const transport = vi.fn(async () => ({
      status: 200,
      headers: { 'x-gnfd-txn-hash': '0xobj' },
      body: '',
    }));
    const be = createSpEmulationBackend({ transport, endpoint: SP });
    const res = await be.putObject({
      bucketName: 'b',
      objectKey: 'a file/x.md',
      data: '# Hi',
      contentType: 'text/markdown',
      owner: OWNER,
    });
    expect(res).toEqual({
      bucketName: 'b',
      objectKey: 'a file/x.md',
      txHash: '0xobj',
    });
    const call = transport.mock.calls[0][0];
    expect(call.method).toBe('PUT');
    expect(call.url).toBe(`${SP}/b/a%20file/x.md`);
    expect(call.headers['Content-Type']).toBe('text/markdown');
    expect(call.body).toBe('# Hi');
  });

  it('maps a 5xx to SP_UNAVAILABLE', async () => {
    const transport = vi.fn(async () => ({ status: 503, headers: {}, body: '' }));
    const be = createSpEmulationBackend({ transport, endpoint: SP });
    await expect(
      be.putObject({ bucketName: 'b', objectKey: 'k', data: 'x' }),
    ).rejects.toMatchObject({ code: 'SP_UNAVAILABLE' });
  });
});
