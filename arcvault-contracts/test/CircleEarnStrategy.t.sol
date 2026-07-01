// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

import {ArcVault} from "../src/ArcVault.sol";
import {CircleEarnStrategy} from "../src/CircleEarnStrategy.sol";
import {yUSDC} from "../src/yUSDC.sol";

contract CircleMockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract MockEarnVault is ERC4626 {
    constructor(IERC20 asset_) ERC20("EarnKit USDC Vault", "eUSDC") ERC4626(asset_) {}
}

contract CircleEarnStrategyTest is Test {
    CircleMockUSDC internal usdc;
    MockEarnVault internal earnVault;
    yUSDC internal receiptToken;
    ArcVault internal vault;
    CircleEarnStrategy internal strategy;

    address internal user = address(0xA11CE);
    address internal keeper = address(0xB0B);

    function setUp() public {
        usdc = new CircleMockUSDC();
        earnVault = new MockEarnVault(IERC20(address(usdc)));
        receiptToken = new yUSDC(address(this), 6);
        vault = new ArcVault(IERC20(address(usdc)), receiptToken, keeper, address(0), address(this));
        receiptToken.setVault(address(vault));

        strategy = new CircleEarnStrategy(
            IERC20(address(usdc)),
            IERC4626(address(earnVault)),
            address(vault),
            address(this)
        );
        vault.setStrategy(address(strategy));

        usdc.mint(user, 1_000e6);
        vm.prank(user);
        usdc.approve(address(vault), type(uint256).max);
    }

    function testDepositSuppliesUsdcToEarnVaultAndTracksShares() public {
        vm.prank(user);
        uint256 shares = vault.deposit(100e6);

        assertEq(shares, 100e6);
        assertEq(receiptToken.balanceOf(user), 100e6);
        assertEq(strategy.trackedShares(), 100e6);
        assertEq(strategy.accountedAssets(), 100e6);
        assertEq(strategy.totalAssets(), 100e6);
        assertEq(earnVault.balanceOf(address(strategy)), 100e6);
        assertEq(usdc.balanceOf(address(earnVault)), 100e6);
        assertEq(vault.totalAssets(), 100e6);
    }

    function testWithdrawRedeemsEarnVaultSharesToArcVault() public {
        vm.prank(user);
        vault.deposit(100e6);

        vm.prank(user);
        uint256 assets = vault.withdraw(40e6);

        assertEq(assets, 40e6);
        assertEq(receiptToken.balanceOf(user), 60e6);
        assertEq(strategy.accountedAssets(), 60e6);
        assertEq(strategy.totalAssets(), 60e6);
        assertEq(earnVault.balanceOf(address(strategy)), 60e6);
        assertEq(usdc.balanceOf(user), 940e6);
        assertEq(vault.totalAssets(), 60e6);
    }

    function testHarvestRealizesEarnVaultSharePriceYield() public {
        vm.prank(user);
        vault.deposit(100e6);

        usdc.mint(address(earnVault), 10e6);

        assertEq(strategy.totalAssets(), 100e6);
        assertApproxEqAbs(strategy.pendingYield(), 10e6, 1);
        assertEq(vault.totalAssets(), 100e6);

        vm.prank(keeper);
        uint256 yieldAssets = vault.compound();

        assertApproxEqAbs(yieldAssets, 10e6, 1);
        assertEq(strategy.harvestCount(), 1);
        assertApproxEqAbs(strategy.accountedAssets(), 110e6, 1);
        assertApproxEqAbs(strategy.totalAssets(), 110e6, 1);
        assertEq(strategy.pendingYield(), 0);
        assertApproxEqAbs(vault.totalAssets(), 110e6, 1);
        assertApproxEqAbs(vault.convertToAssets(100e6), 110e6, 1);
    }

    function testTotalAssetsTracksAccountedValueUntilHarvest() public {
        vm.prank(user);
        vault.deposit(50e6);

        assertEq(strategy.totalAssets(), 50e6);

        usdc.mint(address(earnVault), 5e6);

        assertApproxEqAbs(earnVault.convertToAssets(strategy.trackedShares()), 55e6, 1);
        assertApproxEqAbs(strategy.pendingYield(), 5e6, 1);
        assertEq(strategy.totalAssets(), 50e6);

        vm.prank(keeper);
        vault.compound();

        assertApproxEqAbs(strategy.totalAssets(), 55e6, 1);
    }

    function testConstructorRejectsNonUsdcEarnVaultAsset() public {
        CircleMockUSDC otherAsset = new CircleMockUSDC();
        MockEarnVault wrongEarnVault = new MockEarnVault(IERC20(address(otherAsset)));

        vm.expectRevert(
            abi.encodeWithSelector(
                CircleEarnStrategy.InvalidEarnVaultAsset.selector,
                address(usdc),
                address(otherAsset)
            )
        );
        new CircleEarnStrategy(
            IERC20(address(usdc)),
            IERC4626(address(wrongEarnVault)),
            address(vault),
            address(this)
        );
    }
}
