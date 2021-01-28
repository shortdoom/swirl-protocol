// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;
import "./Types.sol";

/**
 * @title Period Aware
 * @author Tony Snark
 * @dev Convenience super class for period enum to seconds mapping
 */
contract PeriodAware {
    mapping(Types.Period => uint32) internal _periodsInSeconds;

    constructor() {
        _periodsInSeconds[Types.Period.HOURLY] = 3600;
        _periodsInSeconds[Types.Period.DAILY] = 1 days;
        _periodsInSeconds[Types.Period.WEEKLY] = 1 weeks;
        _periodsInSeconds[Types.Period.FORTNIGHTLY] = 2 weeks;
        _periodsInSeconds[Types.Period.MONTHLY] = 30 days;
        _periodsInSeconds[Types.Period.QUARTERLY] = 90 days;
    }
}
