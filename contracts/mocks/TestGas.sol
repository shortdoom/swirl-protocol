// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IBuyStrategy.sol";
import "../libs/SlidingWindow.sol";
import "./MockERC20.sol";
import "hardhat/console.sol";

contract TestGas {
    using SlidingWindow for SlidingWindow.CompressedCircularBuffer;

    SlidingWindow.CompressedCircularBuffer public schedule;
    uint128[256] public slots128;
    uint32 public size128;
    uint64[256] public slots64;
    uint32 public size64;
    uint32[256] public slots32;
    uint32 public size32;
    uint16[256] public slots16;
    uint32 public size16;

    function init() public {
        uint256 gas = gasleft();
        schedule.init(1);
        gas = gas - gasleft();
        console.log("SCHEDULE GAS used: %d for INIT", gas);
    }

    function addToSlots(uint16 value, uint8 numberOfSlots) public {
        addToSlots128(value, numberOfSlots);
        addToSlots64(value, numberOfSlots);
        addToSlots32(value, numberOfSlots);
        addToSlots16(value, numberOfSlots);
    }

    function getSlots32() public view returns (uint32[256] memory) {
        return slots32;
    }

    function increaseSize(uint8 amount) public {
        size128 += amount;
        size64 += amount;
        size32 += amount;
        size16 += amount;
    }

    function addToSlotsSchedule(
        uint256 subValue,
        uint8 subNumberOfSlots,
        uint256 addValue,
        uint8 addNumberOfSlots
    ) public {
        uint256 gas = gasleft();
        schedule.edit(subValue, subNumberOfSlots, addValue, addNumberOfSlots);
        gas = gas - gasleft();
        console.log("SCHEDULE ADD GAS used: %d for %d/%d", gas, subNumberOfSlots, addNumberOfSlots);
    }

    function addToSlots128(uint16 value, uint8 numberOfSlots) public {
        uint256 gas = gasleft();
        uint256 endIndex = size128 + numberOfSlots;
        for (uint256 index = size128; index < endIndex; index++) {
            slots128[index % 256] = value + numberOfSlots;
        }
        gas = gas - gasleft();
        console.log("128 GAS used: %d for %d", gas, numberOfSlots);
    }

    function addToSlots64(uint16 value, uint8 numberOfSlots) public {
        uint256 gas = gasleft();
        uint256 endIndex = size64 + numberOfSlots;

        for (uint256 index = size64; index < endIndex; index++) {
            slots64[index % 256] = value + numberOfSlots;
        }
        gas = gas - gasleft();
        console.log("64 GAS used: %d for %d", gas, numberOfSlots);
    }

    function addToSlots32(uint16 value, uint8 numberOfSlots) public {
        uint256 gas = gasleft();
        uint256 endIndex = size32 + numberOfSlots;

        for (uint256 index = size32; index < endIndex; index++) {
            slots32[index % 256] = value + numberOfSlots;
        }
        gas = gas - gasleft();
        console.log("32 GAS used: %d for %d", gas, numberOfSlots);
    }

    function addToSlots16(uint16 value, uint8 numberOfSlots) public {
        uint256 gas = gasleft();
        uint256 endIndex = size16 + numberOfSlots;

        for (uint256 index = size16; index < endIndex; index++) {
            slots16[index % 256] = value + numberOfSlots;
        }
        gas = gas - gasleft();
        console.log("16 GAS used: %d for %d", gas, numberOfSlots);
    }
}
