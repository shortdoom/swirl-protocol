// SPDX-License-Identifier: MIT
pragma solidity 0.7.4;
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/SafeCast.sol";

/**
 * @dev Library for storing a sliding window of SIZE elements.
 *      Elements can be added and edited with random access, element retrieval and advancement is sequential.
 *      The principal purpose of this library is to have gas efficient storage and access,
 *      This implementation creates an infinite virtual list by using a circular buffer and restricts
 *      the maximum number of editable future elements.
 *      Values are compressed using a scaling factor to allow packed SSTORE of multiple array elements.
 *      Amendments of the window and its values are performed by supplying intervals which are either added or
 *      substracted to the elements currently stored.
 *      Since the buffer is always hot, elements are always kept at a non zero value so to avoid re-initialization
 *      cost after each buffer wrapping.
 *
 * ```
 * contract Example {
 *     // Add the library methods
 *     using SlidingWindow for SlidingWindow.CompressedCircularBuffer;
 *
 *     // Declare a set state variable
 *     SlidingWindow.CompressedCircularBuffer private window;
 * }
 * ```
 *
 */

library SlidingWindow {
    using SafeMath for uint256;
    using Math for uint256;
    using SafeCast for uint256;

    // @dev Maximum number of editable elements
    uint16 public constant SIZE = 256;
    // @dev Baseline value for elements to avoid re-initialization cost
    uint64 private constant _EMPTY_VALUE = 1;

    struct CompressedCircularBuffer {
        // @dev Packed array to store values
        uint64[SIZE] slots;
        // @dev virtualIndex of the next available element
        uint32 nextVirtualIndex;
        // @dev Value by which to compress elements' value
        uint256 scalingFactor;
    }

    /**
     * @dev Initializes scaling factor and inital index
     * @param scalingFactor Value by which to compress elements' value
     */
    function init(CompressedCircularBuffer storage buffer, uint256 scalingFactor) internal {
        require(buffer.nextVirtualIndex == 0, "SW:ALREADY_INIT");
        buffer.nextVirtualIndex = 1;
        buffer.scalingFactor = scalingFactor;
    }

    /**
     * @dev Checks if initialized
     * @return True if initialized
     */
    function isInitialized(CompressedCircularBuffer storage buffer) internal view returns (bool) {
        return buffer.nextVirtualIndex != 0;
    }

    /**
     * @dev Edits current window values.
     *      Modifications are passed as intervals which are either added or
     *      subtracted to current window values. Intervals implicitely start
     *      from the next virtualIndex as we do not care about past values.
     * @param subtractiveValue Value to be subtracted
     * @param subtractiveRangeEnd End virtualIndex of the interval to be subtracted
     * @param additiveValue Value to be added
     * @param additiveRangeEnd End virtualIndex of the interval to be added
     */
    function edit(
        CompressedCircularBuffer storage buffer,
        uint256 subtractiveValue,
        uint256 subtractiveRangeEnd,
        uint256 additiveValue,
        uint256 additiveRangeEnd
    ) internal {
        // Calculate the end of the range under modification
        uint256 lastIndex = Math.max(additiveRangeEnd, subtractiveRangeEnd);
        uint256 scalingFactor = buffer.scalingFactor;
        uint32 nextVirtualIndex = buffer.nextVirtualIndex;
        // The range cannot be larger than the underlying buffer
        require(lastIndex <= nextVirtualIndex + SIZE, "SW:WRITE_OUT_OF_BOUNDS");
        // Compress values
        uint256 compressededAdditiveValue = _compress(additiveValue, scalingFactor);
        uint256 compressededSubtractiveValue = _compress(subtractiveValue, scalingFactor);
        // Adjust schedule
        for (uint32 i = nextVirtualIndex; i < lastIndex; i++) {
            uint256 compressedSlotValue = _getVirtual(buffer, i);
            // Add additive value if within its specified range
            if (i < additiveRangeEnd && additiveValue > 0) {
                compressedSlotValue = compressedSlotValue.add(compressededAdditiveValue);
            }
            // Subtract subtractive value if within its specified range
            if (i < subtractiveRangeEnd && subtractiveValue > 0) {
                compressedSlotValue = compressedSlotValue.sub(compressededSubtractiveValue);
            }
            _setVirtual(buffer, i, compressedSlotValue);
        }
    }

    /**
     * @dev Retrieves value at a specific virtual index
     * @param virtualIndex Virtual index of the element to retrieve
     * @return Element at index
     */
    function _getVirtual(CompressedCircularBuffer storage buffer, uint32 virtualIndex) private view returns (uint256) {
        return _get(buffer, virtualIndex % SIZE);
    }

    /**
     * @dev Retrieve value at a specific physical index
     * @param index Physical index of the element to retrieve
     * @return Element at index
     */
    function _get(CompressedCircularBuffer storage buffer, uint32 index) private view returns (uint256) {
        uint64 value = buffer.slots[index];
        return value <= _EMPTY_VALUE ? 0 : uint256(value - _EMPTY_VALUE);
    }

    /**
     * @dev Stores a value at a specific index
     * @param virtualIndex Index of the element to store
     * @param value Value to store
     */
    function _setVirtual(
        CompressedCircularBuffer storage buffer,
        uint32 virtualIndex,
        uint256 value
    ) private {
        buffer.slots[virtualIndex % SIZE] = (value + _EMPTY_VALUE).toUint64();
    }

    /**
     * @dev Returns true if there's a non null value available
     * @return True if next element is available
     */
    function hasNext(CompressedCircularBuffer storage buffer) internal view returns (bool) {
        return buffer.slots[buffer.nextVirtualIndex % SIZE] > _EMPTY_VALUE;
    }

    /**
     * @dev Retrieves the next available value and moves the window forward
     */
    function next(CompressedCircularBuffer storage buffer) internal returns (uint256 value) {
        // Calculate next physical index
        uint32 nextPhysicalIndex = buffer.nextVirtualIndex % SIZE;
        value = _decompress(_get(buffer, nextPhysicalIndex), buffer.scalingFactor);
        // The window can be advanced only if there's a value available
        require(value != 0, "SW:READ_OUT_OF_BOUNDS");
        // Advance window
        buffer.slots[nextPhysicalIndex] = _EMPTY_VALUE;
        buffer.nextVirtualIndex++;
    }

    /**
     * @dev Retrieves the next available value without moving the window forward
     */
    function peek(CompressedCircularBuffer storage buffer) internal view returns (uint256) {
        return _decompress(_getVirtual(buffer, buffer.nextVirtualIndex), buffer.scalingFactor);
    }

    /**
     * @dev Returns a representation of the current window
     */
    function toArray(CompressedCircularBuffer storage buffer) internal view returns (uint256[SIZE] memory array) {
        uint32 nextVirtualIndex = buffer.nextVirtualIndex % SIZE;
        uint256 scalingFactor = buffer.scalingFactor;
        for (uint32 virtualIndex = nextVirtualIndex; virtualIndex < nextVirtualIndex + SIZE; virtualIndex++) {
            array[virtualIndex - nextVirtualIndex] = _decompress(_getVirtual(buffer, virtualIndex), scalingFactor);
        }
    }

    /**
     * @dev Compresses a value
     * @param value Value to compress
     * @param scalingFactor Scaling factor for compression
     * @return compressedValue Compressed value
     */
    function _compress(uint256 value, uint256 scalingFactor) internal pure returns (uint256 compressedValue) {
        compressedValue = value.div(scalingFactor);
        require(compressedValue > 0 || value == 0, "SW:QTY_UNDERFLOW");
    }

    /**
     * @dev Decompresses a value
     * @param value Value to decompress
     * @param scalingFactor Scaling factor for decompression
     * @return decompressedValue Decompressed value
     */
    function _decompress(uint256 value, uint256 scalingFactor) internal pure returns (uint256 decompressedValue) {
        decompressedValue = value.mul(scalingFactor);
    }
}
