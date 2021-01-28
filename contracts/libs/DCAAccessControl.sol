// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title DCA Access Control
 * @author Tony Snark
 * @notice Restricts access to authorized accounts
 */
abstract contract DCAAccessControl is AccessControl {
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    bytes32 public constant SCHEDULER_ROLE = keccak256("SCHEDULER_ROLE");
    bytes32 public constant VAULT_ROLE = keccak256("VAULT_ROLE");
    string private constant _ERROR_MESSAGE = "DCA: ACCESS_DENIED";

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
    }

    /**
     * @dev Prevents non admin from calling a method
     */
    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), _ERROR_MESSAGE);
        _;
    }

    /**
     * @dev Prevents non executors from calling a method
     */
    modifier onlyExecutor() {
        require(hasRole(EXECUTOR_ROLE, _msgSender()), _ERROR_MESSAGE);
        _;
    }

    /**
     * @dev Prevents non registrars from calling a method
     */
    modifier onlyRegistrar() {
        require(hasRole(REGISTRAR_ROLE, _msgSender()), _ERROR_MESSAGE);
        _;
    }

    modifier onlyVault() {
        require(hasRole(VAULT_ROLE, _msgSender()), _ERROR_MESSAGE);
        _;
    }

    modifier onlyScheduler() {
        require(hasRole(SCHEDULER_ROLE, _msgSender()), _ERROR_MESSAGE);
        _;
    }

    /**
     * @notice Adds an account to the list of registrars
     * @param newRegistrar The new registrar
     */
    function addRegistrar(address newRegistrar) external {
        grantRole(REGISTRAR_ROLE, newRegistrar);
    }

    /**
     * @notice Removes an account from the list of registrar
     * @param registrar The registrar to remove
     */
    function removeRegistrar(address registrar) external {
        revokeRole(REGISTRAR_ROLE, registrar);
    }

    /**
     * @notice Adds an account to the list of executors
     * @param newExecutor The new executor
     */
    function addExecutor(address newExecutor) external {
        grantRole(EXECUTOR_ROLE, newExecutor);
    }

    /**
     * @notice Removes an account from the list of executors
     * @param executor The executor to remove
     */
    function removeExecutor(address executor) external {
        revokeRole(EXECUTOR_ROLE, executor);
    }

    /**
     * @notice Adds an account to the list of admins
     * @dev This is a global admin role
     * @param newAdmin The new admin
     */
    function addAdmin(address newAdmin) external {
        grantRole(DEFAULT_ADMIN_ROLE, newAdmin);
    }

    /**
     * @notice Removes an account from the list of admins
     * @param admin The admin to remove
     */
    function removeAdmin(address admin) external {
        revokeRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function addVault(address newVault) public {
        grantRole(VAULT_ROLE, newVault);
    }

    function removeVault(address vault) public {
        revokeRole(VAULT_ROLE, vault);
    }

    function addScheduler(address newScheduler) public {
        grantRole(SCHEDULER_ROLE, newScheduler);
    }

    function removeScheduler(address scheduler) public {
        revokeRole(SCHEDULER_ROLE, scheduler);
    }
}
