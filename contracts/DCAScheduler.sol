// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/proxy/Initializable.sol";
import "./libs/DCAAccessControl.sol";
import "./libs/SlidingWindow.sol";
import "./interfaces/IBuyStrategy.sol";
import "./interfaces/IGasCalculator.sol";
import "./interfaces/IDCAScheduler.sol";
import "./interfaces/IDCAVault.sol";

/**
 * @title DCA Scheduler
 * @author Tony Snark
 * @notice This scheduler executes swaps of base token into order token after a configured time period.
 *         This contract does not custody tokens.
 * @dev This implementation allows schedule drift. The only invariant is that two consecutive swaps
 *      won't happen within the `period`. Adherence to schedule relies on economic incetives to
 *      executors.
 */
contract DCAScheduler is IDCAScheduler, DCAAccessControl {
    using SlidingWindow for SlidingWindow.CompressedCircularBuffer;
    using SafeMath for uint256;
    using Math for uint256;
    using SafeERC20 for IERC20;

    // @dev Precomputed gas cost for swapping and transferring token received into base token or ETH
    uint32 private constant _GAS_FOR_FEES_OVERHEAD = 400000;
    // @dev How many seconds before retrying an evaluation
    uint16 private constant _SKIPPED_PURCHASE_RETRY_TIMEOUT_IN_S = 300;
    // @dev Protocol fees (max 3%)
    uint16 private _feesInBPS;
    // @dev Recipient of protocol (and gas) fees
    address public feesRecipient;
    // @dev Calculator for expressing gas cost in any token
    IGasCalculator private _gasCalculator;
    // @dev Pools state
    mapping(address => Types.DCAPool) public poolsByVault;

    constructor(address gasCalculator) {
        _gasCalculator = IGasCalculator(gasCalculator);
    }

    /**
     * @notice Adds a pool to the scheduler
     * @param parameters Parameters of the pool to be added
     */
    function addPool(Types.DCAPoolParameters calldata parameters) external override onlyVault {
        Types.DCAPool storage pool = poolsByVault[parameters.vault];
        // Initialize only if not present
        if (!pool.schedule.isInitialized()) {
            pool.buyStrategy = IBuyStrategy(parameters.buyStrategy);
            pool.baseToken = IERC20(parameters.baseToken);
            pool.orderToken = IERC20(parameters.orderToken);
            pool.periodInSeconds = parameters.periodInSeconds;
            pool.nextTargetTimestamp = block.timestamp;
            pool.schedule.init(parameters.baseTokenScalingFactor);
        }
    }

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
    ) public override onlyVault {
        Types.DCAPool storage pool = poolsByVault[vaultAddress];
        pool.schedule.edit(previousQty, previousEndCycle, newQty, newEndCycle);
    }

    /**
     * @notice Performs an evaluation to effect a swap
     * @param vaultAddress Vault address for the pool to evaluate
     */
    function evaluate(address vaultAddress) external override onlyExecutor {
        uint256 gasUsed = gasleft();
        Types.DCAPool storage pool = poolsByVault[vaultAddress];
        if (_ready(pool)) {
            IERC20 baseToken = pool.baseToken;
            IERC20 orderToken = pool.orderToken;
            uint256 totalSellQty = pool.schedule.next();

            uint256 baseTokenBalanceBeforePurchase = baseToken.balanceOf(vaultAddress);
            uint256 orderTokenBalanceBeforePurchase = orderToken.balanceOf(vaultAddress);

            //Phase 1 Execute Purchase Strategy
            if (pool.buyStrategy.buy(vaultAddress, totalSellQty, address(baseToken), address(orderToken))) {
                //Phase 2 Recalculate balances
                uint256 spentQty = baseTokenBalanceBeforePurchase.sub(baseToken.balanceOf(vaultAddress));
                uint256 boughtQty = orderToken.balanceOf(vaultAddress).sub(orderTokenBalanceBeforePurchase);

                /* Fill Or Kill behaviour
                 * We implement FOK to simplify order management
                 * across multiple periods. Quantity is always fixed.
                 */
                require(spentQty == 0 || spentQty == totalSellQty, "DCA_SCHEDULER: FOK_ERROR");
                uint256 fees = _calculateGrossFees(boughtQty, address(orderToken), gasUsed);
                orderToken.safeTransferFrom(vaultAddress, feesRecipient, fees);
                uint256 netOrderQty = boughtQty.sub(fees);

                //Phase 3 Update state
                IDCAVault vault = IDCAVault(vaultAddress);
                vault.onExecution(totalSellQty, netOrderQty);
                pool.nextTargetTimestamp = block.timestamp + pool.periodInSeconds;
                emit PoolEvaluated(spentQty, netOrderQty, fees, pool.nextTargetTimestamp);
            } else {
                // If the purchase was skipped allow retry after timeout
                pool.nextTargetTimestamp = block.timestamp + _SKIPPED_PURCHASE_RETRY_TIMEOUT_IN_S;
            }
        }
    }

    /**
     * @dev Calculates fees and gas cost
     * @param boughtQty Quantity bought
     * @param orderToken Token bought
     * @param initialGas Gas at the start of this evaluation
     * @return fees Amount of gross fees to be paid
     */
    function _calculateGrossFees(
        uint256 boughtQty,
        address orderToken,
        uint256 initialGas
    ) internal view returns (uint256 fees) {
        fees = boughtQty.mul(_feesInBPS).div(10000);

        // Convert gas cost into order token quantity of the same value
        {
            fees = fees.add(
                _gasCalculator
                // Add swap cost to refill executor ether balance
                    .calculateTokenForGas(address(orderToken), initialGas.sub(gasleft()).add(_GAS_FOR_FEES_OVERHEAD))
                //Keeper reward is up to 10%
                    .mul(110)
                    .div(100)
            );
            // If we spend all in gas nothing will be left for the accounts
            fees = fees > boughtQty ? boughtQty : fees;
        }
    }

    /**
     * @notice Check if this contract is ready to be executed
     * @dev    Conditions are
     *         - there is at least one active account
     *         - period since last evaluation has elapsed
     *         - buy strategy can be executed
     * @param vaultAddress Vault address for the pool to check
     */
    function ready(address vaultAddress) external view override returns (bool) {
        Types.DCAPool storage pool = poolsByVault[vaultAddress];
        // This relies on shortcircuit to avoid index out of bounds
        return
            _ready(pool) &&
            pool.buyStrategy.canBuy(pool.schedule.peek(), address(pool.baseToken), address(pool.orderToken));
    }

    /**
     * @notice Internal version of the ready check.
     *         It excludes querying the buy strategy to save gas.
     * @dev    Conditions are
     *         - the sell amount is above minimum required
     *         - period since last evaluation has elapsed
     * @param pool Pool to check

     */
    function _ready(Types.DCAPool storage pool) internal view returns (bool) {
        return (pool.nextTargetTimestamp <= block.timestamp &&
            pool.schedule.hasNext() &&
            pool.schedule.peek() > pool.minTotalSellQty);
    }

    /**
     * @notice Set the minimum total purchase quantity for this pool to become ready.
     * @param _minTotalSellQty New minimum amount
     */
    function setMinTotalSellQty(address vault, uint256 _minTotalSellQty) external override onlyAdmin {
        Types.DCAPool storage pool = poolsByVault[vault];
        pool.minTotalSellQty = Math.max(1, _minTotalSellQty);
    }

    /**
     * @notice Set fees charged by the protocol. Maximum 3%
     * @dev Fees are expressed in BPS (i.e. 100 is 1%).
     * @param feesInBPS Fees to charge
     */
    function setFeesInBPS(uint16 feesInBPS) external override onlyAdmin {
        _feesInBPS = feesInBPS >= 300 ? 300 : feesInBPS; //We limit fees to 3%
        emit FeesUpdated(_feesInBPS);
    }

    /**
     * @notice Set recipient for fees
     * @param _feesRecipient Fees to charge
     */
    function setFeesRecipient(address _feesRecipient) external override onlyAdmin {
        feesRecipient = _feesRecipient;
        emit FeesRecipientUpdated(_feesRecipient);
    }

    /**
     * @notice Retrieve schedule for pool linked to vault
     * @param vaultAddress Vault address of the pool
     */
    function getSchedule(address vaultAddress) external view returns (uint256[256] memory) {
        return poolsByVault[vaultAddress].schedule.toArray();
    }

    /**
     * @notice Retrieve max number of cycles schedulable
     */
    function maxCycles() external pure override returns (uint16) {
        return SlidingWindow.SIZE;
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
