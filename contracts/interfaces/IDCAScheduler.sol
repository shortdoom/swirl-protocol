// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "../libs/Types.sol";
import "./IGasCalculator.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title DCA Pool Interface
 * @author Tony Snark
 */
interface IDCAScheduler {
    /**
     * @notice Emitted when a pool execution is successfully evaluated
     * @param baseTokenQty Amount to sell
     * @param orderTokenQty Amount to buy
     * @param costs Evaluation cost in order token
     * @param nextEvaluationTime Minimum timestamp for next evaluation
     */
    event PoolEvaluated(uint256 baseTokenQty, uint256 orderTokenQty, uint256 costs, uint256 nextEvaluationTime);

    /**
     * @notice Emitted when the protocol fees are updated
     * @param newFees Fees to charge
     */
    event FeesUpdated(uint16 newFees);

    /**
     * @notice Emitted when the protocol fees recipient is updated
     * @param newRecipient Fees Recipient
     */
    event FeesRecipientUpdated(address newRecipient);

    /**
     * @notice Set fees charged by the protocol. Maximum 3%
     * @dev Fees are expressed in BPS (i.e. 100 is 1%).
     * @param feesInBPS Fees to charge
     */
    function setFeesInBPS(uint16 feesInBPS) external;

    /**
     * @notice Set recipient for fees
     * @param feesRecipient Fees to charge
     */
    function setFeesRecipient(address feesRecipient) external;

    /**
     * @notice Adds a pool to the scheduler
     * @param parameters Parameters of the pool to be added
     */
    function addPool(Types.DCAPoolParameters calldata parameters) external;

    /**
     * @notice Edit the schedules for a pool
     * @dev Schedules are the quantity to be executed for each evaliation cycle
     *      In this method we specify a quantity to be removed from a range
     *      and a quantity to be added to another range.
     *      This is because a schedule change can be both in quantity per cycle
     *      and number of cycles
     * @param vaultAddress Address of the vault, this schedules refers to
     * @param previousQty Quantity to be removed starting from the current cycle
     * @param previousEndCycle Last cycles (exlusive) for which removing the quantity above
     * @param newQty Quantity to be added starting from the current cycle
     * @param newEndCycle Last cycles (exlusive) for which adding the quantity above
     */
    function editSchedule(
        address vaultAddress,
        uint256 previousQty,
        uint256 previousEndCycle,
        uint256 newQty,
        uint256 newEndCycle
    ) external;

    /**
     * @notice Performs an evaluation to effect a swap
     * @param vaultAddress Vault address for the pool to evaluate
     */
    function evaluate(address vaultAddress) external;

    /**
     * @notice Check if this contract is ready to be executed
     * @param vaultAddress Vault address for the pool to check
     */
    function ready(address vaultAddress) external view returns (bool);

    /**
     * @notice Set the minimum total purchase quantity for this pool to become ready.
     * @param _minTotalSellQty New minimum amount
     */
    function setMinTotalSellQty(address vault, uint256 _minTotalSellQty) external;

    /**
     * @notice Retrieve max number of cycles schedulable
     */
    function maxCycles() external pure returns (uint16);
}
