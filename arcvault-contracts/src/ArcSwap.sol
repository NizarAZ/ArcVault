// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Owner-seeded Arc Testnet AMM for swapping existing Arc assets into USDC.
/// @dev V1 is intentionally simple: supported token pools are funded by the owner,
///      have no public LP shares, and use deterministic constant-product math.
contract ArcSwap is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant FEE_BPS = 30;

    error ZeroAddress();
    error ZeroAmount();
    error UnsupportedToken();
    error DeadlineExpired();
    error InsufficientOutput();
    error InsufficientReserves();

    struct Pool {
        uint256 tokenReserve;
        uint256 usdcReserve;
        uint8 tokenDecimals;
        bool supported;
    }

    IERC20 public immutable USDC;

    mapping(address token => Pool pool) private pools;
    address[] private supportedTokens;

    event LiquidityAdded(address indexed token, uint256 tokenAmount, uint256 usdcAmount);
    event LiquidityRemoved(address indexed token, uint256 tokenAmount, uint256 usdcAmount, address indexed to);
    event Swapped(
        address indexed user,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 usdcOut,
        address indexed to
    );

    constructor(address usdc_, address[] memory supportedTokens_, address initialOwner_) Ownable(initialOwner_) {
        if (usdc_ == address(0) || initialOwner_ == address(0)) revert ZeroAddress();
        USDC = IERC20(usdc_);

        for (uint256 index = 0; index < supportedTokens_.length; index += 1) {
            _supportToken(supportedTokens_[index]);
        }
    }

    function addLiquidity(address token, uint256 tokenAmount, uint256 usdcAmount) external onlyOwner nonReentrant {
        if (tokenAmount == 0 || usdcAmount == 0) revert ZeroAmount();

        Pool storage pool = _requirePool(token);
        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenAmount);
        USDC.safeTransferFrom(msg.sender, address(this), usdcAmount);

        pool.tokenReserve += tokenAmount;
        pool.usdcReserve += usdcAmount;

        emit LiquidityAdded(token, tokenAmount, usdcAmount);
    }

    function removeLiquidity(address token, uint256 tokenAmount, uint256 usdcAmount, address to)
        external
        onlyOwner
        nonReentrant
    {
        if (to == address(0)) revert ZeroAddress();
        if (tokenAmount == 0 && usdcAmount == 0) revert ZeroAmount();

        Pool storage pool = _requirePool(token);
        if (pool.tokenReserve < tokenAmount || pool.usdcReserve < usdcAmount) revert InsufficientReserves();

        pool.tokenReserve -= tokenAmount;
        pool.usdcReserve -= usdcAmount;

        if (tokenAmount > 0) IERC20(token).safeTransfer(to, tokenAmount);
        if (usdcAmount > 0) USDC.safeTransfer(to, usdcAmount);

        emit LiquidityRemoved(token, tokenAmount, usdcAmount, to);
    }

    function getAmountOut(address tokenIn, uint256 amountIn) external view returns (uint256 usdcOut) {
        Pool storage pool = _requirePool(tokenIn);
        usdcOut = _getAmountOut(amountIn, pool.tokenReserve, pool.usdcReserve);
    }

    function getReserves(address token) external view returns (uint256 tokenReserve, uint256 usdcReserve) {
        Pool storage pool = _requirePool(token);
        return (pool.tokenReserve, pool.usdcReserve);
    }

    function tokenDecimals(address token) external view returns (uint8) {
        Pool storage pool = _requirePool(token);
        return pool.tokenDecimals;
    }

    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokens;
    }

    function swapExactTokensForUSDC(
        address tokenIn,
        uint256 amountIn,
        uint256 minUsdcOut,
        address to,
        uint256 deadline
    ) external nonReentrant returns (uint256 usdcOut) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (to == address(0)) revert ZeroAddress();
        if (amountIn == 0) revert ZeroAmount();

        Pool storage pool = _requirePool(tokenIn);
        usdcOut = _getAmountOut(amountIn, pool.tokenReserve, pool.usdcReserve);
        if (usdcOut < minUsdcOut) revert InsufficientOutput();
        if (usdcOut == 0 || usdcOut > pool.usdcReserve) revert InsufficientReserves();

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        pool.tokenReserve += amountIn;
        pool.usdcReserve -= usdcOut;

        USDC.safeTransfer(to, usdcOut);

        emit Swapped(msg.sender, tokenIn, amountIn, usdcOut, to);
    }

    function _supportToken(address token) private {
        if (token == address(0) || token == address(USDC)) revert ZeroAddress();
        if (pools[token].supported) return;

        pools[token] = Pool({
            tokenReserve: 0,
            usdcReserve: 0,
            tokenDecimals: IERC20Metadata(token).decimals(),
            supported: true
        });
        supportedTokens.push(token);
    }

    function _requirePool(address token) private view returns (Pool storage pool) {
        pool = pools[token];
        if (!pool.supported) revert UnsupportedToken();
    }

    function _getAmountOut(uint256 amountIn, uint256 tokenReserve, uint256 usdcReserve)
        private
        pure
        returns (uint256)
    {
        if (amountIn == 0) revert ZeroAmount();
        if (tokenReserve == 0 || usdcReserve == 0) revert InsufficientReserves();

        uint256 amountInWithFee = amountIn * (BPS - FEE_BPS);
        return (amountInWithFee * usdcReserve) / ((tokenReserve * BPS) + amountInWithFee);
    }
}
