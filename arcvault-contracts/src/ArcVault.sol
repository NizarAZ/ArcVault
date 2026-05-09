// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {yUSDC} from "./yUSDC.sol";

interface IEulerLendingStrategy {
    function deposit(uint256 assets) external;
    function withdraw(uint256 assets) external returns (uint256 withdrawn);
    function harvest() external returns (uint256 yieldAssets);
    function totalAssets() external view returns (uint256 assets);
}

contract ArcVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error ZeroShares();
    error KeeperOnly();
    error StrategyNotSet();
    error InsufficientLiquidity();

    IERC20 public immutable USDC;
    yUSDC public immutable receiptToken;
    IEulerLendingStrategy public strategy;
    address public keeper;

    event Deposited(address indexed user, uint256 assets, uint256 shares);
    event Withdrawn(address indexed user, uint256 assets, uint256 shares);
    event Compounded(address indexed keeper, uint256 yieldAssets, uint256 totalAssetsAfter);
    event KeeperUpdated(address indexed keeper);
    event StrategyUpdated(address indexed strategy);

    constructor(
        IERC20 usdc_,
        yUSDC receiptToken_,
        address keeper_,
        address strategy_,
        address initialOwner_
    ) Ownable(initialOwner_) {
        if (address(usdc_) == address(0) || address(receiptToken_) == address(0) || initialOwner_ == address(0)) {
            revert ZeroAddress();
        }

        USDC = usdc_;
        receiptToken = receiptToken_;
        keeper = keeper_;

        if (strategy_ != address(0)) {
            strategy = IEulerLendingStrategy(strategy_);
            emit StrategyUpdated(strategy_);
        }

        emit KeeperUpdated(keeper_);
    }

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert KeeperOnly();
        _;
    }

    function deposit(uint256 amount) external nonReentrant returns (uint256 shares) {
        if (amount == 0) revert ZeroAmount();

        uint256 assetsBefore = totalAssets();
        shares = _convertToShares(amount, assetsBefore, receiptToken.totalSupply());
        if (shares == 0) revert ZeroShares();

        USDC.safeTransferFrom(msg.sender, address(this), amount);
        receiptToken.mint(msg.sender, shares);
        _deployIdle();

        emit Deposited(msg.sender, amount, shares);
    }

    function withdraw(uint256 shares) external nonReentrant returns (uint256 assets) {
        if (shares == 0) revert ZeroShares();

        assets = convertToAssets(shares);
        if (assets == 0) revert ZeroAmount();

        receiptToken.burn(msg.sender, shares);
        _pullAssets(assets);

        USDC.safeTransfer(msg.sender, assets);
        emit Withdrawn(msg.sender, assets, shares);
    }

    function compound() external nonReentrant onlyKeeper returns (uint256 yieldAssets) {
        IEulerLendingStrategy strategy_ = strategy;
        if (address(strategy_) == address(0)) revert StrategyNotSet();

        yieldAssets = strategy_.harvest();
        _deployIdle();

        uint256 assetsAfter = totalAssets();
        emit Compounded(msg.sender, yieldAssets, assetsAfter);
    }

    function totalAssets() public view returns (uint256 assets) {
        assets = USDC.balanceOf(address(this));

        IEulerLendingStrategy strategy_ = strategy;
        if (address(strategy_) != address(0)) {
            assets += strategy_.totalAssets();
        }
    }

    function convertToShares(uint256 assets) public view returns (uint256 shares) {
        shares = _convertToShares(assets, totalAssets(), receiptToken.totalSupply());
    }

    function convertToAssets(uint256 shares) public view returns (uint256 assets) {
        uint256 supply = receiptToken.totalSupply();
        if (supply == 0) return shares;
        assets = shares * totalAssets() / supply;
    }

    function setKeeper(address keeper_) external onlyOwner {
        keeper = keeper_;
        emit KeeperUpdated(keeper_);
    }

    function setStrategy(address strategy_) external onlyOwner {
        if (strategy_ == address(0)) revert ZeroAddress();
        strategy = IEulerLendingStrategy(strategy_);
        emit StrategyUpdated(strategy_);
    }

    function deployIdle() external onlyOwner nonReentrant {
        _deployIdle();
    }

    function _convertToShares(uint256 assets, uint256 totalManagedAssets, uint256 supply) internal pure returns (uint256) {
        if (supply == 0 || totalManagedAssets == 0) return assets;
        return assets * supply / totalManagedAssets;
    }

    function _deployIdle() internal {
        IEulerLendingStrategy strategy_ = strategy;
        if (address(strategy_) == address(0)) return;

        uint256 idle = USDC.balanceOf(address(this));
        if (idle == 0) return;

        USDC.forceApprove(address(strategy_), idle);
        strategy_.deposit(idle);
    }

    function _pullAssets(uint256 assets) internal {
        uint256 localBalance = USDC.balanceOf(address(this));
        if (localBalance >= assets) return;

        IEulerLendingStrategy strategy_ = strategy;
        if (address(strategy_) == address(0)) revert StrategyNotSet();

        strategy_.withdraw(assets - localBalance);
        if (USDC.balanceOf(address(this)) < assets) revert InsufficientLiquidity();
    }
}
