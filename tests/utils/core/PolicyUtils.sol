// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {Test} from "forge-std/Test.sol";

abstract contract PolicyUtils is Test {
    function encodePolicyManagerConfigData(address[] memory _policies, bytes[] memory _settingsData)
        internal
        pure
        returns (bytes memory configData_)
    {
        return abi.encode(_policies, _settingsData);
    }
}
