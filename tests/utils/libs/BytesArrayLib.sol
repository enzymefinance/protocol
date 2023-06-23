// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.19;

library BytesArrayLib {
    // MEMORY

    function encodePacked(bytes[] memory _self) internal pure returns (bytes memory packedArray_) {
        for (uint256 i; i < _self.length; i++) {
            packedArray_ = abi.encodePacked(packedArray_, _self[i]);
        }

        return packedArray_;
    }
}
