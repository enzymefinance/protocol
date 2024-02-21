// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.19;

library SignatureLib {
    function signatureToString(uint8 _v, bytes32 _r, bytes32 _s) internal pure returns (bytes memory signature_) {
        signature_ = new bytes(65);
        assembly {
            // First 32 bytes store 'r'
            mstore(add(signature_, 0x20), _r)
            // Next 32 bytes store 's'
            mstore(add(signature_, 0x40), _s)
            // Last byte stores 'v'
            mstore8(add(signature_, 0x60), _v)
        }
        return signature_;
    }
}
