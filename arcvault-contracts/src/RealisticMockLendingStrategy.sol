// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IEulerLendingStrategy} from "./ArcVault.sol";

/// @title RealisticMockLendingStrategy
/// @notice Deterministic, educational lending-yield model for Arc Testnet.
/// @dev This contract is self-contained and does not connect to any external protocol.
///      It accrues yield over time from configurable APR parameters. Because it cannot
///      mint real USDC, accrued yield is capped by prefunded reserve liquidity already
///      held by the strategy contract. This keeps the mock testnet-safe, deterministic,
///      and withdrawable for educational Arc Testnet demos.
contract RealisticMockLendingStrategy is IEulerLendingStrategy, Ownable {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error Unauthorized();
    error InvalidBasisPoints();

    uint256 public constant BPS = 10_000;
    uint256 public constant SECONDS_PER_YEAR = 365 days;
    uint256 public constant MAX_APR_BPS = 100_000; // 1,000% APR cap for testnet safety.

    IERC20 public immutable USDC;

    /// @notice ArcVault address allowed to call deposit, withdraw, and harvest.
    address public vault;

    /// @notice Internally accounted assets managed for ArcVault, including realized mock yield.
    uint256 public accountedAssets;

    /// @notice Base APR in basis points. Example: 500 = 5% APR.
    uint256 public baseAprBps;

    /// @notice Manual utilization input in basis points. Example: 8,000 = 80% utilization.
    uint256 public utilizationBps;

    /// @notice Maximum APR added by utilization when utilization is 100%.
    uint256 public utilizationAdjustmentBps;

    /// @notice Enables the utilization-based APR adjustment when true.
    bool public utilizationModelEnabled;

    /// @notice Timestamp when accounted assets were last updated.
    uint256 public lastUpdated;

    uint256 public harvestCount;

    event VaultUpdated(address indexed vault);
    event YieldParametersUpdated(
        uint256 baseAprBps,
        bool utilizationModelEnabled,
        uint256 utilizationBps,
        uint256 utilizationAdjustmentBps
    );
    event YieldReserveFunded(address indexed funder, uint256 assets);
    event YieldAccrued(uint256 yieldAssets, uint256 totalAssetsAfter);

    modifier onlyVault() {
        if (msg.sender != vault) revert Unauthorized();
        _;
    }

    constructor(
        IERC20 usdc_,
        address vault_,
        address initialOwner_,
        uint256 baseAprBps_,
        bool utilizationModelEnabled_,
        uint256 utilizationBps_,
        uint256 utilizationAdjustmentBps_
    ) Ownable(initialOwner_) {
        if (address(usdc_) == address(0) || initialOwner_ == address(0)) revert ZeroAddress();

        USDC = usdc_;
        lastUpdated = block.timestamp;

        _setVault(vault_);
        _setYieldParameters(baseAprBps_, utilizationModelEnabled_, utilizationBps_, utilizationAdjustmentBps_);
    }

    /// @notice Sets or updates the vault that can operate this strategy.
    function setVault(address vault_) external onlyOwner {
        _setVault(vault_);
    }

    /// @notice Updates deterministic yield parameters.
    /// @dev Accrues yield under the old parameters before applying the new parameters.
    function setYieldParameters(
        uint256 baseAprBps_,
        bool utilizationModelEnabled_,
        uint256 utilizationBps_,
        uint256 utilizationAdjustmentBps_
    ) external onlyOwner {
        _accrue();
        _setYieldParameters(baseAprBps_, utilizationModelEnabled_, utilizationBps_, utilizationAdjustmentBps_);
    }

    /// @notice Updates only the manual utilization input for the optional utilization model.
    function setUtilizationBps(uint256 utilizationBps_) external onlyOwner {
        if (utilizationBps_ > BPS) revert InvalidBasisPoints();
        _accrue();
        utilizationBps = utilizationBps_;
        emit YieldParametersUpdated(baseAprBps, utilizationModelEnabled, utilizationBps, utilizationAdjustmentBps);
    }

    /// @notice Adds USDC reserve liquidity that can back future mock yield.
    /// @dev Anyone can fund this on testnet. Funds above accountedAssets act as the yield reserve.
    function fundYieldReserve(uint256 assets) external {
        USDC.safeTransferFrom(msg.sender, address(this), assets);
        emit YieldReserveFunded(msg.sender, assets);
    }

    /// @inheritdoc IEulerLendingStrategy
    function deposit(uint256 assets) external onlyVault {
        _accrue();
        uint256 balanceBefore = USDC.balanceOf(address(this));
        USDC.safeTransferFrom(msg.sender, address(this), assets);
        uint256 received = USDC.balanceOf(address(this)) - balanceBefore;
        accountedAssets += received;
    }

    /// @inheritdoc IEulerLendingStrategy
    function withdraw(uint256 assets) external onlyVault returns (uint256 withdrawn) {
        _accrue();
        withdrawn = _withdraw(assets, msg.sender);
    }

    /// @notice Additive withdraw helper for vaults that support explicit recipients.
    function withdraw(uint256 assets, address to) external onlyVault returns (uint256 withdrawn) {
        if (to == address(0)) revert ZeroAddress();
        _accrue();
        withdrawn = _withdraw(assets, to);
    }

    /// @inheritdoc IEulerLendingStrategy
    function harvest() external onlyVault returns (uint256 yieldAssets) {
        harvestCount += 1;
        yieldAssets = _accrue();
    }

    /// @inheritdoc IEulerLendingStrategy
    function totalAssets() external view returns (uint256 assets) {
        assets = accountedAssets;
    }

    /// @notice Current APR after optional utilization adjustment.
    function effectiveAprBps() public view returns (uint256 aprBps) {
        aprBps = _effectiveAprBps();
    }

    /// @notice Yield accrued since last update, capped by prefunded reserve liquidity.
    /// @dev This value is informational until a state-changing call realizes it.
    function pendingYield() public view returns (uint256 yieldAssets) {
        if (accountedAssets == 0 || block.timestamp <= lastUpdated) return 0;

        uint256 elapsed = block.timestamp - lastUpdated;
        uint256 rawYield = accountedAssets * _effectiveAprBps() * elapsed / BPS / SECONDS_PER_YEAR;
        uint256 reserve = availableYieldReserve();

        yieldAssets = rawYield > reserve ? reserve : rawYield;
    }

    /// @notice USDC held above accounted assets. This reserve backs future mock yield.
    function availableYieldReserve() public view returns (uint256 reserve) {
        uint256 balance = USDC.balanceOf(address(this));
        reserve = balance > accountedAssets ? balance - accountedAssets : 0;
    }

    function _accrue() internal returns (uint256 yieldAssets) {
        if (block.timestamp > lastUpdated && accountedAssets > 0) {
            uint256 elapsed = block.timestamp - lastUpdated;
            uint256 rawYield = accountedAssets * _effectiveAprBps() * elapsed / BPS / SECONDS_PER_YEAR;
            uint256 reserve = availableYieldReserve();

            yieldAssets = rawYield > reserve ? reserve : rawYield;

            if (yieldAssets > 0) {
                accountedAssets += yieldAssets;
            }
        }

        lastUpdated = block.timestamp;
        emit YieldAccrued(yieldAssets, accountedAssets);
    }

    function _withdraw(uint256 assets, address to) internal returns (uint256 withdrawn) {
        uint256 balance = USDC.balanceOf(address(this));

        withdrawn = assets;
        if (withdrawn > accountedAssets) withdrawn = accountedAssets;
        if (withdrawn > balance) withdrawn = balance;

        accountedAssets -= withdrawn;
        USDC.safeTransfer(to, withdrawn);
    }

    function _setVault(address vault_) internal {
        if (vault_ == address(0)) revert ZeroAddress();
        vault = vault_;
        emit VaultUpdated(vault_);
    }

    function _setYieldParameters(
        uint256 baseAprBps_,
        bool utilizationModelEnabled_,
        uint256 utilizationBps_,
        uint256 utilizationAdjustmentBps_
    ) internal {
        if (baseAprBps_ > MAX_APR_BPS || utilizationAdjustmentBps_ > MAX_APR_BPS || utilizationBps_ > BPS) {
            revert InvalidBasisPoints();
        }

        baseAprBps = baseAprBps_;
        utilizationModelEnabled = utilizationModelEnabled_;
        utilizationBps = utilizationBps_;
        utilizationAdjustmentBps = utilizationAdjustmentBps_;

        emit YieldParametersUpdated(baseAprBps_, utilizationModelEnabled_, utilizationBps_, utilizationAdjustmentBps_);
    }

    function _effectiveAprBps() internal view returns (uint256 aprBps) {
        aprBps = baseAprBps;

        if (utilizationModelEnabled) {
            aprBps += utilizationAdjustmentBps * utilizationBps / BPS;
        }

        if (aprBps > MAX_APR_BPS) {
            aprBps = MAX_APR_BPS;
        }
    }

    // Testnet-safety summary:
    // This model is deterministic because yield depends only on configured APR,
    // utilization inputs, elapsed seconds, and accountedAssets. It is self-contained
    // because it never calls external lending protocols. It remains withdrawable
    // because realized yield is capped to prefunded USDC reserves already held here.
}
