// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;

import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../interfaces/IOneInch.sol";
import "../interfaces/IBuyStrategy.sol";
import "../interfaces/IChainLinkFeed.sol";
import "../libs/DCAAccessControl.sol";

import "hardhat/console.sol";

/**
 * @title ChainLink Price Feed Consumer Contract
 * @author Tony Snark
 * @notice This contract provides facilities to evaluate the conversion quantity of a token pair
 *         based on the current price
 * @dev This implementation uses chainlink oracles
 *      Decimals may vary in both feed result and/or the token
 *      The adjustment depends on whether the sell token is the base or quote currency in the feed's pair
 *      - Base:  QB = QS * P * 10 ^ (SD-FD-BD)
 *      - Quote: QB = (QS / P) * 10 ^ -(SD-FD-BD)
 *      Where:
 *      - QB: Buy Token Quantity
 *      - QS: Sell Token Quantity
 *      - P : Price
 *      - FD: Decimals in the feed result
 *      - SD: Decimals in the sell token
 *      - BD: Decimals in the buy token
 */
contract PriceFeedConsumer is DCAAccessControl {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    struct FeedMetadata {
        IChainLinkFeed feed;
        bool isBase;
        int16 adjustment;
    }

    mapping(address => mapping(address => FeedMetadata)) public feedByPair;

    /**
     * @notice Calculate the expected amount of buy token with oracle latest price
     * @param sellToken Token to pay with
     * @param buyToken Token to buy
     * @param sellAmount Amount of sell token to spend
     * @return Expected amount of buy token at latest price
     */
    function expectedAmountWithOraclePrice(
        address sellToken,
        address buyToken,
        uint256 sellAmount
    ) public view returns (uint256) {
        FeedMetadata memory meta = feedByPair[sellToken][buyToken];
        // If feed not available we skip
        if (address(meta.feed) == address(0)) return 0;
        uint256 latestPrice = uint256(meta.feed.latestAnswer());
        // See contract description
        if (meta.adjustment >= 0) {
            uint256 adjustedCost = sellAmount.mul(10**uint256(meta.adjustment));
            return meta.isBase ? adjustedCost.mul(latestPrice) : adjustedCost.div(latestPrice);
        } else {
            return
                meta.isBase
                    ? sellAmount.mul(latestPrice).div(10**uint256(-meta.adjustment))
                    : sellAmount.div(latestPrice).div(10**uint256(-meta.adjustment));
        }
    }

    /**
     * @notice Add a feed for the token provided
     * @dev We pass decimals as ERC20 makes decimal() optional so we aren't sure
     *      we can retrieve it from the token.
     * @param base Base token in the feed pair
     * @param quote Quote token in the feed pair
     * @param feed Feed
     * @param sellTokenDecimals Number of decimals in the base token.
     * @param quoteTokenDecimals Number of decimals in the quote token.
     */
    function addFeed(
        address base,
        address quote,
        IChainLinkFeed feed,
        uint256 sellTokenDecimals,
        uint256 quoteTokenDecimals
    ) public virtual onlyAdmin {
        // See contract description
        int16 adjustment = int16(quoteTokenDecimals) - int16(sellTokenDecimals) - int16(feed.decimals());
        // Add direct pair to feed mapping
        feedByPair[base][quote] = FeedMetadata(feed, true, adjustment);
        // Add inverse pair to feed mapping
        feedByPair[quote][base] = FeedMetadata(feed, false, -adjustment);
    }
}
