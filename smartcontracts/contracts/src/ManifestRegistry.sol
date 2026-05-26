// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ManifestRegistry
/// @notice On-chain integrity anchor for Lit/Chipotle Access Control Conditions
///         (closes G-09). A `manifest.lit` in a Greenfield bucket carries a
///         `conditionsHash` (tamper-detection over the ACC). Anchoring that hash
///         here gives a reader an **authoritative on-chain source of truth** to
///         verify the ACC was not silently swapped by a malicious SP/CDN —
///         instead of trusting the manifest blob alone.
///
///         Self-contained ACL (a minimal registry/validation primitive, partial
///         G-08): the first writer of a `key` becomes its author; only that
///         author may update it afterwards. `key` is caller-defined, e.g.
///         `keccak256(abi.encodePacked(bucket, "/", objectPath))` or a courseId.
contract ManifestRegistry {
    error NotKeyAuthor();
    error ZeroHash();

    struct Anchor {
        address author; // first writer; only they can update
        bytes32 conditionsHash; // hash the reader must match the manifest's ACC against
        uint64 updatedAt;
    }

    mapping(bytes32 key => Anchor) private _anchors;

    event ManifestAnchored(
        bytes32 indexed key,
        address indexed author,
        bytes32 conditionsHash,
        uint64 updatedAt
    );

    /// Anchor (or update) the ACC `conditionsHash` for `key`. First writer
    /// becomes the key's author; subsequent updates are author-only.
    function anchor(bytes32 key, bytes32 conditionsHash) external {
        if (conditionsHash == bytes32(0)) revert ZeroHash();
        Anchor storage a = _anchors[key];
        if (a.author == address(0)) {
            a.author = msg.sender;
        } else if (a.author != msg.sender) {
            revert NotKeyAuthor();
        }
        a.conditionsHash = conditionsHash;
        a.updatedAt = uint64(block.timestamp);
        emit ManifestAnchored(key, msg.sender, conditionsHash, a.updatedAt);
    }

    /// Full anchor record for `key` (author == address(0) ⇒ unanchored).
    function anchorOf(bytes32 key)
        external
        view
        returns (address author, bytes32 conditionsHash, uint64 updatedAt)
    {
        Anchor storage a = _anchors[key];
        return (a.author, a.conditionsHash, a.updatedAt);
    }

    /// Reader-side check (the tamper gate): true iff `key` is anchored to
    /// exactly `conditionsHash`. False for unanchored keys.
    function verify(bytes32 key, bytes32 conditionsHash) external view returns (bool) {
        bytes32 anchored = _anchors[key].conditionsHash;
        return anchored != bytes32(0) && anchored == conditionsHash;
    }
}
