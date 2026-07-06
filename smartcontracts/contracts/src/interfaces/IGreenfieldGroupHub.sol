// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IGreenfieldGroupHub
/// @notice Minimal subset of the official `bnb-chain/greenfield-contracts`
///         `GroupHub` cross-chain interface — enough for the **G-10 spike**
///         ([GreenfieldGroupGate]). On BSC/opBNB a Greenfield Group (and its
///         members) is mirrored as a non-transferable ERC-721/ERC-1155; calling
///         `updateGroup` cross-chain adds/removes members, which is the native
///         access primitive (grant = AddMembers, revoke = RemoveMembers).
///
///         `updateGroup` is `payable` — `msg.value` carries the cross-chain
///         relayer fee. See docs.bnbchain.org/.../cross-chain-integration.
interface IGreenfieldGroupHub {
    /// opType values mirror the real `UpdateGroupOpType` enum:
    /// 0 = AddMembers, 1 = RemoveMembers, 2 = RenewMembers.
    struct UpdateGroupSynPackage {
        address operator;
        uint256 id; // Greenfield group id
        uint8 opType;
        address[] members;
        bytes extraData;
        uint64[] memberExpiration; // per-member expiry (0 = perpetual)
    }

    function updateGroup(UpdateGroupSynPackage memory synPkg) external payable returns (bool);
}
