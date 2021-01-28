// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;

import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./OneInchBuyStrategy.sol";
import "../interfaces/ICurvePool.sol";
import "../interfaces/IBadgerSett.sol";

/**
 * @title Buy Strategy Interface
 * @author Tony Snark
 * @dev Simple buy order strategy with smart order routing provided by
 *      1Inch. No front running protection implemented.
 */
contract BadgerSettBuyStrategy is OneInchBuyStrategy {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    IERC20 private _tBTC = IERC20(0x8dAEBADE922dF735c38C80C7eBD708Af50815fAa);
    IERC20 private _sBTC = IERC20(0xfE18be6b3Bd88A2D2A7f928d00292E7a9963CfC6);
    IERC20 private _renBTC = IERC20(0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D);
    IERC20 private _wBTC = IERC20(0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599);

    IBadgerSett private _tBTCSett = IBadgerSett(0xb9D076fDe463dbc9f915E5392F807315Bf940334);
    IBadgerSett private _sBTCSett = IBadgerSett(0xd04c48A53c111300aD41190D63681ed3dAd998eC);
    IBadgerSett private _renBTCSett = IBadgerSett(0x6dEf55d2e18486B9dDfaA075bc4e4EE0B28c1545);

    ICurvePool private _tBTCPool = ICurvePool(0xC25099792E9349C7DD09759744ea681C7de2cb66);
    ICurvePool private _sBTCPool = ICurvePool(0x7fC77b5c7614E1533320Ea6DDc2Eb61fa00A9714);
    ICurvePool private _renBTCPool = ICurvePool(0x93054188d876f558f4a66B2EF1d97d16eDf0895B);

    IERC20 private _tBTCCrv = IERC20(0x64eda51d3Ad40D56b9dFc5554E06F94e1Dd786Fd);
    IERC20 private _sBTCCrv = IERC20(0x075b1bb99792c9E1041bA13afEf80C91a1e70fB3);
    IERC20 private _renBTCCrv = IERC20(0x49849C98ae39Fff122806C06791Fa73784FB3675);

    constructor() {
        _tBTC.safeApprove(address(_tBTCPool), uint256(-1));
        _wBTC.safeApprove(address(_sBTCPool), uint256(-1));
        _wBTC.safeApprove(address(_renBTCPool), uint256(-1));
    }

    /**
     * @notice Swaps base token into order token
     * @param onBehalfOf Recipient of purchased tokens
     * @param sellAmount Maximum amount of base token allowed to be swapped
     * @param sellToken Token to sell
     * @param buyToken Token to buy
     * @return True if the amount was purchased
     */
    function buy(
        address onBehalfOf,
        uint256 sellAmount,
        address sellToken,
        address buyToken
    ) public override returns (bool) {
        require(sellAmount > 0, "Amount must be positive");
        if (buyToken == address(_tBTCSett)) {
            return _handleTBTC(onBehalfOf, sellAmount, sellToken);
        } else if (buyToken == address(_sBTCSett)) {
            return _handleSBTC(onBehalfOf, sellAmount, sellToken);
        } else if (buyToken == address(_renBTCSett)) {
            return _handleRenBTC(onBehalfOf, sellAmount, sellToken);
        } else {
            revert("Unsupported Sett Token");
        }
    }

    function _handleTBTC(
        address onBehalfOf,
        uint256 sellAmount,
        address sellToken
    ) internal returns (bool) {
        // 1 Swap tokens to deposit into the Curve pool
        bool performed = super._swap(onBehalfOf, sellAmount, sellToken, address(_tBTC));
        if (performed) {
            uint256 tBTCAmount = _tBTC.balanceOf(address(this));

            // 3 Add liquidity to the Curve pool
            uint256[2] memory distribution = [tBTCAmount, 0];
            uint256 mintAmount = _tBTCPool.calc_token_amount(distribution, true);
            _tBTCPool.add_liquidity(distribution, mintAmount.mul(9900).div(10000));
            uint256 poolTokenAmount = _tBTCCrv.balanceOf(address(this));

            // 4 Approve the Curve pool LP token for Sett
            _tBTCCrv.safeApprove(address(_tBTCSett), poolTokenAmount);

            // 5 Deposit in Sett
            _tBTCSett.deposit(poolTokenAmount);

            // 6 Send back purchased token
            IERC20(address(_sBTCSett)).safeTransfer(onBehalfOf, IERC20(address(_sBTCSett)).balanceOf(address(this)));
        }
        return performed;
    }

    function _handleSBTC(
        address onBehalfOf,
        uint256 sellAmount,
        address sellToken
    ) internal returns (bool) {
        // 1 Swap tokens to deposit into the Curve pool
        (bool performed, uint256 wBTCAmount) = _buyWBTC(onBehalfOf, sellAmount, sellToken);
        if (performed) {
            uint256[3] memory distribution = [0, wBTCAmount, 0];
            uint256 mintAmount = _sBTCPool.calc_token_amount(distribution, true);

            // 3 Add liquidity to the Curve pool
            _sBTCPool.add_liquidity(distribution, mintAmount.mul(9900).div(10000));
            uint256 poolTokenAmount = _sBTCCrv.balanceOf(address(this));

            // 4 Approve the Curve pool LP token for Sett
            _sBTCCrv.safeApprove(address(_sBTCSett), poolTokenAmount);

            // 5 Deposit in Sett
            _sBTCSett.deposit(poolTokenAmount);

            // 6 Send back purchased token
            IERC20(address(_sBTCSett)).safeTransfer(onBehalfOf, IERC20(address(_sBTCSett)).balanceOf(address(this)));
        }
        return performed;
    }

    function _handleRenBTC(
        address onBehalfOf,
        uint256 sellAmount,
        address sellToken
    ) internal returns (bool) {
        // 1 Swap tokens to deposit into the Curve pool
        (bool performed, uint256 wBTCAmount) = _buyWBTC(onBehalfOf, sellAmount, sellToken);
        if (performed) {
            uint256[2] memory distribution = [0, wBTCAmount];
            _renBTCPool.calc_token_amount(distribution, true);
            // 3 Add liquidity to the Curve pool
            _renBTCPool.add_liquidity(distribution, 0);
            uint256 poolTokenAmount = _renBTCCrv.balanceOf(address(this));

            // 4 Approve the Curve pool LP token for Sett
            _renBTCCrv.safeApprove(address(_renBTCSett), poolTokenAmount);

            // 5 Deposit in Sett
            _renBTCSett.deposit(poolTokenAmount);

            // 6 Send back purchased token
            IERC20(address(_renBTCSett)).safeTransfer(
                onBehalfOf,
                IERC20(address(_renBTCSett)).balanceOf(address(this))
            );
        }
        return performed;
    }

    function _buyWBTC(
        address onBehalfOf,
        uint256 sellAmount,
        address sellToken
    ) internal returns (bool, uint256) {
        bool performed = super._swap(onBehalfOf, sellAmount, sellToken, address(_wBTC));
        return (performed, _wBTC.balanceOf(address(this)));
    }
}
