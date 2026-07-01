// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IEulerLendingStrategy} from "./ArcVault.sol";

/// @title CircleEarnStrategy
/// @notice ArcVault strategy adapter for a Circle App Kit-discovered USDC Earn vault.
/// @dev App Kit is discovery/infrastructure. This contract is ArcVault's onchain
///      adapter and deposits USDC into the configured ERC-4626-style Earn vault.
contract CircleEarnStrategy is IEulerLendingStrategy, Ownable {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error Unauthorized();
    error InvalidEarnVaultAsset(address expected, address actual);
    error ZeroSharesReceived();

    IERC20 public immutable USDC;
    IERC4626 public immutable earnVault;

    /// @notice ArcVault address allowed to call deposit, withdraw, and harvest.
    address public vault;

    /// @notice Earn vault shares received by this strategy for ArcVault deposits.
    uint256 public trackedShares;

    /// @notice Internally accounted USDC value. Harvest realizes positive deltas over this value.
    uint256 public accountedAssets;

    /// @notice Timestamp of the last state-changing strategy accounting update.
    uint256 public lastUpdated;

    /// @notice Number of harvest calls executed by ArcVault.
    uint256 public harvestCount;

    event VaultUpdated(address indexed vault);
    event DepositedToEarnVault(uint256 assets, uint256 shares);
    event WithdrawnFromEarnVault(uint256 assets, uint256 shares);
    event YieldRealized(uint256 yieldAssets, uint256 totalAssetsAfter);

    modifier onlyVault() {
        if (msg.sender != vault) revert Unauthorized();
        _;
    }

    constructor(IERC20 usdc_, IERC4626 earnVault_, address vault_, address initialOwner_) Ownable(initialOwner_) {
        if (address(usdc_) == address(0) || address(earnVault_) == address(0) || initialOwner_ == address(0)) {
            revert ZeroAddress();
        }

        address asset = earnVault_.asset();
        if (asset != address(usdc_)) revert InvalidEarnVaultAsset(address(usdc_), asset);

        USDC = usdc_;
        earnVault = earnVault_;
        lastUpdated = block.timestamp;

        _setVault(vault_);
    }

    /// @notice Sets or updates the ArcVault address that can operate this strategy.
    function setVault(address vault_) external onlyOwner {
        _setVault(vault_);
    }

    /// @inheritdoc IEulerLendingStrategy
    function deposit(uint256 assets) external onlyVault {
        uint256 balanceBefore = USDC.balanceOf(address(this));
        USDC.safeTransferFrom(msg.sender, address(this), assets);
        uint256 received = USDC.balanceOf(address(this)) - balanceBefore;

        USDC.forceApprove(address(earnVault), received);
        uint256 shares = earnVault.deposit(received, address(this));
        if (shares == 0) revert ZeroSharesReceived();

        trackedShares += shares;
        accountedAssets += received;
        lastUpdated = block.timestamp;

        emit DepositedToEarnVault(received, shares);
    }

    /// @inheritdoc IEulerLendingStrategy
    function withdraw(uint256 assets) external onlyVault returns (uint256 withdrawn) {
        if (assets > accountedAssets) assets = accountedAssets;
        if (assets == 0 || trackedShares == 0) return 0;

        uint256 sharesBurned;
        uint256 receiverBalanceBefore = USDC.balanceOf(msg.sender);

        if (assets == accountedAssets) {
            uint256 redeemShares = trackedShares;
            uint256 maxRedeem = earnVault.maxRedeem(address(this));
            if (redeemShares > maxRedeem) redeemShares = maxRedeem;
            if (redeemShares == 0) return 0;

            earnVault.redeem(redeemShares, msg.sender, address(this));
            sharesBurned = redeemShares;
        } else {
            uint256 sharesBefore = earnVault.balanceOf(address(this));
            earnVault.withdraw(assets, msg.sender, address(this));
            sharesBurned = sharesBefore - earnVault.balanceOf(address(this));
        }

        withdrawn = USDC.balanceOf(msg.sender) - receiverBalanceBefore;
        trackedShares -= sharesBurned;
        accountedAssets = withdrawn >= accountedAssets ? 0 : accountedAssets - withdrawn;
        lastUpdated = block.timestamp;

        emit WithdrawnFromEarnVault(withdrawn, sharesBurned);
    }

    /// @inheritdoc IEulerLendingStrategy
    function harvest() external onlyVault returns (uint256 yieldAssets) {
        harvestCount += 1;

        uint256 managedAssets = _managedAssets();
        if (managedAssets > accountedAssets) {
            yieldAssets = managedAssets - accountedAssets;
        }

        accountedAssets = managedAssets;
        lastUpdated = block.timestamp;

        emit YieldRealized(yieldAssets, managedAssets);
    }

    /// @inheritdoc IEulerLendingStrategy
    function totalAssets() external view returns (uint256 assets) {
        assets = accountedAssets;
    }

    /// @notice Positive Earn vault value above internal accounting, before the next harvest.
    function pendingYield() external view returns (uint256 yieldAssets) {
        uint256 managedAssets = _managedAssets();
        if (managedAssets > accountedAssets) {
            yieldAssets = managedAssets - accountedAssets;
        }
    }

    function _managedAssets() internal view returns (uint256 assets) {
        assets = earnVault.convertToAssets(trackedShares);
    }

    function _setVault(address vault_) internal {
        if (vault_ == address(0)) revert ZeroAddress();
        vault = vault_;
        emit VaultUpdated(vault_);
    }
}
