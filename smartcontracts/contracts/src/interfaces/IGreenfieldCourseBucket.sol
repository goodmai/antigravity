// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IGreenfieldCourseBucket — OPTIONAL cross-chain module (SPEC §6)
/// @notice Only needed if Greenfield bucket lifecycle must be managed
///         on-chain (NOT for access — that is Lit-gated, no cross-chain).
///         Implementations MUST wrap the official
///         `bnb-chain/greenfield-contracts` (`CrossChain` + `BucketHub`),
///         never a custom bridge, and MUST:
///           - accept callbacks only from the trusted hub (msg.sender),
///           - validate srcChainId + package sequence (idempotent),
///           - refund the relayer fee on FailureAck (audit 4.3),
///           - keep relayer fees OUT of the SPEC §4 split.
interface IGreenfieldCourseBucket {
    event BucketCreateRequested(uint256 indexed courseId, string bucket, uint256 relayerFee);
    event BucketCreateAcked(uint256 indexed courseId, bool success);
    event RelayerFeeRefunded(address indexed to, uint256 amount);

    /// @notice Initiate cross-chain creation of the course bucket.
    /// @dev `msg.value` covers the Greenfield relayer fee (separate from
    ///      the course-sale split).
    function requestCreateBucket(uint256 courseId, string calldata bucket) external payable;

    /// @notice Cross-chain ack handler. MUST require `msg.sender == hub`.
    function onBucketCreateAck(
        uint64 sequence,
        uint256 courseId,
        bool success
    ) external;
}
