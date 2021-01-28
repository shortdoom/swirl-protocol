// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IBuyStrategy.sol";
import "./MockERC20.sol";
import "hardhat/console.sol";

contract MockBuyStrategy is IBuyStrategy {
    uint256 public sellTokenAmount;
    uint256 public buyTokenAmount;
    bool private _skip;

    event AmountRequested(uint256 amount);

    /**
     * @dev Performs a swap according to set values
     *      Amount is ignored and logged for sake of interaction verification
     * @param recipient Recipient of purchased tokens
     * @param amount Amount requested
     * @param _sellToken Token to drain
     * @param _buyToken Token to credit
     * @return True if the amount was purchased
     */
    function buy(
        address recipient,
        uint256 amount,
        address _sellToken,
        address _buyToken
    ) public override returns (bool) {
        if (_skip) return false;
        uint256 effectiveAmountToSwap = sellTokenAmount != 0 ? sellTokenAmount : amount;
        console.log("Base transfer: %d", effectiveAmountToSwap);
        MockERC20(_sellToken).godTransfer(recipient, address(this), effectiveAmountToSwap);
        console.log("Order balance: %d", MockERC20(_buyToken).balanceOf(address(this)));
        console.log("Order transfer: %d", buyTokenAmount);
        MockERC20(_buyToken).godTransfer(address(this), recipient, buyTokenAmount);

        // Allows interaction verification in tests
        console.log("Amount %d", amount);
        emit AmountRequested(amount);
        // To avoid adding an additional flag we use amount to simulated skipped swap
        return buyTokenAmount > 0;
    }

    function canBuy(
        uint256, /*sellAmount*/
        address, /*sellToken*/
        address /*buyToken*/
    ) external pure override returns (bool _canBuy) {
        return true;
    }

    /**
     * @dev Pre-sets swap quantities
     * @param _sellTokenAmount Base token amount to debit
     * @param _buyTokenAmount Ordeer token amount to credit
     */
    function setAmounts(uint256 _sellTokenAmount, uint256 _buyTokenAmount) public {
        sellTokenAmount = _sellTokenAmount;
        buyTokenAmount = _buyTokenAmount;
    }

    /**
     * @dev Whether swaps should be skipped
     * @param skip True if swaps to be skipped
     */
    function setSkip(bool skip) public {
        _skip = skip;
    }

    // solhint-disable-next-line no-empty-blocks
    function enableSellToken(address sellToken) external override {}
}
