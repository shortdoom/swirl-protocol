// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;

interface IUniswapV2SlidingOracle {
    function current(
        address tokenIn,
        uint256 amountIn,
        address tokenOut
    ) external view returns (uint256);
}
