# 🔐 lit.md — Encrypted Greenfield buckets with Lit Protocol access control

How to store a bucket on BNB Greenfield where **the payload is encrypted
at rest**, **the metadata stays public so an indexer can crawl it**, and
**access + decryption is enforced by the Lit Protocol** threshold network
— not by Greenfield's own ACLs.

This builds directly on the bucket console in
[`GREENFIELD.md`](./GREENFIELD.md): Lit only ever touches *bytes* and
*public JSON*, so it works identically over Flow A (mock SP), Flow B
(local private chain) and Flow C (public testnet).

---

## 1. The core idea

Lit Protocol does **not** store your data. It is a decentralized key
management network: a BLS threshold key encrypts your content to a set of
**Access Control Conditions (ACC)**, and the network only reassembles the
decryption key for a caller who *proves* they satisfy those conditions
(via session signatures). The ciphertext can live anywhere — for us, in a
Greenfield object.

So the split is:

| Artifact | Where it lives | Secret? | Indexable? |
|----------|----------------|---------|------------|
| Plaintext content | nowhere persisted | — | — |
| `ciphertext` | Greenfield object payload | **No** (useless alone) | yes (opaque blob) |
| `dataToEncryptHash` | public metadata manifest | **No** | **yes** |
| `accessControlConditions` | public metadata manifest | **No** | **yes** |
| Content metadata (name, type, size, tags) | public metadata manifest | No | **yes** |
| Decryption key | derived by Lit nodes on demand | **Yes** | never stored |

Lit's security model **explicitly treats `ciphertext` +
`dataToEncryptHash` + ACC as public**. Publishing them so an indexer can
read them does not weaken anything — only a caller who satisfies the ACC
can ever turn the ciphertext into plaintext.

---

## 2. Bucket layout

One bucket, **`VISIBILITY_TYPE_PUBLIC_READ`**, so GreenfieldScan / any
crawler / a CDN can list and fetch objects. Confidentiality comes 100%
from Lit, never from the bucket ACL.

```
my-encrypted-bucket/                 (public-read)
├── _lit/
│   ├── manifest.json                ← bucket-level index (indexer entrypoint)
│   └── acc/<accSetId>.json          ← reusable named ACC sets
├── courses/01/intro.md.enc          ← Lit ciphertext envelope (the payload)
├── courses/01/intro.md.lit.json     ← per-object PUBLIC sidecar metadata
├── courses/02/video.mp4.enc
└── courses/02/video.mp4.lit.json
```

- `*.enc` — the encrypted object. Body = the **envelope** (§4).
- `*.lit.json` — public sidecar the indexer reads (never secret).
- `_lit/manifest.json` — a single document an indexer can poll to
  discover every protected object in the bucket without walking the SP
  listing API.

### `_lit/manifest.json` (indexer entrypoint)

```jsonc
{
  "schema": "daskibo.lit.manifest/1",
  "bucket": "my-encrypted-bucket",
  "litNetwork": "datil-test",
  "updatedAt": "2026-05-16T00:00:00Z",
  "objects": [
    {
      "key": "courses/01/intro.md.enc",
      "sidecar": "courses/01/intro.md.lit.json",
      "title": "Course 01 · Intro",
      "contentType": "text/markdown",
      "size": 5123,
      "tags": ["course-01", "free-preview:false"],
      "accSetId": "nft-course01-holders",
      "dataToEncryptHash": "64ec88ca00b268e5ba1a..."
    }
  ]
}
```

Everything here is safe to index, mirror, and serve from a CDN.

---

## 3. SDK surface (Lit v7 / Datil)

```bash
npm i @lit-protocol/lit-node-client @lit-protocol/encryption \
      @lit-protocol/auth-helpers @lit-protocol/constants
```

Networks: `datil-dev` (free, dev), `datil-test` (staging, **pair with
Greenfield testnet**), `datil` (production, pair with Greenfield
mainnet). Pin the version — v7 had breaking changes.

---

## 4. The encryption envelope

The `*.enc` object body is a small versioned JSON wrapper so a reader has
everything except the key. (Binary payloads are base64'd; large media
should chunk — see §8.)

