// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IIntegrationManager interface
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Interface for the IntegrationManager
interface IIntegrationManager {
    enum SpendAssetsHandleType {
        None,
        Approve,
        Transfer
    }

    function getPolicyManager() external view returns (address policyManager_);

    function getValueInterpreter() external view returns (address valueInterpreter_);
}
