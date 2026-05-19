/**
 * Daskibo Academy — course discovery index
 *
 * Real search: the public `_lit/manifest.json` of each bucket is
 * crawlable by design (lit.md §1). This aggregates many manifests into
 * one in-memory index and searches by bucket / course title / lesson
 * title / tags — replacing the bucket-name-substring-only filter.
 *
 * Pure & DOM-free; the read client is injected.
 *
 * @typedef {{ title: string, key?: string, tags: string[] }} LessonRecord
 * @typedef {{ bucket: string, title: string, lessons: LessonRecord[],
 *             haystack: string }} CourseRecord
 * @typedef {{ courses: CourseRecord[] }} CourseIndex
 *
 * @typedef {Object} ManifestLike
 * @property {string} [schema]
 * @property {string} [bucket]
 * @property {string} [title]
 * @property {Array<{ key?: string, title?: string, tags?: string[] }>} [objects]
 *
 * @typedef {Object} ReadClient
 * @property {(bucket: string, key: string) => Promise<string>} readObject
 */

const MANIFEST_SCHEMA = 'daskibo.lit.manifest/1';

/** @param {unknown} v @returns {string} */
function str(v) {
  return typeof v === 'string' ? v : '';
}

/**
 * @param {Array<{ bucket: string, manifest: ManifestLike|null|undefined }>} entries
 * @returns {CourseIndex}
 */
export function buildCourseIndex(entries) {
  /** @type {CourseRecord[]} */
  const courses = [];
  for (const e of Array.isArray(entries) ? entries : []) {
    const m = e && e.manifest;
    if (!m || typeof m !== 'object' || m.schema !== MANIFEST_SCHEMA) continue;
    const bucket = str(e.bucket) || str(m.bucket);
    if (!bucket) continue;
    const title = str(m.title) || bucket;
    /** @type {LessonRecord[]} */
    const lessons = [];
    for (const o of Array.isArray(m.objects) ? m.objects : []) {
      if (!o || typeof o !== 'object') continue;
      lessons.push({
        title: str(o.title),
        key: str(o.key) || undefined,
        tags: Array.isArray(o.tags) ? o.tags.map(str) : [],
      });
    }
    const haystack = [
      bucket,
      title,
      ...lessons.map((l) => l.title),
      ...lessons.flatMap((l) => l.tags),
    ]
      .join('\n')
      .toLowerCase();
    courses.push({ bucket, title, lessons, haystack });
  }
  return { courses };
}

/**
 * Case-insensitive substring search over bucket / title / lesson / tag.
 * Empty query returns every course.
 * @param {CourseIndex} index
 * @param {string} query
 * @returns {CourseRecord[]}
 */
export function searchCourseIndex(index, query) {
  const all = index && Array.isArray(index.courses) ? index.courses : [];
  const q = String(query || '').trim().toLowerCase();
  if (!q) return all;
  return all.filter((c) => c.haystack.includes(q));
}

/**
 * Crawl `_lit/manifest.json` of each bucket via a read client. A bucket
 * with no/invalid manifest is skipped (best-effort discovery — a single
 * missing manifest must not fail the whole index).
 * @param {{ client: ReadClient, buckets: string[] }} args
 * @returns {Promise<CourseIndex>}
 */
export async function crawlCourseIndex({ client, buckets }) {
  /** @type {Array<{ bucket: string, manifest: ManifestLike|null }>} */
  const entries = [];
  for (const bucket of Array.isArray(buckets) ? buckets : []) {
    try {
      const raw = await client.readObject(bucket, '_lit/manifest.json');
      entries.push({ bucket, manifest: JSON.parse(raw) });
    } catch {
      // no manifest / not a course bucket / unreadable → skip
    }
  }
  return buildCourseIndex(entries);
}
