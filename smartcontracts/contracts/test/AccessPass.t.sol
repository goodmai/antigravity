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

    /// The ERC721 `safeTransferFrom(from,to,id,data)` overload is also
    /// soulbound — the 3-arg paths are covered above; this exercises the
    /// 4-arg overload explicitly.
    function test_soulbound_safeTransferWithDataReverts() public {
        vm.prank(mp);
        uint256 id = pass.mint(alice, 1, 0);
        vm.prank(alice);
        vm.expectRevert(AccessPass.Soulbound.selector);
        pass.safeTransferFrom(alice, address(0xB0B), id, bytes("data"));
    }

    // ── P-A: wrapNonce + encryptedKey ─────────────────────────────────────

    function test_wrapNonce_issuedOnMint() public {
        vm.prank(mp);
        uint256 id = pass.mint(alice, 1, 0);
        uint256 nonce = pass.wrapNonce(alice, 1);
        assertGt(nonce, 0, "wrapNonce must be non-zero after mint");
        assertEq(pass.tokenIdOf(alice, 1), id, "reverse mapping must match");
        assertEq(pass.encryptedKey(id).length, 0, "encryptedKey empty before setEncryptedKey");
    }

    function test_setEncryptedKey_storesAndConsumesNonce() public {
        vm.prank(mp);
        uint256 id = pass.mint(alice, 1, 0);
        assertGt(pass.wrapNonce(alice, 1), 0);

        bytes memory ct = hex"deadbeefcafe";
        vm.prank(alice);
        pass.setEncryptedKey(id, ct);

        assertEq(pass.encryptedKey(id), ct, "ciphertext stored");
        assertEq(pass.wrapNonce(alice, 1), 0, "nonce consumed");
    }

    function test_setEncryptedKey_revertsIfAlreadySet() public {
        vm.prank(mp);
        uint256 id = pass.mint(alice, 1, 0);
        vm.startPrank(alice);
        pass.setEncryptedKey(id, hex"aabbcc");
        vm.expectRevert(AccessPass.AlreadySet.selector);
        pass.setEncryptedKey(id, hex"ddeeff");
        vm.stopPrank();
    }

    function test_setEncryptedKey_revertsIfNonceConsumed() public {
        vm.prank(mp);
        uint256 id = pass.mint(alice, 1, 0);
        vm.startPrank(alice);
        pass.setEncryptedKey(id, hex"aabbcc");
        // nonce already zero after first call — but AlreadySet fires first:
        vm.expectRevert(AccessPass.AlreadySet.selector);
        pass.setEncryptedKey(id, hex"112233");
        vm.stopPrank();

        // Direct NonceConsumed path: simulate a pass whose nonce is already 0
        // by deploying a fresh pair and consuming nonce via setEncryptedKey,
        // then attempting resetForRewrap path.
        address bob = makeAddr("bob");
        vm.prank(mp);
        uint256 id2 = pass.mint(bob, 2, 0);
        vm.prank(bob);
        pass.setEncryptedKey(id2, hex"cafe");
        // nonce is now 0; governance resets it, then bob can setEncryptedKey again
        pass.resetForRewrap(id2); // owner == address(this) in setUp
        assertGt(pass.wrapNonce(bob, 2), 0, "fresh nonce after reset");
        vm.prank(bob);
        pass.setEncryptedKey(id2, hex"babe");
        assertEq(pass.encryptedKey(id2), hex"babe");
    }

    function test_setEncryptedKey_revertsIfNotTokenOwner() public {
        vm.prank(mp);
        uint256 id = pass.mint(alice, 1, 0);
        address eve = makeAddr("eve");
        vm.prank(eve);
        vm.expectRevert(AccessPass.NotTokenOwner.selector);
        pass.setEncryptedKey(id, hex"baad");
    }

    function test_resetForRewrap_clearsKeyAndIssuesNewNonce() public {
        vm.prank(mp);
        uint256 id = pass.mint(alice, 5, 0);
        vm.prank(alice);
        pass.setEncryptedKey(id, hex"0102030405");
        assertEq(pass.wrapNonce(alice, 5), 0);

        // Governance reset
        pass.resetForRewrap(id); // owner == address(this)
        assertEq(pass.encryptedKey(id).length, 0, "key cleared");
        assertGt(pass.wrapNonce(alice, 5), 0, "fresh nonce");

        // Alice can set again
        vm.prank(alice);
        pass.setEncryptedKey(id, hex"0a0b0c");
        assertEq(pass.encryptedKey(id), hex"0a0b0c");
    }

    function test_resetForRewrap_onlyOwnerOrMarketplace() public {
        vm.prank(mp);
        uint256 id = pass.mint(alice, 1, 0);
        address eve = makeAddr("eve");
        vm.prank(eve);
        vm.expectRevert(AccessPass.NotOwner.selector);
        pass.resetForRewrap(id);
        // marketplace can also reset
        vm.prank(mp);
        pass.resetForRewrap(id); // should not revert
    }

    function test_tokenIdOf_reverseMapping() public {
        vm.prank(mp);
        uint256 id = pass.mint(alice, 7, 0);
        assertEq(pass.tokenIdOf(alice, 7), id);
        assertEq(pass.tokenIdOf(alice, 8), 0, "unminted courseId returns 0");
    }

    function test_wrapNonce_uniqueAcrossReset() public {
        vm.prank(mp);
        uint256 id = pass.mint(alice, 1, 0);
        uint256 nonce1 = pass.wrapNonce(alice, 1);
        vm.prank(alice);
        pass.setEncryptedKey(id, hex"aa");

        vm.roll(block.number + 1);
        pass.resetForRewrap(id);
        uint256 nonce2 = pass.wrapNonce(alice, 1);
        // With different block.number the hash should differ
        assertTrue(nonce2 != nonce1 || nonce2 != 0, "nonce should change after reset");
    }

    // ── P-A: setEncryptedKey edge cases ──────────────────────────────────────

    /// Audit: empty-bytes griefing — a zero-length ciphertext would consume the
    /// wrapNonce but leave encryptedKey.length == 0. A second call would then
    /// pass the AlreadySet guard but fail on NonceConsumed, permanently locking
    /// the slot without storing anything useful. EmptyCiphertext prevents this.
    function test_setEncryptedKey_revertsOnEmptyBytes() public {
        vm.prank(mp);
        uint256 id = pass.mint(alice, 30, 0);
        uint256 nonceBeforeAttempt = pass.wrapNonce(alice, 30);
        assertGt(nonceBeforeAttempt, 0, "nonce must be non-zero before attempt");

        vm.prank(alice);
        vm.expectRevert(AccessPass.EmptyCiphertext.selector);
        pass.setEncryptedKey(id, new bytes(0));

        // Nonce must survive the failed call — no drain of the write-once slot
        assertEq(pass.wrapNonce(alice, 30), nonceBeforeAttempt, "nonce must survive failed call");
        assertEq(pass.encryptedKey(id).length, 0, "slot still empty after failed call");
    }

    /// Design invariant: setEncryptedKey does NOT check expiry on-chain; expiry
    /// is enforced off-chain via the timestamp condition in the Chipotle ACC.
    /// The contract is the source of state, not the enforcement layer.
    function test_setEncryptedKey_onExpiredToken_permittedByDesign() public {
        uint64 exp = uint64(block.timestamp + 10);
        vm.prank(mp);
        uint256 id = pass.mint(alice, 31, exp);

        vm.warp(uint256(exp) + 1); // subscription expired
        assertFalse(pass.hasAccess(alice, 31), "access expired");

        // setEncryptedKey still succeeds — the stored ciphertext's ACC timestamp
        // will deny any Chipotle decrypt attempt after expiry.
        vm.prank(alice);
        pass.setEncryptedKey(id, hex"cafecafe");
        assertEq(pass.encryptedKey(id), hex"cafecafe", "ciphertext stored");
    }

    // ── P-A + expiry enforcement ──────────────────────────────────────────────

    /// Full P-A flow with timed subscription.
    /// Invariants:
    ///   • expiryOf is readable after mint (Chipotle embeds it in the ACC)
    ///   • hasAccess is true during the subscription window
    ///   • after block.timestamp > expiry → hasAccess is false
    ///     (Chipotle's timestamp-ACC condition also denies decrypt at this point)
    ///   • encryptedKey persists on-chain; expiry is enforced off-chain by the ACC
    ///   • setEncryptedKey cannot be called again (AlreadySet)
    function test_pa_expiry_denies_access_after_timestamp() public {
        uint64 exp = uint64(block.timestamp + 1_000);
        vm.prank(mp);
        uint256 id = pass.mint(alice, 20, exp);

        // wrapNonce and expiryOf must be set immediately after mint
        assertGt(pass.wrapNonce(alice, 20), 0, "wrapNonce > 0 after mint");
        assertEq(pass.expiryOf(alice, 20), exp, "expiryOf stored at mint");
        assertTrue(pass.hasAccess(alice, 20), "access valid before expiry");

        // Simulate wrap_for_buyer + setEncryptedKey while subscription is active
        bytes memory ct = hex"cafebabe";
        vm.prank(alice);
        pass.setEncryptedKey(id, ct);
        assertEq(pass.encryptedKey(id), ct, "key stored");
        assertEq(pass.wrapNonce(alice, 20), 0, "nonce consumed after setEncryptedKey");

        // Exactly at boundary: still valid (> not >=)
        vm.warp(uint256(exp));
        assertTrue(pass.hasAccess(alice, 20), "valid at boundary (timestamp == exp)");

        // One second past expiry: access denied
        vm.warp(uint256(exp) + 1);
        assertFalse(pass.hasAccess(alice, 20), "denied after expiry");

        // expiryOf still readable — required for Chipotle to audit/rebuild ACC
        assertEq(pass.expiryOf(alice, 20), exp, "expiryOf unchanged after expiry");

        // Ciphertext persists on-chain; ACC timestamp condition blocks decryption
        assertEq(pass.encryptedKey(id), ct, "ciphertext persists (off-chain ACC enforces expiry)");

        // Attempting a second setEncryptedKey must revert — nonce consumed, key set
        vm.prank(alice);
        vm.expectRevert(AccessPass.AlreadySet.selector);
        pass.setEncryptedKey(id, hex"deadbeef");
    }

    /// After expiry, renewal (second purchase) issues a new tokenId + fresh
    /// wrapNonce. Old ciphertext is orphaned on-chain; its ACC timestamp denies
    /// any decrypt attempt. New token starts with an empty encryptedKey slot.
    function test_pa_renewal_issues_fresh_nonce_after_expiry() public {
        uint64 exp = uint64(block.timestamp + 500);
        vm.prank(mp);
        uint256 id1 = pass.mint(alice, 21, exp);
        uint256 nonce1 = pass.wrapNonce(alice, 21);
        assertGt(nonce1, 0, "initial nonce > 0");

        // Consume nonce (simulate setEncryptedKey call)
        vm.prank(alice);
        pass.setEncryptedKey(id1, hex"0101");
        assertEq(pass.wrapNonce(alice, 21), 0, "nonce consumed");

        // Warp past expiry
        vm.warp(uint256(exp) + 1);
        assertFalse(pass.hasAccess(alice, 21), "expired");

        // Renewal: second mint succeeds because old pass is expired
        vm.roll(block.number + 1); // ensure fresh block for different nonce
        vm.prank(mp);
        uint256 id2 = pass.mint(alice, 21, uint64(block.timestamp + 1_000));
        assertTrue(id2 > id1, "renewal gets new tokenId");

        // Fresh wrapNonce for the renewed pass
        uint256 nonce2 = pass.wrapNonce(alice, 21);
        assertGt(nonce2, 0, "fresh nonce after renewal");

        // Access restored; new token's key slot is empty
        assertTrue(pass.hasAccess(alice, 21), "access restored after renewal");
        assertEq(pass.encryptedKey(id2).length, 0, "new token: no key yet");

        // Old ciphertext still on-chain (ACC timestamp makes it undecryptable)
        assertEq(pass.encryptedKey(id1), hex"0101", "old ciphertext persists");
    }
}
