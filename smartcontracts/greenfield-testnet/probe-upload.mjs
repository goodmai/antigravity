import { createSdkBackend } from './sdk-backend.mjs';

const rpcUrl = process.env.GF_RPC || 'http://127.0.0.1:26750';
const chainId = process.env.GF_CHAIN_ID || 'greenfield_9000-1';
const spEndpoint = process.env.GF_SP || 'http://127.0.0.1:9033';
const privateKey = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const owner = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const backend = createSdkBackend({ rpcUrl, chainId, privateKey, address: owner });
const bucketName = 'probe-' + Math.random().toString(36).slice(2, 10);
const objectKey = 'lessons/01/secret.md.enc';
const payload = 'hello-greenfield-' + Date.now();

console.log('chainId=', chainId, 'sp=', spEndpoint);
console.log('[1] createBucket', bucketName);
const cb = await backend.createBucket({ bucketName, owner, visibility: 'public' });
console.log('    bucket OK:', JSON.stringify(cb));

// allow the SP blocksyncer to observe the new bucket on-chain
await new Promise((r) => setTimeout(r, 6000));

console.log('[2] putObject', objectKey, `(${payload.length} bytes)`);
try {
  const po = await backend.putObject({
    bucketName,
    objectKey,
    data: payload,
    contentType: 'text/markdown',
    visibility: 'public',
  });
  console.log('    upload OK:', JSON.stringify(po));
} catch (e) {
  console.error('    upload FAILED:', e?.message || e, e?.statusCode || '', e?.code || '');
  console.error(e);
  process.exit(1);
}

console.log('[3] readback via universal /download endpoint');
await new Promise((r) => setTimeout(r, 8000));
const url = `${spEndpoint.replace(/\/+$/, '')}/download/${bucketName}/${objectKey}`;
const res = await fetch(url);
const text = await res.text();
console.log('    GET', url, '->', res.status);
console.log('    body:', text.slice(0, 120));
if (res.status === 200 && text === payload) {
  console.log('PROBE SUCCESS: object round-trips through the real SP');
} else {
  console.log('PROBE PARTIAL: upload accepted but readback mismatch/not-ready (status', res.status + ')');
}
