/**
 * Daskibo Academy — EIP-712 `Claim` typed-data builders (P3).
 *
 * Pure helper that builds the exact typed data the soulbound NFT contracts
 * verify in `claimWithSig` — shared by the **decentralized claim signer Lit
 * Action** (`lit-actions/claim-signer.action.js`) and any client. Keeping the
 * digest construction in one tested place removes the "does the off-chain
 * signer hash the same bytes the contract expects?" class of bugs.
 *
 * Domain mirrors the contracts' `EIP712(name, "1")`:
 *   AuthorNft → name "Daskibo Author Pass"   · Claim(address to,uint256 nonce,uint256 deadline)
 *   ClientNft → name "Daskibo Client Pass"    · Claim(address to,uint64 expiry,uint256 nonce,uint256 deadline)
 *
 * The PKP (or any signer) signs `claimDigest(typedData)`; the contract recovers
 * it against `claimSigner`. Set `claimSigner` to the PKP address to make the
 * Lit Action the only authorized minter.
 */

import { hashTypedData } from 'viem';

export const AUTHOR_DOMAIN_NAME = 'Daskibo Author Pass';
export const CLIENT_DOMAIN_NAME = 'Daskibo Client Pass';

// Field order MUST match the contracts' `_CLAIM_TYPEHASH` exactly.
export const AUTHOR_CLAIM_TYPES = {
  Claim: [
    { name: 'to', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};
export const CLIENT_CLAIM_TYPES = {
  Claim: [
    { name: 'to', type: 'address' },
    { name: 'expiry', type: 'uint64' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

function domain(name, chainId, verifyingContract) {
  return { name, version: '1', chainId: Number(chainId), verifyingContract };
}

/** Typed data for AuthorNft.claimWithSig (perpetual author credential). */
export function authorClaimTypedData({ verifyingContract, chainId, to, nonce, deadline }) {
  return {
    domain: domain(AUTHOR_DOMAIN_NAME, chainId, verifyingContract),
    types: AUTHOR_CLAIM_TYPES,
    primaryType: 'Claim',
    message: { to, nonce: BigInt(nonce), deadline: BigInt(deadline) },
  };
}

/** Typed data for ClientNft.claimWithSig (time-limited client pass). */
export function clientClaimTypedData({ verifyingContract, chainId, to, expiry, nonce, deadline }) {
  return {
    domain: domain(CLIENT_DOMAIN_NAME, chainId, verifyingContract),
    types: CLIENT_CLAIM_TYPES,
    primaryType: 'Claim',
    message: { to, expiry: BigInt(expiry), nonce: BigInt(nonce), deadline: BigInt(deadline) },
  };
}

/** The 32-byte digest a signer (PKP) signs — `keccak256("\x19\x01" ‖ domainSeparator ‖ hashStruct)`. */
export function claimDigest(typedData) {
  return hashTypedData(typedData);
}
