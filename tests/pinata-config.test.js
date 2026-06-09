import { describe, it, expect } from 'vitest';
import {
  pinataConfigFromEnv,
  litActionTargets,
} from '../tools/pinata/pinata-config.mjs';

describe('pinataConfigFromEnv', () => {
  it('maps the canonical env vars', () => {
    const cfg = pinataConfigFromEnv({
      PINATA_JWT: 'jwt',
      PINATA_API_KEY: 'k',
      PINATA_API_SECRET: 's',
      PINATA_GATEWAY: 'bronze-junior-ant-598.mypinata.cloud',
    });
    expect(cfg).toEqual({
      jwt: 'jwt',
      apiKey: 'k',
      apiSecret: 's',
      gateway: 'bronze-junior-ant-598.mypinata.cloud',
    });
  });

  it('accepts the PINATA_SECRET_API_KEY alias for the secret', () => {
    const cfg = pinataConfigFromEnv({ PINATA_API_KEY: 'k', PINATA_SECRET_API_KEY: 's2' });
    expect(cfg.apiSecret).toBe('s2');
  });

  it('returns undefined for absent vars (no empty strings)', () => {
    const cfg = pinataConfigFromEnv({});
    expect(cfg).toEqual({ jwt: undefined, apiKey: undefined, apiSecret: undefined, gateway: undefined });
  });
});

describe('litActionTargets', () => {
  const DIR = '/repo/smartcontracts/lit-actions';

  it('lists only the action files that exist on disk', () => {
    const exists = (p) => p.endsWith('claim-signer.action.js');
    const targets = litActionTargets(DIR, { exists });
    expect(targets).toEqual([
      { name: 'claim-signer', file: 'claim-signer.action.js', path: `${DIR}/claim-signer.action.js` },
    ]);
  });

  it('includes wrap-for-buyer once it is added', () => {
    const exists = () => true;
    const names = litActionTargets(DIR, { exists }).map((t) => t.name);
    expect(names).toContain('claim-signer');
    expect(names).toContain('wrap-for-buyer');
  });

  it('returns an empty list when nothing exists', () => {
    expect(litActionTargets(DIR, { exists: () => false })).toEqual([]);
  });
});
