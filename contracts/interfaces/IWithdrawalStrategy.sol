// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;

/**
 * @title Withdrawal Strategy Interface
 * @notice Withdrawal strategy allow customization of how purchased tokens
 *         are sent to users. For example WETH could be directly unwrapped in
 *         the strategy. Strategies can also have state so additional
 *         customization is possible.
 *         e.g. Store bitcoin addresses and burn/claim renBTC towards the user's address.
 * @author Tony Snark
 */
interface IWithdrawalStrategy {
    /**
     * @notice Distribute proceeds to recipient
     * @param recipient Recipient of the proceeds
     * @param proceeds Amount to withdraw
     */
    function withdraw(address recipient, uint256 proceeds) external;
}
