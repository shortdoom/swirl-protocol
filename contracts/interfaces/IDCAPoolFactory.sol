// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;
import "../libs/Types.sol";

/**
 * @title DCA Pool Factory Interface
 * @author Tony Snark
 */
interface IDCAPoolFactory {
    /**
     * @notice Emitted when a new pool is created
     * @param baseToken Token to sell
     * @param orderToken Token to buy
     * @param period How often it should execute (see Types)
     * @param baseTokenScalingFactor Scaling factor for base token quantities
     * @param vault vault's address for the new pool
     */
    event PoolCreated(
        address indexed baseToken,
        address indexed orderToken,
        Types.Period period,
        uint256 baseTokenScalingFactor,
        address vault
    );

    /**
     * @notice Emitted when a new base token is enabled
     * @param token Token enabled
     */
    event BaseTokenEnabled(address token);

    /**
     * @notice Emitted when a new order token is enabled
     * @param token Token enabled
     */
    event OrderTokenEnabled(address token);

    /**
     * @notice Emitted when a new buy strategy is added
     * @param orderToken Order token for the buy strategy (0 if this the default strategy)
     * @param buyStrategy Buy strategy address
     */
    event BuyStrategyModified(address orderToken, address buyStrategy);

    /**
     * @notice Creates a new DCA pool
     * @param baseToken Token to sell
     * @param orderToken Token to buy
     * @param period How often it should execute (see Types)
     * @param baseTokenScalingFactor Scale factor for base token quantities
     * @return Created vault's address
     */
    function createPool(
        address baseToken,
        address orderToken,
        Types.Period period,
        uint256 baseTokenScalingFactor
    ) external returns (address);

    /**
     * @notice Set the buy strategy used by newly create pools
     * @dev This does not retrospectively changes the buy strategy for existing pools
     *      Only admins can call this
     * @param orderToken Order token the buy strategy will be used for
     * @param buyStrategy Buy strategy to be used
     */
    function setBuyStrategy(address orderToken, address buyStrategy) external;

    /**
     * @notice Set the buy strategy used by newly create pools
     * @dev This does not retrospectively changes the buy strategy for existing pools
     *      Only admins can call this
     * @param defaultBuyStrategy Default buy strategy to be used
     */
    function setDefaultBuyStrategy(address defaultBuyStrategy) external;

    /**
     * @notice Enables a token to be used as base in new pools
     * @param baseToken Base token to be enabled
     */
    function enableBaseToken(address baseToken) external;

    /**
     * @notice Enables a token to be used as order in new pools
     * @param orderToken Base token to be enabled
     */
    function enableOrderToken(address orderToken) external;
}
