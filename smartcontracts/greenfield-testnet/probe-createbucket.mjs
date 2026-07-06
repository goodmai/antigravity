import { createSdkBackend } from './sdk-backend.mjs';

const rpcUrl = process.env.GF_RPC || 'http://127.0.0.1:26750';
const chainId = process.env.GF_CHAIN_ID || 'greenfield_9000-1';
const privateKey = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const owner = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const backend = createSdkBackend({ rpcUrl, chainId, privateKey, address: owner });
const bucketName = 'probe-' + Math.random().toString(36).slice(2, 10);
console.log('Creating bucket', bucketName, 'chainId=', chainId);
try {
  const res = await backend.createBucket({ bucketName, owner, visibility: 'public' });
  console.log('SUCCESS:', JSON.stringify(res));
} catch (e) {
  console.error('FAILED:', e.message);
}
