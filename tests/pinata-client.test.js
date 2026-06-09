import { describe, it, expect } from 'vitest';
import {
  PINATA_UPLOAD_URL,
  PINATA_LEGACY_UPLOAD_URL,
  pinataAuthHeaders,
  normalizeGateway,
  gatewayUrl,
  parseCid,
} from '../tools/pinata/pinata-client.mjs';

describe('pinataAuthHeaders', () => {
  it('prefers JWT (Bearer) when provided', () => {
    expect(pinataAuthHeaders({ jwt: 'eyJabc' })).toEqual({
      Authorization: 'Bearer eyJabc',
    });
  });

  it('falls back to legacy api key + secret', () => {
    expect(pinataAuthHeaders({ apiKey: 'k', apiSecret: 's' })).toEqual({
      pinata_api_key: 'k',
      pinata_secret_api_key: 's',
    });
  });

  it('JWT wins over legacy when both present', () => {
    const h = pinataAuthHeaders({ jwt: 'j', apiKey: 'k', apiSecret: 's' });
    expect(h).toEqual({ Authorization: 'Bearer j' });
  });

  it('throws MISSING_PINATA_AUTH when nothing is provided', () => {
    expect(() => pinataAuthHeaders({})).toThrowError(/MISSING_PINATA_AUTH/);
  });

  it('throws when only an api key is given (secret required for legacy)', () => {
    expect(() => pinataAuthHeaders({ apiKey: 'k' })).toThrowError(/MISSING_PINATA_AUTH/);
  });
});

describe('normalizeGateway', () => {
  it('strips https:// and trailing slash', () => {
    expect(normalizeGateway('https://bronze-junior-ant-598.mypinata.cloud/')).toBe(
      'bronze-junior-ant-598.mypinata.cloud',
    );
  });

  it('leaves a bare host untouched', () => {
    expect(normalizeGateway('bronze-junior-ant-598.mypinata.cloud')).toBe(
      'bronze-junior-ant-598.mypinata.cloud',
    );
  });

  it('strips http:// too', () => {
    expect(normalizeGateway('http://x.mypinata.cloud')).toBe('x.mypinata.cloud');
  });

  it('throws on empty', () => {
    expect(() => normalizeGateway('')).toThrowError(/INVALID_GATEWAY/);
  });
});

describe('gatewayUrl', () => {
  it('builds an /ipfs/<cid> URL on the dedicated gateway', () => {
    expect(
      gatewayUrl('QmAbc123', { gateway: 'bronze-junior-ant-598.mypinata.cloud' }),
    ).toBe('https://bronze-junior-ant-598.mypinata.cloud/ipfs/QmAbc123');
  });

  it('normalizes a gateway passed with protocol/slash', () => {
    expect(gatewayUrl('QmAbc', { gateway: 'https://x.mypinata.cloud/' })).toBe(
      'https://x.mypinata.cloud/ipfs/QmAbc',
    );
  });

  it('throws on a missing cid', () => {
    expect(() => gatewayUrl('', { gateway: 'x.mypinata.cloud' })).toThrowError(/INVALID_CID/);
  });

  it('throws on a missing gateway', () => {
    expect(() => gatewayUrl('QmAbc', {})).toThrowError(/INVALID_GATEWAY/);
  });

  it('appends a gateway access token as ?pinataGatewayToken when given', () => {
    expect(gatewayUrl('QmAbc', { gateway: 'g.mypinata.cloud', token: 'TOK123' })).toBe(
      'https://g.mypinata.cloud/ipfs/QmAbc?pinataGatewayToken=TOK123',
    );
  });

  it('omits the query when no token is given', () => {
    expect(gatewayUrl('QmAbc', { gateway: 'g.mypinata.cloud' })).toBe(
      'https://g.mypinata.cloud/ipfs/QmAbc',
    );
  });
});

describe('parseCid', () => {
  it('reads the v3 shape data.cid', () => {
    expect(parseCid({ data: { cid: 'QmV3', id: '1' } })).toBe('QmV3');
  });

  it('reads a top-level cid', () => {
    expect(parseCid({ cid: 'QmTop' })).toBe('QmTop');
  });

  it('reads the legacy IpfsHash', () => {
    expect(parseCid({ IpfsHash: 'QmLegacy', PinSize: 10 })).toBe('QmLegacy');
  });

  it('throws when no cid can be found', () => {
    expect(() => parseCid({ data: {} })).toThrowError(/NO_CID_IN_RESPONSE/);
  });

  it('throws on a null/garbage response', () => {
    expect(() => parseCid(null)).toThrowError(/NO_CID_IN_RESPONSE/);
  });
});

describe('endpoint constants', () => {
  it('points at the v3 uploads host and the legacy pinning host', () => {
    expect(PINATA_UPLOAD_URL).toBe('https://uploads.pinata.cloud/v3/files');
    expect(PINATA_LEGACY_UPLOAD_URL).toBe('https://api.pinata.cloud/pinning/pinFileToIPFS');
  });
});
