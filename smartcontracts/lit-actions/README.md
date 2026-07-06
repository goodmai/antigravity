# Lit Actions — decentralized claim signer (P3 / audit §4.2)

`claim-signer.action.js` removes the centralized `claimSigner` server. It runs in
the Lit (Chipotle/Lit v3) network, verifies the buyer's on-chain entitlement on
BSC (`CourseMarketplace.hasCourseAccess`), and signs the EIP-712 `Claim` with a
**PKP** — so the minting authorization is produced trustlessly, gated by the
actual payment, with no off-chain private key.

## Trust model

- The PKP private key exists only inside the Lit/TEE network (never exported).
- The action is pinned by its **IPFS CID**; the PKP is assigned to that CID, so
  only this exact code can request a signature (tamper-evident — change the code
  → new CID → no signing authority).
- The NFT contract's `claimSigner` is set to the **PKP's EVM address**, so
  `claimWithSig` only accepts signatures this action produced.
- The action signs **only if** `hasCourseAccess(to, courseId) == true` — the
  buyer must have paid on BSC. No server can mint for a non-buyer.

## Flow

```
buyer pays on BSC (CourseMarketplace.purchase)
        │
        ▼
caller → POST /core/v1/lit_action (claim-signer, jsParams: to, courseId, nonce, deadline, …)
        │  Lit Action: hasCourseAccess(to,courseId)? → build EIP-712 digest → PKP signEcdsa
        ▼
signature → nft.claimWithSig(to[,expiry],deadline,sig)  → soulbound pass minted
```

The EIP-712 digest is byte-identical to
[`buckets/claim-eip712.js`](../buckets/claim-eip712.js) and the contracts'
`_CLAIM_TYPEHASH` (`AuthorNft`/`ClientNft`). That digest construction is
unit-tested in [`tests/claim-eip712.test.js`](../../tests/claim-eip712.test.js)
(sign → recover round-trip via viem). The action itself runs only in the
Chipotle/Lit runtime (`Lit`/`ethers` injected) — verify end-to-end via the local
Chipotle stack (`run_e2e_lit.sh`).

## Provisioning runbook (concrete)

> **Status (2026-06): NOT provisioned.** Only the action JS + the contract side
> exist. There is no IPFS CID, no minted PKP, `DeployAccessNfts` sets
> `claimSigner = deployer` (an EOA — `new ClientNft(deployer, deployer)`), and no
> caller is wired (the `docker-compose.mainnet-lit.yml` deploy step mints directly
> with `cast send … mint(address,uint64)`). The steps below are what it takes to
> go from "code-ready" to a live, trustless PKP signer. Endpoint names marked
> **⟨verify⟩** must be confirmed against the live OpenAPI
> (`https://api.chipotle.litprotocol.com/core/v1/swagger-ui`) — Chipotle's
> permitting model is not pinned in this repo.

### 0. Prerequisites
- Chipotle account, **Stripe-funded ≥ $5** → usage `CHIPOTLE_API_KEY`
  (`POST /core/v1/new_account`). See [lit skill §7.1/§7.4](../../skills/lit/SKILL.md).
- Deployed `ClientNft`/`AuthorNft`/`CourseMarketplace` on the gating chain
  (BSC testnet 97 or opBNB 5611) — addresses from `DeployAccessNfts`/`Deploy`.
- Deployer key that **owns** the NFT contracts (to call `setClaimSigner`).
- `BASE=https://api.chipotle.litprotocol.com/core/v1`, `H="X-Api-Key: $CHIPOTLE_API_KEY"`.

### 1. Pin the action to IPFS (get the CID)
The CID is a hash of the **exact file bytes** — any edit changes the CID, which is
the tamper-evidence. Use a v0 CID (base58 `Qm…`, the format Lit permitting expects).
```bash
# local IPFS
ipfs add --cid-version 0 smartcontracts/lit-actions/claim-signer.action.js
# or a pinning service (Pinata)
curl -s -X POST https://api.pinata.cloud/pinning/pinFileToIPFS \
  -H "Authorization: Bearer $PINATA_JWT" \
  -F "file=@smartcontracts/lit-actions/claim-signer.action.js"
# → export ACTION_CID=Qm...
```

