import { describe, it, expect } from 'vitest';
import {
  ipfsMirrorConfigFromEnv,
  mirrorTargets,
  mirrorPlanObjects,
  pinManifest,
} from '../smartcontracts/greenfield-testnet/ipfs-mirror.mjs';

describe('ipfsMirrorConfigFromEnv', () => {
  it('is disabled by default', () => {
    expect(ipfsMirrorConfigFromEnv({}).enabled).toBe(false);
  });

  it.each(['1', 'true', 'yes', 'TRUE'])('enables on PIN_TO_IPFS=%s', (v) => {
    expect(ipfsMirrorConfigFromEnv({ PIN_TO_IPFS: v }).enabled).toBe(true);
  });

  it('stays disabled on PIN_TO_IPFS=0/off', () => {
    expect(ipfsMirrorConfigFromEnv({ PIN_TO_IPFS: '0' }).enabled).toBe(false);
    expect(ipfsMirrorConfigFromEnv({ PIN_TO_IPFS: 'off' }).enabled).toBe(false);
  });

  it('defaults the gateway and picks up credentials', () => {
    const cfg = ipfsMirrorConfigFromEnv({ PINATA_JWT: 'j', PINATA_GATEWAY_KEY: 'tok' });
    expect(cfg.gateway).toBe('gateway.pinata.cloud');
    expect(cfg.jwt).toBe('j');
    expect(cfg.gatewayToken).toBe('tok');
  });

  it('supports the legacy secret alias PINATA_SECRET_API_KEY', () => {
    const cfg = ipfsMirrorConfigFromEnv({ PINATA_API_KEY: 'k', PINATA_SECRET_API_KEY: 's' });
    expect(cfg.apiKey).toBe('k');
    expect(cfg.apiSecret).toBe('s');
  });
});

describe('mirrorTargets', () => {
  it('excludes the manifest (pinned separately, after CID embedding)', () => {
    const objects = [
      { kind: 'manifest', key: '_lit/manifest.json' },
      { kind: 'lesson', key: 'lessons/1.md.enc' },
      { kind: 'index', key: 'index.json' },
    ];
    expect(mirrorTargets(objects).map((o) => o.key)).toEqual(['lessons/1.md.enc', 'index.json']);
  });
});

describe('mirrorPlanObjects / pinManifest', () => {
  const cfg = { jwt: 'j', gateway: 'my.gw.example' };

  it('pins every non-manifest object and returns the CID map', async () => {
    const calls = [];
    const pin = async (opts) => {
      calls.push(opts);
      return { cid: `cid-${calls.length}` };
    };
    const objects = [
      { kind: 'lesson', key: 'a.enc', body: 'x', contentType: 'text/plain' },
      { kind: 'manifest', key: '_lit/manifest.json', body: '{}' },
      { kind: 'lesson', key: 'b.enc', body: 'y' },
    ];
    const mirror = await mirrorPlanObjects({ objects, bucket: 'bkt', cfg }, { pin });
    expect(mirror).toEqual({ gateway: 'my.gw.example', items: { 'a.enc': 'cid-1', 'b.enc': 'cid-2' } });
    expect(calls[0].name).toBe('bkt/a.enc');
    expect(calls[0].contentType).toBe('text/plain');
    expect(calls[0].jwt).toBe('j');
  });

  it('pinManifest returns the CID and a token-LESS gateway url', async () => {
    const pin = async () => ({ cid: 'bafymanifest' });
    const { cid, url } = await pinManifest(
      { manifest: { a: 1 }, bucket: 'bkt', cfg: { ...cfg, gatewayToken: 'SECRET' } },
      { pin },
    );
    expect(cid).toBe('bafymanifest');
    expect(url).toBe('https://my.gw.example/ipfs/bafymanifest');
    expect(url).not.toContain('SECRET');
  });
});
