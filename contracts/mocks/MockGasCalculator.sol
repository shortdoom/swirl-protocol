// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;

import "../interfaces/IGasCalculator.sol";

contract MockGasCalculator is IGasCalculator {
    uint256 public tokenAmount = 1000;

    function calculateTokenForGas(
        address, /* token */
        uint256 /* gasQty */
    ) external view override returns (uint256) {
        return tokenAmount;
    }

    function setTokenAmount(uint256 _tokenAmount) public {
        tokenAmount = _tokenAmount;
    }
}
