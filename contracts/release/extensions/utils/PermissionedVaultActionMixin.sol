// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../core/fund/comptroller/IComptroller.sol";

/// @title PermissionedVaultActionMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A mixin contract for extensions that can make permissioned vault calls
abstract contract PermissionedVaultActionMixin {
    /// @notice Adds an amount of collateral to a specific debt position
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _debtPosition The debt position to receive collateral
    /// @param _assets The assets to add as collateral
    /// @param _amounts The amounts to be added as collateral
    /// @param _data Additional data field to be used by the debt position
    function __addCollateralAssets(
        address _comptrollerProxy,
        address _debtPosition,
        address[] memory _assets,
        uint256[] memory _amounts,
        bytes memory _data
    ) internal {
        IComptroller(_comptrollerProxy).permissionedVaultAction(
            IComptroller.VaultAction.AddCollateralAsset,
            abi.encode(_debtPosition, _assets, _amounts, _data)
        );
    }

    /// @notice Adds a new debt position
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _debtPosition The debt position to be added
    function __addDebtPosition(address _comptrollerProxy, address _debtPosition) internal {
        IComptroller(_comptrollerProxy).permissionedVaultAction(
            IComptroller.VaultAction.AddDebtPosition,
            abi.encode(_debtPosition)
        );
    }

    /// @notice Adds a tracked asset to the fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _asset The asset to add
    function __addTrackedAsset(address _comptrollerProxy, address _asset) internal {
        IComptroller(_comptrollerProxy).permissionedVaultAction(
            IComptroller.VaultAction.AddTrackedAsset,
            abi.encode(_asset)
        );
    }

    /// @notice Grants an allowance to a spender to use a fund's asset
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _asset The asset for which to grant an allowance
    /// @param _target The spender of the allowance
    /// @param _amount The amount of the allowance
    function __approveAssetSpender(
        address _comptrollerProxy,
        address _asset,
        address _target,
        uint256 _amount
    ) internal {
        IComptroller(_comptrollerProxy).permissionedVaultAction(
            IComptroller.VaultAction.ApproveAssetSpender,
            abi.encode(_asset, _target, _amount)
        );
    }

    /// @notice Borrows an array of assets from a specific debt position
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _debtPosition The debt position to borrow the asset
    /// @param _assets The assets to borrow
    /// @param _amounts The amounts to be borrowed
    /// @param _data Additional data field to be used by the debt position
    function __borrowAssets(
        address _comptrollerProxy,
        address _debtPosition,
        address[] memory _assets,
        uint256[] memory _amounts,
        bytes memory _data
    ) internal {
        IComptroller(_comptrollerProxy).permissionedVaultAction(
            IComptroller.VaultAction.BorrowAsset,
            abi.encode(_debtPosition, _assets, _amounts, _data)
        );
    }

    /// @notice Burns fund shares for a particular account
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _target The account for which to burn shares
    /// @param _amount The amount of shares to burn
    function __burnShares(
        address _comptrollerProxy,
        address _target,
        uint256 _amount
    ) internal {
        IComptroller(_comptrollerProxy).permissionedVaultAction(
            IComptroller.VaultAction.BurnShares,
            abi.encode(_target, _amount)
        );
    }

    /// @notice Mints fund shares to a particular account
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _target The account to which to mint shares
    /// @param _amount The amount of shares to mint
    function __mintShares(
        address _comptrollerProxy,
        address _target,
        uint256 _amount
    ) internal {
        IComptroller(_comptrollerProxy).permissionedVaultAction(
            IComptroller.VaultAction.MintShares,
            abi.encode(_target, _amount)
        );
    }

    /// @notice Removes an amount of collateral asset from a specific debt position
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _debtPosition The debt position to remove the collateral
    /// @param _assets The assets to remove as collateral
    /// @param _amounts The amounts to be removed from collateral
    /// @param _data Additional data field to be used by the debt position
    function __removeCollateralAssets(
        address _comptrollerProxy,
        address _debtPosition,
        address[] memory _assets,
        uint256[] memory _amounts,
        bytes memory _data
    ) internal {
        IComptroller(_comptrollerProxy).permissionedVaultAction(
            IComptroller.VaultAction.RemoveCollateralAsset,
            abi.encode(_debtPosition, _assets, _amounts, _data)
        );
    }

    /// @notice Removes a debt posiition from the vaultProxy
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _debtPosition The DebtPosition to remove
    function __removeDebtPosition(address _comptrollerProxy, address _debtPosition) internal {
        IComptroller(_comptrollerProxy).permissionedVaultAction(
            IComptroller.VaultAction.RemoveDebtPosition,
            abi.encode(_debtPosition)
        );
    }

    /// @notice Removes a tracked asset from the fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _asset The asset to remove
    function __removeTrackedAsset(address _comptrollerProxy, address _asset) internal {
        IComptroller(_comptrollerProxy).permissionedVaultAction(
            IComptroller.VaultAction.RemoveTrackedAsset,
            abi.encode(_asset)
        );
    }

    /// @notice Repays an amount of previously borrowed assets on a specific debt position
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _debtPosition The debt position to receive collateral
    /// @param _assets The assets to repay
    /// @param _amounts The amounts to be repaid
    /// @param _data Additional data field to be used by the debt position
    function __repayBorrowedAssets(
        address _comptrollerProxy,
        address _debtPosition,
        address[] memory _assets,
        uint256[] memory _amounts,
        bytes memory _data
    ) internal {
        IComptroller(_comptrollerProxy).permissionedVaultAction(
            IComptroller.VaultAction.RepayBorrowedAsset,
            abi.encode(_debtPosition, _assets, _amounts, _data)
        );
    }

    /// @notice Transfers fund shares from one account to another
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _from The account from which to transfer shares
    /// @param _to The account to which to transfer shares
    /// @param _amount The amount of shares to transfer
    function __transferShares(
        address _comptrollerProxy,
        address _from,
        address _to,
        uint256 _amount
    ) internal {
        IComptroller(_comptrollerProxy).permissionedVaultAction(
            IComptroller.VaultAction.TransferShares,
            abi.encode(_from, _to, _amount)
        );
    }

    /// @notice Withdraws an asset from the VaultProxy to a given account
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _asset The asset to withdraw
    /// @param _target The account to which to withdraw the asset
    /// @param _amount The amount of asset to withdraw
    function __withdrawAssetTo(
        address _comptrollerProxy,
        address _asset,
        address _target,
        uint256 _amount
    ) internal {
        IComptroller(_comptrollerProxy).permissionedVaultAction(
            IComptroller.VaultAction.WithdrawAssetTo,
            abi.encode(_asset, _target, _amount)
        );
    }
}
