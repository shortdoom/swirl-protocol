// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./interfaces/IGasCalculator.sol";
import "./interfaces/IChainLinkFeed.sol";
import "./libs/PriceFeedConsumer.sol";

/**
 * @title ChainLink Gas Calculator
 * @author Tony Snark
 * @notice Calculates gas cost in any supported token
 * @dev See PriceFeedConsumer for implementation details
 *
 */
contract ChainLinkGasCalculator is IGasCalculator, PriceFeedConsumer {
    using SafeMath for uint256;

    IChainLinkFeed public constant FASTGAS = IChainLinkFeed(0x169E633A2D1E6c10dD91238Ba11c4A708dfEF37C);
    // @dev Arbitrary address that represents ether in pairs
    address public constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    mapping(address => bool) private _isBase;

    /**
     * @notice Calculate the amount of token needed to pay for gas
     * @param token Token to pay with
     * @param gasQty Amount of gas to pay
     * @return Amount of token necessary to pay
     */
    function calculateTokenForGas(address token, uint256 gasQty) external view override returns (uint256) {
        uint256 gasCost = gasQty.mul(uint256(FASTGAS.latestAnswer()));
        // WETH / ETH rate is 1
        if (token == WETH) return gasCost;
        if (_isBase[token]) {
            return super.expectedAmountWithOraclePrice(ETH_ADDRESS, token, gasCost);
        } else {
            return super.expectedAmountWithOraclePrice(token, ETH_ADDRESS, gasCost);
        }
    }

    /**
     * @notice Add a feed for the token provided
     * @dev It keeps track wheter the non ETH token is
     *      base or quote in the feed's pair.
     * @param base Base token in the feed pair
     * @param quote Quote token in the feed pair
     * @param feed Feed
     * @param baseTokenDecimals Number of decimals in the base token.
     * @param quoteTokenDecimals Number of decimals in the quote token.
     */
    function addFeed(
        address base,
        address quote,
        IChainLinkFeed feed,
        uint256 baseTokenDecimals,
        uint256 quoteTokenDecimals
    ) public override onlyAdmin {
        if (base == ETH_ADDRESS) {
            _isBase[quote] = false;
        } else if (quote == ETH_ADDRESS) {
            _isBase[base] = true;
        } else {
            revert("The pair must contain ETH");
        }
        super.addFeed(base, quote, feed, baseTokenDecimals, quoteTokenDecimals);
    }
}
