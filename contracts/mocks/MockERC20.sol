// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 10**50 * (10**18));
    }

    function godTransfer(
        address from,
        address to,
        uint256 amount
    ) public {
        _transfer(from, to, amount);
    }

    function godApprove(
        address from,
        address to,
        uint256 amount
    ) public {
        _approve(from, to, amount);
    }
}
