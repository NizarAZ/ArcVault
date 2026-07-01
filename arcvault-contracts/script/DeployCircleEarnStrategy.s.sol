// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

import {CircleEarnStrategy} from "../src/CircleEarnStrategy.sol";

interface IArcVaultOwner {
    function owner() external view returns (address);
}

contract DeployCircleEarnStrategy is Script {
    address internal constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;
    address internal constant EARNKIT_USDC_VAULT = 0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88;

    function run() external returns (CircleEarnStrategy strategy) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address vault = vm.envAddress("VAULT_ADDRESS");
        address vaultOwner = IArcVaultOwner(vault).owner();

        vm.startBroadcast(privateKey);
        strategy = new CircleEarnStrategy(
            IERC20(ARC_TESTNET_USDC),
            IERC4626(EARNKIT_USDC_VAULT),
            vault,
            vaultOwner
        );
        vm.stopBroadcast();

        console2.log("CircleEarnStrategy:", address(strategy));
        console2.log("ArcVault:", vault);
        console2.log("Strategy owner:", vaultOwner);
        console2.log("USDC:", ARC_TESTNET_USDC);
        console2.log("EarnKit USDC Vault:", EARNKIT_USDC_VAULT);
    }
}
