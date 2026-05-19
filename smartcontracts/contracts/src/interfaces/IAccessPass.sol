// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IAccessPass — soulbound course access ticket
/// @notice Non-transferable on purpose: Lit ACC checks `hasAccess`, not a
///         transferable spot balance, which neutralises flash-loan ACC
///         bypass (audit 3.2 / 4.1).
interface IAccessPass {
    event AccessGranted(address indexed user, uint256 indexed courseId, uint256 tokenId);

    /// @notice Mint an access pass. MUST revert unless caller is the
    ///         marketplace. `expiry` is a unix ts; 0 = perpetual.
    function mint(address to, uint256 courseId, uint64 expiry)
        external
        returns (uint256 tokenId);

    /// @notice The predicate Lit's evmContractConditions evaluates on BSC.
    ///         False once `expiry` has passed (time-limited client access).
    function hasAccess(address user, uint256 courseId) external view returns (bool);
}
