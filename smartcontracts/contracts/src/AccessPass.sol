// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IAccessPass} from "./interfaces/IAccessPass.sol";

/// @title AccessPass
/// @notice Soulbound course access ticket + per-NFT encrypted master key (scheme
///         P-A, spec/crypto.md). Each token stores a buyer-specific Chipotle
///         ciphertext: address-bound so no other address can decrypt it.
///
///         Anti-drain guard: a one-time `wrapNonce` is issued at mint.
///         The Lit Action reads it before spending Chipotle credits; it is
///         consumed atomically inside `setEncryptedKey`, making re-wrap
///         impossible without a governance `resetForRewrap` call.
contract AccessPass is IAccessPass {
    error NotOwner();
    error NotMarketplace();
    error MarketplaceAlreadySet();
    error ZeroAddress();
    error AlreadyOwned();
    error Soulbound();
    error AlreadySet();     // encryptedKey already stored for this token
    error NonceConsumed();  // wrapNonce is zero — already used or never minted
    error NotTokenOwner();  // caller is not ownerOf(tokenId)
    error NotGranted();     // no active pass for this buyer+course

    address public owner;
    address public marketplace;

    uint256 private _nextId = 1;
    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => uint256) public courseOf;
    mapping(address => mapping(uint256 => bool)) private _granted;
    mapping(address => mapping(uint256 => uint64)) public expiryOf;

    // ── P-A: per-NFT encrypted key + one-time wrap nonce ─────────────────────
    // wrapNonce: non-zero = wrap allowed; zero = already consumed or never issued.
    // Lit Action MUST check this before spending Chipotle credits (anti-drain).
    mapping(address buyer => mapping(uint256 courseId => uint256)) public wrapNonce;

    // Address-bound Chipotle ciphertext for this token. Empty (length == 0)
    // until the token owner calls setEncryptedKey. Write-once.
    mapping(uint256 tokenId => bytes) public encryptedKey;

    // Reverse lookup so the browser can find tokenId from buyer+courseId.
    mapping(address buyer => mapping(uint256 courseId => uint256)) private _tokenIdOf;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function setMarketplace(address mp) external onlyOwner {
        if (mp == address(0)) revert ZeroAddress();
        if (marketplace != address(0)) revert MarketplaceAlreadySet();
        marketplace = mp;
    }

    // ── Core mint ─────────────────────────────────────────────────────────────

    /// @inheritdoc IAccessPass
    function mint(address to, uint256 courseId, uint64 expiry)
        external
        returns (uint256 tokenId)
    {
        if (msg.sender != marketplace) revert NotMarketplace();
        if (to == address(0)) revert ZeroAddress();
        if (_granted[to][courseId] && !_expired(to, courseId)) revert AlreadyOwned();

        tokenId = _nextId++;
        ownerOf[tokenId]          = to;
        courseOf[tokenId]          = courseId;
        _tokenIdOf[to][courseId]   = tokenId;
        _granted[to][courseId]     = true;
        expiryOf[to][courseId]     = expiry;

        uint256 nonce = _freshNonce(to, courseId, tokenId);
        wrapNonce[to][courseId] = nonce;

        emit AccessGranted(to, courseId, tokenId);
        emit WrapNonceIssued(to, courseId, nonce);
    }

    // ── P-A key management ────────────────────────────────────────────────────

    /// @inheritdoc IAccessPass
    /// @notice Store the buyer-specific Chipotle ciphertext obtained from
    ///         `wrap_for_buyer`. Callable exactly once by the token owner.
    ///         Consumes `wrapNonce` atomically — subsequent calls revert.
    function setEncryptedKey(uint256 tokenId, bytes calldata ct) external {
        if (ownerOf[tokenId] != msg.sender) revert NotTokenOwner();
        if (encryptedKey[tokenId].length != 0) revert AlreadySet();

        uint256 courseId = courseOf[tokenId];
        if (wrapNonce[msg.sender][courseId] == 0) revert NonceConsumed();

        // Consume nonce atomically — no second wrap possible after this point.
        wrapNonce[msg.sender][courseId] = 0;
        encryptedKey[tokenId] = ct;

        emit EncryptedKeySet(tokenId, msg.sender);
    }

    /// @notice Governance: clear the stored key and issue a fresh nonce,
    ///         allowing the holder to re-wrap (key rotation / recovery).
    ///         Only owner or marketplace. The holder must call
    ///         `wrap_for_buyer` + `setEncryptedKey` again after this.
    function resetForRewrap(uint256 tokenId) external {
        if (msg.sender != owner && msg.sender != marketplace) revert NotOwner();
        address buyer = ownerOf[tokenId];
        if (buyer == address(0)) revert NotGranted();

        uint256 courseId = courseOf[tokenId];
        delete encryptedKey[tokenId];

        uint256 newNonce = _freshNonce(buyer, courseId, tokenId);
        wrapNonce[buyer][courseId] = newNonce;

        emit WrapNonceReset(buyer, courseId, newNonce);
    }

    // ── View helpers ─────────────────────────────────────────────────────────

    /// @inheritdoc IAccessPass
    function tokenIdOf(address buyer, uint256 courseId)
        external view returns (uint256)
    {
        return _tokenIdOf[buyer][courseId];
    }

    function _expired(address user, uint256 courseId) internal view returns (bool) {
        uint64 exp = expiryOf[user][courseId];
        return exp != 0 && block.timestamp > exp;
    }

    /// @inheritdoc IAccessPass
    function hasAccess(address user, uint256 courseId) external view returns (bool) {
        return _granted[user][courseId] && !_expired(user, courseId);
    }

    // Use tokenId (unique per mint) as part of the nonce seed so that
    // resetForRewrap always produces a different nonce than the previous one.
    function _freshNonce(address buyer, uint256 courseId, uint256 tokenId)
        private view returns (uint256 n)
    {
        n = uint256(keccak256(
            abi.encodePacked(buyer, courseId, tokenId, block.number, block.timestamp)
        ));
        if (n == 0) n = 1; // guard against astronomically unlikely zero
    }

    // ── Soulbound: all transfer / approval paths revert ──────────────────────

    function transferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert Soulbound();
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert Soulbound();
    }

    function approve(address, uint256) external pure {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) external pure {
        revert Soulbound();
    }
}