```jsonc
{
  "schema": "daskibo.lit.envelope/1",
  "litNetwork": "datil-test",
  "chain": "ethereum",
  "ciphertext": "pSP1Rq4xdyLBzSghZ3Dtt...",
  "dataToEncryptHash": "64ec88ca00b268e5ba1a...",
  "accessControlConditions": [ /* …ACC… */ ],
  "meta": { "contentType": "text/markdown", "originalKey": "courses/01/intro.md" }
}
```

`dataToEncryptHash` cryptographically **binds the ciphertext to its
ACC**: you cannot loosen access by editing the sidecar later. Changing
who-can-read means **re-encrypting** (§7).

---

## 5. Write flow — encrypt, then save to Greenfield

```
author ──encryptString(ACC, plaintext)──▶ Lit (datil-test)
                                          └─▶ { ciphertext, dataToEncryptHash }
author ──build envelope JSON─────────────────────────────────────────────┐
author ──greenfield-core.saveObject("…​.enc",   envelope)  ──▶ Greenfield │
author ──greenfield-core.saveObject("…​.lit.json", sidecar) ──▶ Greenfield │
author ──update _lit/manifest.json + saveObject ─────────────▶ Greenfield │
indexer ──crawls public manifest/sidecars───────────────────────────◀─────┘
```

Reuses the existing `createGreenfieldClient(...).saveObject(...)` from
`smartcontracts/buckets/greenfield-core.js` — the payload is just bytes
to Greenfield.

```ts
import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { encryptString } from '@lit-protocol/encryption';
import { createGreenfieldClient } from './smartcontracts/buckets/greenfield-core.js';

const lit = new LitNodeClient({ litNetwork: 'datil-test' });
await lit.connect();

// "Only holders of the course-01 NFT may decrypt"
const accessControlConditions = [{
  contractAddress: '0xCourse01Nft',
  standardContractType: 'ERC721',
  chain: 'ethereum',
  method: 'balanceOf',
  parameters: [':userAddress'],
  returnValueTest: { comparator: '>', value: '0' },
}];

const { ciphertext, dataToEncryptHash } = await encryptString(
  { accessControlConditions, dataToEncrypt: '# Course 01 — secret notes' },
  lit,
);

const envelope = {
  schema: 'daskibo.lit.envelope/1',
  litNetwork: 'datil-test', chain: 'ethereum',
  ciphertext, dataToEncryptHash, accessControlConditions,
  meta: { contentType: 'text/markdown', originalKey: 'courses/01/intro.md' },
};

const gf = createGreenfieldClient({ transport, owner });
await gf.saveObject('my-encrypted-bucket', 'courses/01/intro.md.enc',
  JSON.stringify(envelope), { contentType: 'application/json', visibility: 'public' });
await gf.saveObject('my-encrypted-bucket', 'courses/01/intro.md.lit.json',
  JSON.stringify({ ...envelope, ciphertext: undefined }),
  { contentType: 'application/json', visibility: 'public' });
// then merge an entry into _lit/manifest.json and saveObject it
```

The sidecar deliberately **omits `ciphertext`** so indexers get pure
metadata; the `.enc` object carries the full envelope for readers.

---

## 6. Read flow — fetch from Greenfield, decrypt via Lit

```
reader ──greenfield-core.readObject("…​.enc") ──▶ Greenfield ──▶ envelope JSON
reader ──getSessionSigs(authNeededCallback: SIWE sign) ──▶ Lit
reader ──decryptToString({ACC, ciphertext, hash, sessionSigs}) ──▶ Lit nodes
            Lit nodes evaluate ACC on-chain ─┐
            satisfied → return key shares ───┘ (threshold reassembly)
reader ◀── plaintext (decrypted client-side, never leaves the browser)
```

```ts
import { decryptToString } from '@lit-protocol/encryption';
import { LitActionResource } from '@lit-protocol/auth-helpers';
import { LIT_ABILITY } from '@lit-protocol/constants';

const env = JSON.parse(await gf.readObject('my-encrypted-bucket',
  'courses/01/intro.md.enc'));

const sessionSigs = await lit.getSessionSigs({
  chain: env.chain,
  resourceAbilityRequests: [
    { resource: new LitActionResource('*'), ability: LIT_ABILITY.LitActionExecution },
  ],
  authNeededCallback, // SIWE message signed by the reader's wallet
});

const plaintext = await decryptToString({
  accessControlConditions: env.accessControlConditions,
  ciphertext: env.ciphertext,
  dataToEncryptHash: env.dataToEncryptHash,
  chain: env.chain,
  sessionSigs,
}, lit);
```

