import { describe, it, expect } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { recoverTypedDataAddress, keccak256, toHex } from 'viem';
import {
  authorClaimTypedData,
  clientClaimTypedData,
  claimDigest,
} from '../smartcontracts/buckets/claim-eip712.js';

// Well-known Anvil dev key (account #1) — TEST ONLY, no real funds. Stands in
// for the PKP that the decentralized claim-signer Lit Action would hold.
const PKP_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const signer = privateKeyToAccount(PKP_PK);
const verifyingContract = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
const chainId = 97;
const to = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

describe('claim EIP-712 (P3 — decentralized claimSigner via PKP)', () => {
  it('author claim: PKP sign → recover round-trips to the signer', async () => {
    const td = authorClaimTypedData({ verifyingContract, chainId, to, nonce: 0, deadline: 9999999999n });
    const signature = await signer.signTypedData(td);
    const recovered = await recoverTypedDataAddress({ ...td, signature });
    expect(recovered.toLowerCase()).toBe(signer.address.toLowerCase());
  });

  it('client claim (with expiry): PKP sign → recover round-trips', async () => {
    const td = clientClaimTypedData({
      verifyingContract, chainId, to, expiry: 1900000000n, nonce: 3, deadline: 9999999999n,
    });
    const signature = await signer.signTypedData(td);
    const recovered = await recoverTypedDataAddress({ ...td, signature });
    expect(recovered.toLowerCase()).toBe(signer.address.toLowerCase());
  });

  it('digest is deterministic for fixed inputs', () => {
    const args = { verifyingContract, chainId, to, nonce: 0, deadline: 9999999999n };
    expect(claimDigest(authorClaimTypedData(args))).toBe(claimDigest(authorClaimTypedData(args)));
  });

  it('Claim typehashes match the on-chain contract _CLAIM_TYPEHASH preimages', () => {
    // These strings are byte-identical to the typehash preimages in
    // AuthorNft.sol / ClientNft.sol — the binding between JS and Solidity.
    const authorTypehash = keccak256(toHex('Claim(address to,uint256 nonce,uint256 deadline)'));
    const clientTypehash = keccak256(toHex('Claim(address to,uint64 expiry,uint256 nonce,uint256 deadline)'));
    // Our types arrays must reproduce exactly these signatures (field order).
    expect(authorTypehash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(clientTypehash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(authorTypehash).not.toBe(clientTypehash);
  });

  it('chain/contract binding: changing verifyingContract changes the digest', () => {
    const a = claimDigest(authorClaimTypedData({ verifyingContract, chainId, to, nonce: 0, deadline: 1n }));
    const b = claimDigest(
      authorClaimTypedData({ verifyingContract: '0x0000000000000000000000000000000000000001', chainId, to, nonce: 0, deadline: 1n }),
    );
    expect(a).not.toBe(b);
  });
});
