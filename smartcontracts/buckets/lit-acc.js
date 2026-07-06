/**
 * Daskibo Academy — Lit Access Control Condition builders
 *
 * Centralised, pure, strict-typed ACC constructors. The UI no longer
 * hand-rolls conditions, and the security caveat from the audit lives in
 * one place.
 *
 * ⚠️ Audit 3.2 / 4.1 — flash-loan caveat: a naive `balanceOf(user) > 0`
 * token gate is bypassable via a flash-loaned access token (borrow →
 * pass the Lit check → repay in the same tx). For paid content prefer
 * `addressAllowlistAcc` (an address equality is NOT flash-loanable) or
 * gate on a *time-weighted / staked / non-transferable* position rather
 * than a spot balance. `tokenBalanceAcc` is provided for convenience but
 * documents this risk explicitly.
 *
 * @typedef {Record<string, unknown>} AccCondition
 * @typedef {Array<AccCondition>} AccSet
 */

/**
 * @param {string} message
 * @param {string} code
 * @returns {Error & { code: string }}
 */
function accError(message, code) {
  return /** @type {Error & { code: string }} */ (
    Object.assign(new Error(message), { code })
  );
}

/**
 * Allow exactly one wallet address to decrypt. An on-chain
 * `:userAddress` equality — there is no balance to flash-loan, so this
 * is the safe default for paid/owner-bound content.
 * @param {string} address
 * @returns {AccSet}
 */
export function addressAllowlistAcc(address) {
  if (typeof address !== 'string' || address.trim().length === 0) {
    throw accError('A reader address is required', 'INVALID_ADDRESS');
  }
  return [
    {
      contractAddress: '',
      standardContractType: '',
      chain: 'ethereum',
      method: '',
      parameters: [':userAddress'],
      returnValueTest: { comparator: '=', value: address },
    },
  ];
}

/**
 * Token-balance gate. ⚠️ Spot `balanceOf` is flash-loan bypassable for
 * transferable tokens — gate on a staked/locked/non-transferable
 * position for real paywalls (see module header).
 * @param {{ contractAddress?: string, standardContractType?: string, chain?: string, min?: string }} opts
 * @returns {AccSet}
 */
export function tokenBalanceAcc({
  contractAddress,
  standardContractType = 'ERC721',
  chain = 'ethereum',
  min = '1',
} = {}) {
  if (typeof contractAddress !== 'string' || contractAddress.length === 0) {
    throw accError('A token contract address is required', 'INVALID_CONTRACT');
  }
  return [
    {
      contractAddress,
      standardContractType,
      chain,
      method: 'balanceOf',
      parameters: [':userAddress'],
      returnValueTest: { comparator: '>=', value: String(min) },
    },
  ];
}

/**
 * Course-access gate — releases the key iff `CourseMarketplace.hasCourseAccess(
 * userAddress, courseId) == true`. This is the same on-chain condition the demo
 * uses: the author has free access, and a buyer gains it by purchasing (which
 * mints a soulbound AccessPass). Not flash-loanable (the pass is soulbound).
 * @param {{ contractAddress?: string, chain?: string, courseId?: string|number }} opts
 * @returns {AccSet}
 */
export function courseAccessAcc({ contractAddress, chain = 'ethereum', courseId } = {}) {
  if (typeof contractAddress !== 'string' || contractAddress.length === 0) {
    throw accError('A CourseMarketplace address is required', 'INVALID_CONTRACT');
  }
  if (courseId === undefined || courseId === null || `${courseId}`.length === 0) {
    throw accError('A courseId is required', 'INVALID_COURSE_ID');
  }
  return [
    {
      contractAddress,
      standardContractType: 'customContract',
      chain,
      method: 'hasCourseAccess',
      parameters: [':userAddress', String(courseId)],
      returnValueTest: { comparator: '==', value: 'true' },
    },
  ];
}

/**
 * @param {AccSet[]} sets
 * @param {'or'|'and'} operator
 * @returns {AccSet}
 */
function combine(sets, operator) {
  const nonEmpty = sets.filter((s) => Array.isArray(s) && s.length > 0);
  if (nonEmpty.length === 0) return [];
  return nonEmpty.reduce((acc, set, i) =>
    i === 0 ? set : [...acc, { operator }, ...set],
  );
}

/** Decrypt if the reader satisfies ANY of the given condition sets. */
export function anyOf(/** @type {AccSet[]} */ ...sets) {
  return combine(sets, 'or');
}

/** Decrypt only if the reader satisfies ALL of the given condition sets. */
export function allOf(/** @type {AccSet[]} */ ...sets) {
  return combine(sets, 'and');
}
