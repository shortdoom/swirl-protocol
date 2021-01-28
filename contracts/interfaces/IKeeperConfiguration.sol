// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;
import "../libs/Types.sol";

/**
 * @title DCA Configuration Interface
 * @author Tony Snark
 * @notice Facet for configuration parameters access
 */
interface IKeeperConfiguration {
    /**
     * @notice Set the minimum bond required by a keeper to call this contract
     * @param keep Minumum bond
     */
    function setMinKeep(uint256 keep) external;

    /**
     * @notice Enables/Disables keeper network integration
     * @param keeperEnabled True if keeper integration should be active
     */
    function setKeeperEnabled(bool keeperEnabled) external;
}
