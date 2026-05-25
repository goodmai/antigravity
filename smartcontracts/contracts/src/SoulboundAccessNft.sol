// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title SoulboundAccessNft
/// @notice Abstract base for the role-specific access NFTs ({AuthorNft},
///         {ClientNft}). It is a real OpenZeppelin ERC721 — so Lit's
///         `standardContractType: "ERC721"` `balanceOf` gate works against it —
///         but **non-transferable (soulbound)**: only the owner mints, and
///         every transfer/approval path reverts. This is the same flash-loan
///         mitigation used by {AccessPass}: Lit checks holding/`hasAccess`, not
///         a transferable spot balance.
///
///         Exposes an EIP-712 `claimSigner` (e.g. a Lit PKP). Subclasses build
///         their own typed `Claim` struct and call {_verifyClaimSig} so an
///         off-chain authorization can be redeemed on-chain (Lit AuthSig
///         pattern).
abstract contract SoulboundAccessNft is ERC721, EIP712, Ownable {
    using ECDSA for bytes32;

    error Soulbound();
    error ClaimExpired();
    error InvalidClaimSignature();

    /// Off-chain signer (e.g. a Lit PKP) authorized to mint via a subclass's
    /// `claimWithSig`.
    address public claimSigner;

    uint256 internal _nextTokenId = 1;

    /// Per-recipient claim nonces (replay protection for signed mints).
    mapping(address account => uint256) private _claimNonces;

    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner,
        address initialClaimSigner
    ) ERC721(name_, symbol_) EIP712(name_, "1") Ownable(initialOwner) {
        claimSigner = initialClaimSigner;
    }

    function setClaimSigner(address signer) external onlyOwner {
        claimSigner = signer;
    }

    function claimNonces(address account) external view returns (uint256) {
        return _claimNonces[account];
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ── Minting helpers (subclasses) ──────────────────────────────────────
    function _mintNext(address to) internal returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
    }

    /// Consume and return the current claim nonce for `account`.
    function _consumeNonce(address account) internal returns (uint256 current) {
        current = _claimNonces[account];
        _claimNonces[account] = current + 1;
    }

    /// Revert unless `signature` over `structHash` recovers `claimSigner` and
    /// `deadline` is still in the future.
    function _verifyClaimSig(uint256 deadline, bytes32 structHash, bytes calldata signature)
        internal
        view
    {
        if (block.timestamp > deadline) revert ClaimExpired();
        address signer = _hashTypedDataV4(structHash).recover(signature);
        if (signer == address(0) || signer != claimSigner) revert InvalidClaimSignature();
    }

    // ── Soulbound enforcement ─────────────────────────────────────────────
    /// Allow mint (from == 0) and burn (to == 0); block holder-to-holder
    /// transfers.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }
}
