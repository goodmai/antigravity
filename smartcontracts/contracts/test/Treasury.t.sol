// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Treasury} from "../src/Treasury.sol";

/// Always rejects ETH — used to exercise the TransferFailed branch.
contract RejectEth {
    receive() external payable {
        revert("nope");
    }
}

contract TreasuryTest is Test {
    Treasury treasury;
    address gov;
    address payable sink;

    function setUp() public {
        gov = makeAddr("gov");
        sink = payable(makeAddr("sink"));
        treasury = new Treasury(gov);
        vm.deal(address(this), 100 ether);
    }

    function test_constructor_rejectsZeroOwner() public {
        vm.expectRevert(Treasury.ZeroAddress.selector);
        new Treasury(address(0));
    }

    function test_fund_viaReceiveAndFn_accounts() public {
        (bool ok,) = address(treasury).call{value: 1 ether}("");
        assertTrue(ok);
        treasury.fund{value: 2 ether}();
        assertEq(treasury.totalReceived(), 3 ether);
        assertEq(address(treasury).balance, 3 ether);
    }

    function test_withdraw_isGovernanceOnly() public {
        treasury.fund{value: 1 ether}();
        vm.expectRevert(Treasury.NotOwner.selector);
        treasury.withdraw(sink, 1 ether); // caller != gov
    }

    function test_withdraw_rejectsZeroAddrAndOverdraw() public {
        treasury.fund{value: 1 ether}();
        vm.startPrank(gov);
        vm.expectRevert(Treasury.ZeroAddress.selector);
        treasury.withdraw(payable(address(0)), 1 ether);
        vm.expectRevert(Treasury.InsufficientBalance.selector);
        treasury.withdraw(sink, 2 ether);
        vm.stopPrank();
    }

    /// Audit 5.2 — no frozen funds: the full balance is always withdrawable
    /// (pull/governance, no unbounded loops, no mass push).
    function test_noFrozenFunds_fullBalanceAlwaysWithdrawable() public {
        treasury.fund{value: 5 ether}();
        uint256 before = sink.balance;
        vm.prank(gov);
        treasury.withdraw(sink, 5 ether);
        assertEq(sink.balance, before + 5 ether);
        assertEq(address(treasury).balance, 0);
    }

    function test_withdraw_failingRecipientReverts_fundsStaySafe() public {
        treasury.fund{value: 1 ether}();
        RejectEth bad = new RejectEth();
        vm.prank(gov);
        vm.expectRevert(Treasury.TransferFailed.selector);
        treasury.withdraw(payable(address(bad)), 1 ether);
        // funds not lost — still withdrawable to a good address
        vm.prank(gov);
        treasury.withdraw(sink, 1 ether);
        assertEq(address(treasury).balance, 0);
    }

    function test_partialWithdraw_leavesRemainder() public {
        treasury.fund{value: 4 ether}();
        vm.prank(gov);
        treasury.withdraw(sink, 1.5 ether);
        assertEq(sink.balance, 1.5 ether);
        assertEq(address(treasury).balance, 2.5 ether); // not frozen
        // totalReceived is cumulative, not balance
        assertEq(treasury.totalReceived(), 4 ether);
    }
}
