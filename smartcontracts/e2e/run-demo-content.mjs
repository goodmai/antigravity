/**
 * Daskibo demo — course-content.html unlock, headless autotest.
 *
 * Reproduces exactly what course-content.js does on "Connect MetaMask & unlock",
 * so the "Unlock failed: Failed to fetch" class of regressions is caught in CI:
 *
 *   1. Load demo/manifest-<id>.json (served by the frontend or read from disk).
 *   2. Assert the manifest is INTERNALLY CONSISTENT with the live stack:
 *        - manifest.rpcUrl actually answers eth_chainId == manifest.chainId
 *          (this is the bug we hit: rpcUrl was :8545 while Anvil is on :9545).
 *        - manifest.chipotleUrl /version is reachable AND its PKP == manifest.pkpId
 *          (the mock regenerates its PKP on restart → stale ciphertext).
 *   3. hasCourseAccess(authorizedAccount, courseId) == true on manifest.rpcUrl.
 *   4. Sign an ownership proof, call Chipotle decrypt → recover the master key.
 *   5. AES-GCM decrypt manifest.env and assert the lesson plaintext is recovered.
 *
 * Env (defaults target the local main stack):
 *   FRONTEND=http://localhost:8085   COURSE_ID=1
 *   RPC=http://localhost:9545        CHIPOTLE=http://localhost:8000
 *   AUTH_PK=<pk of an account that satisfies hasCourseAccess> (default: course author, anvil #2)
 */
import { createRequire } from 'node:module';
import { decryptObject } from '../buckets/crypto-envelope.js';

const _require = createRequire(import.meta.url);
const ethers = _require('ethers');
// Support ethers v5 (ethers.providers.JsonRpcProvider) and v6 (ethers.JsonRpcProvider).
const Wallet = ethers.Wallet;
const Contract = ethers.Contract;
const JsonRpcProvider = ethers.providers?.JsonRpcProvider || ethers.JsonRpcProvider;

const FRONTEND  = process.env.FRONTEND  || 'http://localhost:8085';
const COURSE_ID = Number(process.env.COURSE_ID || 1);
const RPC       = process.env.RPC       || 'http://localhost:9545';
const CHIPOTLE  = process.env.CHIPOTLE  || 'http://localhost:8000';
// anvil #2 = 0x3C44… is the demo course author → always has access.
const AUTH_PK   = process.env.AUTH_PK   || '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';

let fails = 0;
const ok  = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { console.log(`  ✗ ${m}`); fails++; };

async function rpcChainId(url) {
  const r = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
    signal: AbortSignal.timeout(4000),
  });
  return parseInt((await r.json()).result, 16);
}

