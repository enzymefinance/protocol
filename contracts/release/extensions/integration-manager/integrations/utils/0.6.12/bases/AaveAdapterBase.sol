// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import {SafeMath} from "openzeppelin-solc-0.6/math/SafeMath.sol";
import {AddOnlyAddressListOwnerConsumerMixin} from
    "../../../../../../../persistent/address-list-registry/address-list-owners/utils/0.6.12/AddOnlyAddressListOwnerConsumerMixin.sol";
import {IAaveAToken} from "../../../../../../../external-interfaces/IAaveAToken.sol";
import {IIntegrationManager} from "../../../../IIntegrationManager.sol";
import {AdapterBase} from "../AdapterBase.sol";

/// @title AaveAdapterBase Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Base contract for Aave V2 and V3 lending adapters
/// @dev When lending and redeeming, a small `ROUNDING_BUFFER` is subtracted from the min incoming asset amount.
/// This is a workaround for problematic quirks in `aToken` balance rounding (due to RayMath and rebasing logic),
/// which would otherwise lead to tx failures during IntegrationManager validation of incoming asset amounts.
/// Due to this workaround, an `aToken` value less than `ROUNDING_BUFFER` is not usable in this adapter,
/// which is fine because those values would not make sense (gas-wise) to lend or redeem.
abstract contract AaveAdapterBase is AdapterBase, AddOnlyAddressListOwnerConsumerMixin {
    using SafeMath for uint256;

    uint256 private constant ROUNDING_BUFFER = 2;

    constructor(address _integrationManager, address _addressListRegistry, uint256 _aTokenListId)
        public
        AdapterBase(_integrationManager)
        AddOnlyAddressListOwnerConsumerMixin(_addressListRegistry, _aTokenListId)
    {}

    ////////////////////////////////
    // REQUIRED VIRTUAL FUNCTIONS //
    ////////////////////////////////

    /// @dev Logic to lend underlying for aToken
    function __lend(address _vaultProxy, address _underlying, uint256 _amount) internal virtual;

    /// @dev Logic to redeem aToken for underlying
    function __redeem(address _vaultProxy, address _underlying, uint256 _amount) internal virtual;

    /////////////
    // ACTIONS //
    /////////////

    /// @notice Lends an amount of a token to AAVE
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function lend(address _vaultProxy, bytes calldata, bytes calldata _assetData) external onlyIntegrationManager {
        (address[] memory spendAssets, uint256[] memory spendAssetAmounts, address[] memory incomingAssets) =
            __decodeAssetData(_assetData);

        // Validate aToken.
        // Must be done here instead of parseAssetsForAction(),
        // since overriding visibility is not allowed.
        __validateAndAddListItemIfUnregistered(incomingAssets[0]);

        __lend({_vaultProxy: _vaultProxy, _underlying: spendAssets[0], _amount: spendAssetAmounts[0]});
    }

    /// @notice Redeems an amount of aTokens from AAVE
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function redeem(address _vaultProxy, bytes calldata, bytes calldata _assetData) external onlyIntegrationManager {
        (address[] memory spendAssets, uint256[] memory spendAssetAmounts, address[] memory incomingAssets) =
            __decodeAssetData(_assetData);

        // Validate aToken.
        // Must be done here instead of parseAssetsForAction(),
        // since overriding visibility is not allowed.
        __validateAndAddListItemIfUnregistered(spendAssets[0]);

        __redeem({_vaultProxy: _vaultProxy, _underlying: incomingAssets[0], _amount: spendAssetAmounts[0]});
    }

    /////////////////////////////
    // PARSE ASSETS FOR METHOD //
    /////////////////////////////

    /// @notice Parses the expected assets in a particular action
    /// @param _selector The function selector for the callOnIntegration
    /// @param _actionData Data specific to this action
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForAction(address, bytes4 _selector, bytes calldata _actionData)
        external
        view
        override
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        if (_selector == LEND_SELECTOR) {
            return __parseAssetsForLend(_actionData);
        } else if (_selector == REDEEM_SELECTOR) {
            return __parseAssetsForRedeem(_actionData);
        }

        revert("parseAssetsForAction: _selector invalid");
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during lend() calls
    function __parseAssetsForLend(bytes calldata _actionData)
        private
        view
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        (address aToken, uint256 amount) = __decodeCallArgs(_actionData);

        spendAssets_ = new address[](1);
        spendAssets_[0] = IAaveAToken(aToken).UNDERLYING_ASSET_ADDRESS();
        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = amount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = aToken;
        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = amount.sub(ROUNDING_BUFFER);

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Helper function to parse spend and incoming assets from encoded call args
    /// during redeem() calls
    function __parseAssetsForRedeem(bytes calldata _actionData)
        private
        view
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        (address aToken, uint256 amount) = __decodeCallArgs(_actionData);

        spendAssets_ = new address[](1);
        spendAssets_[0] = aToken;
        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = amount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = IAaveAToken(aToken).UNDERLYING_ASSET_ADDRESS();
        minIncomingAssetAmounts_ = new uint256[](1);
        // The `ROUNDING_BUFFER` is overly cautious in this case, but it comes at minimal expense
        minIncomingAssetAmounts_[0] = amount.sub(ROUNDING_BUFFER);

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to decode callArgs for lend and redeem
    function __decodeCallArgs(bytes memory _actionData) private pure returns (address aToken_, uint256 amount_) {
        return abi.decode(_actionData, (address, uint256));
    }
}
