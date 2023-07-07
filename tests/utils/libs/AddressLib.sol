// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.19;

library AddressLib {
    function toBytes32(address _self) internal pure returns (bytes32 bytes32_) {
        return bytes32(uint256(uint160(_self)));
    }
}