If the wallet fails the ACC, Lit simply never returns enough key shares —
the reader holds only the (worthless) ciphertext. Greenfield never has to
know who is or isn't authorized.

---

## 7. Access-control patterns

The ACC array is the policy. Common shapes:

- **Allowlist** — `method:'' parameters:[':userAddress']`,
  `returnValueTest:{ '=', '0xReader' }` (chain rules with `operator:'or'`).
- **Token / NFT gate** — `ERC721/ERC1155/ERC20 balanceOf > 0` (the §5
  example) — natural fit for course-purchase gating.
- **Time-lock** — a unified ACC on block timestamp (`> T`) for embargoed
  releases.
- **Payment gate** — condition checks an on-chain receipt / subscription
  NFT minted at checkout.
- **Programmable (PKP + Lit Action)** — for logic that can't be a static
  condition (off-chain entitlements, rate caps, multi-factor): a Lit
  Action runs JS in the network and only then releases the decryption,
  optionally signing with a PKP.

**Capacity Credits**: production reads/writes on `datil` need a Capacity
Credit NFT to cover Lit node rate limits — provision before launch.

---

## 8. Security & operational considerations

- **ACC immutability**: `dataToEncryptHash` binds ciphertext↔ACC. To
  change access you **re-encrypt** and overwrite the `.enc` object.
  Greenfield objects are versioned/immutable on-chain — treat each
  policy change as a new object version + manifest bump.
- **Crypto-shredding / "deletion"**: deleting a Greenfield object unpins
  the ciphertext, but anyone who already cached it could still ask Lit to
  decrypt. True revocation = rotate to a new key/ACC and stop serving the
  old ciphertext; for hard guarantees, encrypt with a per-tenant data key
  and destroy that key's availability.
- **Metadata leakage**: object *names*, *sizes* and *tags* in the public
  manifest are visible to everyone. Put nothing sensitive in keys/tags;
  pad or bucket sizes if size is a side channel; use opaque object ids and
  keep human titles only inside the encrypted payload if titles are
  sensitive.
- **Session sigs**: short-lived, scoped, signed by the reader's wallet —
  never persist them server-side; expire aggressively.
- **Large media**: don't base64 a 1 GB file into one envelope. Encrypt in
  chunks (e.g. 8–16 MB), store `part-0001.enc …`, list parts + per-part
  `dataToEncryptHash` in the sidecar, decrypt+stream client-side.
- **Indexer trust**: the indexer is *untrusted by design* — it only ever
  sees public material. Verify the manifest against on-chain object
  checksums (Greenfield stores object hashes) to detect a tampering SP or
  indexer.
- **Network pairing**: use `datil-dev`/`datil-test` with Greenfield
  **testnet** (Flow B/C), `datil` with mainnet. Pin SDK + ACC schema
  versions; record `litNetwork` in every envelope so old data stays
  decryptable after upgrades.
