// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {CommonUtilsBase} from "tests/utils/bases/CommonUtilsBase.sol";

abstract contract ErrorUtils is CommonUtilsBase {
    function formatError(string memory _error) internal pure returns (bytes memory) {
        return abi.encodeWithSignature("Error(string)", _error);
    }

    function formatError(string memory _prefix, string memory _error) internal pure returns (bytes memory) {
        return abi.encodePacked(_prefix, abi.encodeWithSignature("Error(string)", _error));
    }
}
