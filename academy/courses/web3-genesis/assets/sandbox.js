/**
 * Daskibo Academy — Web3 Genesis sandbox
 *
 * Deterministic, in-memory EVM-flavored simulator built for the classroom:
 *   • No network, no RPC, no MetaMask required — runs in a vitest jsdom test
 *     and in the browser identically.
 *   • Mirrors the surface that students will later meet on Tenderly / Anvil /
 *     mainnet (viem-style reads & writes, BigInt amounts, Transfer events,
 *     0x-prefixed addresses & tx hashes, gas accounting).
 *   • Pure ESM, no third-party dependencies — usable from <script type="module">
 *     and from `import { ... } from '.../sandbox.js'` inside tests.
 *
 * The point is NOT to be a faithful EVM. The point is to give the learner the
 * shortest possible feedback loop on the four core ERC-20 mechanics: deploy,
 * transfer, balance, event.
 */

// ── Constants ─────────────────────────────────────────────────────────────

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Default 10 ETH starting balance for every faucet-funded test account. */
export const DEFAULT_NATIVE = 10n * 10n ** 18n;

/** Fixed gas cost for an ERC-20 transfer in the sim. Realistic order of magnitude. */
export const TRANSFER_GAS = 51_000n;

/** Fixed gas cost for an ERC-20 deployment in the sim. */
export const DEPLOY_GAS = 850_000n;

/** Sim gas price: 1 gwei. */
export const GAS_PRICE = 1_000_000_000n;

// ── Errors ────────────────────────────────────────────────────────────────

export class SandboxError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SandboxError';
    this.code = code;
  }
}

// ── Address & hash helpers (deterministic, not cryptographic) ─────────────

/**
 * Cheap, deterministic 32-bit-ish FNV-1a hash. Sufficient for the classroom
 * but obviously NOT a substitute for keccak256.
 */
function fnv1a(input) {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = (1n << 64n) - 1n;
  for (let i = 0; i < input.length; i++) {
    h = (h ^ BigInt(input.charCodeAt(i))) & mask;
    h = (h * prime) & mask;
  }
  return h;
}

/** Build a 20-byte address from any seed string. */
export function deriveAddress(seed) {
  let h = fnv1a(seed);
  let hex = '';
  for (let i = 0; i < 5; i++) {
    hex += h.toString(16).padStart(16, '0');
    h = fnv1a(hex + seed);
  }
  return '0x' + hex.slice(0, 40);
}

/** Build a 32-byte tx hash from a seed string. */
export function deriveTxHash(seed) {
  let h = fnv1a(seed);
  let hex = '';
  for (let i = 0; i < 8; i++) {
    hex += h.toString(16).padStart(16, '0');
    h = fnv1a(hex + seed + i);
  }
  return '0x' + hex.slice(0, 64);
}

/** EIP-55-flavoured normalisation (just lowercases; no checksum). */
export function normalizeAddress(addr) {
  if (typeof addr !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
    throw new SandboxError('BAD_ADDRESS', `not a valid 20-byte address: ${addr}`);
  }
  return addr.toLowerCase();
}

// ── Sandbox core ──────────────────────────────────────────────────────────

/**
 * Create a new isolated sandbox. Each call returns an independent universe
 * with its own accounts, contracts, and tx history.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.accounts]  Optional list of pre-funded accounts.
 * @param {bigint}   [opts.faucet]    Optional native balance per account.
 */
