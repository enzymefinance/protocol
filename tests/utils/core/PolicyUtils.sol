// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {CoreUtilsBase} from "tests/utils/bases/CoreUtilsBase.sol";

abstract contract PolicyUtils is CoreUtilsBase {
    function encodePolicyManagerConfigData(address[] memory _policies, bytes[] memory _settingsData)
        internal
        pure
        returns (bytes memory configData_)
    {
        return abi.encode(_policies, _settingsData);
    }
}
