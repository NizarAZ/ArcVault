// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MockEulerStrategy} from "../src/MockEulerStrategy.sol";

contract DeployMockEulerStrategy is Script {
    address internal constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (MockEulerStrategy strategy) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(privateKey);
        strategy = new MockEulerStrategy(IERC20(ARC_TESTNET_USDC));
        vm.stopBroadcast();

        console2.log("MockEulerStrategy:", address(strategy));
        console2.log("USDC:", ARC_TESTNET_USDC);
    }
}