### 2. Mint the PKP / Chipotle wallet
ChainSecured (wallet = identity, management writes are wallet-signed) or managed.
```bash
# managed (usage key) — capture pkpPublicKey + its EVM address
curl -s -X POST "$BASE/create_wallet" -H "$H" -H 'content-type: application/json' -d '{}'
# ChainSecured equivalent: create_wallet_with_signature (wallet-signed)  ⟨verify⟩
# → export PKP_PUBKEY=0x04...   PKP_EVM_ADDR=0x...
```

### 3. Bind the PKP to the action CID (so ONLY this code can sign)
Conceptually: permit `ACTION_CID` on the PKP / bind the Chipotle wallet to exactly
one action (`signAsAction` is deprecated → wallet-bound-to-action model).
```bash
# Bind PKP_PUBKEY ↔ ACTION_CID   ⟨verify exact route in swagger-ui⟩
curl -s -X POST "$BASE/<permit_action_or_bind_wallet>" -H "$H" \
  -H 'content-type: application/json' \
  -d "{\"pkpPublicKey\":\"$PKP_PUBKEY\",\"ipfsId\":\"$ACTION_CID\"}"
```
After this, a `signEcdsa` request from any other code/CID is rejected.

### 4. Point the contract at the PKP
```bash
cast send "$CLIENT_NFT" "setClaimSigner(address)" "$PKP_EVM_ADDR" \
  --rpc-url "$GATING_RPC" --private-key "$OWNER_KEY"
cast send "$AUTHOR_NFT" "setClaimSigner(address)" "$PKP_EVM_ADDR" \
  --rpc-url "$GATING_RPC" --private-key "$OWNER_KEY"
# verify: cast call "$CLIENT_NFT" "claimSigner()(address)" --rpc-url "$GATING_RPC"
```
Also update `DeployAccessNfts.s.sol` to pass `PKP_EVM_ADDR` (env) as
`initialClaimSigner` instead of `deployer`, so fresh deploys are trustless by default.

### 5. Wire the caller (replaces the owner `cast send … mint`)
Post the action, then submit the returned signature to `claimWithSig`. Build the
jsParams so the action's digest matches [`buckets/claim-eip712.js`](../buckets/claim-eip712.js):
```js
const nonce = await nft.claimNonces(to);                 // replay protection
const deadline = Math.floor(Date.now()/1000) + 3600;
const res = await fetch(`${BASE}/lit_action`, {
  method: 'POST', headers: { 'X-Api-Key': KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ ipfsId: ACTION_CID, js_params: {
    kind: 'client', nftAddress: CLIENT_NFT, marketplace: MARKETPLACE,
    courseId, to, expiry, nonce: nonce.toString(), deadline,
    chainId: 97, chain: 'bscTestnet', pkpPublicKey: PKP_PUBKEY, sigName: 'claim',
  }}),
}).then(r => r.json());
// assemble r,s,v from res.signatures.claim, then:
await nft.claimWithSig(to, expiry, deadline, sig);       // ClientNft
// AuthorNft: nft.claimWithSig(to, deadline, sig)
```
Replace the `cast send "$CLIENT_NFT" "mint(...)"` line in
`docker-compose.mainnet-lit.yml` with this caller.

### 6. Decrypt side — `wrap_for_buyer` as a real PKP action
The address-bound key release (P-A) is **mock-only** today
(`greenfield-testnet/chipotle-mock.mjs`, exercised by `e2e/run-devnet-pa.mjs`). On
real Chipotle it is **not** a built-in: port that logic into a Lit Action JS (read
`AccessPass.wrapNonce`/`encryptedKey`, verify the buyer's `signedProof`, re-wrap the
master key bound to the buyer address + timestamp condition), then pin + bind a
PKP/vault as in steps 1–3. This is the mechanism that actually enforces paid
decryption on mainnet (see [REVIEW.md R-1/R-1b](../../spec/REVIEW.md)).

### 7. Verify end-to-end
- Non-buyer → action returns `{ok:false, reason:NOT_ENTITLED}`; `claimWithSig` never called.
- Buyer → `claimWithSig` mints the soulbound pass; replay reverts `InvalidClaimSignature`.
- Local dry-run via the Chipotle stack: `run_e2e_lit.sh` (the action runs only in
  the Chipotle/Lit runtime — `Lit`/`ethers` are injected, no local Node run).

See the [lit skill §7.5](../../skills/lit/SKILL.md) and [NFT.md §4](../contracts/NFT.md#4-lit-action--децентрализованный-claim-signer).
