// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.19;

library Bytes32Lib {
    function toAddress(bytes32 _self) internal pure returns (address address_) {
        return address(uint160(uint256(_self)));
    }

    function toBytes4(bytes32 _self) internal pure returns (bytes4 bytes4_) {
        return bytes4(_self);
    }
}
