// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;
import "../libs/Types.sol";

/**
 * @title DCA Configuration Interface
 * @author Tony Snark
 */
interface IDCAPoolRegister {
    event PoolEvaluationFailed(address indexed pool, bytes reason);

    /**
     * @notice Insert a pool into the register
     * @param baseToken Token to sell
     * @param orderToken Token to buy
     * @param period How often it should execute (see Types)
     * @param pool Pool address
     */
    function registerPool(
        address baseToken,
        address orderToken,
        Types.Period period,
        address payable pool
    ) external;

    /**
     * @notice Evaluates all pools provided
     * @param poolsToEvaluate Pools to be evaluated
     */
    function evaluatePoolsAsExecutor(address[] calldata poolsToEvaluate) external;

    /**
     * @notice Evaluates all pools provided
     * @param poolsToEvaluate Pools to be evaluated
     */
    function evaluatePoolsAsKeeper(address[] calldata poolsToEvaluate) external;

    /**
     * @notice Returns all pools that are ready to be evaluated
     * @return Pools that are ready
     */
    function readyPools() external view returns (address payable[] memory);

    /**
     * @notice Returns the pool identified by the arguments provided
     * @param baseToken Token to sell
     * @param orderToken Token to buy
     * @param period How often it should execute (see Types)
     * @return All user's settings
     */
    function getPool(
        address baseToken,
        address orderToken,
        Types.Period period
    ) external returns (address);
}
