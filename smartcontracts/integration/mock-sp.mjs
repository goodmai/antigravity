/**
 * Mock BNB Greenfield Storage Provider (SP) gateway.
 *
 * Implements just enough of the SP HTTP surface that greenfield-core.js
 * speaks, so the create / search / save / read flow can be exercised
 * end-to-end in a local docker-compose integration test — no testnet,
 * no wallet, fully deterministic.
 *
 *   PUT  /{bucket}                    → create bucket
 *   GET  /            (owner header)  → list buckets
 *   PUT  /{bucket}/{key...}           → save object
 *   GET  /download/{bucket}/{key...}  → read object
 *   GET  /view/{bucket}/{key...}      → read object (inline)
 *   GET  /healthz                     → readiness probe
 */

import http from 'node:http';

const PORT = process.env.PORT || 9000;

/** owner → Set(bucket) */
const buckets = new Map();
/** `${bucket}/${key}` → { body, contentType } */
const objects = new Map();

const txh = () =>
  '0x' + Math.random().toString(16).slice(2).padEnd(8, '0').slice(0, 8);

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const segs = url.pathname.split('/').filter(Boolean);
  const owner = req.headers['x-gnfd-user-address'] || 'anon';

  // Health probe
  if (segs[0] === 'healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('ok');
  }

  // List buckets: GET /
  if (req.method === 'GET' && segs.length === 0) {
    const owned = [...(buckets.get(owner) || [])].map((b) => ({
      bucket_name: b,
      visibility: 'public',
      create_at: 1700000000,
    }));
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ buckets: owned }));
  }

  // Read object: GET /download|view/{bucket}/{key...}
  if (req.method === 'GET' && (segs[0] === 'download' || segs[0] === 'view')) {
    const bucket = segs[1];
    const key = segs.slice(2).map(decodeURIComponent).join('/');
    const obj = objects.get(`${bucket}/${key}`);
    if (!obj) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': obj.contentType });
    return res.end(obj.body);
  }

  // Create bucket: PUT /{bucket}
  if (req.method === 'PUT' && segs.length === 1) {
    const bucket = segs[0];
    const set = buckets.get(owner) || new Set();
    if (set.has(bucket)) {
      res.writeHead(409, { 'content-type': 'text/plain' });
      return res.end('bucket exists');
    }
    set.add(bucket);
    buckets.set(owner, set);
    res.writeHead(200, { 'x-gnfd-txn-hash': txh() });
    return res.end('');
  }

  // Save object: PUT /{bucket}/{key...}
  if (req.method === 'PUT' && segs.length >= 2) {
    const bucket = segs[0];
    const key = segs.slice(1).map(decodeURIComponent).join('/');
    const body = await readBody(req);
    objects.set(`${bucket}/${key}`, {
      body,
      contentType: req.headers['content-type'] || 'application/octet-stream',
    });
    res.writeHead(200, { 'x-gnfd-txn-hash': txh() });
    return res.end('');
  }

  res.writeHead(400, { 'content-type': 'text/plain' });
  res.end('unsupported');
});

server.listen(PORT, () => {
  console.log(`mock-sp listening on :${PORT}`);
});
