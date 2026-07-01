// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

import {MorphoVaultStrategy} from "../src/MorphoVaultStrategy.sol";

interface IArcVaultOwner {
    function owner() external view returns (address);
}

contract DeployMorphoVaultStrategy is Script {
    address internal constant ARC_TESTNET_USDC = 0x3600000000000000000000000000000000000000;
    address internal constant MORPHO_USDC_VAULT = 0xAabbeF1D3971c710276ed41eC791BbE14CdB8E88;

    function run() external returns (MorphoVaultStrategy strategy) {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address vault = vm.envAddress("VAULT_ADDRESS");
        address vaultOwner = IArcVaultOwner(vault).owner();

        vm.startBroadcast(privateKey);
        strategy = new MorphoVaultStrategy(
            IERC20(ARC_TESTNET_USDC),
            IERC4626(MORPHO_USDC_VAULT),
            vault,
            vaultOwner
        );
        vm.stopBroadcast();

        console2.log("MorphoVaultStrategy:", address(strategy));
        console2.log("ArcVault:", vault);
        console2.log("Strategy owner:", vaultOwner);
        console2.log("USDC:", ARC_TESTNET_USDC);
        console2.log("Morpho USDC VaultV2:", MORPHO_USDC_VAULT);
    }
}
