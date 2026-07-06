/**
 * PROD publisher — encrypt a course, store it on BNB Greenfield MAINNET
 * (chain 1017), gate the master key via the REAL Chipotle (Lit v3, Base
 * mainnet) and mirror the encrypted artifacts to IPFS via Pinata.
 *
 * Thin CLI over the shared pipeline in publish-course-run.mjs (same flow as
 * write-devnet.mjs, mainnet target). The old datil-based implementation was
 * removed: Lit P2P networks (datil/naga) are dead — Chipotle REST is the only
 * live Lit network (see skills/lit/SKILL.md §7).
 *
 * Required env:
 *   GREENFIELD_MAINNET_PRIVATE_KEY / GREENFIELD_MAINNET_ADDRESS  (funded BNB @1017)
 *   CHIPOTLE_URL=https://api.chipotle.litprotocol.com
 *   CHIPOTLE_API_KEY=…            (usage key; account funded via Stripe, min $5)
 *   MARKETPLACE_ADDR + COURSE_ID  (purchase-gated)  OR  NFT_GATING_CONTRACT
 *
 * Optional env:
 *   NFT_GATING_CHAIN=bsc|opbnb (default bsc) · NFT_STANDARD · NFT_MIN_BALANCE
 *   GF_BUCKET · COURSE=lessons|academy/<name>
 *   PIN_TO_IPFS=1 + PINATA_JWT (or PINATA_API_KEY+PINATA_API_SECRET) + PINATA_GATEWAY
 *
 * Run:
 *   docker compose -f smartcontracts/docker-compose.yml --profile prod up
 *   # or directly:
 *   cd smartcontracts/greenfield-testnet && npm install && node write-mainnet.mjs
 */
import { resolvePublishEnv, runPublish } from './publish-course-run.mjs';

let cfg;
try {
  cfg = resolvePublishEnv(process.env, 'mainnet');
} catch (e) {
  console.error(e.message);
  process.exit(e.exitCode ?? 2);
}

runPublish(cfg).catch((e) => {
  console.error('FAILED:', e?.message ?? e);
  process.exit(1);
});
