// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../IExtension.sol";

/// @title ExtensionBase Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Base class for extensions
abstract contract ExtensionBase is IExtension {
    function activateForFund() external virtual override {
        // UNIMPLEMENTED
    }

    function deactivateForFund() external virtual override {
        // UNIMPLEMENTED
    }

    function setConfigForFund(bytes calldata) external virtual override {
        // UNIMPLEMENTED
    }
}
