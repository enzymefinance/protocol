// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

/// @title PolicyManager Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IPolicyManager {
    enum PolicyHook {None, BuyShares, CallOnIntegration}
    enum PolicyHookExecutionTime {None, Pre, Post}

    function enablePolicies(address[] calldata, bytes[] calldata) external;

    function postValidatePolicy(PolicyHook, bytes calldata) external;

    function preValidatePolicy(PolicyHook, bytes calldata) external;
}

/// @title PolicyManagerFactory Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IPolicyManagerFactory {
    function createInstance(address _hub) external returns (address);
}
