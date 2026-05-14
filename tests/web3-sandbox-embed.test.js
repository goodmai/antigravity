// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildRemixUrl,
  PUBLIC_RPCS,
  NETWORK_PRESETS,
  mountAll,
} from '../academy/courses/web3-genesis/assets/sandbox-embed.js';

describe('buildRemixUrl', () => {
  it('encodes inline source via base64 url-safe code fragment', () => {
    const code = 'contract A {}';
    const url = buildRemixUrl({ code, filename: 'A.sol' });
    expect(url.startsWith('https://remix.ethereum.org/?')).toBe(true);
    expect(url).toContain('autoCompile=true');
    expect(url).toContain('#code=');
    expect(url).toContain('filename=A.sol');
    // не должно содержать padding `=` или `/` или `+`
    const fragment = url.split('#code=')[1].split('&')[0];
    expect(fragment).not.toMatch(/[/+=]/);
  });

  it('uses #url= when source URL is provided', () => {
    const src = 'https://raw.githubusercontent.com/foo/bar/main/A.sol';
    const url = buildRemixUrl({ source: src });
    expect(url).toContain('#url=' + encodeURIComponent(src));
    expect(url).not.toContain('#code=');
  });

  it('respects autoCompile=false', () => {
    const url = buildRemixUrl({ code: 'contract A {}', autoCompile: false });
    expect(url).not.toContain('autoCompile=true');
  });
});

describe('PUBLIC_RPCS', () => {
  it('exposes Sepolia and Ethereum endpoints', () => {
    expect(PUBLIC_RPCS.sepolia).toMatch(/^https?:\/\//);
    expect(PUBLIC_RPCS.ethereum).toMatch(/^https?:\/\//);
  });
});

describe('NETWORK_PRESETS', () => {
  it('uses lowercase hex chain ids', () => {
    for (const id of Object.keys(NETWORK_PRESETS)) {
      expect(id).toMatch(/^0x[0-9a-f]+$/);
    }
  });

  it('Sepolia preset uses official RPC and explorer', () => {
    const sepolia = NETWORK_PRESETS['0xaa36a7'];
    expect(sepolia.chainName).toBe('Sepolia');
    expect(sepolia.rpcUrls[0]).toContain('sepolia');
    expect(sepolia.blockExplorerUrls[0]).toContain('etherscan');
  });
});

describe('mountAll', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders Remix-inline card with a launch button (iframe is lazy)', () => {
    document.body.innerHTML = `
      <div class="sandbox" data-embed="remix-inline" data-title="X" data-filename="X.sol">
        <pre>contract X {}</pre>
      </div>`;
    mountAll(document);
    const host = document.querySelector('.sandbox');
    expect(host.textContent).toContain('X');
    expect(host.querySelector('button[data-action="open"]')).toBeTruthy();
    // iframe не вставляется до клика
    expect(host.querySelector('iframe')).toBeNull();
  });

  it('renders Tenderly cards with deep-links to dashboard.tenderly.co', () => {
    document.body.innerHTML = `
      <div class="sandbox" data-embed="tenderly" data-network="1" data-slug="my-slug"></div>`;
    mountAll(document);
    const host = document.querySelector('.sandbox');
    const cards = host.querySelectorAll('a.embed-card');
    expect(cards.length).toBeGreaterThanOrEqual(3);
    // Ссылки только на официальный Tenderly
    for (const a of cards) {
      expect(a.href).toMatch(/^https:\/\/(dashboard|docs)\.tenderly\.co\//);
    }
    // Slug пробрасывается в форму создания VNet
    const createLink = Array.from(cards).find((a) => a.href.includes('virtual-testnets/new'));
    expect(createLink.href).toContain('slug=my-slug');
    expect(createLink.href).toContain('network=1');
  });

  it('renders live RPC playground with method dropdown and run button', () => {
    document.body.innerHTML = `
      <div class="sandbox" data-embed="rpc-live" data-network="sepolia"></div>`;
    mountAll(document);
    const host = document.querySelector('.sandbox');
    const select = host.querySelector('select');
    expect(select).toBeTruthy();
    const methods = Array.from(select.querySelectorAll('option')).map((o) => o.value);
    expect(methods).toContain('eth_blockNumber');
    expect(methods).toContain('eth_chainId');
    expect(methods).toContain('eth_getTransactionReceipt');
    expect(host.querySelector('button.btn-primary').textContent).toMatch(/вызвать/i);
  });

  it('rpc-live: clicking run posts a JSON-RPC envelope to the public RPC', async () => {
    document.body.innerHTML = `
      <div class="sandbox" data-embed="rpc-live" data-network="sepolia"></div>`;
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x14589ce' }),
    });
    globalThis.fetch = fetchMock;
    mountAll(document);
    const host = document.querySelector('.sandbox');
    host.querySelector('select').value = 'eth_blockNumber';
    host.querySelector('button.btn-primary').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(PUBLIC_RPCS.sepolia);
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('eth_blockNumber');
    expect(body.params).toEqual([]);
  });

  it('metamask card builds a wallet_addEthereumChain payload for Sepolia', () => {
    document.body.innerHTML = `
      <div class="sandbox" data-embed="metamask" data-chain="0xaa36a7"></div>`;
    mountAll(document);
    const host = document.querySelector('.sandbox');
    const pre = host.querySelector('pre.code-block');
    expect(pre.textContent).toContain('wallet_addEthereumChain');
    expect(pre.textContent).toContain('0xaa36a7');
    expect(pre.textContent).toContain('Sepolia');
  });

  it('anvil card prints copy-paste commands including fork URL', () => {
    document.body.innerHTML = `
      <div class="sandbox" data-embed="anvil" data-fork="https://example.org/rpc"></div>`;
    mountAll(document);
    const host = document.querySelector('.sandbox');
    expect(host.textContent).toContain('anvil --fork-url https://example.org/rpc');
    expect(host.textContent).toContain('foundryup');
  });
});
