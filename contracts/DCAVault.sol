// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/SafeCast.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/proxy/Initializable.sol";
import "./libs/DCAAccessControl.sol";
import "./interfaces/IBuyStrategy.sol";
import "./interfaces/IWithdrawalStrategy.sol";
import "./interfaces/IDCAScheduler.sol";
import "./interfaces/IDCAVault.sol";

/**
 * @title DCA Pool
 * @author Tony Snark
 * @notice This vault custodies funds for users. Base tokens are used to purchase order tokens.
 *         Upon account creation or modification, this contracts notifies the scheduler.
 *         This contract is notified from the scheduler after a successful evaluation.
 *         Token balances for a user are:
 *
 *         BB = CL * QP
 *         OB = QP * CI[LC] - CI[IC]
 *
 *         Where:
 *
 *         BB: Base Token Balance
 *         OB: Order Token Balance
 *         CL: Cycles Left to execute
 *         QP: Quantity (to sell) per Period
 *         CI: Cumulative Index for the order token
 *         LC: Last cycle for the user
 *         IC: Initial cycle for the user
 *         Every time a user modifies its QP or withdraws, the current order balance is snapped in its account
 *         For increase accuracy in the CI calculation a scaling factor of around 2^128 bits has been selected
 *         This choice is appropriate for our values ranges.
 *
 */
