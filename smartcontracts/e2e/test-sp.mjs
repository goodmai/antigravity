import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);
const { Client } = _require('@bnb-chain/greenfield-js-sdk');

async function main() {
  const client = Client.create('https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org', '5600');
  const sps = await client.sp.getStorageProviders();
  console.log(JSON.stringify(sps.map(s => ({ addr: s.operatorAddress, endpoint: s.endpoint, status: s.status })), null, 2));
}

main().catch(console.error);
