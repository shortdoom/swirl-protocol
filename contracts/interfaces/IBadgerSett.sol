// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;

/**
 * @title Badger Sett Interface
 * @author Tony Snark
 */
interface IBadgerSett {
    /**
     * @notice Deposits desired amount into badger sett
     * @param amount Amount to be deposited
     */
    function deposit(uint256 amount) external;

    function approveContractAccess(address account) external;
}
