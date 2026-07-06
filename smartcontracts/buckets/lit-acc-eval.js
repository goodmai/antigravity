/**
 * Daskibo Academy — canonical Access-Control-Condition evaluator
 *
 * The Chipotle TEE does NOT run `Lit.Actions.checkConditions`, so every ACC is
 * enforced **app-side**, on the decrypt path, before the master key is trusted.
 * This module is the single source of truth for that enforcement, shared by:
 *   - greenfield-testnet/chipotle-mock.mjs  (local mock server)
 *   - buckets/lit-sdk-chipotle.js           (real-Chipotle adapter)
 *   - bucket-reader.html / course-view.js   (browser readers)
 *
 * Before this module existed the two-pass logic was copy-pasted into each of
 * those files and drifted: the mock enforced the `timestamp` (expiry) condition
 * but the adapter and a reader did not, so a subscription expiry held on devnet
 * yet leaked the key on mainnet. Keep it here, import it everywhere.
 *
 * Two passes (mirrors the original chipotle-mock `accSatisfied`):
 *   Pass 1 — every `timestamp` condition with value > 0 must currently hold
 *            (AND). value 0 = perpetual. This enforces P-A subscription expiry.
 *   Pass 2 — at least one address-allowlist OR on-chain contract condition
 *            passes (OR) — standard Lit ACC semantics.
 *
 * Pure & dependency-free: on-chain reads are done through an injected
 * `ethCall(to, dataHex) => Promise<hexString>` so the same code runs under
 * Node (ethers, or raw RPC) and in the browser (raw `eth_call` via fetch), with
 * no ethers version coupling.
 *
 * @typedef {Record<string, any>} AccCondition
 */

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

// 4-byte selectors (verified with `cast sig`):
const SEL_BALANCE_OF = '70a08231'; // balanceOf(address)
const SEL_HAS_COURSE = 'c77628fb'; // hasCourseAccess(address,uint256)

/** Strip the `{ operator: 'and'|'or' }` joiners, leaving only real conditions. */
export function realConditions(accessControlConditions) {
  return (accessControlConditions || []).filter((c) => c && !c.operator);
}

/**
 * Pass 1 — timestamp / expiry. Returns a human reason string if any timestamp
 * condition is currently violated, or `null` if all pass (or there are none).
 * @param {AccCondition[]} conditions  already operator-stripped
 * @param {number} [nowTs]  unix seconds; defaults to wall clock
 * @returns {string | null}
 */
export function timestampExpiry(conditions, nowTs = Math.floor(Date.now() / 1000)) {
  for (const c of conditions) {
    if (c.standardContractType !== 'timestamp') continue;
    const maxTs = Number(c?.returnValueTest?.value ?? 0);
    if (maxTs === 0) continue; // perpetual
    const cmp = c?.returnValueTest?.comparator ?? '<=';
    const ok = (cmp === '<=' && nowTs <= maxTs) || (cmp === '<' && nowTs < maxTs);
    if (!ok) return `subscription expired — timestamp ${nowTs} > expiry ${maxTs}`;
  }
  return null;
}

function pad32(hexNo0x) { return hexNo0x.padStart(64, '0'); }
function addrArg(a) { return pad32(String(a).toLowerCase().replace(/^0x/, '')); }
function uintArg(n) { return pad32(BigInt(n).toString(16)); }

/** True iff the condition is a bare `:userAddress == <addr>` allowlist match. */
function addressMatches(c, userAddress) {
  const v = c?.returnValueTest?.value;
  return typeof v === 'string' && ADDR_RE.test(v) && v.toLowerCase() === String(userAddress).toLowerCase();
}

/** Decode a 32-byte hex word (with/without 0x) to BigInt. `0x`/empty → 0n. */
function decodeUint(hex) {
  if (!hex || hex === '0x') return 0n;
  return BigInt(hex.startsWith('0x') ? hex : '0x' + hex);
}

