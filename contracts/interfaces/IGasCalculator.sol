// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Gas Calculator Interface
 * @author Tony Snark
 */
interface IGasCalculator {
    /**
     * @notice Calculate the amount of token needed to pay for gas
     * @param token Token to pay with
     * @param gasQty Amount of gas to pay
     * @return Amount of token necessary to pay
     */
    function calculateTokenForGas(address token, uint256 gasQty) external view returns (uint256);
}
