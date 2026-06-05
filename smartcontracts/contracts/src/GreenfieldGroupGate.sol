// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IGreenfieldGroupHub} from "./interfaces/IGreenfieldGroupHub.sol";

/// @title GreenfieldGroupGate — SPIKE for G-10 (Greenfield Group mirroring)
/// @notice Proof-of-concept of using **native Greenfield Groups** as the access
///         primitive instead of bespoke access NFTs (osint.md §5а). A
///         course→group mapping is configured, then `grantAccess`/`revokeAccess`
///         drive Greenfield group membership **cross-chain** via {GroupHub}
///         (AddMembers / RemoveMembers). Membership is mirrored on BSC as a
///         non-transferable ERC-1155, which Lit/Chipotle then gates the
///         decryption key on. `revokeAccess` gives **native revocation**
///         (removeMember) — the cross-chain analogue of {SoulboundAccessNft}'s
///         `revoke`.
///
///         ⚠️ **Spike / not production, not wired into {CourseMarketplace}.** It
///         demonstrates the routing + auth (granter role, G-08) and is forge-
///         tested against a mock hub. Production wiring needs the real
///         `bnb-chain/greenfield-contracts` GroupHub, sequence/`srcChainId`
///         validation, relayer-fee accounting, and `FailureAck` refunds.
contract GreenfieldGroupGate {
    uint8 internal constant OP_ADD_MEMBERS = 0;
    uint8 internal constant OP_REMOVE_MEMBERS = 1;

    error NotAuthorized();
    error GroupNotSet();
    error ZeroAddress();
    error ZeroGroupId(); // group 0 is the "not set" sentinel — reject it explicitly

    IGreenfieldGroupHub public immutable groupHub;
    address public owner;
    mapping(address account => bool) public isGranter;
    /// courseId → Greenfield group id (the group whose membership = access).
    mapping(uint256 courseId => uint256 groupId) public groupOf;

    event GranterSet(address indexed account, bool allowed);
    event GroupSet(uint256 indexed courseId, uint256 indexed groupId);
    event AccessGranted(uint256 indexed courseId, address indexed member, uint64 expiry);
    event AccessRevoked(uint256 indexed courseId, address indexed member);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotAuthorized();
        _;
    }

    modifier onlyOwnerOrGranter() {
        if (msg.sender != owner && !isGranter[msg.sender]) revert NotAuthorized();
        _;
    }

    constructor(address groupHub_, address owner_) {
        if (groupHub_ == address(0)) revert ZeroAddress();
        if (owner_ == address(0)) revert ZeroAddress();
        groupHub = IGreenfieldGroupHub(groupHub_);
        owner = owner_;
    }

    /// Authorize a delegated granter (e.g. CourseMarketplace) — G-08 pattern.
    function setGranter(address account, bool allowed) external onlyOwner {
        isGranter[account] = allowed;
        emit GranterSet(account, allowed);
    }

    /// Map a course to the Greenfield group whose membership gates it.
    function setGroup(uint256 courseId, uint256 groupId) external onlyOwner {
        if (groupId == 0) revert ZeroGroupId();
        groupOf[courseId] = groupId;
        emit GroupSet(courseId, groupId);
    }

    /// Grant access: add `member` to the course's Greenfield group (cross-chain).
    /// `expiry` is a unix ts (0 = perpetual). `msg.value` = relayer fee.
    function grantAccess(uint256 courseId, address member, uint64 expiry)
        external
        payable
        onlyOwnerOrGranter
    {
        if (member == address(0)) revert ZeroAddress();
        _updateGroup(courseId, member, OP_ADD_MEMBERS, expiry);
        emit AccessGranted(courseId, member, expiry);
    }

    /// Revoke access: remove `member` from the course's Greenfield group
    /// (cross-chain) — native revocation. `msg.value` = relayer fee.
    function revokeAccess(uint256 courseId, address member)
        external
        payable
        onlyOwnerOrGranter
    {
        if (member == address(0)) revert ZeroAddress();
        _updateGroup(courseId, member, OP_REMOVE_MEMBERS, 0);
        emit AccessRevoked(courseId, member);
    }

    function _updateGroup(uint256 courseId, address member, uint8 opType, uint64 expiry) internal {
        uint256 groupId = groupOf[courseId];
        if (groupId == 0) revert GroupNotSet();

        address[] memory members = new address[](1);
        members[0] = member;
        uint64[] memory expirations = new uint64[](1);
        expirations[0] = expiry;

        groupHub.updateGroup{value: msg.value}(
            IGreenfieldGroupHub.UpdateGroupSynPackage({
                operator: address(this),
                id: groupId,
                opType: opType,
                members: members,
                extraData: "",
                memberExpiration: expirations
            })
        );
    }
}
