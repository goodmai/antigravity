// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {AuthorNft} from "../src/AuthorNft.sol";
import {SoulboundAccessNft} from "../src/SoulboundAccessNft.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

/// AuthorNft is the perpetual, soulbound author credential. Lit gates author
/// update/read on balanceOf(author) >= 1. These tests cover the AuthorNft
/// surface plus the soulbound base it inherits (transfers/approvals revert).
contract AuthorNftTest is Test {
    AuthorNft nft;
    address owner;
    address author;
    address signer;
    uint256 signerPk;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    function setUp() public {
        owner = address(this);
        author = makeAddr("author");
        (signer, signerPk) = makeAddrAndKey("claimSigner");
        nft = new AuthorNft(owner, signer);
    }

    function test_metadataAndConstructor() public view {
        assertEq(nft.name(), "Daskibo Author Pass");
        assertEq(nft.symbol(), "DASK-AUTH");
        assertEq(nft.owner(), owner);
        assertEq(nft.claimSigner(), signer);
    }

    function test_mint_perpetual_byOwner() public {
        vm.expectEmit(true, true, true, true);
        emit Transfer(address(0), author, 1);
        uint256 id = nft.mint(author);
        assertEq(id, 1);
        assertEq(nft.balanceOf(author), 1);
        assertEq(nft.ownerOf(id), author);
    }

    function test_mint_unauthorizedReverts() public {
        vm.prank(author); // neither owner nor granter
        vm.expectRevert(SoulboundAccessNft.NotAuthorized.selector);
        nft.mint(author);
    }

    // ── Delegated granter (G-08) ──────────────────────────────────────────
    event GranterSet(address indexed account, bool allowed);
    event AccessRevoked(address indexed holder, uint256 indexed tokenId);

    function test_setGranter_ownerOnly_andEffect() public {
        address op = makeAddr("op");
        vm.prank(op);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, op));
        nft.setGranter(op, true);
        nft.setGranter(op, true);
        assertTrue(nft.isGranter(op));
    }

    function test_granter_canMint() public {
        address op = makeAddr("op");
        nft.setGranter(op, true);
        vm.prank(op);
        uint256 id = nft.mint(author);
        assertEq(nft.balanceOf(author), 1);
        assertEq(nft.ownerOf(id), author);
    }

    // ── Revoke (R-09): burn flips the balanceOf gate (R-10) ───────────────
    function test_revoke_burnsAndClearsBalance() public {
        uint256 id = nft.mint(author);
        assertEq(nft.balanceOf(author), 1);
        vm.expectEmit(true, true, false, false);
        emit AccessRevoked(author, id);
        nft.revoke(id);
        assertEq(nft.balanceOf(author), 0); // Lit `balanceOf >= 1` gate now fails
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, id));
        nft.ownerOf(id);
    }

    function test_revoke_byGranter() public {
        address op = makeAddr("op");
        nft.setGranter(op, true);
        uint256 id = nft.mint(author);
        vm.prank(op);
        nft.revoke(id);
        assertEq(nft.balanceOf(author), 0);
    }

    function test_revoke_unauthorizedReverts() public {
        uint256 id = nft.mint(author);
        vm.prank(author);
        vm.expectRevert(SoulboundAccessNft.NotAuthorized.selector);
        nft.revoke(id);
    }

    // ── Soulbound (base) ──────────────────────────────────────────────────
    function test_transferReverts_soulbound() public {
        uint256 id = nft.mint(author);
        vm.prank(author);
        vm.expectRevert(SoulboundAccessNft.Soulbound.selector);
        nft.transferFrom(author, makeAddr("buyer"), id);
    }

    function test_safeTransferReverts_soulbound() public {
        uint256 id = nft.mint(author);
        vm.prank(author);
        vm.expectRevert(SoulboundAccessNft.Soulbound.selector);
        nft.safeTransferFrom(author, makeAddr("buyer"), id);
    }

    function test_approveAndSetApprovalForAllRevert_soulbound() public {
        nft.mint(author);
        vm.startPrank(author);
        vm.expectRevert(SoulboundAccessNft.Soulbound.selector);
        nft.approve(makeAddr("op"), 1);
        vm.expectRevert(SoulboundAccessNft.Soulbound.selector);
        nft.setApprovalForAll(makeAddr("op"), true);
        vm.stopPrank();
    }

    function test_supportsInterface() public view {
        assertTrue(nft.supportsInterface(type(IERC721).interfaceId));
        assertTrue(nft.supportsInterface(type(IERC165).interfaceId));
        assertFalse(nft.supportsInterface(0xffffffff));
    }

    function test_ownerOf_nonexistentReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, uint256(99)));
        nft.ownerOf(99);
    }

    // ── EIP-712 claim (Lit PKP) ───────────────────────────────────────────
    function _claimDigest(address to, uint256 nonce, uint256 deadline) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(keccak256("Claim(address to,uint256 nonce,uint256 deadline)"), to, nonce, deadline)
        );
        return keccak256(abi.encodePacked("\x19\x01", nft.DOMAIN_SEPARATOR(), structHash));
    }

    function test_claimWithSig_mintsForAuthorizedSigner() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _claimDigest(author, nft.claimNonces(author), deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        uint256 id = nft.claimWithSig(author, deadline, abi.encodePacked(r, s, v));
        assertEq(nft.ownerOf(id), author);
        assertEq(nft.claimNonces(author), 1);
    }

    function test_claimWithSig_replayReverts() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _claimDigest(author, nft.claimNonces(author), deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        nft.claimWithSig(author, deadline, sig);
        vm.expectRevert(SoulboundAccessNft.InvalidClaimSignature.selector);
        nft.claimWithSig(author, deadline, sig);
    }

    function test_claimWithSig_expiredReverts() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _claimDigest(author, nft.claimNonces(author), deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        vm.warp(deadline + 1);
        vm.expectRevert(SoulboundAccessNft.ClaimExpired.selector);
        nft.claimWithSig(author, deadline, abi.encodePacked(r, s, v));
    }

    function test_claimWithSig_wrongSignerReverts() public {
        (, uint256 evePk) = makeAddrAndKey("eve");
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _claimDigest(author, nft.claimNonces(author), deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(evePk, digest);
        vm.expectRevert(SoulboundAccessNft.InvalidClaimSignature.selector);
        nft.claimWithSig(author, deadline, abi.encodePacked(r, s, v));
    }

    function test_setClaimSigner_ownerOnly_andEffect() public {
        address newSigner = makeAddr("newSigner");
        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, author));
        nft.setClaimSigner(newSigner);
        nft.setClaimSigner(newSigner);
        assertEq(nft.claimSigner(), newSigner);
    }
}
