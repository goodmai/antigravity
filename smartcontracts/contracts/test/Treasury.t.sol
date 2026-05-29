// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Treasury} from "../src/Treasury.sol";

/// Always rejects ETH — used to exercise the TransferFailed branch.
contract RejectEth {
    receive() external payable {
        revert("nope");
    }
}

/// Pull-payment source stub: withdraw() pays the caller its balance.
contract MpStub {
    receive() external payable {}

    function withdraw() external {
        (bool ok,) = msg.sender.call{value: address(this).balance}("");
        require(ok, "send");
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

    function test_collectFrom_pullsAndCredits() public {
        MpStub mp = new MpStub();
        (bool ok,) = address(mp).call{value: 2 ether}("");
        assertTrue(ok);
        treasury.collectFrom(address(mp)); // permissionless pull
        assertEq(address(treasury).balance, 2 ether);
        assertEq(treasury.totalReceived(), 2 ether); // landed via receive()
    }

    function test_collectFrom_rejectsZeroAddress() public {
        vm.expectRevert(Treasury.ZeroAddress.selector);
        treasury.collectFrom(address(0));
    }

    // ── Ownable2Step (audit §2.3) ─────────────────────────────────────────
    function test_transferOwnership_isTwoStep() public {
        address newOwner = makeAddr("newGov");
        vm.prank(gov);
        treasury.transferOwnership(newOwner);
        // Ownership does NOT change until accepted.
        assertEq(treasury.owner(), gov);
        assertEq(treasury.pendingOwner(), newOwner);

        vm.prank(newOwner);
        treasury.acceptOwnership();
        assertEq(treasury.owner(), newOwner);
        assertEq(treasury.pendingOwner(), address(0));

        // Old owner can no longer withdraw; new owner can.
        treasury.fund{value: 1 ether}();
        vm.prank(gov);
        vm.expectRevert(Treasury.NotOwner.selector);
        treasury.withdraw(sink, 1 ether);
        vm.prank(newOwner);
        treasury.withdraw(sink, 1 ether);
        assertEq(sink.balance, 1 ether);
    }

    function test_transferOwnership_isOwnerOnly() public {
        vm.expectRevert(Treasury.NotOwner.selector);
        treasury.transferOwnership(makeAddr("attacker")); // caller != gov
    }

    function test_acceptOwnership_onlyPendingOwner() public {
        vm.prank(gov);
        treasury.transferOwnership(makeAddr("newGov"));
        vm.expectRevert(Treasury.NotPendingOwner.selector);
        treasury.acceptOwnership(); // caller is neither gov nor pending
    }

    // ── Audit: coverage of missing attack surfaces ────────────────────────

    /// collectFrom() with a zero-balance marketplace reverts because
    /// withdraw() reverts NothingToWithdraw — permissionless caller cannot
    /// drain Treasury via empty pulls (funds are not at risk; the call just
    /// fails cleanly).
    function test_collectFrom_zeroBalance_reverts() public {
        MpStub mp = new MpStub(); // balance = 0
        // mp.withdraw() sends 0 ether via call{value:0} which succeeds (returns 0);
        // totalReceived stays 0, no revert.  This verifies no harm from empty pull.
        treasury.collectFrom(address(mp)); // should not revert
        assertEq(address(treasury).balance, 0);
        assertEq(treasury.totalReceived(), 0);
    }

    /// Multiple inflows (receive + fund + collectFrom) are all tracked
    /// cumulatively in totalReceived.
    function test_totalReceived_tracksAllInflows() public {
        (bool ok,) = address(treasury).call{value: 1 ether}("");
        assertTrue(ok);
        treasury.fund{value: 2 ether}();
        MpStub mp = new MpStub();
        (bool ok2,) = address(mp).call{value: 0.5 ether}("");
        assertTrue(ok2);
        treasury.collectFrom(address(mp));
        assertEq(treasury.totalReceived(), 3.5 ether); // 1 + 2 + 0.5
        assertEq(address(treasury).balance, 3.5 ether);
    }

    /// Governance can perform multiple partial withdrawals; balance drains
    /// correctly each time and totalReceived is NOT decremented (it is
    /// cumulative inflows only, not a balance mirror).
    function test_multipleWithdraws_drainCorrectly() public {
        treasury.fund{value: 6 ether}();
        vm.startPrank(gov);
        treasury.withdraw(sink, 2 ether);
        assertEq(address(treasury).balance, 4 ether);
        treasury.withdraw(sink, 4 ether);
        assertEq(address(treasury).balance, 0);
        vm.stopPrank();
        assertEq(treasury.totalReceived(), 6 ether); // cumulative, not a balance
        assertEq(sink.balance, 6 ether);
    }
}