- **Availability**: Lit liveness gates *all* reads. Cache the Greenfield
  ciphertext on a CDN (cheap, it's public) but treat Lit as the
  critical-path dependency for decryption and design ret/backoff + a
  clear "access service unavailable" UX.

---

## 9. Proposed implementation (TDD, matches repo conventions)

Mirror `greenfield-core.js`'s pure/injectable style so it stays unit-testable:

| File | Role | Tests first |
|------|------|-------------|
| `smartcontracts/buckets/lit-envelope.js` | Pure: build/parse/validate envelope + sidecar + manifest merge. **No network.** Injectable `litClient` + reuse `greenfield-core` client. | `tests/lit-envelope.test.js` — schema validation, sidecar strips ciphertext, manifest upsert, ACC binding checks, error codes (`INVALID_ENVELOPE`, `ACC_REQUIRED`, `LIT_UNAVAILABLE`). |
| `smartcontracts/buckets/lit-ui.js` | DOM glue: "encrypt & save" / "fetch & decrypt" wired to forms; jsdom-testable with a mock Lit client + mock Greenfield client. | `tests/lit-ui.test.js`. |
| `smartcontracts/lit/docker-compose.yml` | Flow D integration: frontend + mock SP + a **mock Lit node** (deterministic encrypt/decrypt + ACC stub) so the full encrypt→store→gate→decrypt loop runs offline in CI. Live `datil-test` run is opt-in (env-gated), exactly like Flow C. | `tests/lit-integration.docker.test.js` (auto-skips without Docker). |

Red → green, same as the existing suites; default `npm test` stays
hermetic (mock Lit), real Lit network behind an opt-in env flag.

---

## 10. End-to-end summary

1. Author defines an ACC (who may read).
2. `encryptString(ACC, plaintext)` → `ciphertext` + `dataToEncryptHash`.
3. Save envelope (`.enc`) + public sidecar (`.lit.json`) + manifest to a
   **public-read** Greenfield bucket via the existing bucket console.
4. Indexer crawls the public manifest/sidecars — full discoverability,
   zero plaintext exposure.
5. Reader fetches the `.enc` envelope, gets `sessionSigs`, calls
   `decryptToString`; Lit evaluates the ACC and only then reassembles the
   key. Decryption happens client-side.

Confidentiality = Lit threshold cryptography. Discoverability = public
Greenfield metadata. The two concerns are cleanly separated.

---

## 11. Payments & fee routing (w3ext + treasury)

Lit Protocol charges for **both** operations: encryption at **save**
(provisioning the threshold key + access policy) and the key-share
reassembly at **read** (decryption). w3ext is the platform broker that
fronts those Lit costs and adds its margin; the course marketplace adds a
protocol cut on sales.

Implemented as pure, deterministic BigInt math (integer minor units,
basis-points percentages, no float, every split re-sums exactly to its
input) in **`smartcontracts/buckets/lit-pricing.js`**, fully TDD'd by
**`tests/lit-pricing.test.js`**.

### Defaults

| Event | Who is paid | Default |
|-------|-------------|---------|
| **Save** a course | Lit (encryption) + Greenfield storage | pass-through cost |
| **Save** a course | **w3ext platform fee** | **20%** of the save cost (`DEFAULT_W3EXT_FEE_BPS = 2000`) |
| **Read** a course | Lit (decryption) | pass-through cost |
| **Read** a course | **w3ext platform fee** | **20%** of the read cost (`DEFAULT_W3EXT_READ_FEE_BPS = 2000`, override per-call) |
| **Sale** of a course | **`treasury` smart contract** | **20%** of the sale price (`DEFAULT_TREASURY_BPS = 2000`) |
| **Sale** of a course | Seller | the exact remainder (absorbs rounding) |

All percentages are overridable per call; the constants above are only
the defaults the user asked for.

### Save charge

```js
import { computeSaveCharge } from './smartcontracts/buckets/lit-pricing.js';

computeSaveCharge({ litSaveCost: 800n, storageCost: 200n,
                    litPayee:'0xLit', storagePayee:'0xSP', w3extPayee:'0xW3' });
// base = 1000  (Lit 800 + storage 200)
// w3extFee = 200  (20% of base — the default w3ext cut on saving a course)
// total = 1200
// payouts: 0xLit→800 (lit-save), 0xSP→200 (storage), 0xW3→200 (w3ext-fee)
//          Σ payouts === total   (invariant, asserted in tests)
```

### Read charge

```js
import { computeReadCharge } from './smartcontracts/buckets/lit-pricing.js';

computeReadCharge({ litReadCost: 500n });
// litReadCost 500 + w3extFee 100 (20%) = total 600
```

### Sale split → treasury

```js
import { computeSaleSplit } from './smartcontracts/buckets/lit-pricing.js';

computeSaleSplit({ salePrice: 1000n, treasury:'0xTreasury', seller:'0xSeller' });
// treasuryAmount = 200  (20% → treasury smart contract)
// sellerAmount   = 800  (remainder; rounding never loses wei)
// payouts re-sum to salePrice
```

### Where the money settles

- **w3ext** is the off-/on-chain broker: it collects `total` from the
  author/reader, forwards the Lit + storage pass-through to their payees,
  and keeps `w3extFee`. It is the natural place to provision Lit
  **Capacity Credits** (§7) and amortize them across users.
- **treasury** is a smart contract address. The 20% sale cut is a
  transfer/`call` to that contract inside the course-purchase
  transaction; `computeSaleSplit` produces the exact `payouts` a contract
  or payment router executes atomically with the sale.
- The pricing module is **policy only** — it never moves funds. It feeds
  a payment router / smart contract so the splits stay auditable and
  unit-tested independently of any chain.

---

## 12. Efficient encryption when Lit is NOT used

Lit gates *who* may decrypt, but a self-custodied or offline path still
needs confidentiality without a network round-trip. For that, use the
**envelope (hybrid) scheme** in
**`smartcontracts/buckets/crypto-envelope.js`** — pure, DOM-free,
injectable WebCrypto, TDD'd by **`tests/crypto-envelope.test.js`** (10
tests).