export function createSandbox(opts = {}) {
  const faucet = opts.faucet ?? DEFAULT_NATIVE;

  // Mutable world state.
  const native = new Map();           // address -> bigint
  const contracts = new Map();        // address -> { kind, state }
  const txs = [];                     // ordered list of mined transactions
  const logs = [];                    // ordered list of decoded events
  let nonce = 0;                      // global ordering nonce

  // Default cast of characters. The same seeds every session ⇒ stable docs.
  const defaultAccounts = ['alice', 'bob', 'carol', 'dave']
    .map((name) => ({ name, address: deriveAddress(`account:${name}`) }));

  const namedAccounts = new Map(defaultAccounts.map((a) => [a.name, a.address]));
  const labels = new Map(defaultAccounts.map((a) => [a.address, a.name]));

  const seed = (addr) => native.set(addr, faucet);
  for (const a of defaultAccounts) seed(a.address);
  for (const extra of opts.accounts ?? []) {
    const addr = normalizeAddress(extra);
    if (!native.has(addr)) seed(addr);
  }

  // ── Internal mining helper ──────────────────────────────────────────────

  function mine(from, gas, op) {
    nonce += 1;
    const fee = gas * GAS_PRICE;
    const fromBal = native.get(from) ?? 0n;
    if (fromBal < fee) {
      throw new SandboxError('OUT_OF_GAS', `${labelOf(from)} cannot afford ${gas} gas`);
    }
    native.set(from, fromBal - fee);

    const hash = deriveTxHash(`tx:${nonce}:${from}:${op.kind}`);
    const tx = {
      hash,
      nonce,
      from,
      gas,
      gasPrice: GAS_PRICE,
      fee,
      ...op,
    };
    txs.push(tx);
    return tx;
  }

  function labelOf(address) {
    return labels.get(address) ?? address;
  }

  // ── Native balances ─────────────────────────────────────────────────────

  function getBalance(addressOrName) {
    const addr = resolve(addressOrName);
    return native.get(addr) ?? 0n;
  }

  function resolve(addressOrName) {
    if (typeof addressOrName !== 'string') {
      throw new SandboxError('BAD_ADDRESS', 'address must be a string');
    }
    if (namedAccounts.has(addressOrName)) return namedAccounts.get(addressOrName);
    return normalizeAddress(addressOrName);
  }

  // ── ERC-20: deploy ──────────────────────────────────────────────────────

  /**
   * Deploy a fresh ERC-20 token. The deployer receives `initialSupply` * 10^decimals.
   */
  function deployERC20(deployerNameOrAddr, params) {
    const { name, symbol } = params;
    const decimals = params.decimals ?? 18;
    const initialSupply = BigInt(params.initialSupply);

    if (!name || typeof name !== 'string') {
      throw new SandboxError('BAD_PARAM', 'token name is required');
    }
    if (!symbol || typeof symbol !== 'string') {
      throw new SandboxError('BAD_PARAM', 'token symbol is required');
    }
    if (initialSupply < 0n) {
      throw new SandboxError('BAD_PARAM', 'initialSupply cannot be negative');
    }
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
      throw new SandboxError('BAD_PARAM', 'decimals must be an integer in [0, 36]');
    }

    const deployer = resolve(deployerNameOrAddr);
    const address = deriveAddress(`erc20:${name}:${symbol}:${deployer}:${nonce}`);
    const supply = initialSupply * 10n ** BigInt(decimals);

    const state = {
      name,
      symbol,
      decimals,
      totalSupply: supply,
      balances: new Map([[deployer, supply]]),
      allowances: new Map(),
      deployer,
    };
    contracts.set(address, { kind: 'erc20', state });

    const tx = mine(deployer, DEPLOY_GAS, {
      kind: 'deploy',
      contract: address,
      params: { name, symbol, decimals, initialSupply: supply },
    });

    if (supply > 0n) {
      const event = {
        address,
        event: 'Transfer',
        args: { from: ZERO_ADDRESS, to: deployer, value: supply },
        txHash: tx.hash,
        nonce,
      };
      logs.push(event);
      tx.logs = [event];
    } else {
      tx.logs = [];
    }

    return { address, tx };
  }

  // ── ERC-20: read views ──────────────────────────────────────────────────

  function getToken(address) {
    const c = contracts.get(normalizeAddress(address));
    if (!c || c.kind !== 'erc20') {
      throw new SandboxError('NO_CONTRACT', `no ERC-20 at ${address}`);
    }
    return c.state;
  }

  function balanceOf(tokenAddress, addressOrName) {
    const t = getToken(tokenAddress);
    const who = resolve(addressOrName);
    return t.balances.get(who) ?? 0n;
  }

  function totalSupply(tokenAddress) {
    return getToken(tokenAddress).totalSupply;
  }

  function tokenInfo(tokenAddress) {
    const t = getToken(tokenAddress);
    return { name: t.name, symbol: t.symbol, decimals: t.decimals, totalSupply: t.totalSupply };
  }

  // ── ERC-20: writes ──────────────────────────────────────────────────────

  function transfer(tokenAddress, fromNameOrAddr, toNameOrAddr, rawAmount) {
    const t = getToken(tokenAddress);
    const from = resolve(fromNameOrAddr);
    const to = resolve(toNameOrAddr);
    const amount = BigInt(rawAmount);

    if (amount < 0n) {
      throw new SandboxError('BAD_PARAM', 'amount cannot be negative');
    }
    if (to === ZERO_ADDRESS) {
      throw new SandboxError('ERC20_ZERO_TO', 'ERC20: transfer to the zero address');
    }
    const fromBal = t.balances.get(from) ?? 0n;
    if (fromBal < amount) {
      throw new SandboxError('ERC20_INSUFFICIENT', `transfer of ${amount} exceeds balance ${fromBal}`);
    }

    t.balances.set(from, fromBal - amount);
    t.balances.set(to, (t.balances.get(to) ?? 0n) + amount);

    const tx = mine(from, TRANSFER_GAS, {
      kind: 'transfer',
      contract: normalizeAddress(tokenAddress),
      to,
      amount,
    });
    const event = {
      address: normalizeAddress(tokenAddress),
      event: 'Transfer',
      args: { from, to, value: amount },
      txHash: tx.hash,
      nonce: tx.nonce,
    };
    logs.push(event);
    tx.logs = [event];
    return tx;
  }

  // ── Introspection helpers ───────────────────────────────────────────────

  function getEvents(filter = {}) {
    return logs.filter((l) => {
      if (filter.address && normalizeAddress(filter.address) !== l.address) return false;
      if (filter.event && filter.event !== l.event) return false;
      return true;
    });
  }

  function getTransactions() {
    return txs.slice();
  }

  function listAccounts() {
    return Array.from(namedAccounts.entries()).map(([name, address]) => ({
      name,
      address,
      balance: native.get(address) ?? 0n,
    }));
  }

  function labelFor(addressOrName) {
    if (namedAccounts.has(addressOrName)) {
      return `${addressOrName} (${namedAccounts.get(addressOrName).slice(0, 6)}…)`;
    }
    const addr = normalizeAddress(addressOrName);
    return labels.has(addr) ? `${labels.get(addr)} (${addr.slice(0, 6)}…)` : addr;
  }

  return {
    // queries
    getBalance,
    balanceOf,
    totalSupply,
    tokenInfo,
    getEvents,
    getTransactions,
    listAccounts,
    labelFor,
    resolve,
    // writes
    deployERC20,
    transfer,
    // raw access (read-only access intended)
    _state: { native, contracts, txs, logs, namedAccounts, labels },
  };
}

// ── Pretty printing ───────────────────────────────────────────────────────

/** Format a raw bigint amount using `decimals`, trimming trailing zeros. */
export function formatUnits(value, decimals = 18) {
  const v = BigInt(value);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  if (frac === 0n) return (neg ? '-' : '') + whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + `${whole}.${fracStr}`;
}

/** Parse a human-readable decimal string into a raw bigint with `decimals`. */
export function parseUnits(human, decimals = 18) {
  const s = String(human).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    throw new SandboxError('BAD_PARAM', `not a decimal number: ${human}`);
  }
  const neg = s.startsWith('-');
  const body = neg ? s.slice(1) : s;
  const [whole, frac = ''] = body.split('.');
  if (frac.length > decimals) {
    throw new SandboxError('BAD_PARAM', `too many decimals: ${human}`);
  }
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const value = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || '0');
  return neg ? -value : value;
}
