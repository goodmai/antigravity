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
 * @typedef {Object} PublishPlan
 * @property {string}                                            bucketName
 * @property {'public'}                                          visibility
 * @property {BucketObject[]}                                    objects
 * @property {import('./course-template.js').CourseManifest}     manifest
 * @property {string}                                            masterKey
 * @property {ReturnType<typeof computeSaveCharge>}              settlement
 */

import { buildCourseBucket, encryptCourseBucket } from './course-template.js';
import { computeSaveCharge, computeSaleSplit } from './lit-pricing.js';

/**
 * Build + encrypt the course and compute the w3ext save settlement.
 * Pure: no client, no network.
 * @param {{ spec: CourseSpec, pricing: SavePricing, crypto?: WebCryptoLike, masterKey?: string }} args
 * @returns {Promise<PublishPlan>}
 */
export async function planCoursePublish({ spec, pricing, crypto, masterKey }) {
  const plain = buildCourseBucket(spec);
  const enc = await encryptCourseBucket(plain, { crypto, masterKey });
  const settlement = computeSaveCharge(pricing);
  return {
    bucketName: enc.bucketName,
    visibility: enc.visibility,
    objects: enc.objects,
    manifest: enc.manifest,
    masterKey: enc.masterKey,
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
