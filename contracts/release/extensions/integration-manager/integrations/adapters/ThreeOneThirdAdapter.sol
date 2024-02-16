// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {IThreeOneThird} from "../../../../../external-interfaces/IThreeOneThird.sol";
import {IAddressListRegistry} from "../../../../../persistent/address-list-registry/IAddressListRegistry.sol";
import {MathHelpers} from "../../../../../utils/0.6.12/MathHelpers.sol";
import {IIntegrationManager} from "../../IIntegrationManager.sol";
import {ThreeOneThirdActionsMixin} from "../utils/0.6.12/actions/ThreeOneThirdActionsMixin.sol";
import {AdapterBase} from "../utils/0.6.12/AdapterBase.sol";
import "../../../../../utils/0.6.12/AddressArrayLib.sol";
import "../../../../../utils/0.6.12/Uint256ArrayLib.sol";

/// @title ThreeOneThirdAdapter Contract
/// @author 31Third <dev@31third.com>, Enzyme Council <security@enzyme.finance>
/// @notice Adapter to 31Third BatchTrade Contract
contract ThreeOneThirdAdapter is AdapterBase, MathHelpers, ThreeOneThirdActionsMixin {
    using AddressArrayLib for address[];
    using Uint256ArrayLib for uint256[];

    constructor(address _integrationManager, address _batchTrade)
        public
        AdapterBase(_integrationManager)
        ThreeOneThirdActionsMixin(_batchTrade)
    {}

    // EXTERNAL FUNCTIONS

    /// @notice Take an order on 31Third
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function takeOrder(address _vaultProxy, bytes calldata _actionData, bytes calldata _assetData)
        external
        postActionIncomingAssetsTransferHandler(_vaultProxy, _assetData)
    {
        (IThreeOneThird.Trade[] memory trades, IThreeOneThird.BatchTradeConfig memory batchTradeConfig) =
            __decodeTakeOrderCallArgs(_actionData);

        __threeOneThirdBatchTrade({_trades: trades, _batchTradeConfig: batchTradeConfig});
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
        require(_selector == TAKE_ORDER_SELECTOR, "parseAssetsForAction: _selector invalid");

        uint16 feeBasisPoints = __getThreeOneThirdFeeBasisPoints();

        (IThreeOneThird.Trade[] memory trades,) = __decodeTakeOrderCallArgs(_actionData);

        uint256 tradesLength = trades.length;

        spendAssets_ = new address[](0);
        spendAssetAmounts_ = new uint256[](0);
        incomingAssets_ = new address[](0);
        minIncomingAssetAmounts_ = new uint256[](0);

        for (uint256 i; i < tradesLength; i++) {
            uint256 spendAssetIndex = spendAssets_.findIndex(trades[i].from);
            if (spendAssetIndex == type(uint256).max) {
                spendAssets_ = spendAssets_.addItem(trades[i].from);
                spendAssetAmounts_ = spendAssetAmounts_.addItem(trades[i].fromAmount);
            } else {
                spendAssetAmounts_[spendAssetIndex] += trades[i].fromAmount;
            }

            uint256 incomingAssetIndex = incomingAssets_.findIndex(trades[i].to);
            if (incomingAssetIndex == type(uint256).max) {
                incomingAssets_ = incomingAssets_.addItem(trades[i].to);
                minIncomingAssetAmounts_ = minIncomingAssetAmounts_.addItem(trades[i].minToReceiveBeforeFees.mul(10000 - feeBasisPoints).div(10000));
            } else {
                minIncomingAssetAmounts_[incomingAssetIndex] += trades[i].minToReceiveBeforeFees.mul(10000 - feeBasisPoints).div(10000);
            }
        }

        // Deduct incoming amounts from spend amounts
        // This has to be done after all spend amounts have been calculated -> extra loop
        for (uint256 i; i < tradesLength; i++) {
            uint256 spendAssetIndex = spendAssets_.findIndex(trades[i].to);

            // just if incoming asset is also spend asset
            if (spendAssetIndex != type(uint256).max) {
                spendAssetAmounts_[spendAssetIndex] -= trades[i].minToReceiveBeforeFees;
            }

        }

        // TODO: check if this can be optimized
        // Remove incoming asset if it has a dependent spend asset, where spend amount >= min incoming amount
        for (uint256 i; i < spendAssets_.length; i++) {
            uint256 incomingAssetIndex = incomingAssets_.findIndex(spendAssets_[i]);
            if (incomingAssetIndex != type(uint256).max && spendAssetAmounts_[i] >= minIncomingAssetAmounts_[incomingAssetIndex]) {
                incomingAssets_ = incomingAssets_.removeAt(incomingAssetIndex);
                minIncomingAssetAmounts_ = minIncomingAssetAmounts_.removeAt(incomingAssetIndex);
            }
        }

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    // PRIVATE FUNCTIONS

    /// @dev Decode the trades of a takeOrder call
    /// @param _actionData Encoded trades passed from client side
    /// @return trades_ Decoded trades
    function __decodeTakeOrderCallArgs(bytes memory _actionData)
        private
        pure
        returns (IThreeOneThird.Trade[] memory trades_, IThreeOneThird.BatchTradeConfig memory _batchTradeConfig)
    {
        return abi.decode(_actionData, (IThreeOneThird.Trade[], IThreeOneThird.BatchTradeConfig));
    }
}
