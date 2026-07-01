// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

interface IArcVaultConfig {
    function setStrategy(address strategy_) external;
    function deployIdle() external;
    function receiptToken() external view returns (address);
    function strategy() external view returns (address);
}

interface IReceiptTokenConfig {
    function vault() external view returns (address);
}

contract ConfigureStrategy is Script {
    error InvalidVaultAddress(address candidate);
    error InvalidReceiptTokenLink(address vault, address receiptToken, address linkedVault);

    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address vault = vm.envAddress("VAULT_ADDRESS");
        address strategy = vm.envOr("STRATEGY_ADDRESS", address(0));
        if (strategy == address(0)) {
            strategy = vm.envAddress("EULER_STRATEGY_ADDRESS");
        }
        bool deployIdle = vm.envOr("DEPLOY_IDLE", false);

        address receiptToken = validateVault(vault);

        console2.log("Validated ArcVault:", vault);
        console2.log("Linked yUSDC:", receiptToken);
        console2.log("Requested strategy:", strategy);

        vm.startBroadcast(privateKey);

        IArcVaultConfig(vault).setStrategy(strategy);

        if (deployIdle) {
            IArcVaultConfig(vault).deployIdle();
        }

        vm.stopBroadcast();

        console2.log("ArcVault:", vault);
        console2.log("Strategy:", IArcVaultConfig(vault).strategy());
        console2.log("Deploy idle:", deployIdle ? "true" : "false");
    }

    function validateVault(address vault) public view returns (address receiptToken) {
        (bool ok, bytes memory receiptData) = vault.staticcall(abi.encodeCall(IArcVaultConfig.receiptToken, ()));
        if (!ok || receiptData.length != 32) revert InvalidVaultAddress(vault);

        receiptToken = abi.decode(receiptData, (address));

        (ok, receiptData) = receiptToken.staticcall(abi.encodeCall(IReceiptTokenConfig.vault, ()));
        if (!ok || receiptData.length != 32) revert InvalidReceiptTokenLink(vault, receiptToken, address(0));

        address linkedVault = abi.decode(receiptData, (address));
        if (linkedVault != vault) revert InvalidReceiptTokenLink(vault, receiptToken, linkedVault);
    }
}
