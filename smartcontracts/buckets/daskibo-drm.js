/**
 * Daskibo Academy — high-level DRM SDK facade (growth point G-01).
 *
 * One ergonomic surface over the low-level buckets/* modules so an integrator
 * doesn't hand-wire Greenfield upload + crypto-envelope + Chipotle/Lit + ACC:
 *
 *   const drm = createDaskiboDRM({ client, litClient, owner, chain, spUrl });
 *   const { bucketName, manifestUrl } = await drm.publishCourse({ spec, accessControlConditions });
 *   const masterKey = await drm.getCourseKey({ bucket, authContext }); // ACCESS_DENIED if ACC unmet
 *
 * `client` is a Greenfield client (see greenfield-core.js) and `litClient` is a
 * LitClient (Chipotle: lit-sdk-chipotle.js, or any encrypt/decrypt adapter).
 * Both are **injected**, so the orchestration is unit-testable with fakes — the
 * same DI philosophy as lit-access.js / course-publish.js. The raw AES master
 * key is never written into a stored object (handled by crypto-envelope).
 *
 * @typedef {import('./lit-access.js').LitClient} LitClient
 * @typedef {import('./course-publish.js').GreenfieldLike & { readObject?: (bucket: string, key: string) => Promise<string> }} GreenfieldClient
 */

import { planCoursePublish } from './course-publish.js';
import { createLitAccess } from './lit-access.js';

/** @returns {Error & { code: string }} */
function drmError(message, code) {
  return /** @type {Error & { code: string }} */ (Object.assign(new Error(message), { code }));
}

const MANIFEST_KEY = '_lit/manifest.json';

/**
 * @param {{ client: GreenfieldClient, litClient: LitClient, owner?: string,
 *   chain?: string, pricing?: import('./course-publish.js').SavePricing, spUrl?: string }} cfg
 */
export function createDaskiboDRM({
  client,
  litClient,
  owner,
  chain = 'bscTestnet',
  pricing = { litSaveCost: 800n, storageCost: 200n },
  spUrl,
} = {}) {
  if (!client || typeof client.createBucket !== 'function' || typeof client.saveObject !== 'function') {
    throw drmError('A Greenfield client (createBucket/saveObject[/readObject]) is required', 'NO_CLIENT');
  }
  if (!litClient || typeof litClient.encrypt !== 'function') {
    throw drmError('A Lit client (encrypt/decrypt) is required', 'NO_LIT_CLIENT');
  }
  const access = createLitAccess({ litClient, chain });

  /**
   * Encrypt + publish an ACC-gated course to Greenfield in one call.
   * @param {{ spec: import('./course-template.js').CourseSpec,
   *   accessControlConditions: import('./lit-access.js').AccessControlConditions,
   *   author?: string }} args
   */
  async function publishCourse({ spec, accessControlConditions, author }) {
    const plan = await planCoursePublish({
      spec,
      pricing,
      lit: { access, accessControlConditions, author },
    });
    if (!plan.manifest.lit) {
      throw drmError('publish produced no Lit envelope — check accessControlConditions', 'NO_ENVELOPE');
    }
    await client.createBucket(plan.bucketName, { visibility: 'public', ...(owner ? { owner } : {}) });
    /** @type {string[]} */
    const savedKeys = [];
    for (const o of plan.objects) {
      await client.saveObject(plan.bucketName, o.key, o.body, {
        contentType: o.contentType,
        ...(owner ? { owner } : {}),
      });
      savedKeys.push(o.key);
    }
    return {
      bucketName: plan.bucketName,
      manifestKey: MANIFEST_KEY,
      manifestUrl: spUrl ? `${spUrl.replace(/\/$/, '')}/${plan.bucketName}/${MANIFEST_KEY}` : undefined,
      savedKeys,
      manifest: plan.manifest,
    };
  }

  /**
   * Read the bucket manifest and recover the AES master key via Lit/Chipotle.
   * Throws `ACCESS_DENIED` (from lit-access) if `authContext` does not satisfy
   * the ACC. The caller then decrypts objects with crypto-envelope/course-read.
   * @param {{ bucket: string, authContext?: unknown }} args
   * @returns {Promise<string>} master key (base64)
   */
  async function getCourseKey({ bucket, authContext }) {
    if (typeof client.readObject !== 'function') {
      throw drmError('client.readObject is required to read the manifest', 'NO_CLIENT');
    }
    const manifest = JSON.parse(await client.readObject(bucket, MANIFEST_KEY));
    if (!manifest.lit) throw drmError('manifest has no Lit envelope', 'NO_ENVELOPE');
    return access.decryptMasterKey(manifest.lit, authContext);
  }

  return { publishCourse, getCourseKey, access };
}