async function main() {
  console.log('\n━━ Demo course-content unlock autotest ━━');

  // [1] manifest
  const mRes = await fetch(`${FRONTEND}/demo/manifest-${COURSE_ID}.json`, { cache: 'no-store' });
  if (!mRes.ok) { bad(`manifest HTTP ${mRes.status}`); return finish(); }
  const manifest = await mRes.json();
  ok(`manifest-${COURSE_ID}.json loaded (rpc ${manifest.rpcUrl}, chipotle ${manifest.chipotleUrl})`);

  // [2a] rpcUrl in the manifest must be live and match its chainId — THE BUG.
  try {
    const cid = await rpcChainId(manifest.rpcUrl);
    cid === manifest.chainId
      ? ok(`manifest.rpcUrl reachable, chainId ${cid} == manifest.chainId`)
      : bad(`manifest.rpcUrl chainId ${cid} != manifest.chainId ${manifest.chainId}`);
  } catch (e) {
    bad(`manifest.rpcUrl ${manifest.rpcUrl} unreachable ("Failed to fetch" in the UI): ${e.message}`);
  }

  // [2a'] CSP connect-src on the served page must allow manifest.rpcUrl + chipotleUrl.
  // Node has no CSP, so a reachable RPC still "Failed to fetch" in the browser if the
  // page's connect-src omits its host (the :9545 vs :8545 regression). Parse it here.
  try {
    const html = await (await fetch(`${FRONTEND}/course-content.html`, { cache: 'no-store' })).text();
    const csp = (html.match(/connect-src([^;]*)/i) || [, ''])[1];
    const allowed = (url) => {
      const u = new URL(url);
      const origin = `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}`;
      return csp.includes(origin) || csp.includes(`${u.protocol}//${u.hostname}`);
    };
    for (const [label, url] of [['rpcUrl', manifest.rpcUrl], ['chipotleUrl', manifest.chipotleUrl]]) {
      allowed(url)
        ? ok(`CSP connect-src allows manifest.${label} (${url})`)
        : bad(`CSP connect-src BLOCKS manifest.${label} ${url} — browser throws "Failed to fetch" (add host to course-content.html CSP)`);
    }
  } catch (e) {
    bad(`could not fetch/parse course-content.html CSP: ${e.message}`);
  }

  // [2b] chipotle reachable + PKP matches the wrapped ciphertext.
  try {
    const v = await (await fetch(`${manifest.chipotleUrl}/core/v1/version`, { signal: AbortSignal.timeout(4000) })).json();
    v.pkp?.toLowerCase() === manifest.pkpId?.toLowerCase()
      ? ok(`chipotle reachable, PKP ${v.pkp} == manifest.pkpId`)
      : bad(`chipotle PKP ${v.pkp} != manifest.pkpId ${manifest.pkpId} (stale ciphertext — re-run demo-encrypt)`);
  } catch (e) {
    bad(`chipotle ${manifest.chipotleUrl} unreachable: ${e.message}`);
  }

  // [3] on-chain access for the authorized account
  const wallet = new Wallet(AUTH_PK);
  const read = new JsonRpcProvider(RPC);
  const mp = new Contract(manifest.marketplace, ['function hasCourseAccess(address,uint256) view returns (bool)'], read);
  const hasAccess = await mp.hasCourseAccess(wallet.address, COURSE_ID).catch(() => false);
  hasAccess ? ok(`hasCourseAccess(${wallet.address.slice(0, 10)}…, ${COURSE_ID}) == true`)
            : bad(`hasCourseAccess false for ${wallet.address} — not an authorized account`);

  // [4] sign proof + Chipotle decrypt → master key
  const message = `Daskibo course access\nCourse: ${COURSE_ID}\nWallet: ${wallet.address}\nNonce: ${Date.now()}`;
  const signature = await wallet.signMessage(message);
  const dRes = await fetch(`${CHIPOTLE}/core/v1/lit_action`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'dummy-api-key' },
    body: JSON.stringify({ js_params: {
      action: 'decrypt', ciphertext: manifest.masterCiphertext,
      accessControlConditions: manifest.accessControlConditions,
      userAddress: wallet.address, signedProof: { message, signature },
    } }),
  });
  const dData = await dRes.json();
  if (dData.has_error) { bad(`chipotle decrypt refused: ${dData.error || dData.logs}`); return finish(); }
  const masterKey = dData.response?.decrypted;
  masterKey ? ok('master key released by Chipotle') : bad('no master key returned');

  // [5] AES-GCM decrypt the lesson
  if (masterKey) {
    try {
      const { text } = await decryptObject(masterKey, manifest.env);
      text && text.includes(manifest.title)
        ? ok(`lesson decrypted (${text.length} chars, title present)`)
        : bad('lesson decrypted but content unexpected');
    } catch (e) { bad(`AES decrypt failed: ${e.message}`); }
  }

  finish();
}

function finish() {
  console.log(fails === 0
    ? '\n━━ DEMO-CONTENT OK — buy → unlock → decrypt verified ━━'
    : `\n━━ DEMO-CONTENT FAILED — ${fails} check(s) ━━`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error('autotest crashed:', e?.stack || e); process.exit(1); });
