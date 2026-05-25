// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SoulboundAccessNft} from "./SoulboundAccessNft.sol";

/// @title AuthorNft — perpetual, soulbound author credential
/// @notice Held by a course author. Grants the right to **UPDATE and READ**
///         the course's Greenfield bucket: Lit gates author write/read on
///         `balanceOf(author) >= 1`. Never expires (perpetual). Soulbound, so
///         the author credential cannot be sold or flash-loaned.
contract AuthorNft is SoulboundAccessNft {
    // Claim(address to,uint256 nonce,uint256 deadline)
    bytes32 private constant _CLAIM_TYPEHASH =
        keccak256("Claim(address to,uint256 nonce,uint256 deadline)");

    constructor(address initialOwner, address initialClaimSigner)
        SoulboundAccessNft("Daskibo Author Pass", "DASK-AUTH", initialOwner, initialClaimSigner)
    {}

    /// Owner mint of a perpetual author credential.
    function mint(address to) external onlyOwner returns (uint256) {
        return _mintNext(to);
    }

    /// Redeem an EIP-712 `Claim(to,nonce,deadline)` signed by `claimSigner`
    /// (e.g. a Lit PKP) to mint the perpetual author credential to `to`.
    function claimWithSig(address to, uint256 deadline, bytes calldata signature)
        external
        returns (uint256)
    {
        uint256 nonce = _consumeNonce(to);
        bytes32 structHash = keccak256(abi.encode(_CLAIM_TYPEHASH, to, nonce, deadline));
        _verifyClaimSig(deadline, structHash, signature);
        return _mintNext(to);
    }
}
