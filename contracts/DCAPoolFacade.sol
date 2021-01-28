// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "./libs/DCAAccessControl.sol";
import "./interfaces/IDCAPoolRegister.sol";
import "./interfaces/IKeeperConfiguration.sol";
import "./interfaces/IDCAScheduler.sol";
import "./interfaces/IKeep3rV1.sol";

/**
 * @author Tony Snark
 * @title DCA Pool Facade
 * @notice A façade to register and interact with DCA pools
 */
contract DCAPoolFacade is DCAAccessControl, IDCAPoolRegister, IKeeperConfiguration {
    using EnumerableSet for EnumerableSet.AddressSet;
    using Math for uint256;
    using SafeERC20 for IERC20;

    // @dev This is used only on mainnet
    IKeep3rV1 public constant KPR = IKeep3rV1(0x1cEB5cB57C4D4E2b2433641b95Dd330A33185A44);
    IDCAScheduler private _scheduler;

    mapping(bytes32 => address) public _poolsByHash;
    mapping(address => bool) public activePools;

    address payable[] public pools;
    uint256 private _minKeep;
    bool private _keeperEnabled;

    constructor(IDCAScheduler scheduler) {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _minKeep = 200e18;
        _keeperEnabled = false;
        _scheduler = scheduler;
    }

    modifier onlyKeeper() {
        require(KPR.isMinKeeper(msg.sender, _minKeep, 0, 0) && _keeperEnabled, "DCA_FACADE: UNAUTHORIZED");
        _;
        KPR.worked(msg.sender);
    }

    /**
     * @notice Insert a pool into the register
     * @dev Pools are uniquely identified by the tuple (base token, order token, period)
     *      Only the latest instance of a pool is mapped to the tuple. New versions overwrite
     *      previous versions mapping (likely to use a new buy strategy).
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
    ) external override onlyRegistrar {
        _poolsByHash[keccak256(abi.encode(baseToken, orderToken, period))] = pool;
        activePools[pool] = true;
        pools.push(pool);
    }

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
    ) external view override returns (address) {
        return _poolsByHash[keccak256(abi.encode(baseToken, orderToken, period))];
    }

    /**
     * @notice Evaluates all pools provided
     * @dev This method can only be called in mainnet by a keeper
     *      (see https://docs.keep3r.network). It performs fees bookkeeping.
     * @param poolsToEvaluate Pools to be evaluated
     */
    function evaluatePoolsAsKeeper(address[] calldata poolsToEvaluate) external override onlyKeeper {
        _evaluatePools(poolsToEvaluate);
    }

    /**
     * @notice Evaluates all pools provided
     * @dev This method can only be called by a registered executor
     * @param poolsToEvaluate Pools to be evaluated
     */
    function evaluatePoolsAsExecutor(address[] calldata poolsToEvaluate) external override onlyExecutor {
        _evaluatePools(poolsToEvaluate);
    }

    /**
     * @dev This method evaluate all pools provided if they are registered.
     *      It does not stop the evaluation in case of errors on a pool.
     * @param poolsToEvaluate Pools to be evaluated
     */
    function _evaluatePools(address[] memory poolsToEvaluate) internal {
        for (uint256 i = 0; i < poolsToEvaluate.length; i++) {
            address pool = poolsToEvaluate[i];
            if (activePools[address(pool)]) {
                // solhint-disable-next-line no-empty-blocks
                try _scheduler.evaluate(pool) {} catch (bytes memory reason) {
                    emit PoolEvaluationFailed(pool, reason);
                }
            }
        }
    }

    /**
     * @notice Returns all pools that are ready to be evaluated
     * @dev It returns a zero address terminated array of addresses.
     *      All zero addresses means no pool is ready.
     * @return Pools that are ready
     */
    function readyPools() external view override returns (address payable[] memory) {
        address payable[] memory _readyPools = new address payable[](pools.length);
        uint256 j = 0;
        for (uint256 i = 0; i < pools.length; i++) {
            address pool = pools[i];
            if (_scheduler.ready(pool)) {
                _readyPools[j++] = pools[i];
            }
        }
        return _readyPools;
    }

    /**
     * @notice Set the minimum bond required by a keeper to call this contract
     * @param keep Minumum bond
     */
    function setMinKeep(uint256 keep) public override onlyAdmin {
        _minKeep = keep;
    }

    /**
     * @notice Enables/Disables keeper network integration
     * @param keeperEnabled True if keeper integration should be active
     */
    function setKeeperEnabled(bool keeperEnabled) public override onlyAdmin {
        _keeperEnabled = keeperEnabled;
    }

    /**
     * @notice Collect unused balance from this contract
     * @param tokens Tokens to collect
     * @param payee Recipients of the collection
     */
    function withdraw(IERC20[] calldata tokens, address payable payee) external onlyAdmin {
        for (uint256 i = 0; i < tokens.length; i++) {
            IERC20 token = tokens[i];
            uint256 tokenBalance = token.balanceOf(address(this));
            if (tokenBalance > 0) {
                token.safeTransfer(payee, tokenBalance);
            }
        }
        if (address(this).balance > 0) {
            payee.transfer(address(this).balance);
        }
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
