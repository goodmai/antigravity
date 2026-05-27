// Daskibo — course & lesson loader.
//
// Loads REAL course content from the repo (the same trees served at
// https://goodmai.github.io/antigravity/) instead of a synthetic mock:
//   • the flat lessons course  → repo `lessons/`            (id: "lessons")
//   • the academy courses       → repo `academy/courses/<id>/`
//
// Exposes the file inventory (for raw upload + size/gas measurement) and a
// publish spec (text lessons for the DRM/encrypted publisher).
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const CONTENT_TYPES = {
  '.html': 'text/html', '.htm': 'text/html', '.md': 'text/markdown',
  '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.gif': 'image/gif', '.txt': 'text/plain',
  '.py': 'text/x-python', '.yml': 'text/yaml', '.yaml': 'text/yaml',
};

const contentTypeFor = (f) => CONTENT_TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream';
const isText = (ct) => /^text\/|application\/(javascript|json)/.test(ct);

export function humanBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(2)} MB`;
}

function walk(dir, base, out) {
  for (const name of readdirSync(dir).sort()) {
    const abs = path.join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, base, out);
    else {
      const ct = contentTypeFor(abs);
      out.push({ abs, key: path.relative(base, abs).split(path.sep).join('/'), size: st.size, contentType: ct, isText: isText(ct) });
    }
  }
}

function titleFromIndex(root, fallback) {
  const idx = path.join(root, 'index.html');
  if (existsSync(idx)) {
    const m = readFileSync(idx, 'utf8').match(/<title>([^<]*)<\/title>/i);
    if (m) return m[1].trim();
  }
  return fallback;
}

/** Enumerate available courses: the flat `lessons/` course + academy courses. */
export function listCourses() {
  const courses = [];
  const flat = path.join(REPO_ROOT, 'lessons');
  if (existsSync(flat)) courses.push({ id: 'lessons', root: flat, title: titleFromIndex(flat, 'Anti-Gravity Lessons') });
  const academy = path.join(REPO_ROOT, 'academy', 'courses');
  if (existsSync(academy)) {
    for (const name of readdirSync(academy).sort()) {
      const root = path.join(academy, name);
      if (statSync(root).isDirectory()) courses.push({ id: `academy/${name}`, root, title: titleFromIndex(root, name) });
    }
  }
  return courses;
}

/**
 * Load one course by id ("lessons", "academy/<name>") or explicit dir.
 * @returns {{ id: string, title: string, root: string, files: object[], textFiles: object[], totalBytes: number }}
 */
export function loadCourse({ id, dir } = {}) {
  let root = dir;
  let cid = id || (dir ? path.basename(dir) : 'lessons');
  if (!root) {
    if (process.env.LESSONS_DIR && (!id || id === 'lessons')) root = process.env.LESSONS_DIR;
    else {
      const found = listCourses().find((c) => c.id === (id || 'lessons'));
      if (!found) throw new Error(`Unknown course id "${id}". Available: ${listCourses().map((c) => c.id).join(', ')}`);
      root = found.root; cid = found.id;
    }
  }
  if (!existsSync(root)) throw new Error(`Course dir not found: ${root}`);
  const files = [];
  walk(root, root, files);
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  return { id: cid, title: titleFromIndex(root, cid), root, files, textFiles: files.filter((f) => f.isText), totalBytes };
}

/** Convenience: the flat lessons course. */
export const loadLessonsCourse = (dir) => loadCourse({ id: 'lessons', dir });

export const readLessonFile = (abs) => readFileSync(abs);

/**
 * Build a DRM publish spec (text lessons only — images/assets are uploaded raw
 * by the measure/upload flow, not encrypted into the manifest).
 * @returns {{ slug: string, title: string, litNetwork: string, lessons: Array<{key:string,title:string,contentType:string,body:string}> }}
 */
export function buildPublishSpec(course, { slug, litNetwork = 'chipotle' } = {}) {
  const lessons = course.textFiles.map((f) => ({
    key: f.key,
    title: lessonTitle(f.key),
    contentType: f.contentType,
    body: readFileSync(f.abs, 'utf8'),
  }));
  return { slug: slug || course.id.replace(/[^a-z0-9-]/gi, '-').toLowerCase(), title: course.title, litNetwork, lessons };
}

function lessonTitle(key) {
  const m = key.match(/(?:^|\/)(\d+)\//);
  const base = path.basename(key);
  return m ? `Lesson ${m[1]} — ${base}` : base;
}
