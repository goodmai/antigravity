// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MockNFT} from "../src/MockNFT.sol";

contract DeployMockNFT is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        MockNFT nft = new MockNFT();
        vm.stopBroadcast();
        console2.log("MockNFT         ", address(nft));
    }
}
