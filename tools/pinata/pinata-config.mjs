/**
 * Pinata config + Lit-action target resolution. Pure/injectable so the CLI's
 * file selection and env wiring are unit-tested without touching the filesystem.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Read Pinata credentials + gateway from an env-like object. Empty strings
 * become undefined so downstream auth selection is clean.
 * @param {Record<string,string|undefined>} [env]
 * @returns {{ jwt?: string, apiKey?: string, apiSecret?: string, gateway?: string }}
 */
export function pinataConfigFromEnv(env = {}) {
  const pick = (v) => (v && String(v).length > 0 ? String(v) : undefined);
  return {
    jwt: pick(env.PINATA_JWT),
    apiKey: pick(env.PINATA_API_KEY),
    apiSecret: pick(env.PINATA_API_SECRET) ?? pick(env.PINATA_SECRET_API_KEY),
    gateway: pick(env.PINATA_GATEWAY),
  };
}

/**
 * The Lit Actions this project pins to IPFS (see
 * ../../skills/pinata/litaction.md). Only files that exist are returned, so the
 * not-yet-written `wrap-for-buyer.action.js` is skipped until added.
 * @param {string} litActionsDir
 * @param {{ exists?: (path: string) => boolean }} [deps]
 * @returns {Array<{ name: string, file: string, path: string }>}
 */
export function litActionTargets(litActionsDir, { exists = existsSync } = {}) {
  const candidates = [
    { name: 'claim-signer', file: 'claim-signer.action.js' },
    { name: 'wrap-for-buyer', file: 'wrap-for-buyer.action.js' },
  ];
  return candidates
    .map((c) => ({ ...c, path: join(litActionsDir, c.file) }))
    .filter((c) => exists(c.path));
}
