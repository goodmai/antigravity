# Daskibo DRM SDK (`daskibo-drm.js`) — G-01

One ergonomic facade over the low-level `buckets/*` modules (Greenfield upload +
`crypto-envelope` + Chipotle/Lit + ACC). Closes growth point **G-01** (see
[osint.md §4](../../spec/osint.md)).

```js
import { createDaskiboDRM } from './daskibo-drm.js';
import { createGreenfieldClient } from './greenfield-core.js';
import { createChipotleClient } from './lit-sdk-chipotle.js';
import { tokenBalanceAcc } from './lit-acc.js';

const drm = createDaskiboDRM({
  client:    createGreenfieldClient({ /* transport, owner, endpoint, backend */ }),
  litClient: createChipotleClient({ chipotleUrl, pkpId, apiKey }),
  owner:     '0x…',
  chain:     'bscTestnet',
  spUrl:     'https://gnfd-testnet-sp1.bnbchain.org',
});

// Publish an ACC-gated course in one call:
const { bucketName, manifestUrl } = await drm.publishCourse({
  spec,                                                   // course-template CourseSpec
  accessControlConditions: tokenBalanceAcc({ contractAddress: CLIENT_NFT, chain: 'bscTestnet', min: '1' }),
});

// Reader side — recover the AES master key (throws ACCESS_DENIED if ACC unmet):
const masterKey = await drm.getCourseKey({ bucket: bucketName, authContext });
// …then decrypt objects with crypto-envelope / course-read.js.
```

**API**
- `createDaskiboDRM({ client, litClient, owner?, chain?, pricing?, spUrl? })` — `client`/`litClient` are injected (any Greenfield client / LitClient), so the orchestration is unit-testable without a network.
- `publishCourse({ spec, accessControlConditions, author? })` → `{ bucketName, manifestKey, manifestUrl, savedKeys, manifest }`.
- `getCourseKey({ bucket, authContext })` → master key (b64); `ACCESS_DENIED` if the ACC is not satisfied.

Tests: [`tests/daskibo-drm.test.js`](../../tests/daskibo-drm.test.js) (fakes, no network).
The raw master key is never written into a stored object (enforced by `crypto-envelope`).
