// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../persistent/external-positions/IExternalPosition.sol";
import "../release/utils/AddressArrayLib.sol";

/// @title MockGenericExternalPosition Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Provides a generic external position to be used on tests
contract MockGenericExternalPositionLib is IExternalPosition {
    using AddressArrayLib for address[];

    enum MockGenericExternalPositionActions {
        AddManagedAssets,
        RemoveManagedAssets,
        AddDebtAssets,
        RemoveDebtAssets
    }

    address[] private debtAssets;
    address[] private managedAssets;

    mapping(address => uint256) private debtAssetsToAmounts;
    mapping(address => uint256) private managedAssetsToAmounts;

    function init(bytes memory) external override {}

    function receiveCallFromVault(bytes memory _actionData) external override {
        (uint256 actionId, bytes memory actionArgs) = abi.decode(_actionData, (uint256, bytes));

        (address[] memory assets, uint256[] memory amounts) = abi.decode(
            actionArgs,
            (address[], uint256[])
        );
        if (actionId == uint256(MockGenericExternalPositionActions.AddManagedAssets)) {
            __addManagedAssets(assets, amounts);
        } else if (actionId == uint256(MockGenericExternalPositionActions.RemoveManagedAssets)) {
            __removeManagedAssets(assets);
        } else if (actionId == uint256(MockGenericExternalPositionActions.AddDebtAssets)) {
            __addDebtAssets(assets, amounts);
        } else if (actionId == uint256(MockGenericExternalPositionActions.RemoveDebtAssets)) {
            __removeDebtAssets(assets);
        } else {
            revert("receiveCallFromVault: Invalid actionId");
        }
    }

    /// @dev Adds an array of assets to the existing debt assets
    function __addDebtAssets(address[] memory _assets, uint256[] memory _amounts) private {
        for (uint256 i; i < _assets.length; i++) {
            debtAssets.push(_assets[i]);

            debtAssetsToAmounts[_assets[i]] = _amounts[i];
        }
    }

    /// @dev Adds an array of assets to the existing managed assets
    function __addManagedAssets(address[] memory _assets, uint256[] memory _amounts) private {
        for (uint256 i; i < _assets.length; i++) {
            managedAssets.push(_assets[i]);

            managedAssetsToAmounts[_assets[i]] = _amounts[i];
        }
    }

    /// @dev Removes an array of assets from the existing debt assets
    function __removeDebtAssets(address[] memory _assets) private {
        for (uint256 i; i < _assets.length; i++) {
            if (debtAssetsToAmounts[_assets[i]] > 0) {
                debtAssets.removeStorageItem(_assets[i]);
                debtAssetsToAmounts[_assets[i]] = 0;
            }
        }
    }

    /// @dev Removes an array of assets from the existing managed assets
    function __removeManagedAssets(address[] memory _assets) private {
        for (uint256 i; i < _assets.length; i++) {
            if (managedAssetsToAmounts[_assets[i]] > 0) {
                managedAssets.removeStorageItem(_assets[i]);
                managedAssetsToAmounts[_assets[i]] = 0;
            }
        }
    }

    /// @dev Gets the array of debt assets
    function getDebtAssets()
        external
        override
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        assets_ = new address[](debtAssets.length);
        amounts_ = new uint256[](debtAssets.length);

        for (uint256 i; i < debtAssets.length; i++) {
            assets_[i] = debtAssets[i];
            amounts_[i] = debtAssetsToAmounts[assets_[i]];
        }
        return (assets_, amounts_);
    }

    /// @dev Gets the array of managed assets
    function getManagedAssets()
        external
        override
        returns (address[] memory assets_, uint256[] memory amounts_)
    {
        assets_ = new address[](managedAssets.length);
        amounts_ = new uint256[](managedAssets.length);

        for (uint256 i; i < managedAssets.length; i++) {
            assets_[i] = managedAssets[i];
            amounts_[i] = managedAssetsToAmounts[assets_[i]];
        }
        return (assets_, amounts_);
    }
}
