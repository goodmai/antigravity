// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ClientNft} from "../src/ClientNft.sol";
import {SoulboundAccessNft} from "../src/SoulboundAccessNft.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

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

    function test_mint_onlyOwner() public {
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, client));
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
}
