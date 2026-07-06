#!/usr/bin/env node
/**
 * Pinata pin CLI — pin a file or the project's Lit Actions to IPFS.
 *
 * Usage:
 *   node tools/pinata/pin.mjs <path> [--private] [--name NAME]
 *   node tools/pinata/pin.mjs --lit-actions      # pin claim-signer (+ wrap-for-buyer)
 *   node tools/pinata/pin.mjs --help
 *
 * Credentials come from the env (loaded from repo-root .env if present):
 *   PINATA_JWT (recommended)  OR  PINATA_API_KEY + PINATA_API_SECRET
 *   PINATA_GATEWAY            e.g. bronze-junior-ant-598.mypinata.cloud
 *
 * See skills/pinata/SKILL.md and skills/pinata/litaction.md.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinFile, gatewayUrl } from './pinata-client.mjs';
import { pinataConfigFromEnv, litActionTargets } from './pinata-config.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');
const LIT_ACTIONS_DIR = join(REPO_ROOT, 'smartcontracts', 'lit-actions');

/** Minimal .env loader (no dependency): KEY=VALUE lines, # comments. */
function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2].replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function usage() {
  console.log(
    [
      'pin.mjs — pin files / Lit Actions to IPFS via Pinata',
      '',
      '  node tools/pinata/pin.mjs <path> [--private] [--name NAME]',
      '  node tools/pinata/pin.mjs --lit-actions',
      '',
      'env: PINATA_JWT | PINATA_API_KEY+PINATA_API_SECRET, PINATA_GATEWAY',
    ].join('\n'),
  );
}

async function main() {
  loadDotEnv(join(REPO_ROOT, '.env'));
  const cfg = pinataConfigFromEnv(process.env);
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    usage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const network = args.includes('--private') ? 'private' : 'public';
  const nameFlagIdx = args.indexOf('--name');
  const nameOverride = nameFlagIdx >= 0 ? args[nameFlagIdx + 1] : undefined;

  if (args.includes('--lit-actions')) {
    const targets = litActionTargets(LIT_ACTIONS_DIR);
    if (targets.length === 0) {
      console.error(`No Lit Actions found in ${LIT_ACTIONS_DIR}`);
      process.exit(1);
    }
    const out = {};
    for (const t of targets) {
      const content = readFileSync(t.path, 'utf8');
      const { cid, url } = await pinFile(
        { content, name: t.file, network, contentType: 'application/javascript', ...cfg },
        {},
      );
      // Persist a token-LESS gateway URL — the gateway access token is a secret
      // and must never be written to a committed artifact. Readers append
      // ?pinataGatewayToken from PINATA_GATEWAY_KEY at read time.
      out[t.name] = {
        file: t.file,
        cid,
        url: gatewayUrl(cid, { gateway: cfg.gateway || 'gateway.pinata.cloud' }),
      };
      console.log(`✓ ${t.name}: ${cid}`);
      console.log(`    ${url ?? out[t.name].url}`); // console may show the token URL (ephemeral)
    }
    const mapPath = join(LIT_ACTIONS_DIR, 'cids.json');
    writeFileSync(mapPath, JSON.stringify(out, null, 2) + '\n');
    console.log(`\nWrote CID map → ${mapPath}`);
    return;
  }

  // Single-file mode
  const filePath = args.find((a) => !a.startsWith('--') && a !== nameOverride);
  if (!filePath) {
    usage();
    process.exit(1);
  }
  const content = readFileSync(filePath, 'utf8');
  const { cid, url } = await pinFile(
    { content, name: nameOverride ?? basename(filePath), network, ...cfg },
    {},
  );
  console.log(`cid: ${cid}`);
  if (url) console.log(`url: ${url}`);
}

main().catch((e) => {
  console.error(`pinata: ${e.message ?? e}`);
  process.exit(1);
});
