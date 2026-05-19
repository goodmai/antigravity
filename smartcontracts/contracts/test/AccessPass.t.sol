// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AccessPass} from "../src/AccessPass.sol";

contract AccessPassTest is Test {
    AccessPass pass;
    address mp;
    address alice;

    function setUp() public {
        mp = makeAddr("mp");
        alice = makeAddr("alice");
        pass = new AccessPass();
        pass.setMarketplace(mp);
    }

    function test_setMarketplace_isOneShot() public {
        vm.expectRevert(AccessPass.MarketplaceAlreadySet.selector);
        pass.setMarketplace(address(0xBEEF));
    }

    function test_onlyMarketplaceCanMint() public {
        vm.expectRevert(AccessPass.NotMarketplace.selector);
        pass.mint(alice, 1, 0);

        vm.prank(mp);
        uint256 id = pass.mint(alice, 1, 0);
        assertEq(pass.ownerOf(id), alice);
        assertTrue(pass.hasAccess(alice, 1));
        assertFalse(pass.hasAccess(alice, 2));
    }

    /// Audit 5.2 — Access Control Bypass: NOBODY but the marketplace can
    /// mint (not even the contract owner / deployer). Equivalent to a
    /// MINTER_ROLE granted solely to CourseMarketplace, but immutable.
    function test_ownerCannotMint_noBypass() public {
        // `this` is the deployer/owner of `pass`
        vm.expectRevert(AccessPass.NotMarketplace.selector);
        pass.mint(alice, 99, 0);
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(AccessPass.NotMarketplace.selector);
        pass.mint(alice, 99, 0);
    }

    function test_doubleMintSameCourseReverts() public {
        vm.startPrank(mp);
        pass.mint(alice, 1, 0);
        vm.expectRevert(AccessPass.AlreadyOwned.selector);
        pass.mint(alice, 1, 0);
        vm.stopPrank();
    }

    function test_soulbound_allTransferPathsRevert() public {
        vm.prank(mp);
        uint256 id = pass.mint(alice, 1, 0);

        vm.startPrank(alice);
        vm.expectRevert(AccessPass.Soulbound.selector);
        pass.transferFrom(alice, address(0xB0B), id);
        vm.expectRevert(AccessPass.Soulbound.selector);
        pass.safeTransferFrom(alice, address(0xB0B), id);
        vm.expectRevert(AccessPass.Soulbound.selector);
        pass.approve(address(0xB0B), id);
        vm.expectRevert(AccessPass.Soulbound.selector);
        pass.setApprovalForAll(address(0xB0B), true);
        vm.stopPrank();
    }

    function test_timeLimitedAccessExpires() public {
        vm.prank(mp);
        pass.mint(alice, 7, uint64(block.timestamp + 1 days));
        assertTrue(pass.hasAccess(alice, 7));
        vm.warp(block.timestamp + 1 days + 1);
        assertFalse(pass.hasAccess(alice, 7)); // expired

        // re-mint after expiry is allowed (renewal)
        vm.prank(mp);
        pass.mint(alice, 7, uint64(block.timestamp + 1 days));
        assertTrue(pass.hasAccess(alice, 7));
    }

    function test_setMarketplace_rejectsZeroAndNonOwner() public {
        AccessPass fresh = new AccessPass(); // owner == address(this)
        vm.expectRevert(AccessPass.ZeroAddress.selector);
        fresh.setMarketplace(address(0));
        vm.prank(makeAddr("notOwner"));
        vm.expectRevert(AccessPass.NotOwner.selector);
        fresh.setMarketplace(mp);
    }

    function test_mint_rejectsZeroRecipient() public {
        vm.prank(mp);
        vm.expectRevert(AccessPass.ZeroAddress.selector);
        pass.mint(address(0), 1, 0);
    }

    function test_mappings_ownerAndCourseRecorded() public {
        vm.prank(mp);
        uint256 id = pass.mint(alice, 42, 0);
        assertEq(pass.ownerOf(id), alice);
        assertEq(pass.courseOf(id), 42);
        assertEq(pass.expiryOf(alice, 42), 0); // perpetual
    }

    // ── Negative / edge: access without / expired NFT ───────────────────
    function test_noAccessWithoutNft() public view {
        // never minted → no access at all
        assertFalse(pass.hasAccess(alice, 1));
        assertFalse(pass.hasAccess(address(0xCAFE), 999));
    }

    function test_courseIsolation_passDoesNotLeakAcrossCourses() public {
        vm.prank(mp);
        pass.mint(alice, 1, 0);
        assertTrue(pass.hasAccess(alice, 1));
        assertFalse(pass.hasAccess(alice, 2)); // different course
    }

    function test_expiryBoundary_validAtExpiryInvalidAfter() public {
        uint64 exp = uint64(block.timestamp + 1000);
        vm.prank(mp);
        pass.mint(alice, 5, exp);
        vm.warp(exp); // exactly at expiry → still valid (> only)
        assertTrue(pass.hasAccess(alice, 5));
        vm.warp(uint256(exp) + 1); // one second past → expired
        assertFalse(pass.hasAccess(alice, 5));
    }

    function test_pastExpiryGrantsNoAccess_thenRenewable() public {
        vm.warp(10_000);
        vm.prank(mp);
        pass.mint(alice, 5, uint64(9_000)); // expiry already in the past
        assertFalse(pass.hasAccess(alice, 5));
        // expired ⇒ re-mint (renewal) allowed, restores access
        vm.prank(mp);
        pass.mint(alice, 5, uint64(block.timestamp + 1000));
        assertTrue(pass.hasAccess(alice, 5));
    }

    /// "НФТ владельца тоже не трансферабл": ANY holder's pass is soulbound,
    /// including one minted to an author-like / owner address.
    function test_anyHoldersPassIsSoulbound() public {
        address holder = makeAddr("courseOwnerHolder");
        vm.prank(mp);
        uint256 id = pass.mint(holder, 3, 0);
        vm.startPrank(holder);
        vm.expectRevert(AccessPass.Soulbound.selector);
        pass.transferFrom(holder, alice, id);
        vm.expectRevert(AccessPass.Soulbound.selector);
        pass.safeTransferFrom(holder, alice, id);
        vm.expectRevert(AccessPass.Soulbound.selector);
        pass.approve(alice, id);
        vm.stopPrank();
    }

    function test_ownerOf_nonexistentTokenIsZero() public view {
        assertEq(pass.ownerOf(99999), address(0));
    }
}
