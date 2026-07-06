#!/usr/bin/env node
/**
 * Re-apply the Daskibo patches to @synthetixio/synpress-metamask so the spec
 * fixture works with our local MetaMask 13.24.0 build on Chrome-for-Testing 130.
 * node_modules patches are lost on reinstall — run this after `pnpm install`:
 *
 *   node patch-synpress.mjs
 *
 * Three patches to dist/playwright/index.js:
 *   1. prepareExtension(): return the local 13.24.0 build (ext ID hebhbl…) instead
 *      of downloading Synpress's pinned 13.13.1 (different ext ID → cached wallet
 *      state, keyed to the 13.24.0 ID, would be invisible).
 *   2. launchPersistentContext: pin CfT 130 (Chrome 137+ blocks --load-extension;
 *      system Chrome is 148) and strip Playwright's default --disable-extensions
 *      (which otherwise disables the loaded MetaMask).
 *   3. getExtensionId: match the extension by substring — this build's name is
 *      "MetaMask MV3 lavamoat snow", not exactly "MetaMask".
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MM_PATH = process.env.METAMASK_EXT_PATH || '/home/g/projects/metamask-chrome-13.24.0';
const CHROME_BIN = process.env.CHROME_BIN || '/home/g/.local/share/chrome-for-testing-130/chrome-linux64/chrome';

// Resolve the synpress-metamask playwright bundle(s). pnpm hoists under .pnpm,
// and a single package can have MULTIPLE virtual dirs (its peer set changes the
// hash — e.g. adding `typescript` created `…playwright-core@1.48.2_typescript@5.9.3`
// alongside `…playwright-core@1.48.2`). The fixture may resolve EITHER, so patch
// ALL of them — patching only the first (`.find`) silently leaves the live copy
// unpatched → "[GetExtensionId] Extension with name MetaMask not found".
const glob = path.join(__dirname, 'node_modules/.pnpm');
const pkgDirs = fs.readdirSync(glob).filter(d => d.startsWith('@synthetixio+synpress-metamask@'));
if (pkgDirs.length === 0) { console.error('synpress-metamask not installed'); process.exit(1); }

function patchFile(target) {
  if (!fs.existsSync(target)) return -1;
  let src = fs.readFileSync(target, 'utf8');
  let n = 0;

  // 1. prepareExtension → local build
  if (!src.includes('PATCHED (Daskibo): use the local MetaMask')) {
    src = src.replace(
      /async function prepareExtension\(forceCache = true\) \{[\s\S]*?return unzipResult\.outputPath;\n\}/,
      `async function prepareExtension(forceCache = true) {\n` +
      `  // PATCHED (Daskibo): use the local MetaMask 13.24.0 build.\n` +
      `  return process.env.METAMASK_EXT_PATH || ${JSON.stringify(MM_PATH)};\n}`,
    );
    n++;
  }

  // 2. launchPersistentContext → CfT 130 + ignoreDefaultArgs
  if (!src.includes('PATCHED (Daskibo): pin Chrome-for-Testing')) {
    src = src.replace(
      /const context = await chromium\.launchPersistentContext\(_contextPath, \{\n\s*headless: false,/,
      `const context = await chromium.launchPersistentContext(_contextPath, {\n` +
      `        // PATCHED (Daskibo): pin Chrome-for-Testing 130 + strip --disable-extensions.\n` +
      `        executablePath: process.env.CHROME_BIN || ${JSON.stringify(CHROME_BIN)},\n` +
      `        ignoreDefaultArgs: ["--disable-extensions", "--enable-automation", "--disable-component-extensions-with-background-pages"],\n` +
      `        headless: false,`,
    );
    n++;
  }

  // 3. getExtensionId → substring match
  if (src.includes('extension.name.toLowerCase() === extensionName.toLowerCase()')) {
    src = src.replace(
      'extension.name.toLowerCase() === extensionName.toLowerCase()',
      'extension.name.toLowerCase().includes(extensionName.toLowerCase())',
    );
    n++;
  }

  fs.writeFileSync(target, src);
  return n;
}

let patchedAny = false;
for (const pkgDir of pkgDirs) {
  const target = path.join(glob, pkgDir, 'node_modules/@synthetixio/synpress-metamask/dist/playwright/index.js');
  const n = patchFile(target);
  if (n < 0) continue;
  patchedAny = true;
  console.log(`${n === 0 ? 'already patched' : `applied ${n} patch(es)`}: ${pkgDir}`);
}
console.log(patchedAny ? 'Done.' : 'No synpress-metamask dist found to patch.');
