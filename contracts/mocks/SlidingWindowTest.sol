// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "../libs/SlidingWindow.sol";

/**
 * @title Sliding Window Test
 * @author Tony Snark
 * @dev This contract exists solely to test the SlidingWindow.sol Library
 */
contract SlidingWindowTest {
    using SlidingWindow for SlidingWindow.CompressedCircularBuffer;

    // @dev window under test
    SlidingWindow.CompressedCircularBuffer public window;

    constructor(uint256 _scalingFactor) {
        window.init(_scalingFactor);
    }

    function init(uint256 _scalingFactor) public {
        window.init(_scalingFactor);
    }

    function edit(
        uint256 previousQty,
        uint256 previousEndCycle,
        uint256 newQty,
        uint256 newEndCycle
    ) public {
        window.edit(previousQty, previousEndCycle, newQty, newEndCycle);
    }

    function next() public returns (uint256) {
        return window.next();
    }

    function peek() public view returns (uint256) {
        return window.peek();
    }

    function hasNext() public view returns (bool) {
        return window.hasNext();
    }

    function toArray() public view returns (uint256[256] memory) {
        return window.toArray();
    }

    function nextIndex() public view returns (uint32) {
        return window.nextVirtualIndex;
    }

    function scalingFactor() public view returns (uint256) {
        return window.scalingFactor;
    }

    function setScalingFactor(uint256 _scalingFactor) public {
        window.scalingFactor = _scalingFactor;
    }

    function size() public pure returns (uint256) {
        return SlidingWindow.SIZE;
    }
}
