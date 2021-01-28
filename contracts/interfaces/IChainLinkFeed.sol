// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;

/**
 * @title Chainlink aggregator feed interface
 */

interface IChainLinkFeed {
    function latestAnswer() external view returns (int256);

    function decimals() external view returns (uint8);
}
