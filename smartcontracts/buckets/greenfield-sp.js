/**
 * Daskibo Academy — Greenfield primary Storage-Provider selection
 *
 * Pure, shared by both real SDK write paths (Node `sdk-backend.mjs` and
 * browser `greenfield-wallet-sdk.js`) so selection is uniform and an
 * empty / unusable SP list fails with a coded `SP_UNAVAILABLE` instead of
 * an opaque `undefined.operatorAddress` TypeError.
 /**
  * @typedef {{ operatorAddress?: string, endpoint?: string, status?: string|number }} SpEntry
  * @typedef {{ operatorAddress: string, endpoint: string }} PrimarySp
  */

 /**
  * @param {string} message
  * @param {string} code
  * @returns {Error & { code: string }}
  */
 function spError(message, code) {
   return /** @type {Error & { code: string }} */ (
     Object.assign(new Error(message), { code })
   );
 }

 /**
  * Choose a usable primary SP: an https endpoint if any, else http. The
  * entry must carry both an operatorAddress and an endpoint.
  * @param {SpEntry[]|undefined|null} sps
  * @returns {PrimarySp}
  */
 export function pickPrimarySp(sps) {
   const list = Array.isArray(sps) ? sps : [];
   const targetEp = (typeof process !== 'undefined' && process.env.GF_SP) || '';
   if (targetEp) {
     const host = targetEp.replace(/^https?:\/\//, '');
     let match = list.find(s => s && s.endpoint && s.endpoint.includes(host));
     // On the local network the configured GF_SP host ("greenfield-local:9033")
     // differs from the SP's on-chain endpoint host ("127.0.0.1:9033"), so fall
     // back to matching by PORT — this deterministically selects the primary SP
     // serving that gateway (sp0, the GVG family-1 primary) rather than an
     // arbitrary in-service SP.
     if (!match) {
       const portMatch = host.match(/:(\d+)$/);
       if (portMatch) {
         const port = portMatch[1];
         match = list.find(s => s && s.endpoint && new RegExp(`:${port}(/|$)`).test(s.endpoint));
       }
     }
     if (match && match.operatorAddress && match.endpoint) {
       return { operatorAddress: match.operatorAddress, endpoint: match.endpoint };
     }
   }
   const usable = [];
   for (const s of list) {
     const addr = s && typeof s.operatorAddress === 'string' ? s.operatorAddress : '';
     const ep = s && typeof s.endpoint === 'string' ? s.endpoint : '';
     if (addr && /^https?:\/\//i.test(ep) && (s.status === undefined || s.status === null || s.status === 0)) {
       usable.push({ operatorAddress: addr, endpoint: ep });
     }
   }
   const https = usable.find((s) => /^https:\/\//i.test(s.endpoint));
   const chosen = https || usable[0];
   if (!chosen) {
     throw spError(
       'No usable Greenfield storage provider (empty or invalid SP list)',
       'SP_UNAVAILABLE',
     );
   }
   return chosen;
 }
