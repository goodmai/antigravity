// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IAccessPass — soulbound course access ticket + per-NFT key store
/// @notice Non-transferable: flash-loan bypass neutralised (audit 3.2/4.1).
///         Each token holds a buyer-specific Chipotle ciphertext (scheme P-A,
///         spec/crypto.md). A one-time `wrapNonce` limits Chipotle wrap calls
///         to one per NFT, preventing drain of platform credits.
interface IAccessPass {
    event AccessGranted(address indexed user, uint256 indexed courseId, uint256 tokenId);
    event EncryptedKeySet(uint256 indexed tokenId, address indexed buyer);
    event WrapNonceIssued(address indexed buyer, uint256 indexed courseId, uint256 nonce);
    event WrapNonceReset(address indexed buyer, uint256 indexed courseId, uint256 newNonce);

    // ── Core ──────────────────────────────────────────────────────────────────

    /// @notice Mint a soulbound access pass. Only the marketplace may call.
    ///         Issues a `wrapNonce` atomically for the P-A wrap-on-purchase flow.
    function mint(address to, uint256 courseId, uint64 expiry)
        external returns (uint256 tokenId);

    /// @notice True if `user` has a valid, non-expired pass for `courseId`.
    ///         This is what Lit's evmContractConditions evaluates on BSC.
    function hasAccess(address user, uint256 courseId) external view returns (bool);

    // ── P-A: per-NFT encrypted key ────────────────────────────────────────────

    /// @notice Store the buyer-specific Chipotle ciphertext from `wrap_for_buyer`.
    ///         Callable once by the token owner; consumes `wrapNonce` atomically.
    function setEncryptedKey(uint256 tokenId, bytes calldata ct) external;

    /// @notice Address-bound Chipotle ciphertext. Empty (`0x`) until
    ///         `setEncryptedKey` is called. Read by the browser to skip the
    ///         wrap step on subsequent logins.
    function encryptedKey(uint256 tokenId) external view returns (bytes memory);

    /// @notice One-time wrap nonce. Non-zero = wrap allowed. The Lit Action
    ///         MUST check this is non-zero before spending Chipotle credits.
    ///         Consumed to zero by `setEncryptedKey`.
    function wrapNonce(address buyer, uint256 courseId) external view returns (uint256);

    /// @notice Reverse lookup: (buyer, courseId) → tokenId.
    ///         Returns 0 if no pass was ever minted for this pair.
    function tokenIdOf(address buyer, uint256 courseId) external view returns (uint256);
}
