// Extracted from index.html so a strict Content-Security-Policy can use
// `script-src 'self' https://esm.sh` with no `'unsafe-inline'` (audit 4.2).
import { GREENFIELD_TESTNET } from './buckets/greenfield-core.js';
import './buckets/greenfield-ui.js';

document.getElementById('net-chain').textContent =
  GREENFIELD_TESTNET.cosmosChainId;
document.getElementById('net-sp').textContent = GREENFIELD_TESTNET.spEndpoint;
const f = document.getElementById('net-faucet');
f.href = GREENFIELD_TESTNET.faucet;
const e = document.getElementById('net-explorer');
e.href = GREENFIELD_TESTNET.explorer;
