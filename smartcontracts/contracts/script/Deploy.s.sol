// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Treasury} from "../src/Treasury.sol";
import {AccessPass} from "../src/AccessPass.sol";
import {CourseMarketplace} from "../src/CourseMarketplace.sol";

/// @notice Deploy + wire the settlement layer. Run via the `deploy`
///         compose service against anvil (local) or any RPC.
///         w3ext defaults to the deployer unless W3EXT is set.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address w3ext = vm.envOr("W3EXT", deployer);

        vm.startBroadcast(pk);

        Treasury treasury = new Treasury(deployer);
        AccessPass pass = new AccessPass();
        CourseMarketplace mp =
            new CourseMarketplace(address(treasury), w3ext);

        pass.setMarketplace(address(mp));
        mp.setAccessPass(address(pass));

        vm.stopBroadcast();

        console2.log("Treasury        ", address(treasury));
        console2.log("AccessPass      ", address(pass));
        console2.log("CourseMarketplace", address(mp));
        console2.log("w3ext           ", w3ext);
    }
}
