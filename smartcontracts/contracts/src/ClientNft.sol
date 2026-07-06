// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SoulboundAccessNft} from "./SoulboundAccessNft.sol";

/// @title ClientNft — time-limited, soulbound client subscription
/// @notice Held by a course buyer. Grants **READ-only** access to the course's
///         Greenfield bucket while valid. Lit gates client reads on
///         `hasAccess(user)` (true only while a non-expired pass is held).
///         Soulbound, so a subscription cannot be resold or flash-loaned.
contract ClientNft is SoulboundAccessNft {
    // Claim(address to,uint64 expiry,uint256 nonce,uint256 deadline)
    bytes32 private constant _CLAIM_TYPEHASH =
        keccak256("Claim(address to,uint64 expiry,uint256 nonce,uint256 deadline)");

    /// Per-token expiry (unix ts; 0 = perpetual).
    mapping(uint256 tokenId => uint64) public expiryOf;
    /// Latest grant per holder (soulbound ⇒ a single active subject).
    mapping(address account => uint64) public accessExpiryOf; // 0 = perpetual
    mapping(address account => bool) private _granted;

    constructor(address initialOwner, address initialClaimSigner)
        SoulboundAccessNft("Daskibo Client Pass", "DASK-CLI", initialOwner, initialClaimSigner)
    {}

    /// Mint a (possibly time-limited) client pass. Owner or a delegated granter
    /// (G-08). `expiry` is a unix timestamp; 0 = perpetual.
    function mint(address to, uint64 expiry) external onlyOwnerOrGranter returns (uint256) {
        return _mintWithExpiry(to, expiry);
    }

    /// On revoke (R-09): clear the holder's grant so `hasAccess` returns false
    /// immediately — even for a perpetual (expiry==0) pass that could never
    /// lapse before.
    function _onRevoke(address holder, uint256 tokenId) internal override {
        _granted[holder] = false;
        accessExpiryOf[holder] = 0;
        delete expiryOf[tokenId];
    }

    function _mintWithExpiry(address to, uint64 expiry) internal returns (uint256 tokenId) {
        tokenId = _mintNext(to);
        expiryOf[tokenId] = expiry; // per-token: the exact window of THIS token
        // Per-account window must never SHRINK on a new grant (audit §2.B): a
        // shorter pass minted to a holder of a longer/perpetual one must not cut
        // their active access. `expiry == 0` = perpetual = the longest window.
        if (!_granted[to]) {
            accessExpiryOf[to] = expiry; // first/fresh grant (also after revoke)
        } else if (accessExpiryOf[to] != 0 && (expiry == 0 || expiry > accessExpiryOf[to])) {
            accessExpiryOf[to] = expiry; // current finite → extend (to later, or to perpetual)
        }
        // else: current already perpetual, or new grant is shorter → keep current
        _granted[to] = true;
    }

    /// The predicate Lit's `evmContractConditions` evaluates for client reads:
    /// true only while `user` holds a granted, non-expired pass.
    function hasAccess(address user) external view returns (bool) {
        if (!_granted[user]) return false;
        uint64 exp = accessExpiryOf[user];
        return exp == 0 || block.timestamp <= exp;
    }

    /// Redeem an EIP-712 `Claim(to,expiry,nonce,deadline)` signed by
    /// `claimSigner` (e.g. a Lit PKP) to mint a client pass to `to`.
    function claimWithSig(address to, uint64 expiry, uint256 deadline, bytes calldata signature)
        external
        returns (uint256)
    {
        uint256 nonce = _consumeNonce(to);
        bytes32 structHash =
            keccak256(abi.encode(_CLAIM_TYPEHASH, to, expiry, nonce, deadline));
        _verifyClaimSig(deadline, structHash, signature);
        return _mintWithExpiry(to, expiry);
    }
}
