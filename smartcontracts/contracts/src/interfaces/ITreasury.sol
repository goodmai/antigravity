// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ITreasury — receiver of the protocol cut (default 20%).
interface ITreasury {
    event Funded(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    /// @notice Accept native BNB (also via `receive`).
    function fund() external payable;

    /// @notice Governance-only native withdrawal.
    function withdraw(address payable to, uint256 amount) external;

    function totalReceived() external view returns (uint256);
}
