/**
 * Daskibo Academy — Greenfield primary Storage-Provider selection
 *
 * Pure, shared by both real SDK write paths (Node `sdk-backend.mjs` and
 * browser `greenfield-wallet-sdk.js`) so selection is uniform and an
 * empty / unusable SP list fails with a coded `SP_UNAVAILABLE` instead of
 * an opaque `undefined.operatorAddress` TypeError.
 *
 * @typedef {{ operatorAddress?: string, endpoint?: string }} SpEntry
 * @typedef {{ operatorAddress: string, endpoint: string }} PrimarySp
 */

/**
 * @param {string} message
 * @param {string} code
 * @returns {Error & { code: string }}
 */
function spError(message, code) {
  return /** @type {Error & { code: string }} */ (
    Object.assign(new Error(message), { code })
  );
}

/**
 * Choose a usable primary SP: an https endpoint if any, else http. The
 * entry must carry both an operatorAddress and an endpoint.
 * @param {SpEntry[]|undefined|null} sps
 * @returns {PrimarySp}
 */
export function pickPrimarySp(sps) {
  const list = Array.isArray(sps) ? sps : [];
  /** @type {PrimarySp[]} */
  const usable = [];
  for (const s of list) {
    const addr = s && typeof s.operatorAddress === 'string' ? s.operatorAddress : '';
    const ep = s && typeof s.endpoint === 'string' ? s.endpoint : '';
    if (addr && /^https?:\/\//i.test(ep)) {
      usable.push({ operatorAddress: addr, endpoint: ep });
    }
  }
  const https = usable.find((s) => /^https:\/\//i.test(s.endpoint));
  const chosen = https || usable[0];
  if (!chosen) {
    throw spError(
      'No usable Greenfield storage provider (empty or invalid SP list)',
      'SP_UNAVAILABLE',
    );
  }
  return chosen;
}
