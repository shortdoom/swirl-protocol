// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;
import "../libs/Types.sol";
import "./IGasCalculator.sol";
import "./IWithdrawalStrategy.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title DCA Pool Interface
 * @author Tony Snark
 */
interface IDCAVault {
    /**
     * @notice Emitted when a user modifies their account
     * @dev This is used to track the state of an account client side
     * @param owner User address
     * @param qtyPerCycle New quantity to sell per cycle
     * @param numberOfCycles Number of cycles to perform DCA
     */
    event AccountModified(address owner, uint256 qtyPerCycle, uint256 numberOfCycles);

    /**
     * @notice Callback function to notify this vault of a performed execution
     * @param totalSellQty How much was sold
     * @param totalBuyQty How much was bought
     */
    function onExecution(uint256 totalSellQty, uint256 totalBuyQty) external;

    /**
     * @notice Creates an account for the sender of the transaction
     * @param qtyPerCycle How much to sell for each cycle
     * @param numberOfCycles How many times to perform the sale
     */
    function createAccount(uint256 qtyPerCycle, uint256 numberOfCycles) external;

    /**
     * @notice Closes an account for the sender of the transaction
     *         Base token amount held on account is refunded
     */
    function closeAccount() external;

    /**
     * @notice Amends an account for the sender of the transaction
     * @param newQtyPerCycle How much to sell for each cycle
     * @param numberOfCycles How many times to perform the sale
     */
    function editAccount(uint256 newQtyPerCycle, uint256 numberOfCycles) external;

    /**
     * @notice Withdraw order token balance for a user
     */
    function withdraw() external;

    /**
     * @notice Set the minimum order quantity for this pool.
     *         This is enforced at the account level.
     * @param minQty New minimum amount
     */
    function setMinQty(uint256 minQty) external;

    /**
     * @notice Returns the base token for this pool
     */
    function baseToken() external returns (IERC20);

    /**
     * @notice Returns the base order for this pool
     */
    function orderToken() external returns (IERC20);

    /**
     * @notice Collect unused balance from this pool
     */
    function collectDust(IERC20[] calldata tokens, address payable payee) external;

    /**
     * @notice Sets the new withdrawal strategy.
     * @dev It can only be set once
     * @param withdrawalStrategy New withdrawal strategy
     */
    function setWithdrawalStrategy(IWithdrawalStrategy withdrawalStrategy) external;
}
