// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;

import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../interfaces/IOneInch.sol";
import "../interfaces/IBuyStrategy.sol";
import "../interfaces/IChainLinkFeed.sol";
import "../libs/PriceFeedConsumer.sol";

/**
 * @title Buy Strategy Interface
 * @author Tony Snark
 * @dev Simple buy order strategy with smart order routing provided by
 *      1Inch. Front running/slippage protection is implemented using price feeds
 *      where available.
 */
contract OneInchBuyStrategy is IBuyStrategy, PriceFeedConsumer {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    IOneInch internal _oneInch = IOneInch(0x50FDA034C0Ce7a8f7EFDAebDA7Aa7cA21CC1267e);
    uint16 internal _parts = 3;
    uint256 internal _slippageToleranceInBps = 50;

    /**
     * @notice Swaps base token into order token
     * @param onBehalfOf Recipient of purchased tokens
     * @param sellAmount Maximum amount of base token allowed to be swapped
     * @param sellToken Token to sell
     * @param buyToken Token to buy
     * @return True if the amount was purchased
     */
    function buy(
        address onBehalfOf,
        uint256 sellAmount,
        address sellToken,
        address buyToken
    ) public virtual override returns (bool) {
        bool performed = _swap(onBehalfOf, sellAmount, sellToken, buyToken);

        if (performed) {
            // Send back purchased token
            IERC20(buyToken).safeTransfer(onBehalfOf, IERC20(buyToken).balanceOf(address(this)));
        }
        return performed;
    }

    /**
     * @notice Swaps base token into order token
     * @param sellAmount Maximum amount of base token allowed to be swapped
     * @param sellToken Token to sell
     * @param buyToken Token to buy
     * @return True if the swap was performed
     */
    function _swap(
        address onBehalfOf,
        uint256 sellAmount,
        address sellToken,
        address buyToken
    ) internal returns (bool) {
        require(sellAmount > 0, "Amount must be positive");
        // Get needed quantity
        IERC20(sellToken).safeTransferFrom(onBehalfOf, address(this), sellAmount);

        (bool _canBuy, uint256 returnAmount, uint256[] memory distribution, uint256 minimumAdmissibleAmount) =
            _canBuyOnOneInch(sellAmount, sellToken, buyToken);

        if (_canBuy) {
            _oneInch.swap(sellToken, buyToken, sellAmount, returnAmount, distribution, 0);
            return true;
        } else {
            emit SlippageLimitBreached(sellToken, sellAmount, buyToken, returnAmount, minimumAdmissibleAmount);
            return false;
        }
    }

    /**
     * @notice Checks whether the purchase is currently possible
     * @param sellAmount Maximum amount of base token allowed to be swapped
     * @param sellToken Token to sell
     * @param buyToken Token to buy
     * @return True if the swap can be performed
     *         The expected purchase amount
     *         The 1Inch distribution
     */
    function _canBuyOnOneInch(
        uint256 sellAmount,
        address sellToken,
        address buyToken
    )
        internal
        view
        returns (
            bool,
            uint256 returnAmount,
            uint256[] memory distribution,
            uint256 minimumAdmissibleAmount
        )
    {
        // Get expected return
        (returnAmount, distribution) = _oneInch.getExpectedReturn(sellToken, buyToken, sellAmount, _parts, 0);
        // Calculate minimum return based on current price and slippage tolerance
        minimumAdmissibleAmount = super
            .expectedAmountWithOraclePrice(sellToken, buyToken, sellAmount)
            .mul(10000 - _slippageToleranceInBps)
            .div(10000);
        // If slippage within bounds swap is possible
        return (minimumAdmissibleAmount < returnAmount, returnAmount, distribution, minimumAdmissibleAmount);
    }

    /**
     * @notice Checks whether the purchase is currently possible
     * @param sellAmount Maximum amount of base token allowed to be swapped
     * @param sellToken Token to sell
     * @param buyToken Token to buy
     * @return _canBuy True if the purchase can be performed
     */
    function canBuy(
        uint256 sellAmount,
        address sellToken,
        address buyToken
    ) external view override returns (bool _canBuy) {
        (_canBuy, , , ) = _canBuyOnOneInch(sellAmount, sellToken, buyToken);
        return _canBuy;
    }

    /**
     * @notice Enable base token for swaps
     * @param sellToken Token to be enabled
     */
    function enableSellToken(address sellToken) external override onlyAdmin {
        IERC20(sellToken).safeApprove(address(_oneInch), uint256(-1));
    }

    /**
     * @notice Set slippage tolerance
     * @param slippageToleranceInBps Tolerance in bps
     */
    function setSlippageToleranceInBps(uint256 slippageToleranceInBps) external onlyAdmin {
        require(slippageToleranceInBps <= 10000, "Tolerance max value 10000");
        _slippageToleranceInBps = slippageToleranceInBps;
    }

    /**
     * @notice Set 1 inch parts for split calculation
     * @param parts Number of parts
     */
    function setParts(uint16 parts) external onlyAdmin {
        require(parts <= 10, "Max parts 10");
        _parts = parts;
    }
}
