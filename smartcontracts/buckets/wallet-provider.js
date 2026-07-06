/**
 * Daskibo Academy — injected wallet provider resolver
 *
 * Tiny, pure EIP-1193 resolver owned by smartcontracts (no dependency on
 * academy/js/web3-core internals). Resolution order: EIP-6963 MetaMask →
 * window.ethereum. DOM-free: the window-like object is injected.
 *
 * @typedef {{ request: (args: { method: string, params?: unknown[] }) => Promise<unknown> }} Eip1193Provider
 * @typedef {{ info?: { rdns?: string, name?: string }, provider?: unknown }} Eip6963Detail
 * @typedef {{ ethereum?: unknown, __eip6963?: Eip6963Detail[] }} WindowLike
 */

/** @param {unknown} p @returns {p is Eip1193Provider} */
function isProvider(p) {
  return (
    !!p &&
    typeof p === 'object' &&
    'request' in p &&
    typeof (/** @type {{ request?: unknown }} */ (p)).request === 'function'
  );
}

/**
 * @param {WindowLike} [win]
 * @returns {Eip1193Provider|undefined}
 */
export function resolveInjectedProvider(win) {
  const w =
    win || (typeof globalThis !== 'undefined' ? globalThis : undefined);
  if (!w || typeof w !== 'object') return undefined;
  const ww = /** @type {WindowLike} */ (w);

  // 1. EIP-6963 announced providers (multi-wallet discovery)
  const announced = Array.isArray(ww.__eip6963) ? ww.__eip6963 : [];
  for (const entry of announced) {
    const rdns = entry?.info?.rdns ?? '';
    const name = entry?.info?.name ?? '';
    if (
      (rdns === 'io.metamask' || /metamask/i.test(name)) &&
      isProvider(entry?.provider)
    ) {
      return entry.provider;
    }
  }

  // 2. Legacy single injected provider
  return isProvider(ww.ethereum) ? ww.ethereum : undefined;
}
