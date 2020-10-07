// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./IPolicyManager.sol";

/// @title Policy Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IPolicy {
    function activateForFund(address) external;

    function addFundSettings(address, bytes calldata) external;

    function identifier() external pure returns (string memory);

    function policyHook() external view returns (IPolicyManager.PolicyHook);

    function policyHookExecutionTime()
        external
        view
        returns (IPolicyManager.PolicyHookExecutionTime);

    function updateFundSettings(address, bytes calldata) external;

    function validateRule(address, bytes calldata) external returns (bool);
}