/**
 * Full two-pass evaluation.
 * @param {object} args
 * @param {AccCondition[]} args.accessControlConditions  raw (operators allowed)
 * @param {string} args.userAddress
 * @param {number} [args.nowTs]
 * @param {(to: string, dataHex: string) => Promise<string>} [args.ethCall]
 *        on-chain reader; required only if a contract condition is present.
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function evaluateAcc({ accessControlConditions, userAddress, nowTs, ethCall }) {
  if (!userAddress) return { ok: false, reason: 'no userAddress' };
  const conditions = realConditions(accessControlConditions);
  if (conditions.length === 0) return { ok: false, reason: 'no access control conditions' };

  // Pass 1 — timestamp expiry (AND over all timestamp conditions).
  const expired = timestampExpiry(conditions, nowTs);
  if (expired) return { ok: false, reason: expired };

  // Pass 2 — address allowlist OR on-chain contract condition (OR).
  for (const c of conditions) {
    if (c.standardContractType === 'timestamp') continue;

    if (addressMatches(c, userAddress)) return { ok: true };

    if (c.contractAddress) {
      if (typeof ethCall !== 'function') {
        // Can't evaluate an on-chain condition without a reader — skip it
        // rather than throw, so a sibling address condition can still pass.
        continue;
      }
      try {
        if (c.standardContractType === 'ERC721') {
          const data = '0x' + SEL_BALANCE_OF + addrArg(userAddress);
          const bal = decodeUint(await ethCall(c.contractAddress, data));
          const min = BigInt(String(c?.returnValueTest?.value ?? '1'));
          if (bal >= min) return { ok: true };
        } else {
          const courseId = c?.parameters?.[1] ?? '0';
          const data = '0x' + SEL_HAS_COURSE + addrArg(userAddress) + uintArg(courseId);
          if (decodeUint(await ethCall(c.contractAddress, data)) !== 0n) return { ok: true };
        }
      } catch (e) {
        // On-chain read failure is non-fatal for this condition; try the rest.
        // (Surfaced by the caller as "does not satisfy" if nothing passes.)
      }
    }
  }

  return { ok: false, reason: `${userAddress} does not satisfy the access control conditions` };
}

/** Known chain identifier → public JSON-RPC endpoint (for browser readers). */
export const CHAIN_RPCS = {
  ethereum:     'https://ethereum-rpc.publicnode.com',
  bsc:          'https://bsc-rpc.publicnode.com',
  bscTestnet:   'https://bsc-testnet-rpc.publicnode.com',
  opbnb:        'https://opbnb-mainnet-rpc.bnbchain.org',
  opbnbTestnet: 'https://opbnb-testnet-rpc.bnbchain.org',
  base:         'https://base-rpc.publicnode.com',
};

/** Numeric chain id (EIP-155) → chain identifier, for manifests that carry ids. */
export const CHAIN_ID_ALIASES = {
  1: 'ethereum',
  56: 'bsc',
  97: 'bscTestnet',
  204: 'opbnb',
  5611: 'opbnbTestnet',
  8453: 'base',
};

/** Resolve a Lit `chain` identifier (or numeric id) to an RPC URL, or null. */
export function rpcForChain(chain, overrides = {}) {
  if (!chain) return null;
  const map = { ...CHAIN_RPCS, ...overrides };
  const alias = CHAIN_ID_ALIASES[chain] ?? CHAIN_ID_ALIASES[Number(chain)];
  return map[chain] || map[String(chain)] || (alias ? map[alias] : null) || null;
}

/**
 * Build an `ethCall(to, dataHex)` backed by a JSON-RPC endpoint via `fetch`.
 * Works in the browser and in Node 18+ (global fetch).
 * @param {string} rpcUrl
 * @param {typeof fetch} [fetchImpl]
 */
export function makeFetchEthCall(rpcUrl, fetchImpl) {
  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!f) throw new Error('makeFetchEthCall: no fetch implementation available');
  return async function ethCall(to, dataHex) {
    const res = await f(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data: dataHex }, 'latest'] }),
    });
    const json = await res.json();
    if (json.error) throw new Error(`eth_call ${to}: ${json.error.message || json.error}`);
    return json.result;
  };
}
