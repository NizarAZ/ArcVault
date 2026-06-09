// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IEulerLendingStrategy} from "./ArcVault.sol";

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
        uint256 balance = USDC.balanceOf(address(this));
        withdrawn = assets > balance ? balance : assets;
        USDC.safeTransfer(msg.sender, withdrawn);
    }

    function harvest() external returns (uint256 yieldAssets) {
        harvestCount += 1;
        yieldAssets = USDC.balanceOf(address(this)) / 1000;
    }

    function totalAssets() public view returns (uint256 assets) {
        assets = USDC.balanceOf(address(this));
    }
}
