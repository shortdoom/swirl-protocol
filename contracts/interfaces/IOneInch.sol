// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IOneInch {
    function swap(
        address fromToken,
        address destToken,
        uint256 amount,
        uint256 minReturn,
        uint256[] memory distribution,
        uint256 flags
    ) external payable returns (uint256 returnAmount);

    function getExpectedReturn(
        address fromToken,
        address destToken,
        uint256 amount,
        uint256 parts,
        uint256 flags
    ) external view returns (uint256 returnAmount, uint256[] memory distribution);
}
