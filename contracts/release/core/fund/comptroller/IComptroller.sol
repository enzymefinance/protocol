// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IComptroller Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IComptroller {
    enum VaultAction {
        None,
        BurnShares,
        MintShares,
        TransferShares,
        ApproveAssetSpender,
        WithdrawAssetTo,
        AddTrackedAsset,
        RemoveTrackedAsset
    }

    function activate(address, bool) external;

    function calcGav(bool) external returns (uint256, bool);

    function calcGrossShareValue(bool) external returns (uint256, bool);

    function callOnExtension(
        address,
        uint256,
        bytes calldata
    ) external;

    function configureExtensions(bytes calldata, bytes calldata) external;

    function destruct() external;

    function getDenominationAsset() external view returns (address);

    function getVaultProxy() external view returns (address);

    function init(address, uint256) external;

    function permissionedVaultAction(VaultAction, bytes calldata) external;
}
