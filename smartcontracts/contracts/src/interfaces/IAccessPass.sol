// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAccessPass — soulbound course access ticket
/// @notice Non-transferable on purpose: Lit ACC checks `hasAccess`, not a
///         transferable spot balance, which neutralises flash-loan ACC
///         bypass (audit 3.2 / 4.1).
interface IAccessPass {
    event AccessGranted(address indexed user, uint256 indexed courseId, uint256 tokenId);

    /// @notice Mint an access pass. MUST revert unless caller is the marketplace.
    function mint(address to, uint256 courseId) external returns (uint256 tokenId);

    /// @notice The predicate Lit's evmContractConditions evaluates on BSC.
    function hasAccess(address user, uint256 courseId) external view returns (bool);
}
