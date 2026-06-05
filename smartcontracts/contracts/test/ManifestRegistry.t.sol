// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ManifestRegistry} from "../src/ManifestRegistry.sol";

/// ManifestRegistry anchors the Lit ACC `conditionsHash` on-chain so a reader
/// can detect a swapped manifest (G-09). Tests cover first-writer authorship,
/// author-only updates, the verify() tamper gate, and edge cases.
contract ManifestRegistryTest is Test {
    ManifestRegistry reg;
    address author1;
    address author2;
    bytes32 constant KEY = keccak256("daskibo-bucket/_lit/manifest.json");
    bytes32 constant H1 = keccak256("acc-v1");
    bytes32 constant H2 = keccak256("acc-v2");

    event ManifestAnchored(
        bytes32 indexed key, address indexed author, bytes32 conditionsHash, uint64 updatedAt
    );

    function setUp() public {
        reg = new ManifestRegistry();
        author1 = makeAddr("author1");
        author2 = makeAddr("author2");
    }

    function test_anchor_setsAuthorHashAndEmits() public {
        vm.prank(author1);
        vm.expectEmit(true, true, false, true);
        emit ManifestAnchored(KEY, author1, H1, uint64(block.timestamp));
        reg.anchor(KEY, H1);

        (address a, bytes32 h, uint64 t) = reg.anchorOf(KEY);
        assertEq(a, author1);
        assertEq(h, H1);
        assertEq(t, uint64(block.timestamp));
    }

    function test_zeroHashReverts() public {
        vm.expectRevert(ManifestRegistry.ZeroHash.selector);
        reg.anchor(KEY, bytes32(0));
    }

    function test_authorCanUpdate() public {
        vm.startPrank(author1);
        reg.anchor(KEY, H1);
        reg.anchor(KEY, H2);
        vm.stopPrank();
        assertTrue(reg.verify(KEY, H2));
        assertFalse(reg.verify(KEY, H1)); // old hash no longer matches
    }

    function test_nonAuthorCannotUpdate() public {
        vm.prank(author1);
        reg.anchor(KEY, H1);
        vm.prank(author2);
        vm.expectRevert(ManifestRegistry.NotKeyAuthor.selector);
        reg.anchor(KEY, H2);
    }

    function test_verify_tamperGate() public {
        assertFalse(reg.verify(KEY, H1)); // unanchored ⇒ false
        vm.prank(author1);
        reg.anchor(KEY, H1);
        assertTrue(reg.verify(KEY, H1)); // matching anchor
        assertFalse(reg.verify(KEY, H2)); // swapped ACC ⇒ false (tamper detected)
        assertFalse(reg.verify(keccak256("other-key"), H1));
    }

    function test_anchorOf_unanchoredIsZero() public view {
        (address a, bytes32 h, uint64 t) = reg.anchorOf(keccak256("never"));
        assertEq(a, address(0));
        assertEq(h, bytes32(0));
        assertEq(t, 0);
    }

    /// verify() must return true only for the exact (key, hash) pair that was
    /// anchored — any off-by-one in either dimension is a tamper signal.
    function testFuzz_anchorAndVerify(bytes32 key, bytes32 hash) public {
        vm.assume(hash != bytes32(0));
        vm.prank(author1);
        reg.anchor(key, hash);
        assertTrue(reg.verify(key, hash));
        // flipping one bit in the hash must not pass
        bytes32 flipped = bytes32(uint256(hash) ^ 1);
        assertFalse(reg.verify(key, flipped));
        // same hash, different key must not pass
        bytes32 otherKey = bytes32(uint256(key) ^ 1);
        assertFalse(reg.verify(otherKey, hash));
    }

    /// Multiple distinct keys can be independently anchored and updated.
    function test_multipleKeys_independent() public {
        bytes32 key2 = keccak256("bucket2/_lit/manifest.json");
        vm.prank(author1);
        reg.anchor(KEY, H1);
        vm.prank(author2);
        reg.anchor(key2, H2);

        assertTrue(reg.verify(KEY, H1));
        assertFalse(reg.verify(KEY, H2)); // KEY is anchored to H1, not H2
        assertTrue(reg.verify(key2, H2));
        assertFalse(reg.verify(key2, H1));

        // author1 cannot update key2 and vice versa
        vm.prank(author1);
        vm.expectRevert(ManifestRegistry.NotKeyAuthor.selector);
        reg.anchor(key2, H1);
    }
}
