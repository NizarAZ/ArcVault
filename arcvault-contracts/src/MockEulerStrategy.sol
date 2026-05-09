// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IEulerLendingStrategy} from "./ArcVault.sol";

interface IMintableUSDC {
    function mint(address to, uint256 amount) external;
}

contract MockEulerStrategy is IEulerLendingStrategy {
    using SafeERC20 for IERC20;

    IERC20 public immutable USDC;
    uint256 public harvestCount;

    constructor(IERC20 usdc_) {
        USDC = usdc_;
    }

    function deposit(uint256 assets) external {
        USDC.safeTransferFrom(msg.sender, address(this), assets);
    }

    function withdraw(uint256 assets) external returns (uint256 withdrawn) {
        withdrawn = assets;
        USDC.safeTransfer(msg.sender, withdrawn);
    }

    function harvest() external returns (uint256 yieldAssets) {
        harvestCount += 1;
        yieldAssets = USDC.balanceOf(address(this)) / 1000;

        if (yieldAssets > 0) {
            IMintableUSDC(address(USDC)).mint(address(this), yieldAssets);
        }
    }

    function totalAssets() external view returns (uint256 assets) {
        assets = USDC.balanceOf(address(this));
    }
}
