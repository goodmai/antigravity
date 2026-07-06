/**
 * Daskibo Academy — Lit/Greenfield payments & w3ext fee math
 *
 * Pure, deterministic money math. Amounts are integer minor units as
 * BigInt (wei-style); percentages are basis points (bps, 10000 = 100%).
 * Every split re-sums exactly to its input — the rounding remainder is
 * assigned to the principal so no wei is created or lost.
 *
 * Policy encoded here:
 *   - Lit Protocol is paid for BOTH save (encryption) and read
 *     (decryption) operations.
 *   - w3ext (the platform broker) takes 20% of the course SAVE cost by
 *     default (and, by default, 20% of the read cost).
 *   - When a course is SOLD, 20% of the sale price is routed to the
 *     `treasury` smart contract; the seller receives the remainder.
 */

export const BPS_DENOMINATOR = 10000n;
export const DEFAULT_W3EXT_FEE_BPS = 2000n; // 20% platform fee on save
export const DEFAULT_W3EXT_READ_FEE_BPS = 2000n; // 20% platform fee on read
export const DEFAULT_TREASURY_BPS = 2000n; // 20% of a sale → treasury

/**
 * @typedef {bigint | number | string} Amount  Integer minor units.
 * @typedef {bigint | number | string} Bps      Basis points [0,10000].
 * @typedef {Error & { code: string }} CodedError
 * @typedef {{ to: string, amount: bigint, kind: string }} Payout
 */

/**
 * @param {string} message
 * @param {string} code
 * @returns {CodedError}
 */
function priceError(message, code) {
  return /** @type {CodedError} */ (
    Object.assign(new Error(message), { code })
  );
}

/**
 * Coerce bigint | integer Number | integer string → non-negative BigInt.
 * @param {Amount} x
 * @returns {bigint}
 */
export function toAmount(x) {
  let v;
  if (typeof x === 'bigint') {
    v = x;
  } else if (typeof x === 'number') {
    if (!Number.isInteger(x)) {
      throw priceError(`Amount must be an integer, got ${x}`, 'INVALID_AMOUNT');
    }
    v = BigInt(x);
  } else if (typeof x === 'string' && /^-?\d+$/.test(x.trim())) {
    v = BigInt(x.trim());
  } else {
    throw priceError(`Not an integer amount: ${x}`, 'INVALID_AMOUNT');
  }
  if (v < 0n) {
    throw priceError(`Amount must be non-negative, got ${v}`, 'INVALID_AMOUNT');
  }
  return v;
}

/**
 * @param {Bps} x
 * @returns {bigint}
 */
function toBps(x) {
  let v;
  try {
    v = typeof x === 'bigint' ? x : toAmount(x);
  } catch {
    throw priceError(`bps must be an integer in [0,10000]: ${x}`, 'INVALID_BPS');
  }
  if (v < 0n || v > BPS_DENOMINATOR) {
    throw priceError(`bps out of range [0,10000]: ${v}`, 'INVALID_BPS');
  }
  return v;
}

/**
 * floor(amount * bps / 10000) — deterministic, no float.
 * @param {Amount} amount
 * @param {Bps} bps
 * @returns {bigint}
 */
export function applyBps(amount, bps) {
  const a = toAmount(amount);
  const b = toBps(bps);
  return (a * b) / BPS_DENOMINATOR;
}

/**
 * Cost of saving a course = Lit encryption cost + Greenfield storage
 * cost, with w3ext taking `w3extFeeBps` (default 20%) of that base on top.
 * @param {{ litSaveCost: Amount, storageCost?: Amount, w3extFeeBps?: Bps,
 *           litPayee?: string, storagePayee?: string, w3extPayee?: string }} args
 */
export function computeSaveCharge({
  litSaveCost,
  storageCost = 0n,
  w3extFeeBps = DEFAULT_W3EXT_FEE_BPS,
  litPayee = 'lit',
  storagePayee = 'storage',
  w3extPayee = 'w3ext',
}) {
  const lit = toAmount(litSaveCost);
  const storage = toAmount(storageCost);
  const bps = toBps(w3extFeeBps);
  const base = lit + storage;
  const w3extFee = applyBps(base, bps);
  const total = base + w3extFee;

  const payouts = [
    { to: litPayee, amount: lit, kind: 'lit-save' },
    { to: storagePayee, amount: storage, kind: 'storage' },
    { to: w3extPayee, amount: w3extFee, kind: 'w3ext-fee' },
  ].filter((p) => p.amount > 0n || p.kind === 'lit-save');

  return {
    litSaveCost: lit,
    storageCost: storage,
    base,
    w3extFeeBps: bps,
    w3extFee,
    total,
    payouts,
  };
}

/**
 * Cost of reading (decrypting) a course: Lit read cost + w3ext fee.
 * @param {{ litReadCost: Amount, w3extFeeBps?: Bps,
 *           litPayee?: string, w3extPayee?: string }} args
 */
export function computeReadCharge({
  litReadCost,
  w3extFeeBps = DEFAULT_W3EXT_READ_FEE_BPS,
  litPayee = 'lit',
  w3extPayee = 'w3ext',
}) {
  const lit = toAmount(litReadCost);
  const bps = toBps(w3extFeeBps);
  const w3extFee = applyBps(lit, bps);
  const total = lit + w3extFee;

  const payouts = [
    { to: litPayee, amount: lit, kind: 'lit-read' },
    { to: w3extPayee, amount: w3extFee, kind: 'w3ext-fee' },
  ].filter((p) => p.amount > 0n || p.kind === 'lit-read');

  return { litReadCost: lit, w3extFeeBps: bps, w3extFee, total, payouts };
}

/**
 * Course sale settlement: `treasuryBps` (default 20%) of the price goes
 * to the treasury smart contract, the rest to the seller. The seller
 * absorbs the rounding remainder so payouts re-sum to `salePrice`.
 * @param {{ salePrice: Amount, treasuryBps?: Bps,
 *           treasury?: string, seller?: string }} args
 */
export function computeSaleSplit({
  salePrice,
  treasuryBps = DEFAULT_TREASURY_BPS,
  treasury,
  seller,
}) {
  if (!treasury || !seller) {
    throw priceError(
      'Both `treasury` and `seller` addresses are required',
      'MISSING_PAYEE',
    );
  }
  const price = toAmount(salePrice);
  const bps = toBps(treasuryBps);
  const treasuryAmount = applyBps(price, bps);
  const sellerAmount = price - treasuryAmount; // remainder → seller

  return {
    salePrice: price,
    treasuryBps: bps,
    treasuryAmount,
    sellerAmount,
    payouts: [
      { to: treasury, amount: treasuryAmount, kind: 'treasury' },
      { to: seller, amount: sellerAmount, kind: 'seller' },
    ],
  };
}
