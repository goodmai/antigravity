import { describe, it, expect } from 'vitest';
import {
  resolvePublishEnv,
  isRealChipotle,
  GF_TARGETS,
} from '../smartcontracts/greenfield-testnet/publish-course-run.mjs';

const BASE_TESTNET = {
  GREENFIELD_TESTNET_PRIVATE_KEY: '0x01',
  GREENFIELD_TESTNET_ADDRESS: '0xA11CE',
  MARKETPLACE_ADDR: '0xMKT',
  COURSE_ID: '1',
};
const BASE_MAINNET = {
  GREENFIELD_MAINNET_PRIVATE_KEY: '0x02',
  GREENFIELD_MAINNET_ADDRESS: '0xB0B',
  MARKETPLACE_ADDR: '0xMKT',
  COURSE_ID: '1',
  CHIPOTLE_URL: 'https://api.chipotle.litprotocol.com',
  CHIPOTLE_API_KEY: 'real-key',
};

describe('isRealChipotle', () => {
  it('detects the prod endpoint only', () => {
    expect(isRealChipotle('https://api.chipotle.litprotocol.com')).toBe(true);
    expect(isRealChipotle('http://chipotle-mock:8000')).toBe(false);
    expect(isRealChipotle(undefined)).toBe(false);
  });
});

describe('resolvePublishEnv — testnet target', () => {
  it('resolves Greenfield testnet defaults and bscTestnet gate', () => {
    const cfg = resolvePublishEnv(BASE_TESTNET, 'testnet');
    expect(cfg.rpc).toBe(GF_TARGETS.testnet.rpc);
    expect(cfg.chainId).toBe('5600');
    expect(cfg.gate.chain).toBe('bscTestnet');
    expect(cfg.gate.course).toBe(true);
    expect(cfg.bucket).toMatch(/^daskibo-/);
    expect(cfg.pin.enabled).toBe(false);
  });

  it('requires the key pair', () => {
    expect(() => resolvePublishEnv({ MARKETPLACE_ADDR: 'x', COURSE_ID: '1' }, 'testnet')).toThrow(
      /GREENFIELD_TESTNET_PRIVATE_KEY/,
    );
  });

  it('requires a gate (marketplace+courseId or NFT contract)', () => {
    expect(() =>
      resolvePublishEnv(
        { GREENFIELD_TESTNET_PRIVATE_KEY: '0x01', GREENFIELD_TESTNET_ADDRESS: '0xA' },
        'testnet',
      ),
    ).toThrow(/MARKETPLACE_ADDR \+ COURSE_ID|NFT_GATING_CONTRACT/);
  });

  it('falls back to the NFT balance gate', () => {
    const cfg = resolvePublishEnv(
      {
        GREENFIELD_TESTNET_PRIVATE_KEY: '0x01',
        GREENFIELD_TESTNET_ADDRESS: '0xA',
        NFT_GATING_CONTRACT: '0xNFT',
        NFT_GATING_CHAIN: 'opbnbTestnet',
      },
      'testnet',
    );
    expect(cfg.gate.course).toBe(false);
    expect(cfg.gate.nftContract).toBe('0xNFT');
    expect(cfg.gate.chain).toBe('opbnbTestnet');
  });

  it('refuses a dummy API key against the REAL Chipotle', () => {
    expect(() =>
      resolvePublishEnv(
        { ...BASE_TESTNET, CHIPOTLE_URL: 'https://api.chipotle.litprotocol.com' },
        'testnet',
      ),
    ).toThrow(/Stripe credits/);
  });

  it('PIN_TO_IPFS=1 requires Pinata credentials', () => {
    expect(() => resolvePublishEnv({ ...BASE_TESTNET, PIN_TO_IPFS: '1' }, 'testnet')).toThrow(
      /PINATA_JWT/,
    );
    const cfg = resolvePublishEnv({ ...BASE_TESTNET, PIN_TO_IPFS: '1', PINATA_JWT: 'j' }, 'testnet');
    expect(cfg.pin.enabled).toBe(true);
  });
});

describe('resolvePublishEnv — mainnet target', () => {
  it('resolves Greenfield mainnet defaults and bsc gate', () => {
    const cfg = resolvePublishEnv(BASE_MAINNET, 'mainnet');
    expect(cfg.rpc).toBe('https://greenfield-chain.bnbchain.org:443');
    expect(cfg.chainId).toBe('1017');
    expect(cfg.gate.chain).toBe('bsc');
    expect(cfg.chipotlePublicUrl).toBe('https://api.chipotle.litprotocol.com');
  });

  it('refuses a mock Chipotle URL', () => {
    expect(() =>
      resolvePublishEnv({ ...BASE_MAINNET, CHIPOTLE_URL: 'http://chipotle-mock:8000' }, 'mainnet'),
    ).toThrow(/REAL Chipotle/);
  });

  it('supports opbnb as the gating chain', () => {
    const cfg = resolvePublishEnv({ ...BASE_MAINNET, NFT_GATING_CHAIN: 'opbnb' }, 'mainnet');
    expect(cfg.gate.chain).toBe('opbnb');
  });

  it('misconfig errors carry exitCode 2 (CLI contract)', () => {
    try {
      resolvePublishEnv({}, 'mainnet');
      expect.unreachable();
    } catch (e) {
      expect(e.exitCode).toBe(2);
    }
  });
});
