/**
 * DRM publisher (Chipotle / Lit v3) — devnet/testnets target: encrypt a course,
 * store it on the REAL BNB Greenfield testnet (5600), and gate the master-key
 * release on-chain (BSC testnet 97 / opBNB testnet 5611).
 *
 * Thin CLI over the shared pipeline in publish-course-run.mjs — one flow, two
 * targets (this one and write-mainnet.mjs). Lit has no testnets: DRM is either
 * the local chipotle-mock (default) or the REAL api.chipotle.litprotocol.com
 * (Base mainnet, Stripe-funded CHIPOTLE_API_KEY) — used by the `testnets`
 * compose profile too, since Chipotle prod is the only live Lit network.
 *
 * Required env:
 *   GREENFIELD_TESTNET_PRIVATE_KEY / GREENFIELD_TESTNET_ADDRESS   (funded tBNB @5600)
 *   MARKETPLACE_ADDR + COURSE_ID   (purchase-gated)  OR  NFT_GATING_CONTRACT
 *
 * Optional env:
 *   CHIPOTLE_URL / CHIPOTLE_API_KEY / CHIPOTLE_PUBLIC_URL
 *   NFT_GATING_CHAIN=bscTestnet · NFT_STANDARD=ERC721 · NFT_MIN_BALANCE=1
 *   GF_BUCKET · COURSE=lessons|academy/<name>
 *   PIN_TO_IPFS=1 + PINATA_JWT (or PINATA_API_KEY+PINATA_API_SECRET) + PINATA_GATEWAY
 */
import { resolvePublishEnv, runPublish } from './publish-course-run.mjs';

let cfg;
try {
  cfg = resolvePublishEnv(process.env, 'testnet');
} catch (e) {
  console.error(e.message);
  process.exit(e.exitCode ?? 2);
}

runPublish(cfg).catch((e) => {
  console.error('FAILED:', e?.message ?? e);
  process.exit(1);
});
