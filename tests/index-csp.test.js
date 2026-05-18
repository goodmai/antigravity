/**
 * Daskibo Academy — CSP / XSS-hardening guard (audit 4.2)
 *
 * Regression guard: the bucket console must ship a Content-Security-Policy
 * and must not reintroduce an inline module script (which would force
 * 'unsafe-inline' and re-open the session-sig theft vector).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(
  path.join(ROOT, 'smartcontracts/index.html'),
  'utf8',
);

describe('index.html Content-Security-Policy', () => {
  it('ships a CSP meta tag', () => {
    expect(html).toMatch(
      /http-equiv="Content-Security-Policy"/i,
    );
  });

  it('restricts scripts to self + the pinned CDN, no unsafe-inline', () => {
    const csp = html.match(/Content-Security-Policy"\s+content="([^"]+)"/i)[1];
    expect(csp).toMatch(/script-src 'self' https:\/\/esm\.sh/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
  });

  it('restricts connect-src to trusted domains (audit 5.3 — no bare https:)', () => {
    const csp = html.match(/Content-Security-Policy"\s+content="([^"]+)"/i)[1];
    const connect = csp.match(/connect-src ([^;]+)/)[1].trim();
    // must NOT be the broad `https:` wildcard
    expect(connect).not.toMatch(/(^|\s)https:(\s|$)/);
    expect(connect).toContain("'self'");
    expect(connect).toContain('https://*.bnbchain.org'); // Greenfield RPC/SP
    expect(connect).toMatch(/litprotocol\.com|litgateway\.com/); // Lit nodes
  });

  it('has no inline module script body (extracted to index-init.js)', () => {
    expect(html).toContain('src="./index-init.js"');
    expect(html).not.toMatch(/<script type="module">\s*\S/);
  });
});
