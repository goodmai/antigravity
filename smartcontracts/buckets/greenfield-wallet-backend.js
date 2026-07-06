/**
 * Daskibo Academy — browser wallet Greenfield backend
 *
 * Implements the greenfield-core `GreenfieldBackend` write interface with
 * the user's in-browser wallet as the signer. The wallet (EIP-1193) is
 * used to resolve/authorize the account; the actual Greenfield protocol
 * (SDK, off-chain auth, on-chain submission) is an INJECTED `makeClient`
 * so this module is pure, DOM-free and unit-testable with fakes. The real
 * client (CDN-loaded `@bnb-chain/greenfield-js-sdk` + wallet off-chain
 * auth) is supplied by the non-strict UI layer.
 *
 * @typedef {{ request: (args: { method: string, params?: unknown[] }) => Promise<unknown> }} Eip1193Provider
 *
 * @typedef {Object} WalletGreenfieldClient
 * @property {(args: { bucketName: string, creator: string, visibility: string }) => Promise<{ txHash: string|null }>} createBucket
 * @property {(args: { bucketName: string, objectKey: string, data: string|Uint8Array, contentType: string, creator: string, visibility: string }) => Promise<{ txHash: string|null }>} uploadObject
 *
 * @typedef {import('./greenfield-core.js').GreenfieldBackend} GreenfieldBackend
 */

/**
 * @param {string} message
 * @param {string} code
 * @returns {Error & { code: string }}
 */
function walletError(message, code) {
  return /** @type {Error & { code: string }} */ (
    Object.assign(new Error(message), { code })
  );
}

/**
 * @param {{ provider?: Eip1193Provider, makeClient?: () => Promise<WalletGreenfieldClient> }} [cfg]
 * @returns {GreenfieldBackend}
 */
export function createWalletBackend({ provider, makeClient } = {}) {
  /** @type {string|undefined} */
  let address;
  /** @type {WalletGreenfieldClient|undefined} */
  let client;

  /** @returns {Promise<string>} */
  async function connect() {
    if (address) return address;
    if (!provider || typeof provider.request !== 'function') {
      throw walletError(
        'No browser wallet detected — install/connect a wallet to sign ' +
          'Greenfield writes.',
        'NO_WALLET',
      );
    }
    /** @type {unknown} */
    let accounts;
    try {
      accounts = await provider.request({ method: 'eth_requestAccounts' });
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        err.code === 4001
      ) {
        throw walletError('Wallet connection rejected', 'USER_REJECTED');
      }
      throw walletError(
        `Wallet connection failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
        'WALLET_ERROR',
      );
    }
    const first =
      Array.isArray(accounts) && typeof accounts[0] === 'string'
        ? accounts[0]
        : undefined;
    if (!first) {
      throw walletError(
        'Wallet returned no accounts — unlock it and try again',
        'NO_ACCOUNTS',
      );
    }
    address = first;
    return address;
  }

  /** @returns {Promise<WalletGreenfieldClient>} */
  async function ensureClient() {
    if (client) return client;
    if (typeof makeClient !== 'function') {
      throw walletError(
        'No Greenfield wallet client configured (makeClient missing)',
        'NO_WALLET_CLIENT',
      );
    }
    client = await makeClient();
    return client;
  }

  return {
    async createBucket({ bucketName, visibility }) {
      const creator = await connect();
      const c = await ensureClient();
      const res = await c.createBucket({
        bucketName,
        creator,
        visibility: visibility || 'private',
      });
      return { bucketName, txHash: res.txHash };
    },

    async putObject({ bucketName, objectKey, data, contentType, visibility }) {
      const creator = await connect();
      const c = await ensureClient();
      const res = await c.uploadObject({
        bucketName,
        objectKey,
        data,
        contentType: contentType || 'application/octet-stream',
        creator,
        visibility: visibility || 'inherit',
      });
      return { bucketName, objectKey, txHash: res.txHash };
    },

    /** The signer account — lets greenfield-core derive `owner`. */
    async resolveOwner() {
      return connect();
    },
  };
}

/**
 * Build the `signTypedDataCallback` the Greenfield SDK uses to broadcast
 * a tx in the browser: it signs the EIP-712 payload via the wallet's
 * `eth_signTypedData_v4`. Pure + injectable so the signing wiring is
 * unit-tested (the SDK call graph around it stays integration-only).
 * @param {Eip1193Provider|undefined} provider
 * @returns {(address: string, message: string) => Promise<string>}
 */
export function makeSignTypedDataCallback(provider) {
  if (!provider || typeof provider.request !== 'function') {
    throw walletError(
      'No browser wallet to sign the Greenfield transaction',
      'NO_WALLET',
    );
  }
  return async (address, message) => {
    try {
      const sig = await provider.request({
        method: 'eth_signTypedData_v4',
        params: [address, message],
      });
      return typeof sig === 'string' ? sig : String(sig);
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        err.code === 4001
      ) {
        throw walletError('Transaction signature rejected', 'USER_REJECTED');
      }
      throw walletError(
        `Wallet signing failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
        'WALLET_ERROR',
      );
    }
  };
}
