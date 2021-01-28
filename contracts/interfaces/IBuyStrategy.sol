// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;

/**
 * @title Buy Strategy Interface
 * @author Tony Snark
 */
interface IBuyStrategy {
    event SlippageLimitBreached(
        address sellToken,
        uint256 sellAmount,
        address buyToken,
        uint256 returnAmount,
        uint256 minimumAdmissibleAmount
    );

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
    ) external returns (bool);

    /**
     * @notice Checks whether the purchase is currently possible
     * @param sellAmount Maximum amount of base token allowed to be swapped
     * @param sellToken Token to sell
     * @param buyToken Token to buy
     * @return True if the purchase can be performed
     */
    function canBuy(
        uint256 sellAmount,
        address sellToken,
        address buyToken
    ) external view returns (bool);

    /**
     * @notice Enables a token to be sold for purchases
     * @param sellToken Token to be enabled
     */
    function enableSellToken(address sellToken) external;
}
