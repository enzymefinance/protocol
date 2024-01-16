// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IHelperDataReader Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IHelperDataReader {
    struct VaultDetails {
        string name;
        string symbol;
        uint256 totalSupply;
        address denominationAsset;
        uint256 netShareValue;
        uint256 grossAssetValue;
        address owner;
        bool hasInvalidAum;
    }

    struct VaultDetailsExtended {
        string name;
        string symbol;
        uint256 totalSupply;
        address denominationAsset;
        uint256 netShareValue;
        uint256 grossAssetValue;
        address owner;
        bool hasInvalidAum;
        AssetAmount[] trackedAssetsAmounts;
        ExternalPositionDetails[] activeExternalPositionsDetails;
        PolicyDetails[] policiesDetails;
        FeeDetails[] feesDetails;
    }

    struct AssetAmount {
        address asset;
        uint256 amount;
    }

    struct ExternalPositionDetails {
        string label;
        address id;
        uint256 typeId;
        AssetAmount[] debtAssetsAmounts;
        AssetAmount[] managedAssetsAmounts;
    }

    struct PolicyDetails {
        string identifier;
        address id;
    }

    struct FeeDetails {
        address recipientForFund;
        address id;
    }
}
