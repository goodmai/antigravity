// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ITreasury} from "./interfaces/ITreasury.sol";

/// @title Treasury
/// @notice Holds the protocol cut (default 20%). Fixed, known address so
///         the marketplace can `push` to it safely; outflow is
///         governance-only. No reinvest logic in v1 (minimal surface).
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

    /// @inheritdoc ITreasury
    function withdraw(address payable to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (amount > address(this).balance) revert InsufficientBalance();
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(to, amount);
    }
}
