// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IExtension Interface
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Interface for all extensions
interface IExtension {
    function activateForFund(bool _isMigration) external;

    function deactivateForFund() external;

    function receiveCallFromComptroller(address _caller, uint256 _actionId, bytes calldata _callArgs) external;

    function setConfigForFund(address _comptrollerProxy, address _vaultProxy, bytes calldata _configData) external;
}
