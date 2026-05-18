// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AccessPass} from "../src/AccessPass.sol";

contract AccessPassTest is Test {
    AccessPass pass;
    address mp = address(0xMP);
    address alice = address(0xA11CE);

    function setUp() public {
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
}
