// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {ArcSwap} from "../src/ArcSwap.sol";

contract MockToken is ERC20 {
    uint8 private immutable tokenDecimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        tokenDecimals = decimals_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public view override returns (uint8) {
        return tokenDecimals;
    }
}

contract ArcSwapTest is Test {
    MockToken internal usdc;
    MockToken internal eurc;
    MockToken internal cirbtc;
    ArcSwap internal swapper;

    address internal owner = address(0xA11CE);
    address internal user = address(0xB0B);

    function setUp() public {
        vm.warp(100);

        usdc = new MockToken("USD Coin", "USDC", 6);
        eurc = new MockToken("Euro Coin", "EURC", 6);
        cirbtc = new MockToken("Circle Bitcoin", "cirBTC", 8);

        address[] memory tokens = new address[](2);
        tokens[0] = address(eurc);
        tokens[1] = address(cirbtc);

        vm.prank(owner);
        swapper = new ArcSwap(address(usdc), tokens, owner);

        usdc.mint(owner, 100_000e6);
        eurc.mint(owner, 100_000e6);
        cirbtc.mint(owner, 10e8);
        eurc.mint(user, 1_000e6);
        cirbtc.mint(user, 1e8);

        vm.startPrank(owner);
        usdc.approve(address(swapper), type(uint256).max);
        eurc.approve(address(swapper), type(uint256).max);
        cirbtc.approve(address(swapper), type(uint256).max);
        swapper.addLiquidity(address(eurc), 10_000e6, 11_000e6);
        swapper.addLiquidity(address(cirbtc), 2e8, 80_000e6);
        vm.stopPrank();
    }

    function testOwnerCanSeedPools() public {
        (uint256 eurcReserve, uint256 eurcUsdcReserve) = swapper.getReserves(address(eurc));
        (uint256 btcReserve, uint256 btcUsdcReserve) = swapper.getReserves(address(cirbtc));

        assertEq(eurcReserve, 10_000e6);
        assertEq(eurcUsdcReserve, 11_000e6);
        assertEq(btcReserve, 2e8);
        assertEq(btcUsdcReserve, 80_000e6);
        assertEq(swapper.tokenDecimals(address(cirbtc)), 8);
    }

    function testNonOwnerCannotAddOrRemoveLiquidity() public {
        vm.startPrank(user);
        eurc.approve(address(swapper), type(uint256).max);
        usdc.approve(address(swapper), type(uint256).max);

        vm.expectRevert();
        swapper.addLiquidity(address(eurc), 100e6, 100e6);

        vm.expectRevert();
        swapper.removeLiquidity(address(eurc), 100e6, 100e6, user);
        vm.stopPrank();
    }

    function testGetAmountOutMatchesConstantProductMathWithFee() public {
        uint256 amountIn = 100e6;
        uint256 amountInWithFee = amountIn * 9_970;
        uint256 expected = (amountInWithFee * 11_000e6) / ((10_000e6 * 10_000) + amountInWithFee);

        assertEq(swapper.getAmountOut(address(eurc), amountIn), expected);
    }

    function testSwapTransfersInputAndOutputsUSDC() public {
        uint256 amountIn = 100e6;
        uint256 expectedOut = swapper.getAmountOut(address(eurc), amountIn);
        uint256 userUsdcBefore = usdc.balanceOf(user);

        vm.startPrank(user);
        eurc.approve(address(swapper), amountIn);
        uint256 usdcOut = swapper.swapExactTokensForUSDC(address(eurc), amountIn, expectedOut, user, block.timestamp + 1);
        vm.stopPrank();

        assertEq(usdcOut, expectedOut);
        assertEq(eurc.balanceOf(user), 900e6);
        assertEq(usdc.balanceOf(user), userUsdcBefore + expectedOut);
    }

    function testReservesUpdateAfterSwap() public {
        uint256 amountIn = 100e6;
        uint256 expectedOut = swapper.getAmountOut(address(eurc), amountIn);

        vm.startPrank(user);
        eurc.approve(address(swapper), amountIn);
        swapper.swapExactTokensForUSDC(address(eurc), amountIn, 0, user, block.timestamp + 1);
        vm.stopPrank();

        (uint256 tokenReserve, uint256 usdcReserve) = swapper.getReserves(address(eurc));
        assertEq(tokenReserve, 10_100e6);
        assertEq(usdcReserve, 11_000e6 - expectedOut);
    }

    function testRevertsOnUnsupportedToken() public {
        MockToken unsupported = new MockToken("Other", "OTHER", 18);

        vm.expectRevert(ArcSwap.UnsupportedToken.selector);
        swapper.getAmountOut(address(unsupported), 1e18);
    }

    function testRevertsOnZeroAmountExpiredDeadlineInsufficientOutputAndReserves() public {
        vm.startPrank(user);
        eurc.approve(address(swapper), type(uint256).max);

        vm.expectRevert(ArcSwap.ZeroAmount.selector);
        swapper.swapExactTokensForUSDC(address(eurc), 0, 0, user, block.timestamp + 1);

        vm.expectRevert(ArcSwap.DeadlineExpired.selector);
        swapper.swapExactTokensForUSDC(address(eurc), 100e6, 0, user, block.timestamp - 1);

        uint256 quote = swapper.getAmountOut(address(eurc), 100e6);
        vm.expectRevert(ArcSwap.InsufficientOutput.selector);
        swapper.swapExactTokensForUSDC(address(eurc), 100e6, quote + 1, user, block.timestamp + 1);
        vm.stopPrank();

        vm.startPrank(owner);
        swapper.removeLiquidity(address(eurc), 10_000e6, 11_000e6, owner);
        vm.stopPrank();

        vm.expectRevert(ArcSwap.InsufficientReserves.selector);
        swapper.getAmountOut(address(eurc), 100e6);
    }
}