contract DCAVault is IDCAVault, DCAAccessControl, Initializable {
    using SafeMath for uint256;
    using SafeCast for uint256;
    using SafeERC20 for IERC20;

    struct Account {
        uint128 orderTokenBalance;
        uint128 qtyPerCycle;
        uint32 startCycle; //Inclusive
        uint32 endCycle; //Exclusive
    }

    // @dev Scaling factor used for denormalize CI
    uint256 private constant _SCALING_FACTOR = 10**38;
    // @dev Strategy for distributing purchases tokens. Default is ERC20 transfer
    IWithdrawalStrategy private _withdrawalStrategy;
    // @dev Scheduler used for executions
    IDCAScheduler private _scheduler;
    // @dev Token to purchase
    IERC20 public override orderToken;
    // @dev Token to sell
    IERC20 public override baseToken;
    // @dev Base tokens held on users' behalf
    uint256 public usersBaseTokenBalance;
    // @dev Order tokens held on users' behalf
    uint256 public usersOrderTokenBalance;
    // @dev Account for each user
    mapping(address => Account) public accountByOwner;
    // @dev Cumulative purchase results used to calculate users' individual balances
    uint256[] public cumulativeIndexes;
    // @dev Minimum order size for a single account
    uint256 public minQty;

    /**
     * @notice Initializes this pool
     * @dev It can be called only once
     * @param _buyStrategy Strategy used to perform the swap
     * @param _baseToken Token to sell
     * @param _orderToken Token to buy
     * @param scheduler Scheduler address
     * @param periodInSeconds Execution period
     * @param baseTokenScalingFactor Compression factor for base token quantities
     */
    function initialize(
        address _buyStrategy,
        address _baseToken,
        address _orderToken,
        address scheduler,
        uint32 periodInSeconds,
        uint256 baseTokenScalingFactor
    ) public initializer {
        minQty = 1;
        orderToken = IERC20(_orderToken);
        baseToken = IERC20(_baseToken);
        _scheduler = IDCAScheduler(scheduler);
        // To save gas we infinity approve our buy strategy
        baseToken.safeApprove(address(_buyStrategy), type(uint256).max);
        // Allow scheduler to pay fees on our behalf
        orderToken.safeApprove(address(scheduler), type(uint256).max);
        // Initialize arrays to avoid checks
        cumulativeIndexes.push(0);
        // Add scheduler to ACL
        addScheduler(scheduler);
        _scheduler.addPool(
            Types.DCAPoolParameters({
                vault: address(this),
                buyStrategy: _buyStrategy,
                baseToken: _baseToken,
                orderToken: _orderToken,
                periodInSeconds: periodInSeconds,
                baseTokenScalingFactor: baseTokenScalingFactor
            })
        );
    }

    function onExecution(uint256 totalSellQty, uint256 totalBuyQty) public override onlyScheduler {
        uint256 previousResult = cumulativeIndexes[cumulativeIndexes.length - 1];
        uint256 price = totalBuyQty.mul(_SCALING_FACTOR).div(totalSellQty);
        cumulativeIndexes.push(previousResult.add(price));
        usersBaseTokenBalance = usersBaseTokenBalance.sub(totalSellQty);
        usersOrderTokenBalance = usersOrderTokenBalance.add(totalBuyQty);
    }

    function createAccount(uint256 qtyPerCycle, uint256 numberOfCycles) public override {
        require(
            qtyPerCycle > 0 && numberOfCycles > 0 && numberOfCycles < _scheduler.maxCycles(),
            "DCA_VAULT:INVALID_ACCOUNT"
        );
        address accountOwner = msg.sender;
        require(accountByOwner[accountOwner].qtyPerCycle == 0, "DCA_VAULT:ALREADY_EXISTS");
        require(qtyPerCycle >= minQty, "DCA_VAULT:MIN_QTY");

        uint256 depositQty = qtyPerCycle.mul(numberOfCycles);
        uint256 currentCycle = cumulativeIndexes.length;
        uint256 endCycle = currentCycle + numberOfCycles;

        // Create account
        accountByOwner[accountOwner] = Account({
            orderTokenBalance: 0,
            qtyPerCycle: qtyPerCycle.toUint128(),
            startCycle: currentCycle.toUint32(),
            endCycle: endCycle.toUint32()
        });

        _scheduler.editSchedule(address(this), 0, 0, qtyPerCycle, endCycle);

        // Internal balance accounting
        usersBaseTokenBalance = usersBaseTokenBalance.add(depositQty);
        // Collect deposit
        baseToken.safeTransferFrom(accountOwner, address(this), depositQty);

        emit AccountModified(accountOwner, qtyPerCycle, numberOfCycles);
    }

    function editAccount(uint256 newQtyPerCycle, uint256 numberOfCycles) public override {
        // Validate input
        require(
            // It's either an edit or a cancellation
            (newQtyPerCycle > 0 && numberOfCycles > 0 && numberOfCycles < _scheduler.maxCycles()) ||
                (newQtyPerCycle == 0 && numberOfCycles == 0),
            "DCA_VAULT:INVALID_ACCOUNT"
        );
        // Allow 0 for cancellation
        require(newQtyPerCycle == 0 || newQtyPerCycle >= minQty, "DCA_VAULT:MIN_QTY");
        address accountOwner = msg.sender;

        Account storage account = accountByOwner[accountOwner];
        uint256 previousQtyPerCycle = account.qtyPerCycle;
        // If qty wasn't set we assume account not initialized
        require(previousQtyPerCycle > 0, "DCA_VAULT:NOT_FOUND");

        // Calculate cycle indexes
        uint256 previousEndCycle = account.endCycle;
        uint256 currentCycle = cumulativeIndexes.length;
        uint256 newEndCycle = currentCycle + numberOfCycles;

        _scheduler.editSchedule(address(this), previousQtyPerCycle, previousEndCycle, newQtyPerCycle, newEndCycle);

        // We must calculate these values before updating the account
        uint256 baseTokenBalance = baseTokenBalanceOf(accountOwner);
        uint256 newTotalQty = newQtyPerCycle.mul(numberOfCycles);
        uint256 orderTokenBalance = orderTokenBalanceOf(accountOwner); //Snap accrued balance
        // Update account before token transfers
        account.qtyPerCycle = newQtyPerCycle.toUint128();
        account.endCycle = newEndCycle.toUint32();
        // It should never be greater than end cycle
        account.startCycle = Math.min(currentCycle, newEndCycle).toUint32();
        account.orderTokenBalance = orderTokenBalance.toUint128();

        _processBalanceChange(baseTokenBalance, newTotalQty, accountOwner);

        emit AccountModified(accountOwner, newQtyPerCycle, numberOfCycles);
    }

    function _processBalanceChange(
        uint256 baseTokenBalance,
        uint256 newTotalQty,
        address accountOwner
    ) internal {
        // We check if we owe or are owed based on the actual account amendment
        if (baseTokenBalance > newTotalQty) {
            uint256 delta = baseTokenBalance.sub(newTotalQty);
            usersBaseTokenBalance = usersBaseTokenBalance.sub(delta);
            baseToken.safeTransfer(accountOwner, delta);
        } else {
            uint256 delta = newTotalQty.sub(baseTokenBalance);
            usersBaseTokenBalance = usersBaseTokenBalance.add(delta);
            baseToken.safeTransferFrom(accountOwner, address(this), delta);
        }
    }

    /**
     * @notice Closes an account for the sender of the transaction
     *         Base token amount held on account is refunded
     */
    function closeAccount() public override {
        editAccount(0, 0);
    }

    function withdraw() public override {
        address accountOwner = msg.sender;
        uint256 withdrawalAmount = orderTokenBalanceOf(accountOwner);
        // Reset account
        Account storage account = accountByOwner[accountOwner];
        account.startCycle = Math.min(account.endCycle, cumulativeIndexes.length).toUint32();
        account.orderTokenBalance = 0;
        // Adjust internal accounting
        usersOrderTokenBalance = usersOrderTokenBalance.sub(withdrawalAmount);
        if (_hasCustomWithdrawal()) {
            _withdrawalStrategy.withdraw(accountOwner, withdrawalAmount);
        } else {
            orderToken.safeTransfer(accountOwner, withdrawalAmount);
        }
    }

    /**
     * @notice Collect unused balance from this pool
     * @dev This preserve user's funds held on account in the contract
     * @param tokens Tokens to collect
     * @param payee Recipient of the collection
     */
    function collectDust(IERC20[] calldata tokens, address payable payee) external override onlyAdmin {
        // Allow recovery of arbitrary tokens
        for (uint256 i = 0; i < tokens.length; i++) {
            IERC20 token = tokens[i];
            // If base token subtract funds held on users' behalf
            uint256 tokenBalance = token.balanceOf(address(this));
            if (_hasCustomWithdrawal()) {
                tokenBalance.add(token.balanceOf(address(_withdrawalStrategy)));
            }
            if (token == baseToken) {
                tokenBalance = tokenBalance.sub(usersBaseTokenBalance);
            } else if (token == orderToken) {
                tokenBalance = tokenBalance.sub(usersOrderTokenBalance);
            }
            if (tokenBalance > 0) {
                token.safeTransfer(payee, tokenBalance);
            }
        }
        if (address(this).balance > 0) {
            payee.transfer(address(this).balance);
        }
    }

    /**
     * @notice Set the minimum order quantity for this pool.
     *         This is enforced at the account level.
     * @dev Existing accounts are not affected.
     * @param _minQty New minimum amount
     */
    function setMinQty(uint256 _minQty) public override onlyAdmin {
        minQty = Math.max(1, _minQty);
    }

    /**
     * @notice Sets the new withdrawal strategy.
     * @dev It can only be set once
     * @param withdrawalStrategy New withdrawal strategy
     */
    function setWithdrawalStrategy(IWithdrawalStrategy withdrawalStrategy) public override onlyAdmin {
        if (!_hasCustomWithdrawal()) {
            orderToken.safeApprove(address(withdrawalStrategy), uint256(-1));
            _withdrawalStrategy = withdrawalStrategy;
        }
    }

    /**
     * @dev Whether this pool has custom withdrawal for purchased tokens.
     * @return True if there's a custom withdrawal strategy set
     */
    function _hasCustomWithdrawal() internal view returns (bool) {
        return address(_withdrawalStrategy) != address(0);
    }

    function baseTokenBalanceOf(address owner) public view returns (uint256 balance) {
        Account memory account = accountByOwner[owner];
        uint256 currentCycle = cumulativeIndexes.length;
        uint256 cyclesLeft = account.endCycle > currentCycle ? account.endCycle - currentCycle : 0;
        balance = uint256(account.qtyPerCycle).mul(cyclesLeft);
    }

    function orderTokenBalanceOf(address owner) public view returns (uint256 balance) {
        Account memory account = accountByOwner[owner];
        balance = account.orderTokenBalance;
        uint256 baselineCycle = account.startCycle - 1;
        uint256 lastCycleForAccount = Math.min(cumulativeIndexes.length - 1, account.endCycle - 1);

        // If the user has accrued additional tokens since last snap
        if (lastCycleForAccount > baselineCycle) {
            uint256 baseLine = cumulativeIndexes[baselineCycle];
            uint256 lastResult = cumulativeIndexes[lastCycleForAccount];
            uint256 deltaIndex = lastResult.sub(baseLine);
            balance = balance.add(uint256(account.qtyPerCycle).mul(deltaIndex).div(_SCALING_FACTOR));
        }
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
