import { describe, it, expect } from 'vitest';
import {
  PINATA_UPLOAD_URL,
  pinFile,
  pinJson,
} from '../tools/pinata/pinata-client.mjs';

/** A fake fetch that records the last call and returns a canned response. */
function fakeFetch({ ok = true, status = 200, json = { data: { cid: 'QmFAKE' } }, text = '' } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return {
      ok,
      status,
      json: async () => json,
      text: async () => text,
    };
  };
  fn.calls = calls;
  return fn;
}

describe('pinFile', () => {
  it('POSTs multipart form-data to the v3 endpoint with a Bearer token', async () => {
    const fetch = fakeFetch();
    const res = await pinFile(
      { content: 'hello', name: 'a.txt', jwt: 'jwt123', gateway: 'g.mypinata.cloud' },
      { fetch },
    );
    expect(res.cid).toBe('QmFAKE');
    expect(res.url).toBe('https://g.mypinata.cloud/ipfs/QmFAKE');

    const { url, init } = fetch.calls[0];
    expect(url).toBe(PINATA_UPLOAD_URL);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer jwt123');
    // body is FormData with file + network + name
    expect(init.body.get('network')).toBe('public');
    expect(init.body.get('name')).toBe('a.txt');
    expect(init.body.get('file')).toBeTruthy();
  });

  it('defaults network to public but honors an override', async () => {
    const fetch = fakeFetch();
    await pinFile({ content: 'x', jwt: 'j', network: 'private' }, { fetch });
    expect(fetch.calls[0].init.body.get('network')).toBe('private');
  });

  it('uses legacy headers when only apiKey + apiSecret are given', async () => {
    const fetch = fakeFetch({ json: { IpfsHash: 'QmLeg' } });
    const res = await pinFile({ content: 'x', apiKey: 'k', apiSecret: 's' }, { fetch });
    expect(res.cid).toBe('QmLeg');
    const h = fetch.calls[0].init.headers;
    expect(h.pinata_api_key).toBe('k');
    expect(h.pinata_secret_api_key).toBe('s');
    expect(h.Authorization).toBeUndefined();
  });

  it('omits the gateway url when no gateway is configured', async () => {
    const fetch = fakeFetch();
    const res = await pinFile({ content: 'x', jwt: 'j' }, { fetch });
    expect(res.url).toBeUndefined();
    expect(res.cid).toBe('QmFAKE');
  });

  it('throws PINATA_UPLOAD_FAILED with the status on a non-ok response', async () => {
    const fetch = fakeFetch({ ok: false, status: 401, text: 'bad jwt' });
    await expect(
      pinFile({ content: 'x', jwt: 'j' }, { fetch }),
    ).rejects.toThrowError(/PINATA_UPLOAD_FAILED.*401.*bad jwt/s);
  });

  it('throws MISSING_PINATA_AUTH before any network call when unauthenticated', async () => {
    const fetch = fakeFetch();
    await expect(pinFile({ content: 'x' }, { fetch })).rejects.toThrowError(/MISSING_PINATA_AUTH/);
    expect(fetch.calls.length).toBe(0);
  });
});

describe('pinJson', () => {
  it('serializes the object and pins it as application/json', async () => {
    const fetch = fakeFetch({ json: { data: { cid: 'QmJSON' } } });
    const res = await pinJson({ a: 1, b: 'two' }, { jwt: 'j', name: 'manifest.json' }, { fetch });
    expect(res.cid).toBe('QmJSON');
    const file = fetch.calls[0].init.body.get('file');
    const stored = typeof file.text === 'function' ? await file.text() : String(file);
    expect(JSON.parse(stored)).toEqual({ a: 1, b: 'two' });
    expect(fetch.calls[0].init.body.get('name')).toBe('manifest.json');
  });
});
