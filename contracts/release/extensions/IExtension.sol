// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title IExtension Interface
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Interface for all extensions
interface IExtension {
    function activateForFund(bool) external;

    function deactivateForFund() external;

    function receiveCallFromComptroller(
        address,
        uint256,
        bytes calldata
    ) external;

    function setConfigForFund(bytes calldata) external;
}
