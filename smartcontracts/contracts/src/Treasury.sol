// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ITreasury} from "./interfaces/ITreasury.sol";

/// Minimal view of a pull-payment source (e.g. CourseMarketplace).
interface IWithdrawable {
    function withdraw() external;
}

/// @title Treasury
/// @notice Holds the protocol cut (default 20%). The marketplace credits
///         this address via pull-payments; `collectFrom` pulls the
///         accrued cut here (permissionless — funds always land in the
///         Treasury). Outflow is governance-only. No reinvest in v1.
contract Treasury is ITreasury {
    error NotOwner();
    error ZeroAddress();
    error InsufficientBalance();
    error TransferFailed();

    address public owner;
    uint256 public totalReceived;

    constructor(address _owner) {
        if (_owner == address(0)) revert ZeroAddress();
        owner = _owner;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    receive() external payable {
        totalReceived += msg.value;
        emit Funded(msg.sender, msg.value);
    }

    /// @inheritdoc ITreasury
    function fund() external payable {
        totalReceived += msg.value;
        emit Funded(msg.sender, msg.value);
    }

    /// @notice Pull this Treasury's accrued protocol cut from a
    ///         pull-payment source (the marketplace credits
    ///         `pendingWithdrawals[treasury]`; this triggers its
    ///         `withdraw()`, which pays `msg.sender` == this Treasury,
    ///         landing in `receive()`). Permissionless: funds can only
    ///         arrive here, never be redirected.
    function collectFrom(address marketplace) external {
        if (marketplace == address(0)) revert ZeroAddress();
        IWithdrawable(marketplace).withdraw();
    }

    /// @inheritdoc ITreasury
    function withdraw(address payable to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (amount > address(this).balance) revert InsufficientBalance();
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(to, amount);
    }
}
