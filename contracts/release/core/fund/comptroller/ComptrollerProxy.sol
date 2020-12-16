// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../../utils/Proxy.sol";

/// @title ComptrollerProxy Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A proxy contract for all ComptrollerProxy instances
contract ComptrollerProxy is Proxy {
    constructor(bytes memory _constructData, address _comptrollerLib)
        public
        Proxy(_constructData, _comptrollerLib)
    {}
}
