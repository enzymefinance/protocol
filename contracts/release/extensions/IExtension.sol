// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title IExtension Interface
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Interface for all extensions
interface IExtension {
    function activateForFund(bool _isMigration) external;

    function deactivateForFund() external;

    function receiveCallFromComptroller(
        address _comptrollerProxy,
        uint256 _actionId,
        bytes calldata _callArgs
    ) external;

    function setConfigForFund(bytes calldata _configData) external;
}
