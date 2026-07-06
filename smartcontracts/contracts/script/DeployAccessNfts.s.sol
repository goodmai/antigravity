// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {ClientNft} from "../src/ClientNft.sol";
import {AuthorNft} from "../src/AuthorNft.sol";
import {ManifestRegistry} from "../src/ManifestRegistry.sol";

/// @notice Deploy the soulbound role NFTs that Lit gates on (replacing the old
///         MockNFT). ClientNft is deployed FIRST so it keeps the well-known
///         nonce-1 address used by the Base/ERC-721 gating scenario
///         (run-e2e-lit.mjs / `NFT_CONTRACT_ADDR`). Deployer is both owner
///         (can mint) and the EIP-712 claim signer.
contract DeployAccessNfts is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        // ClientNft first (nonce 1) to keep its well-known address; AuthorNft
        // nonce 2; ManifestRegistry nonce 3 (appended — does not shift the above).
        vm.startBroadcast(pk);
        ClientNft client = new ClientNft(deployer, deployer);
        AuthorNft author = new AuthorNft(deployer, deployer);
        ManifestRegistry registry = new ManifestRegistry();
        vm.stopBroadcast();
        console2.log("ClientNft       ", address(client));
        console2.log("AuthorNft       ", address(author));
        console2.log("ManifestRegistry", address(registry));
    }
}
