// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockNFT} from "../src/MockNFT.sol";

/// MockNFT is the deployable "NFT on Base" used by the Lit cross-chain
/// gating scenarios (script/DeployMockNFT.s.sol). It is minimal but real,
/// so it carries its own coverage.
contract MockNFTTest is Test {
    MockNFT nft;
    address alice;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    function setUp() public {
        nft = new MockNFT();
        alice = makeAddr("alice");
    }

    function test_metadata() public view {
        assertEq(nft.name(), "Mock Lit NFT");
        assertEq(nft.symbol(), "MLNFT");
    }

    function test_mint_incrementsIdsAndBalance_emitsTransfer() public {
        vm.expectEmit(true, true, true, true);
        emit Transfer(address(0), alice, 1);
        uint256 id1 = nft.mint(alice);
        assertEq(id1, 1);
        uint256 id2 = nft.mint(alice);
        assertEq(id2, 2);
        assertEq(nft.balanceOf(alice), 2);
        assertEq(nft.ownerOf(id1), alice);
        assertEq(nft.ownerOf(id2), alice);
    }

    function test_mint_rejectsZeroAddress() public {
        vm.expectRevert(bytes("Zero address"));
        nft.mint(address(0));
    }

    function test_balanceOf_rejectsZeroAddress() public {
        vm.expectRevert(bytes("Zero address"));
        nft.balanceOf(address(0));
    }

    function test_ownerOf_nonexistentReverts() public {
        vm.expectRevert(bytes("Token does not exist"));
        nft.ownerOf(999);
    }
}
