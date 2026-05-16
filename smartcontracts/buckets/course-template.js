/**
 * Daskibo Academy — canonical course bucket template
 *
 * A deterministic course-bucket layout, reused by the app and as a stable
 * test fixture. Plaintext shape matches the lit.md manifest schema; the
 * optional {@link encryptCourseBucket} step swaps payloads for envelope
 * `.enc` objects plus indexer-safe `.lit.json` sidecars.
 *
 * Pure & DOM-free. WebCrypto is injectable for the encrypt step.
 *
 * @typedef {Object} Lesson
 * @property {string} key          Object key, e.g. "lessons/01/intro.md".
 * @property {string} title        Human title (indexable).
 * @property {string} contentType  MIME type of the lesson body.
 * @property {string} body         Plaintext lesson content.
 *
 * @typedef {Object} CourseSpec
 * @property {string}   slug         Bucket name (must be a valid bucket name).
 * @property {string}   title        Course title.
 * @property {Lesson[]} lessons      One or more lessons (non-empty).
 * @property {string}  [litNetwork]  Lit network tag recorded in the manifest.
 * @property {string}  [updatedAt]   ISO timestamp; defaults fixed for determinism.
 *
 * @typedef {Object} BucketObject
 * @property {string} key
 * @property {string} contentType
 * @property {string} body
 * @property {'manifest'|'payload'|'sidecar'} kind
 *
 * @typedef {Object} CourseBucket
 * @property {string}         bucketName
 * @property {'public'}       visibility
 * @property {object}         manifest
 * @property {BucketObject[]} objects
 *
 * @typedef {CourseBucket & { masterKey: string }} EncryptedCourseBucket
 */

import { assertBucketName, assertObjectKey } from './greenfield-core.js';
import {
  createBucketMasterKey,
  encryptObject,
} from './crypto-envelope.js';

const MANIFEST_SCHEMA = 'daskibo.lit.manifest/1';
const FIXED_UPDATED_AT = '2026-01-01T00:00:00.000Z';
const MANIFEST_KEY = '_lit/manifest.json';

/**
 * @param {string} message
 * @param {string} code
 * @returns {Error & { code: string }}
 */
function templateError(message, code) {
  return /** @type {Error & { code: string }} */ (
    Object.assign(new Error(message), { code })
  );
}

/** @type {CourseSpec} */
export const COURSE_TEMPLATE = {
  slug: 'daskibo-greenfield-course',
  title: 'Daskibo · Greenfield Course',
  litNetwork: 'datil-test',
  updatedAt: FIXED_UPDATED_AT,
  lessons: [
    {
      key: 'lessons/01/greenfield-basics.md',
      title: 'Course 01 · Greenfield Basics',
      contentType: 'text/markdown',
      body: '# Greenfield Basics\nBuckets, objects and the SP gateway.\n',
    },
    {
      key: 'lessons/02/permissions.md',
      title: 'Course 02 · Permissions & Visibility',
      contentType: 'text/markdown',
      body: '# Permissions & Visibility\nPublic vs private, policies.\n',
    },
    {
      key: 'lessons/03/onchain-flows.md',
      title: 'Course 03 · On-chain Storage Flows',
      contentType: 'text/markdown',
      body: '# On-chain Storage Flows\nTx lifecycle, fees and quotas.\n',
    },
  ],
};

/** @param {string} str @returns {number} */
function byteLength(str) {
  return new TextEncoder().encode(str).length;
}

/**
 * Build a deterministic plaintext course bucket from a spec.
 * @param {CourseSpec} spec
 * @returns {CourseBucket}
 */
export function buildCourseBucket(spec) {
  if (!spec || typeof spec !== 'object') {
    throw templateError('A course spec is required', 'EMPTY_COURSE');
  }
  const { slug, title, lessons, litNetwork = 'datil-test' } = spec;
  assertBucketName(slug);
  if (!Array.isArray(lessons) || lessons.length === 0) {
    throw templateError('A course needs at least one lesson', 'EMPTY_COURSE');
  }

  /** @type {BucketObject[]} */
  const payloads = [];
  const manifestObjects = [];
  for (const l of lessons) {
    assertObjectKey(l.key);
    payloads.push({
      key: l.key,
      contentType: l.contentType,
      body: l.body,
      kind: 'payload',
    });
    manifestObjects.push({
      key: l.key,
      title: l.title,
      contentType: l.contentType,
      size: byteLength(l.body),
    });
  }

  const manifest = {
    schema: MANIFEST_SCHEMA,
    bucket: slug,
    title,
    litNetwork,
    updatedAt: spec.updatedAt || FIXED_UPDATED_AT,
    objects: manifestObjects,
  };

  /** @type {BucketObject} */
  const manifestObject = {
    key: MANIFEST_KEY,
    contentType: 'application/json',
    body: JSON.stringify(manifest),
    kind: 'manifest',
  };

  return {
    bucketName: slug,
    visibility: 'public',
    manifest,
    objects: [manifestObject, ...payloads],
  };
}

/**
 * The canonical 3-lesson fixture (optionally re-slugged).
 * @param {string} [slug]
 * @returns {CourseBucket}
 */
export function sampleCourseBucket(slug) {
  return buildCourseBucket({
    ...COURSE_TEMPLATE,
    slug: slug || COURSE_TEMPLATE.slug,
  });
}

/**
 * @param {import('./crypto-envelope.js').WebCryptoLike} crypto
 * @param {Uint8Array} bytes
 * @returns {Promise<string>}
 */
async function sha256Hex(crypto, bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Encrypt every payload with one bucket master key; emit `.enc` envelopes
 * plus ciphertext-free `.lit.json` sidecars. The manifest stays plaintext
 * and public so indexers keep working.
 * @param {CourseBucket} bucket
 * @param {{ crypto?: import('./crypto-envelope.js').WebCryptoLike, masterKey?: string }} [opts]
 * @returns {Promise<EncryptedCourseBucket>}
 */
export async function encryptCourseBucket(bucket, opts = {}) {
  const crypto =
    /** @type {import('./crypto-envelope.js').WebCryptoLike} */ (
      opts.crypto || globalThis.crypto
    );
  const masterKey = opts.masterKey || (await createBucketMasterKey(crypto));

  /** @type {BucketObject[]} */
  const out = [];
  for (const o of bucket.objects) {
    if (o.kind !== 'payload') {
      out.push(o);
      continue;
    }
    const env = await encryptObject(
      masterKey,
      o.body,
      { contentType: o.contentType, originalKey: o.key },
      crypto,
    );
    const dataToEncryptHash = await sha256Hex(
      crypto,
      new TextEncoder().encode(env.ciphertext),
    );
    const { ciphertext: _omit, ...sidecarBase } = env;
    const sidecar = { ...sidecarBase, dataToEncryptHash };

    out.push({
      key: `${o.key}.enc`,
      contentType: 'application/json',
      body: JSON.stringify(env),
      kind: 'payload',
    });
    out.push({
      key: `${o.key}.lit.json`,
      contentType: 'application/json',
      body: JSON.stringify(sidecar),
      kind: 'sidecar',
    });
  }

  return {
    bucketName: bucket.bucketName,
    visibility: bucket.visibility,
    manifest: bucket.manifest,
    objects: out,
    masterKey,
  };
}
