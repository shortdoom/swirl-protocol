// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// solhint-disable
interface ICurvePool {
    function add_liquidity(uint256[2] calldata amounts, uint256 min_mint_amount) external;

    function add_liquidity(uint256[3] calldata amounts, uint256 min_mint_amount) external;

    function add_liquidity(uint256[4] calldata amounts, uint256 min_mint_amount) external;

    function calc_token_amount(uint256[2] calldata amounts, bool deposit) external returns (uint256);

    function calc_token_amount(uint256[3] calldata amounts, bool deposit) external returns (uint256);

    function calc_token_amount(uint256[4] calldata amounts, bool deposit) external returns (uint256);

    function token() external returns (address);
}
