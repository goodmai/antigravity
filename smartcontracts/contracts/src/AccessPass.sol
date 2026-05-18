// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessPass} from "./interfaces/IAccessPass.sol";

/// @title AccessPass
/// @notice Soulbound (non-transferable) course access ticket. Only the
///         marketplace may mint. Transfers/approvals revert by design —
///         this is the structural flash-loan mitigation (audit 3.2/4.1):
///         Lit's ACC checks `hasAccess`, and there is no transferable
///         balance to flash-loan.
contract AccessPass is IAccessPass {
    error NotOwner();
    error NotMarketplace();
    error MarketplaceAlreadySet();
    error ZeroAddress();
    error AlreadyOwned();
    error Soulbound();

    address public owner;
    address public marketplace;

    uint256 private _nextId = 1;
    mapping(uint256 => address) public ownerOf; // tokenId => holder
    mapping(uint256 => uint256) public courseOf; // tokenId => courseId
    mapping(address => mapping(uint256 => bool)) private _access; // user=>course=>granted

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice One-shot wiring of the authorised minter.
    function setMarketplace(address mp) external onlyOwner {
        if (mp == address(0)) revert ZeroAddress();
        if (marketplace != address(0)) revert MarketplaceAlreadySet();
        marketplace = mp;
    }

    /// @inheritdoc IAccessPass
    function mint(address to, uint256 courseId) external returns (uint256 tokenId) {
        if (msg.sender != marketplace) revert NotMarketplace();
        if (to == address(0)) revert ZeroAddress();
        if (_access[to][courseId]) revert AlreadyOwned();

        tokenId = _nextId++;
        ownerOf[tokenId] = to;
        courseOf[tokenId] = courseId;
        _access[to][courseId] = true;
        emit AccessGranted(to, courseId, tokenId);
    }

    /// @inheritdoc IAccessPass
    function hasAccess(address user, uint256 courseId) external view returns (bool) {
        return _access[user][courseId];
    }

    // ── Soulbound: every transfer/approval path reverts ──────────────────
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