```
plaintext ──AES-256-GCM(DEK)──▶ ciphertext        (fast bulk AEAD)
DEK       ──AES-256-GCM(MASTER)──▶ wrappedDek      (32-byte key-wrap)
MASTER    ──AES-GCM(PBKDF2-SHA256(passphrase))──▶ wrapped   (optional)
```

Why this is efficient (and not just "encrypt everything with RSA"):

- **Bulk data is symmetric only.** AES-256-GCM is hardware-accelerated;
  asymmetric/KDF work is confined to the 32-byte DEK, so cost is ~O(size)
  with a tiny constant — independent of object count for the expensive
  part.
- **One master key per bucket.** Every object gets a fresh random DEK
  (unique IV + ciphertext, verified in tests), but all DEKs are wrapped
  by a single bucket master. **Rotating or destroying the master
  crypto-shreds the entire bucket in O(1)** — the practical answer to the
  "deletion" problem raised in §8, with no per-object rewrite.
- **AEAD integrity for free.** GCM tags mean a tampered ciphertext or the
  wrong key fails closed (`DECRYPT_FAILED`), never returns garbage.
- **Portable custody.** The master can be wrapped by a PBKDF2-SHA256
  passphrase KEK (≥210k iterations) for human-held backup, or — in a Lit
  deployment — the *master itself* becomes the `dataToEncrypt`, so Lit
  protects one 32-byte key instead of every object. This composes the two
  schemes: Lit for policy, envelope for efficient bulk + instant
  revocation.

```js
import {
  createBucketMasterKey, encryptObject, decryptObject,
  wrapMasterWithPassphrase, unwrapMasterWithPassphrase,
} from './smartcontracts/buckets/crypto-envelope.js';

const master = await createBucketMasterKey();              // 256-bit, base64
const env = await encryptObject(master, '# secret lesson',
              { contentType: 'text/markdown', originalKey: 'c01.md' });
// → store `env` as the Greenfield object (public-read is fine: opaque)
const { text } = await decryptObject(master, env);          // round-trips

const wrap = await wrapMasterWithPassphrase(master, 'pass phrase');
// store `wrap` as bucket-level key backup; or feed `master` to Lit's
// encryptString so Lit guards the single master key.
```

Selection guide:

| Need | Use |
|------|-----|
| Token/NFT/allowlist-gated, no shared secret | **Lit** (§5–§7) |
| Self-custody / offline / max throughput | **envelope** (§12) |
| Gated **and** cheap bulk + instant revoke | **both**: Lit-wrap the envelope master |

Both modules follow the repo's pure/injectable/TDD conventions and plug
into the same `greenfield-core` `saveObject`/`readObject` calls — the
stored bytes are opaque either way.

---

### Sources

- [Lit — Encryption & Access Control](https://developer.litprotocol.com/sdk/access-control/intro)
- [Lit — Quick Start (encryptString / decryptToString)](https://developer.litprotocol.com/sdk/access-control/quick-start)
- [Lit — Session Signatures](https://developer.litprotocol.com/sdk/authentication/session-sigs/get-session-sigs)
- [Lit — SDK v7 release & Datil networks](https://spark.litprotocol.com/lit-sdk-v7/)
- [Lit ✕ decentralized storage (encrypt → store → gated decrypt)](https://spark.litprotocol.com/working-with-decentralized-access-control/)
- [BNB Greenfield — visibility / storage module](https://docs.bnbchain.org/bnb-greenfield/) · see also [`GREENFIELD.md`](./GREENFIELD.md)
