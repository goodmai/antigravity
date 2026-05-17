/**
 * Daskibo Academy — course publish orchestrator
 *
 * The single integration seam that ties the formerly stand-alone modules
 * into one tested flow:
 *
 *   course-template (build + encrypt)
 *     → crypto-envelope (AES-GCM envelopes + sidecars)
 *     → lit-pricing    (w3ext save settlement / treasury sale split)
 *     → greenfield-core client (createBucket + saveObject)
 *
 * Pure planning (`planCoursePublish`) is separated from side effects
 * (`publishCourse`) so the whole money + crypto path is unit-testable
 * without a network or wallet.
 *
 * @typedef {import('./course-template.js').CourseSpec}    CourseSpec
 * @typedef {import('./course-template.js').BucketObject}  BucketObject
 * @typedef {import('./crypto-envelope.js').WebCryptoLike} WebCryptoLike
 *
 * @typedef {Object} SavePricing
 * @property {import('./lit-pricing.js').Amount}  litSaveCost
 * @property {import('./lit-pricing.js').Amount} [storageCost]
 * @property {import('./lit-pricing.js').Bps}    [w3extFeeBps]
 * @property {string} [litPayee]
 * @property {string} [storagePayee]
 * @property {string} [w3extPayee]
 *
 * @typedef {Object} GreenfieldLike
 * @property {(name: string, opts?: { owner?: string, visibility?: string }) => Promise<{ bucketName: string, txHash: string|null }>} createBucket
 * @property {(bucket: string, key: string, data: string|Uint8Array, opts?: { owner?: string, contentType?: string, visibility?: string }) => Promise<{ bucketName: string, objectKey: string, txHash: string|null }>} saveObject
 *
 * @typedef {import('./lit-access.js').LitEnvelope} LitEnvelope
 * @typedef {import('./lit-access.js').AccessControlConditions} AccessControlConditions
 *
 * @typedef {Object} LitOption
 * @property {{ encryptMasterKey: (master: string, acc: AccessControlConditions) => Promise<LitEnvelope> }} access
 * @property {AccessControlConditions} [accessControlConditions]
 *
 * @typedef {Object} PublishPlan
 * @property {string}                                            bucketName
 * @property {'public'}                                          visibility
 * @property {BucketObject[]}                                    objects
 * @property {import('./course-template.js').CourseManifest & { lit?: LitEnvelope }} manifest
 * @property {string}                                            masterKey
 * @property {LitEnvelope}                                       [litMaster]
 * @property {ReturnType<typeof computeSaveCharge>}              settlement
 */

import { buildCourseBucket, encryptCourseBucket } from './course-template.js';
import { computeSaveCharge, computeSaleSplit } from './lit-pricing.js';

/**
 * Build + encrypt the course and compute the w3ext save settlement.
 * Pure: no client, no network.
 * When `lit` is given, the AES bucket master key is Lit-wrapped under the
 * access control conditions and recorded in the manifest (`manifest.lit`)
 * — the raw master is never written into any stored object.
 * @param {{ spec: CourseSpec, pricing: SavePricing, crypto?: WebCryptoLike, masterKey?: string, lit?: LitOption }} args
 * @returns {Promise<PublishPlan>}
 */
export async function planCoursePublish({
  spec,
  pricing,
  crypto,
  masterKey,
  lit,
}) {
  const plain = buildCourseBucket(spec);
  const enc = await encryptCourseBucket(plain, { crypto, masterKey });
  const settlement = computeSaveCharge(pricing);

  /** @type {import('./course-template.js').CourseManifest & { lit?: LitEnvelope }} */
  let manifest = enc.manifest;
  let objects = enc.objects;
  /** @type {LitEnvelope|undefined} */
  let litMaster;

  if (lit && lit.access) {
    const acc = lit.accessControlConditions;
    if (!Array.isArray(acc) || acc.length === 0) {
      throw /** @type {Error & { code: string }} */ (
        Object.assign(
          new Error('Lit access requires at least one access control condition'),
          { code: 'INVALID_ACC' },
        )
      );
    }
    litMaster = await lit.access.encryptMasterKey(enc.masterKey, acc);
    manifest = { ...enc.manifest, lit: litMaster };
    const body = JSON.stringify(manifest);
    objects = enc.objects.map((o) =>
      o.kind === 'manifest' ? { ...o, body } : o,
    );
  }

  return {
    bucketName: enc.bucketName,
    visibility: enc.visibility,
    objects,
    manifest,
    masterKey: enc.masterKey,
    ...(litMaster ? { litMaster } : {}),
    settlement,
  };
}

/**
 * Execute a publish: create the public bucket, then save every object
 * (manifest + `.enc` + `.lit.json`). Fails fast — a client error is
 * propagated, never swallowed into a partial success.
 * @param {{ client: GreenfieldLike, spec: CourseSpec, pricing: SavePricing, crypto?: WebCryptoLike, owner?: string, masterKey?: string }} args
 * @returns {Promise<{ bucketName: string, masterKey: string, savedKeys: string[], settlement: ReturnType<typeof computeSaveCharge>, txs: Array<{ key: string, txHash: string|null }> }>}
 */
export async function publishCourse({
  client,
  spec,
  pricing,
  crypto,
  owner,
  masterKey,
}) {
  const plan = await planCoursePublish({ spec, pricing, crypto, masterKey });

  await client.createBucket(plan.bucketName, {
    visibility: 'public',
    ...(owner ? { owner } : {}),
  });

  /** @type {string[]} */
  const savedKeys = [];
  /** @type {Array<{ key: string, txHash: string|null }>} */
  const txs = [];
  for (const o of plan.objects) {
    const r = await client.saveObject(plan.bucketName, o.key, o.body, {
      contentType: o.contentType,
      ...(owner ? { owner } : {}),
    });
    savedKeys.push(o.key);
    txs.push({ key: o.key, txHash: r.txHash });
  }

  return {
    bucketName: plan.bucketName,
    masterKey: plan.masterKey,
    savedKeys,
    settlement: plan.settlement,
    txs,
  };
}

/**
 * Quote a course sale: 20% (default) to the treasury, remainder to the
 * seller. Thin seam over lit-pricing so the sale path is exercised here.
 * @param {{ salePrice: import('./lit-pricing.js').Amount, treasury?: string, seller?: string, treasuryBps?: import('./lit-pricing.js').Bps }} args
 * @returns {ReturnType<typeof computeSaleSplit>}
 */
export function quoteCourseSale(args) {
  return computeSaleSplit(args);
}
