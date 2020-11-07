// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./libs/IPermissionedVaultActionLib.sol";

/// @title IComptroller Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IComptroller {
    function activate(address, bool) external;

    function calcGav() external returns (uint256, bool);

    function calcGrossShareValue() external returns (uint256, bool);

    function callOnExtension(
        address,
        uint256,
        bytes calldata
    ) external;

    function configureExtensions(bytes calldata, bytes calldata) external;

    function destruct() external;

    function getVaultProxy() external view returns (address);

    function init(
        address,
        uint256,
        address[] calldata
    ) external;

    function permissionedVaultAction(IPermissionedVaultActionLib.VaultAction, bytes calldata)
        external;
}
