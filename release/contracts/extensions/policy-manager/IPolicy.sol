// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./IPolicyManager.sol";

/// @title Policy Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IPolicy {
    function activateForFund(address, address) external;

    function addFundSettings(address, bytes calldata) external;

    function identifier() external pure returns (string memory);

    function implementedHooks() external view returns (IPolicyManager.PolicyHook[] memory);

    function updateFundSettings(
        address,
        address,
        bytes calldata
    ) external;

    function validateRule(
        address,
        address,
        IPolicyManager.PolicyHook,
        bytes calldata
    ) external returns (bool);
}
