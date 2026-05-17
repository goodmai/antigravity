/**
 * Daskibo Academy — local SP-emulation Greenfield backend
 *
 * Honest naming: this implements the `GreenfieldBackend` write interface
 * by speaking the *simplified PUT-to-SP* protocol that the local mock SP
 * (smartcontracts/integration/mock-sp.mjs) understands. It is a
 * development / Flow-A integration emulator — it does NOT perform real
 * on-chain Greenfield transactions. The real signer is the SDK backend.
 *
 * greenfield-core no longer fabricates writes; this backend is injected
 * explicitly where SP emulation is wanted.
 *
 * @typedef {import('../buckets/greenfield-core.js').Transport} Transport
 * @typedef {import('../buckets/greenfield-core.js').GreenfieldBackend} GreenfieldBackend
 */

function beError(message, code) {
  return Object.assign(new Error(message), { code });
}

function mapStatus(status, body) {
  if (status >= 200 && status < 300) return null;
  if (status === 404) return beError('Resource not found', 'NOT_FOUND');
  if (status === 409) return beError('Bucket already exists', 'BUCKET_EXISTS');
  if (status === 401 || status === 403) {
    return beError('Not authorized', 'UNAUTHORIZED');
  }
  if (status >= 500) {
    return beError(`Storage Provider unavailable (HTTP ${status})`, 'SP_UNAVAILABLE');
  }
  return beError(`SP request failed (HTTP ${status}): ${body ?? ''}`, 'SP_ERROR');
}

function encodeKey(key) {
  return String(key).split('/').map(encodeURIComponent).join('/');
}

/**
 * @param {{ transport: Transport, endpoint: string }} cfg
 * @returns {GreenfieldBackend}
 */
export function createSpEmulationBackend({ transport, endpoint }) {
  if (typeof transport !== 'function') {
    throw beError('A transport function is required', 'NO_TRANSPORT');
  }
  const sp = String(endpoint || '').replace(/\/+$/, '');

  async function send(req) {
    let res;
    try {
      res = await transport(req);
    } catch (err) {
      throw beError(
        `SP network error: ${err instanceof Error ? err.message : String(err)}`,
        'NETWORK_ERROR',
      );
    }
    const failure = mapStatus(res.status, res.body);
    if (failure) throw failure;
    return res;
  }

  return {
    async createBucket({ bucketName, owner, visibility }) {
      const res = await send({
        method: 'PUT',
        url: `${sp}/${bucketName}`,
        headers: {
          'X-Gnfd-User-Address': owner,
          'X-Gnfd-Visibility': visibility || 'private',
        },
        body: '',
      });
      return {
        bucketName,
        txHash: res.headers?.['x-gnfd-txn-hash'] || null,
      };
    },

    async putObject({ bucketName, objectKey, data, contentType, owner, visibility }) {
      const res = await send({
        method: 'PUT',
        url: `${sp}/${bucketName}/${encodeKey(objectKey)}`,
        headers: {
          'X-Gnfd-User-Address': owner,
          'Content-Type': contentType || 'application/octet-stream',
          'X-Gnfd-Visibility': visibility || 'inherit',
        },
        body: data,
      });
      return {
        bucketName,
        objectKey,
        txHash: res.headers?.['x-gnfd-txn-hash'] || null,
      };
    },
  };
}
