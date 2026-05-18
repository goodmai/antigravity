// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CourseMarketplace} from "../src/CourseMarketplace.sol";
import {AccessPass} from "../src/AccessPass.sol";
import {Treasury} from "../src/Treasury.sol";

/// Reenters withdraw() on receiving its author payout.
contract ReenterAuthor {
    CourseMarketplace public mp;
    bool private hit;

    constructor(CourseMarketplace _mp) {
        mp = _mp;
    }

    function register() external returns (uint256) {
        return mp.registerCourse(1 ether, bytes32("h"), "bkt");
    }

    function pull() external {
        mp.withdraw();
    }

    receive() external payable {
        if (!hit) {
            hit = true;
            mp.withdraw(); // must be blocked by nonReentrant
        }
    }
}

contract CourseMarketplaceTest is Test {
    CourseMarketplace mp;
    AccessPass pass;
    Treasury treasury;

    address w3ext = address(0xW3);
    address author = address(0xA47);
    address buyer = address(0xB17);

    function setUp() public {
        treasury = new Treasury(address(this));
        mp = new CourseMarketplace(address(treasury), w3ext);
        pass = new AccessPass();
        pass.setMarketplace(address(mp));
        mp.setAccessPass(address(pass));
        vm.deal(buyer, 100 ether);
    }

    function _register(uint96 price) internal returns (uint256 id) {
        vm.prank(author);
        id = mp.registerCourse(price, bytes32("hash"), "course-bucket");
    }

    function test_quote_splitResumsToPrice_default2020() public view {
        (uint256 p, uint256 w, uint256 a) = mp.quote(1000);
        assertEq(p, 200); // 20%
        assertEq(w, 200); // 20%
        assertEq(a, 600);
        assertEq(p + w + a, 1000);
    }

    function testFuzz_splitInvariant(uint96 price) public view {
        vm.assume(price > 0);
        (uint256 p, uint256 w, uint256 a) = mp.quote(price);
        assertEq(p + w + a, uint256(price)); // no wei created/lost
    }

    function test_purchase_happyPath_creditsPullAndPushesTreasury() public {
        uint256 id = _register(1 ether);
        vm.prank(buyer);
        mp.purchase{value: 1 ether}(id);

        assertTrue(pass.hasAccess(buyer, id));
        assertEq(treasury.totalReceived(), 0.2 ether);
        assertEq(mp.pendingWithdrawals(author), 0.6 ether);
        assertEq(mp.pendingWithdrawals(w3ext), 0.2 ether);
    }

    function test_purchase_wrongPriceReverts() public {
        uint256 id = _register(1 ether);
        vm.prank(buyer);
        vm.expectRevert(CourseMarketplace.BadPrice.selector);
        mp.purchase{value: 0.5 ether}(id);
    }

    function test_purchase_twiceReverts() public {
        uint256 id = _register(1 ether);
        vm.startPrank(buyer);
        mp.purchase{value: 1 ether}(id);
        vm.expectRevert(CourseMarketplace.AlreadyOwned.selector);
        mp.purchase{value: 1 ether}(id);
        vm.stopPrank();
    }

    function test_pullWithdraw() public {
        uint256 id = _register(1 ether);
        vm.prank(buyer);
        mp.purchase{value: 1 ether}(id);

        uint256 before = author.balance;
        vm.prank(author);
        mp.withdraw();
        assertEq(author.balance, before + 0.6 ether);
        assertEq(mp.pendingWithdrawals(author), 0);
    }

    function test_reentrantWithdrawIsBlocked() public {
        ReenterAuthor evil = new ReenterAuthor(mp);
        vm.prank(address(evil));
        uint256 id = evil.register();

        vm.prank(buyer);
        mp.purchase{value: 1 ether}(id);

        // reentrant withdraw() in receive() must not double-pay
        vm.expectRevert();
        evil.pull();
        assertEq(address(evil).balance, 0);
    }

    function test_setParams_rejectsPerCutOverLimit() public {
        vm.expectRevert(CourseMarketplace.BpsTooHigh.selector);
        mp.setParams(4000, 1000, address(treasury), w3ext); // 4000 > MAX_BPS_EACH
    }

    function test_setParams_rejectsZeroAddress() public {
        vm.expectRevert(CourseMarketplace.ZeroAddress.selector);
        mp.setParams(1000, 1000, address(0), w3ext);
    }

    function test_setParams_validUpdate() public {
        mp.setParams(1000, 500, address(treasury), w3ext);
        (uint256 p, uint256 w, uint256 a) = mp.quote(10_000);
        assertEq(p, 1000);
        assertEq(w, 500);
        assertEq(a, 8500);
    }
}
