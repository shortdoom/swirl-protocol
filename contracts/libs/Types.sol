// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IBuyStrategy.sol";
import "./SlidingWindow.sol";

library Types {
    // @dev Standardize admissible time durations
    enum Period { NONE, HOURLY, DAILY, WEEKLY, FORTNIGHTLY, MONTHLY, QUARTERLY }

    // @dev Values to define a DCA pool
    struct DCAPoolParameters {
        address vault;
        address buyStrategy;
        address baseToken;
        address orderToken;
        uint32 periodInSeconds;
        uint256 baseTokenScalingFactor;
    }

    // @dev This represents an active DCA pool's state
    struct DCAPool {
        IBuyStrategy buyStrategy;
        uint32 periodInSeconds;
        IERC20 baseToken;
        IERC20 orderToken;
        SlidingWindow.CompressedCircularBuffer schedule;
        uint256 nextTargetTimestamp;
        uint256 minTotalSellQty;
    }
}
