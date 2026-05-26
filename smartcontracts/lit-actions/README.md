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

## Setup

1. Mint a PKP (Chipotle `create_wallet` / ChainSecured) and pin this action; assign the PKP to the action CID.
2. `nft.setClaimSigner(pkpEvmAddress)`.
3. Caller invokes the action with `pkpPublicKey` + the claim params (`nonce = nft.claimNonces(to)`).

See the [lit skill §7.5](../../skills/lit/SKILL.md).
