// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ArcVault, IEulerLendingStrategy} from "../src/ArcVault.sol";
import {yUSDC} from "../src/yUSDC.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract MockEulerStrategy is IEulerLendingStrategy {
    using SafeERC20 for IERC20;

    MockUSDC public immutable usdc;
    uint256 public accountedAssets;

    constructor(MockUSDC usdc_) {
        usdc = usdc_;
    }

    function deposit(uint256 assets) external {
        accountedAssets += assets;
        IERC20(address(usdc)).safeTransferFrom(msg.sender, address(this), assets);
    }

    function withdraw(uint256 assets) external returns (uint256 withdrawn) {
        withdrawn = assets;
        accountedAssets -= assets;
        IERC20(address(usdc)).safeTransfer(msg.sender, withdrawn);
    }

    function harvest() external returns (uint256 yieldAssets) {
        uint256 balance = usdc.balanceOf(address(this));
        yieldAssets = balance > accountedAssets ? balance - accountedAssets : 0;
        accountedAssets = balance;
    }

    function totalAssets() external view returns (uint256 assets) {
        assets = usdc.balanceOf(address(this));
    }

    function addYield(uint256 amount) external {
        usdc.mint(address(this), amount);
    }
}

contract ArcVaultTest is Test {
    MockUSDC internal usdc;
    yUSDC internal receiptToken;
    MockEulerStrategy internal strategy;
    ArcVault internal vault;

    address internal user = address(0xA11CE);
    address internal keeper = address(0xB0B);

    function setUp() public {
        usdc = new MockUSDC();
        receiptToken = new yUSDC(address(this), 6);
        strategy = new MockEulerStrategy(usdc);
        vault = new ArcVault(IERC20(address(usdc)), receiptToken, keeper, address(strategy), address(this));
        receiptToken.setVault(address(vault));

        usdc.mint(user, 1_000e6);
        vm.prank(user);
        usdc.approve(address(vault), type(uint256).max);
    }

    function testDepositMintsShares() public {
        vm.prank(user);
        uint256 shares = vault.deposit(100e6);

        assertEq(shares, 100e6);
        assertEq(receiptToken.balanceOf(user), 100e6);
        assertEq(vault.totalAssets(), 100e6);
        assertEq(usdc.balanceOf(user), 900e6);
    }

    function testWithdrawBurnsSharesAndReturnsAssets() public {
        vm.startPrank(user);
        vault.deposit(100e6);
        uint256 assets = vault.withdraw(40e6);
        vm.stopPrank();

        assertEq(assets, 40e6);
        assertEq(receiptToken.balanceOf(user), 60e6);
        assertEq(vault.totalAssets(), 60e6);
        assertEq(usdc.balanceOf(user), 940e6);
    }

    function testShareMathAfterYield() public {
        vm.prank(user);
        vault.deposit(100e6);

        strategy.addYield(10e6);

        assertEq(vault.totalAssets(), 110e6);
        assertEq(vault.convertToAssets(100e6), 110e6);
        assertEq(vault.convertToShares(11e6), 10e6);
    }

    function testCompoundOnlyKeeper() public {
        vm.prank(user);
        vault.deposit(100e6);
        strategy.addYield(5e6);

        vm.expectRevert(ArcVault.KeeperOnly.selector);
        vault.compound();

        vm.prank(keeper);
        uint256 yieldAssets = vault.compound();

        assertEq(yieldAssets, 5e6);
    }
}
