// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {CommonUtilsBase} from "tests/utils/bases/CommonUtilsBase.sol";

abstract contract TypeUtils is CommonUtilsBase {
    // toArray() - address

    function toArray(address _0) internal pure returns (address[] memory array_) {
        array_ = new address[](1);
        array_[0] = _0;

        return array_;
    }

    function toArray(address _0, address _1) internal pure returns (address[] memory array_) {
        array_ = new address[](2);
        array_[0] = _0;
        array_[1] = _1;

        return array_;
    }

    function toArray(address _0, address _1, address _2) internal pure returns (address[] memory array_) {
        array_ = new address[](3);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;

        return array_;
    }

    function toArray(address _0, address _1, address _2, address _3) internal pure returns (address[] memory array_) {
        array_ = new address[](4);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;
        array_[3] = _3;

        return array_;
    }

    function toArray(address _0, address _1, address _2, address _3, address _4)
        internal
        pure
        returns (address[] memory array_)
    {
        array_ = new address[](5);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;
        array_[3] = _3;
        array_[4] = _4;

        return array_;
    }

    // toArray() - uint256

    function toArray(uint256 _0) internal pure returns (uint256[] memory array_) {
        array_ = new uint256[](1);
        array_[0] = _0;

        return array_;
    }

    function toArray(uint256 _0, uint256 _1) internal pure returns (uint256[] memory array_) {
        array_ = new uint256[](2);
        array_[0] = _0;
        array_[1] = _1;

        return array_;
    }

    function toArray(uint256 _0, uint256 _1, uint256 _2) internal pure returns (uint256[] memory array_) {
        array_ = new uint256[](3);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;

        return array_;
    }

    function toArray(uint256 _0, uint256 _1, uint256 _2, uint256 _3) internal pure returns (uint256[] memory array_) {
        array_ = new uint256[](4);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;
        array_[3] = _3;

        return array_;
    }

    // toArray() - bytes32

    function toArray(bytes32 _0) internal pure returns (bytes32[] memory array_) {
        array_ = new bytes32[](1);
        array_[0] = _0;

        return array_;
    }

    function toArray(bytes32 _0, bytes32 _1) internal pure returns (bytes32[] memory array_) {
        array_ = new bytes32[](2);
        array_[0] = _0;
        array_[1] = _1;

        return array_;
    }

    function toArray(bytes32 _0, bytes32 _1, bytes32 _2) internal pure returns (bytes32[] memory array_) {
        array_ = new bytes32[](3);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;

        return array_;
    }

    function toArray(bytes32 _0, bytes32 _1, bytes32 _2, bytes32 _3) internal pure returns (bytes32[] memory array_) {
        array_ = new bytes32[](4);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;
        array_[3] = _3;

        return array_;
    }

    // toArray() - bytes

    function toArray(bytes memory _0) internal pure returns (bytes[] memory array_) {
        array_ = new bytes[](1);
        array_[0] = _0;

        return array_;
    }

    function toArray(bytes memory _0, bytes memory _1) internal pure returns (bytes[] memory array_) {
        array_ = new bytes[](2);
        array_[0] = _0;
        array_[1] = _1;

        return array_;
    }

    function toArray(bytes memory _0, bytes memory _1, bytes memory _2) internal pure returns (bytes[] memory array_) {
        array_ = new bytes[](3);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;

        return array_;
    }

    function toArray(bytes memory _0, bytes memory _1, bytes memory _2, bytes memory _3)
        internal
        pure
        returns (bytes[] memory array_)
    {
        array_ = new bytes[](4);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;
        array_[3] = _3;

        return array_;
    }

    // toArray() - string

    function toArray(string memory _0) internal pure returns (string[] memory array_) {
        array_ = new string[](1);
        array_[0] = _0;

        return array_;
    }

    function toArray(string memory _0, string memory _1) internal pure returns (string[] memory array_) {
        array_ = new string[](2);
        array_[0] = _0;
        array_[1] = _1;

        return array_;
    }

    function toArray(string memory _0, string memory _1, string memory _2)
        internal
        pure
        returns (string[] memory array_)
    {
        array_ = new string[](3);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;

        return array_;
    }

    function toArray(string memory _0, string memory _1, string memory _2, string memory _3)
        internal
        pure
        returns (string[] memory array_)
    {
        array_ = new string[](4);
        array_[0] = _0;
        array_[1] = _1;
        array_[2] = _2;
        array_[3] = _3;

        return array_;
    }
}
