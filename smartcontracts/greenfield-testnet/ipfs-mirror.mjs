/**
 * IPFS mirror step for the course-publish pipeline — pin the published bucket
 * objects (encrypted lessons, assets, index) and the final manifest to IPFS
 * via Pinata, so every prod/testnet publish has a content-addressed replica
 * independent of Greenfield SP availability.
 *
 * Ciphertext only ever leaves the pipeline encrypted: lessons are AES-wrapped
 * by planCoursePublish before this step runs, and the master key exists only
 * Chipotle-wrapped inside the manifest. Pinning to a public IPFS network
 * therefore does not widen the DRM trust boundary.
 *
 * Pure planning + injected `pin` (defaults to the Pinata client) keep this
 * unit-testable without network or credentials.
 */
import { pinFile, gatewayUrl } from '../../tools/pinata/pinata-client.mjs';

/**
 * Read the mirror config from an env-like object.
 * Enabled via PIN_TO_IPFS=1 (any of 1/true/yes).
 * @param {Record<string,string|undefined>} [env]
 */
export function ipfsMirrorConfigFromEnv(env = {}) {
  const pick = (v) => (v && String(v).length > 0 ? String(v) : undefined);
  return {
    enabled: /^(1|true|yes)$/i.test(env.PIN_TO_IPFS ?? ''),
    jwt: pick(env.PINATA_JWT),
    apiKey: pick(env.PINATA_API_KEY),
    apiSecret: pick(env.PINATA_API_SECRET) ?? pick(env.PINATA_SECRET_API_KEY),
    gateway: pick(env.PINATA_GATEWAY) ?? 'gateway.pinata.cloud',
    gatewayToken: pick(env.PINATA_GATEWAY_KEY) ?? pick(env.PINATA_GATEWAY_TOKEN),
    uploadUrl: pick(env.PINATA_UPLOAD_URL), // override for tests/self-hosted
  };
}

/**
 * Which plan objects get mirrored: everything except the manifest (the
 * manifest is pinned separately, after the CID map is embedded into it).
 * @param {Array<{ kind: string }>} objects
 */
export function mirrorTargets(objects = []) {
  return objects.filter((o) => o.kind !== 'manifest');
}

/**
 * Pin all non-manifest plan objects. Returns the CID map to embed into the
 * manifest as `manifest.ipfsMirror`.
 * @param {{
 *   objects: Array<{ key: string, kind: string, body: string|Uint8Array, contentType?: string }>,
 *   bucket: string,
 *   cfg: ReturnType<typeof ipfsMirrorConfigFromEnv>,
 * }} args
 * @param {{ pin?: typeof pinFile }} [deps]
 * @returns {Promise<{ gateway: string, items: Record<string,string> }>}
 */
export async function mirrorPlanObjects({ objects, bucket, cfg }, { pin = pinFile } = {}) {
  /** @type {Record<string,string>} */
  const items = {};
  for (const o of mirrorTargets(objects)) {
    const { cid } = await pin({
      content: o.body,
      name: `${bucket}/${o.key}`,
      network: 'public',
      contentType: o.contentType || 'application/octet-stream',
      ...cfg,
    });
    items[o.key] = cid;
  }
  return { gateway: cfg.gateway || 'gateway.pinata.cloud', items };
}

/**
 * Pin the final manifest (with `ipfsMirror` already embedded). The manifest
 * CID cannot be part of the manifest itself — it is returned to the caller
 * (logged + optionally written to a shared artifact).
 * @param {{ manifest: object, bucket: string, cfg: ReturnType<typeof ipfsMirrorConfigFromEnv> }} args
 * @param {{ pin?: typeof pinFile }} [deps]
 * @returns {Promise<{ cid: string, url: string }>}
 */
export async function pinManifest({ manifest, bucket, cfg }, { pin = pinFile } = {}) {
  const { cid } = await pin({
    content: JSON.stringify(manifest),
    name: `${bucket}/_lit/manifest.json`,
    network: 'public',
    contentType: 'application/json',
    ...cfg,
  });
  // Token-less URL — gateway access tokens are secrets and must not land in
  // logs/artifacts; readers append ?pinataGatewayToken at read time.
  return { cid, url: gatewayUrl(cid, { gateway: cfg.gateway || 'gateway.pinata.cloud' }) };
}
