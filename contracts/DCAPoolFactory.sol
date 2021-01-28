// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./libs/PeriodAware.sol";
import "./libs/DCAAccessControl.sol";
import "./interfaces/IDCAPoolFactory.sol";
import "./interfaces/IDCAPoolRegister.sol";
import "./interfaces/IDCAScheduler.sol";
import "./DCAVault.sol";

/**
 * @title DCA Pool Factory
 * @author Tony Snark
 * @notice Factory to create new DCA vaults for enabled tokens
 * @dev Pools cannot be overwritten. A vault is identified by its tokens and period
 */
contract DCAPoolFactory is IDCAPoolFactory, PeriodAware, DCAAccessControl {
    using EnumerableSet for EnumerableSet.AddressSet;

    EnumerableSet.AddressSet private _baseTokensEnabled;
    EnumerableSet.AddressSet private _orderTokensEnabled;

    address private _defaultBuyStrategy;
    address private _gasCalculator;
    DCAAccessControl private _scheduler;
    IDCAPoolRegister private _vaultRegistry;
    // @dev Allow buy strategy customisation by purchased token
    mapping(address => address) private _buyStrategyByOrderToken;

    constructor(
        address defaultBuyStrategy,
        address gasCalculator,
        IDCAPoolRegister vaultRegistry,
        DCAAccessControl scheduler
    ) {
        _gasCalculator = gasCalculator;
        _defaultBuyStrategy = defaultBuyStrategy;
        _vaultRegistry = vaultRegistry;
        _scheduler = scheduler;
    }

    /**
     * @notice Creates a new DCA pool
     * @param baseToken Token to sell
     * @param orderToken Token to buy
     * @param period How often it should execute (see Types)
     * @param baseTokenScalingFactor Scaling factor for base token quantities
     * @return Created vault's address
     */
    function createPool(
        address baseToken,
        address orderToken,
        Types.Period period,
        uint256 baseTokenScalingFactor
    ) external override onlyAdmin returns (address) {
        require(baseToken != orderToken, "DCA_FACTORY: SAME_TOKEN");
        require(_baseTokensEnabled.contains(baseToken), "DCA_FACTORY: INVALID_B_TOKEN");
        require(_orderTokensEnabled.contains(orderToken), "DCA_FACTORY: INVALID_O_TOKEN");
        // Resolve buy strategy for order token
        address buyStrategy =
            _buyStrategyByOrderToken[orderToken] == address(0)
                ? _defaultBuyStrategy
                : _buyStrategyByOrderToken[orderToken];
        bytes memory bytecode = type(DCAVault).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(baseToken, orderToken, period, buyStrategy));
        address payable vault;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            vault := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        _vaultRegistry.registerPool(baseToken, orderToken, period, vault);
        _scheduler.addVault(vault);

        DCAVault vaultContract = DCAVault(vault);
        vaultContract.initialize(
            buyStrategy,
            baseToken,
            orderToken,
            address(_scheduler),
            _periodsInSeconds[period],
            baseTokenScalingFactor
        );

        // Set this contract's admin as vault's admin
        vaultContract.addAdmin(msg.sender);
        emit PoolCreated(baseToken, orderToken, period, baseTokenScalingFactor, vault);
        return vault;
    }

    /**
     * @notice Set the buy strategy used by newly create vaults
     * @dev This does not retrospectively changes the buy strategy for existing vaults
     *      Only admins can call this
     * @param orderToken Order token the buy strategy will be used for
     * @param buyStrategy Buy strategy to be used
     */
    function setBuyStrategy(address orderToken, address buyStrategy) external override onlyAdmin {
        _buyStrategyByOrderToken[orderToken] = buyStrategy;
        emit BuyStrategyModified(orderToken, buyStrategy);
    }

    /**
     * @notice Set the buy strategy used by newly create vaults
     * @dev This does not retrospectively changes the buy strategy for existing vaults
     *      Only admins can call this
     * @param defaultBuyStrategy Default buy strategy to be used
     */
    function setDefaultBuyStrategy(address defaultBuyStrategy) external override onlyAdmin {
        _defaultBuyStrategy = defaultBuyStrategy;
        emit BuyStrategyModified(address(0), defaultBuyStrategy);
    }

    /**
     * @notice Enables a token to be used as base in new vaults
     * @dev Only admins can call this
     * @param baseToken Base token to be enabled
     */
    function enableBaseToken(address baseToken) external override onlyAdmin {
        bool added = _baseTokensEnabled.add(baseToken);
        if (added) emit BaseTokenEnabled(baseToken);
    }

    /**
     * @notice Enables a token to be used as order in new vaults
     * @dev Only admins can call this
     * @param orderToken Base token to be enabled
     */
    function enableOrderToken(address orderToken) external override onlyAdmin {
        bool added = _orderTokensEnabled.add(orderToken);
        if (added) emit OrderTokenEnabled(orderToken);
    }
}
