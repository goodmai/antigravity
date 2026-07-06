// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {GreenfieldGroupGate} from "../src/GreenfieldGroupGate.sol";
import {IGreenfieldGroupHub} from "../src/interfaces/IGreenfieldGroupHub.sol";

/// Mock of the Greenfield cross-chain GroupHub: records the relayer fee + opType
/// and applies AddMembers/RemoveMembers to an in-memory membership set, so the
/// gate's routing is verifiable in forge without the real cross-chain stack.
contract MockGroupHub is IGreenfieldGroupHub {
    mapping(uint256 groupId => mapping(address => bool)) public member;
    uint256 public lastValue;
    uint8 public lastOpType;
    uint256 public calls;

    function updateGroup(UpdateGroupSynPackage memory p) external payable returns (bool) {
        lastValue = msg.value;
        lastOpType = p.opType;
        calls++;
        for (uint256 i = 0; i < p.members.length; i++) {
            if (p.opType == 0) member[p.id][p.members[i]] = true; // AddMembers
            else if (p.opType == 1) member[p.id][p.members[i]] = false; // RemoveMembers
        }
        return true;
    }
}

contract GreenfieldGroupGateTest is Test {
    MockGroupHub hub;
    GreenfieldGroupGate gate;
    address owner;
    address marketplace;
    address buyer;
    uint256 constant COURSE = 42;
    uint256 constant GROUP = 7;

    event AccessGranted(uint256 indexed courseId, address indexed member, uint64 expiry);
    event AccessRevoked(uint256 indexed courseId, address indexed member);

    function setUp() public {
        owner = address(this);
        marketplace = makeAddr("marketplace");
        buyer = makeAddr("buyer");
        hub = new MockGroupHub();
        gate = new GreenfieldGroupGate(address(hub), owner);
        gate.setGroup(COURSE, GROUP);
    }

    function test_constructor_rejectsZero() public {
        vm.expectRevert(GreenfieldGroupGate.ZeroAddress.selector);
        new GreenfieldGroupGate(address(0), owner);
        vm.expectRevert(GreenfieldGroupGate.ZeroAddress.selector);
        new GreenfieldGroupGate(address(hub), address(0));
    }

    function test_setGroup_onlyOwner_andEffect() public {
        vm.prank(buyer);
        vm.expectRevert(GreenfieldGroupGate.NotAuthorized.selector);
        gate.setGroup(COURSE, GROUP);
        assertEq(gate.groupOf(COURSE), GROUP);
    }

    function test_grant_addsMemberCrossChain_withRelayerFee() public {
        vm.expectEmit(true, true, false, true);
        emit AccessGranted(COURSE, buyer, 0);
        gate.grantAccess{value: 1e15}(COURSE, buyer, 0);
        assertTrue(hub.member(GROUP, buyer));
        assertEq(hub.lastOpType(), 0); // AddMembers
        assertEq(hub.lastValue(), 1e15); // relayer fee forwarded cross-chain
    }

    function test_revoke_removesMemberCrossChain() public {
        gate.grantAccess(COURSE, buyer, 0);
        assertTrue(hub.member(GROUP, buyer));
        vm.expectEmit(true, true, false, false);
        emit AccessRevoked(COURSE, buyer);
        gate.revokeAccess(COURSE, buyer);
        assertFalse(hub.member(GROUP, buyer)); // native revocation (removeMember)
        assertEq(hub.lastOpType(), 1); // RemoveMembers
    }

    function test_granter_canGrantAndRevoke() public {
        gate.setGranter(marketplace, true);
        vm.prank(marketplace);
        gate.grantAccess(COURSE, buyer, uint64(block.timestamp + 30 days));
        assertTrue(hub.member(GROUP, buyer));
        vm.prank(marketplace);
        gate.revokeAccess(COURSE, buyer);
        assertFalse(hub.member(GROUP, buyer));
    }

    function test_unauthorizedReverts() public {
        vm.prank(buyer);
        vm.expectRevert(GreenfieldGroupGate.NotAuthorized.selector);
        gate.grantAccess(COURSE, buyer, 0);
    }

    function test_grant_revertsWhenGroupNotSet() public {
        vm.expectRevert(GreenfieldGroupGate.GroupNotSet.selector);
        gate.grantAccess(999, buyer, 0); // course with no mapped group
    }

    function test_grant_rejectsZeroMember() public {
        vm.expectRevert(GreenfieldGroupGate.ZeroAddress.selector);
        gate.grantAccess(COURSE, address(0), 0);
    }

    function test_revoke_rejectsZeroMember() public {
        vm.expectRevert(GreenfieldGroupGate.ZeroAddress.selector);
        gate.revokeAccess(COURSE, address(0));
    }

    function test_setGranter_onlyOwner_andEffect() public {
        vm.prank(buyer);
        vm.expectRevert(GreenfieldGroupGate.NotAuthorized.selector);
        gate.setGranter(marketplace, true);
        gate.setGranter(marketplace, true);
        assertTrue(gate.isGranter(marketplace));
    }

    /// M-3: groupId 0 is the "not set" sentinel — accepting it would make every
    /// grant/revoke for that course revert as GroupNotSet immediately.
    function test_setGroup_rejectsZeroGroupId() public {
        vm.expectRevert(GreenfieldGroupGate.ZeroGroupId.selector);
        gate.setGroup(COURSE, 0);
        // The mapping must remain at its previous value.
        assertEq(gate.groupOf(COURSE), GROUP);
    }

    /// Granter can be disabled after being enabled, locking them out.
    function test_granterDisable_blocksSubsequentCalls() public {
        gate.setGranter(marketplace, true);
        assertTrue(gate.isGranter(marketplace));
        gate.setGranter(marketplace, false);
        assertFalse(gate.isGranter(marketplace));

        vm.prank(marketplace);
        vm.expectRevert(GreenfieldGroupGate.NotAuthorized.selector);
        gate.grantAccess(COURSE, buyer, 0);
    }

    /// Multiple courses can be mapped to different groups independently.
    function test_multiCourse_independentGroups() public {
        gate.setGroup(1, 10);
        gate.setGroup(2, 20);

        gate.grantAccess(1, buyer, 0);
        gate.grantAccess(2, buyer, 0);
        assertTrue(hub.member(10, buyer));
        assertTrue(hub.member(20, buyer));

        gate.revokeAccess(1, buyer);
        assertFalse(hub.member(10, buyer));
        assertTrue(hub.member(20, buyer)); // course 2 unaffected
    }
}
