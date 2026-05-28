// Daskibo local demo — encrypt the seeded course's lesson and write its
// DRM manifest. Runs once after demo-deploy, against the Chipotle MOCK.
//
// Flow (mirrors the real Flow-C DRM, minus Greenfield):
//   1. AES-GCM encrypt the lesson body with a fresh master key (crypto-envelope).
//   2. Wrap (encrypt) that master key via the Chipotle mock, bound to an ACC =
//      CourseMarketplace.hasCourseAccess(:userAddress, courseId).
//   3. Write demo/manifest-<id>.json: { ciphertext envelope, wrapped master,
//      ACC, chipotleUrl }. The reader page can only recover the master — and
//      thus decrypt — if the connected wallet satisfies the ACC on-chain.
//
// Content source: by default reads `LESSON_PATH` (a real markdown lesson, e.g.
// /app/lessons/1/README.md on devnet so the gated reader shows the actual
// course we just published to Greenfield). Falls back to a hardcoded Hello-
// World stub when no file is provided / readable (used by the throwaway local
// Anvil demo where the lesson body is not the point of the demo).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createBucketMasterKey, encryptObject } from '../buckets/crypto-envelope.js';

const SHARED = process.env.SHARED_DIR || '/shared';
// URL the BROWSER will call (published port), not the in-network one.
const CHIPOTLE_PUBLIC_URL = process.env.CHIPOTLE_PUBLIC_URL || 'http://localhost:8000';
// URL THIS script calls to wrap the key (in-compose-network).
const CHIPOTLE_URL = process.env.CHIPOTLE_URL || 'http://chipotle-mock:8000';

const COURSE_ID = Number(process.env.DEMO_COURSE_ID || 1);
const TITLE = process.env.DEMO_COURSE_TITLE || 'Intro to Greenfield';
const LESSON_PATH = process.env.LESSON_PATH || '';

const addrs = JSON.parse(readFileSync(`${SHARED}/addresses.json`, 'utf8'));

let lesson;
let source;
if (LESSON_PATH && existsSync(LESSON_PATH)) {
  const real = readFileSync(LESSON_PATH, 'utf8');
  lesson = [
    `# ${TITLE}`,
    '',
    `_Lesson #${COURSE_ID} — decrypted via Chipotle after hasCourseAccess(you, ${COURSE_ID})._`,
    '',
    real.trim(),
    '',
    '---',
    `_Issued: ${new Date().toISOString()} · marketplace \`${addrs.marketplace}\` · source \`${LESSON_PATH}\`_`,
  ].join('\n');
  source = `real lesson @ ${LESSON_PATH} (${real.length} chars)`;
} else {
  lesson = [
    `# ${TITLE}`,
    '',
    '## Lesson 1 — Hello, World! 🎓',
    '',
    `This is the **decrypted** body of course #${COURSE_ID} (\`${addrs.marketplace}\`).`,
    'You can read it because your wallet satisfies the on-chain access condition',
    '`CourseMarketplace.hasCourseAccess(you, courseId) == true` — i.e. you are the',
    'author or you bought a soulbound AccessPass. Without it, the Chipotle key',
    'server refuses to release the decryption key and this text stays ciphertext.',
    '',
    `_Issued: ${new Date().toISOString()} · token ${Date.now()}_`,
  ].join('\n');
  source = LESSON_PATH ? `stub (LESSON_PATH not found: ${LESSON_PATH})` : 'stub (no LESSON_PATH set)';
}

const accessControlConditions = [{
  contractAddress: addrs.marketplace,
  standardContractType: 'customContract',
  chain: 'ethereum',
  method: 'hasCourseAccess',
  parameters: [':userAddress', String(COURSE_ID)],
  returnValueTest: { comparator: '==', value: 'true' },
}];

async function main() {
  // 1. AES envelope over the lesson body.
  const masterKey = await createBucketMasterKey();
  const env = await encryptObject(masterKey, lesson, {
    contentType: 'text/markdown', originalKey: `course-${COURSE_ID}`,
  });

  // 2. Wrap the master key via the Chipotle mock (bound to the ACC).
  const res = await fetch(`${CHIPOTLE_URL}/core/v1/lit_action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'dummy-api-key' },
    body: JSON.stringify({
      js_params: { action: 'encrypt', masterKey, accessControlConditions },
    }),
  });
  const data = await res.json();
  if (data.has_error) throw new Error('Chipotle encrypt failed: ' + data.error);
  const wrapped = data.response; // { ciphertext, dataToEncryptHash, pkpId }

  // 3. Manifest for the reader page.
  const manifest = {
    schema: 'daskibo.demo.manifest/1',
    courseId: COURSE_ID,
    title: TITLE,
    marketplace: addrs.marketplace,
    chainId: addrs.chainId,
    rpcUrl: addrs.rpcUrl,
    chipotleUrl: CHIPOTLE_PUBLIC_URL,
    accessControlConditions,
    masterCiphertext: wrapped.ciphertext,
    pkpId: wrapped.pkpId,
    env,
  };
  writeFileSync(`${SHARED}/manifest-${COURSE_ID}.json`, JSON.stringify(manifest, null, 2));
  console.log(`  lesson source: ${source}`);
  console.log(`✓ Wrote ${SHARED}/manifest-${COURSE_ID}.json (encrypted lesson + ACC-gated key)`);
}

main().catch((e) => { console.error('demo-encrypt failed:', e.message); process.exit(1); });
