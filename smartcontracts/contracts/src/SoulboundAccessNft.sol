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
    error NotAuthorized();
    error ZeroAddress();

    /// Off-chain signer (e.g. a Lit PKP) authorized to mint via a subclass's
    /// `claimWithSig`.
    address public claimSigner;

    /// Delegated issuers — addresses (e.g. {CourseMarketplace} or an operator)
    /// allowed to mint/revoke passes besides the owner. Closes G-08 (on-chain
    /// per-recipient grant without giving away ownership).
    mapping(address account => bool) public isGranter;

    uint256 internal _nextTokenId = 1;

    /// Per-recipient claim nonces (replay protection for signed mints).
    mapping(address account => uint256) private _claimNonces;

    /// Emitted when a delegated granter is enabled/disabled.
    event GranterSet(address indexed account, bool allowed);
    /// Emitted on explicit revocation (burn) of a pass — the on-chain signal a
    /// Lit Action / indexer watches (R-09).
    event AccessRevoked(address indexed holder, uint256 indexed tokenId);

    /// Owner or an authorized granter (delegated issuance/revocation).
    modifier onlyOwnerOrGranter() {
        if (msg.sender != owner() && !isGranter[msg.sender]) revert NotAuthorized();
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner,
        address initialClaimSigner
    ) ERC721(name_, symbol_) EIP712(name_, "1") Ownable(initialOwner) {
        claimSigner = initialClaimSigner;
    }

    function setClaimSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        claimSigner = signer;
    }

    /// Enable/disable a delegated granter (G-08). Owner only.
    function setGranter(address account, bool allowed) external onlyOwner {
        isGranter[account] = allowed;
        emit GranterSet(account, allowed);
    }

    /// Explicitly revoke (burn) a pass — closes R-09 (revocation, incl. of a
    /// perpetual pass; previously access could only lapse via expiry). Callable
    /// by the owner or an authorized granter. Clears any subclass access-state
    /// via {_onRevoke}, so the on-chain predicate a Lit Action reads
    /// (`hasAccess`/`balanceOf`) flips to false immediately (R-10).
    function revoke(uint256 tokenId) external onlyOwnerOrGranter {
        address holder = ownerOf(tokenId); // reverts ERC721NonexistentToken if unminted/burned
        _burn(tokenId);
        _onRevoke(holder, tokenId);
        emit AccessRevoked(holder, tokenId);
    }

    /// Hook: subclasses clear their per-account access-state on revoke.
    function _onRevoke(address holder, uint256 tokenId) internal virtual {}

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
