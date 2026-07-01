// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ArcVault} from "../src/ArcVault.sol";
import {yUSDC} from "../src/yUSDC.sol";

contract Deploy is Script {
    address internal constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (ArcVault vault, yUSDC receiptToken) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);
        address keeper = vm.envAddress("KEEPER_ADDRESS");
        address strategy = vm.envOr("STRATEGY_ADDRESS", vm.envOr("EULER_STRATEGY_ADDRESS", address(0)));

        vm.startBroadcast(privateKey);

        receiptToken = new yUSDC(deployer, 6);
        vault = new ArcVault(IERC20(ARC_TESTNET_USDC), receiptToken, keeper, strategy, deployer);
        receiptToken.setVault(address(vault));

        vm.stopBroadcast();

        console2.log("ArcVault:", address(vault));
        console2.log("yUSDC:", address(receiptToken));
        console2.log("Strategy:", strategy);
    }
}
