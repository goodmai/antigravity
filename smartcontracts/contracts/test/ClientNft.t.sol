// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ClientNft} from "../src/ClientNft.sol";
import {SoulboundAccessNft} from "../src/SoulboundAccessNft.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

/// ClientNft is the time-limited, soulbound client subscription. Lit gates
/// client reads on hasAccess(user). These tests cover mint+expiry semantics,
/// the hasAccess predicate, the signed claim, and soulbound behavior.
contract ClientNftTest is Test {
    ClientNft nft;
    address owner;
    address client;
    address signer;
    uint256 signerPk;

    function setUp() public {
        owner = address(this);
        client = makeAddr("client");
        (signer, signerPk) = makeAddrAndKey("claimSigner");
        nft = new ClientNft(owner, signer);
    }

    function test_metadata() public view {
        assertEq(nft.name(), "Daskibo Client Pass");
        assertEq(nft.symbol(), "DASK-CLI");
    }

    function test_mint_unauthorizedReverts() public {
        vm.prank(client); // neither owner nor granter
        vm.expectRevert(SoulboundAccessNft.NotAuthorized.selector);
        nft.mint(client, 0);
    }

    function test_mint_perpetual_grantsAccess() public {
        uint256 id = nft.mint(client, 0);
        assertEq(nft.ownerOf(id), client);
        assertEq(nft.expiryOf(id), 0);
        assertEq(nft.accessExpiryOf(client), 0);
        assertTrue(nft.hasAccess(client));
    }

    function test_mint_timeLimited_expires() public {
        uint64 exp = uint64(block.timestamp + 1 days);
        uint256 id = nft.mint(client, exp);
        assertEq(nft.expiryOf(id), exp);
        assertTrue(nft.hasAccess(client)); // before expiry
        vm.warp(uint256(exp)); // exactly at expiry → still valid (<=)
        assertTrue(nft.hasAccess(client));
        vm.warp(uint256(exp) + 1); // past expiry
        assertFalse(nft.hasAccess(client));
    }

    function test_hasAccess_falseForNeverGranted() public {
        assertFalse(nft.hasAccess(client));
        assertFalse(nft.hasAccess(makeAddr("stranger")));
    }

    function test_renewal_afterExpiry() public {
        uint64 exp = uint64(block.timestamp + 1 days);
        nft.mint(client, exp);
        vm.warp(uint256(exp) + 1);
        assertFalse(nft.hasAccess(client));
        // re-mint (renewal) restores access
        nft.mint(client, uint64(block.timestamp + 7 days));
        assertTrue(nft.hasAccess(client));
    }

    // ── Per-account window never shrinks (audit §2.B) ─────────────────────
    function test_mint_shorterDoesNotShrinkActiveWindow() public {
        uint64 long_ = uint64(block.timestamp + 30 days);
        uint256 id1 = nft.mint(client, long_);
        uint64 short_ = uint64(block.timestamp + 1 days);
        uint256 id2 = nft.mint(client, short_); // shorter, second token
        // per-account window keeps the longer one…
        assertEq(nft.accessExpiryOf(client), long_);
        // …but each token records its own exact expiry
        assertEq(nft.expiryOf(id1), long_);
        assertEq(nft.expiryOf(id2), short_);
        vm.warp(uint256(short_) + 1); // past the short pass, before the long
        assertTrue(nft.hasAccess(client)); // still has access via the longer window
    }

    function test_mint_perpetualNotShrunkByFinite() public {
        nft.mint(client, 0); // perpetual
        nft.mint(client, uint64(block.timestamp + 1 days)); // finite, must NOT downgrade
        assertEq(nft.accessExpiryOf(client), 0);
        vm.warp(block.timestamp + 3650 days);
        assertTrue(nft.hasAccess(client)); // perpetual preserved
    }

    function test_mint_finiteUpgradedToPerpetual() public {
        nft.mint(client, uint64(block.timestamp + 1 days));
        nft.mint(client, 0); // perpetual upgrade
        assertEq(nft.accessExpiryOf(client), 0);
        vm.warp(block.timestamp + 3650 days);
        assertTrue(nft.hasAccess(client));
    }

    // ── Soulbound ─────────────────────────────────────────────────────────
    function test_transferReverts_soulbound() public {
        uint256 id = nft.mint(client, 0);
        vm.prank(client);
        vm.expectRevert(SoulboundAccessNft.Soulbound.selector);
        nft.transferFrom(client, makeAddr("other"), id);
    }

    // ── EIP-712 claim with expiry ─────────────────────────────────────────
    function _claimDigest(address to, uint64 expiry, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Claim(address to,uint64 expiry,uint256 nonce,uint256 deadline)"),
                to,
                expiry,
                nonce,
                deadline
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", nft.DOMAIN_SEPARATOR(), structHash));
    }

    function test_claimWithSig_mintsTimeLimited() public {
        uint64 expiry = uint64(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _claimDigest(client, expiry, nft.claimNonces(client), deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        uint256 id = nft.claimWithSig(client, expiry, deadline, abi.encodePacked(r, s, v));
        assertEq(nft.ownerOf(id), client);
        assertEq(nft.expiryOf(id), expiry);
        assertTrue(nft.hasAccess(client));
        assertEq(nft.claimNonces(client), 1);
    }

    function test_claimWithSig_expiredDeadlineReverts() public {
        uint64 expiry = uint64(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _claimDigest(client, expiry, nft.claimNonces(client), deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        vm.warp(deadline + 1);
        vm.expectRevert(SoulboundAccessNft.ClaimExpired.selector);
        nft.claimWithSig(client, expiry, deadline, abi.encodePacked(r, s, v));
    }

    function test_claimWithSig_wrongSignerReverts() public {
        (, uint256 evePk) = makeAddrAndKey("eve");
        uint64 expiry = uint64(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _claimDigest(client, expiry, nft.claimNonces(client), deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(evePk, digest);
        vm.expectRevert(SoulboundAccessNft.InvalidClaimSignature.selector);
        nft.claimWithSig(client, expiry, deadline, abi.encodePacked(r, s, v));
    }

    /// Replay protection: reusing the same signature consumes the nonce on the
    /// first call, so the second recovers a digest over nonce+1 and the
    /// recovered signer no longer equals claimSigner → InvalidClaimSignature.
    /// (AuthorNft has this test; ClientNft must guarantee the same.)
    function test_claimWithSig_replayReverts() public {
        uint64 expiry = uint64(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _claimDigest(client, expiry, nft.claimNonces(client), deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        nft.claimWithSig(client, expiry, deadline, sig);
        vm.expectRevert(SoulboundAccessNft.InvalidClaimSignature.selector);
        nft.claimWithSig(client, expiry, deadline, sig);
    }

    /// A PKP-signed claim with expiry == 0 mints a perpetual client pass — the
    /// signed-mint counterpart of `test_mint_perpetual_grantsAccess`.
    function test_claimWithSig_perpetual() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _claimDigest(client, 0, nft.claimNonces(client), deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        uint256 id = nft.claimWithSig(client, 0, deadline, abi.encodePacked(r, s, v));
        assertEq(nft.expiryOf(id), 0);
        assertEq(nft.accessExpiryOf(client), 0);
        vm.warp(block.timestamp + 3650 days);
        assertTrue(nft.hasAccess(client)); // never lapses
    }

    /// Two successive signed claims to the same holder: each consumes the next
    /// nonce, so a fresh signature over nonce+1 mints a second token (renewal /
    /// top-up via the PKP path). Confirms the nonce monotonically advances.
    function test_claimWithSig_secondClaimWithFreshNonce() public {
        uint64 expiry = uint64(block.timestamp + 30 days);
        uint256 deadline = block.timestamp + 1 hours;

        bytes32 d0 = _claimDigest(client, expiry, 0, deadline);
        (uint8 v0, bytes32 r0, bytes32 s0) = vm.sign(signerPk, d0);
        uint256 id0 = nft.claimWithSig(client, expiry, deadline, abi.encodePacked(r0, s0, v0));
        assertEq(nft.claimNonces(client), 1);

        bytes32 d1 = _claimDigest(client, expiry, 1, deadline);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(signerPk, d1);
        uint256 id1 = nft.claimWithSig(client, expiry, deadline, abi.encodePacked(r1, s1, v1));
        assertEq(nft.claimNonces(client), 2);

        assertTrue(id1 > id0, "second claim mints a new tokenId");
        assertEq(nft.balanceOf(client), 2);
    }

    // ── Delegated granter (G-08) ──────────────────────────────────────────
    event GranterSet(address indexed account, bool allowed);
    event AccessRevoked(address indexed holder, uint256 indexed tokenId);

    function test_setGranter_ownerOnly_andEffect() public {
        address op = makeAddr("op");
        vm.prank(op);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, op));
        nft.setGranter(op, true);
        vm.expectEmit(true, false, false, true);
        emit GranterSet(op, true);
        nft.setGranter(op, true);
        assertTrue(nft.isGranter(op));
    }

    function test_granter_canMint() public {
        address op = makeAddr("op");
        nft.setGranter(op, true);
        vm.prank(op);
        uint256 id = nft.mint(client, 0);
        assertEq(nft.ownerOf(id), client);
        assertTrue(nft.hasAccess(client));
    }

    // ── Revoke (R-09) — incl. a perpetual pass, with predicate flip (R-10) ──
    function test_revoke_perpetual_clearsAccess() public {
        uint256 id = nft.mint(client, 0); // perpetual — previously un-revocable
        assertTrue(nft.hasAccess(client));
        vm.expectEmit(true, true, false, false);
        emit AccessRevoked(client, id);
        nft.revoke(id);
        assertFalse(nft.hasAccess(client)); // predicate a Lit Action reads flips
        assertEq(nft.balanceOf(client), 0);
        assertEq(nft.accessExpiryOf(client), 0);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, id));
        nft.ownerOf(id);
    }

    function test_revoke_byGranter() public {
        address op = makeAddr("op");
        nft.setGranter(op, true);
        uint256 id = nft.mint(client, 0);
        vm.prank(op);
        nft.revoke(id);
        assertFalse(nft.hasAccess(client));
    }

    function test_revoke_unauthorizedReverts() public {
        uint256 id = nft.mint(client, 0);
        vm.prank(client);
        vm.expectRevert(SoulboundAccessNft.NotAuthorized.selector);
        nft.revoke(id);
    }

    function test_revoke_nonexistentReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, uint256(99)));
        nft.revoke(99);
    }

    function test_revoke_thenRemint_restoresAccess() public {
        uint256 id = nft.mint(client, 0);
        nft.revoke(id);
        assertFalse(nft.hasAccess(client));
        nft.mint(client, 0); // re-grant after revocation
        assertTrue(nft.hasAccess(client));
    }

    /// M-2: setClaimSigner(address(0)) would permanently disable claimWithSig.
    function test_setClaimSigner_rejectsZeroAddress() public {
        vm.expectRevert(SoulboundAccessNft.ZeroAddress.selector);
        nft.setClaimSigner(address(0));
        assertEq(nft.claimSigner(), signer);
    }
}
