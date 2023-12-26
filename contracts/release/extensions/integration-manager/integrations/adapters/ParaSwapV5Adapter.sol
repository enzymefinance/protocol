// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {IERC20} from "../../../../../external-interfaces/IERC20.sol";
import {IParaSwapV5AugustusSwapper} from "../../../../../external-interfaces/IParaSwapV5AugustusSwapper.sol";
import {AddressArrayLib} from "../../../../../utils/0.6.12/AddressArrayLib.sol";
import {IIntegrationManager} from "../../IIntegrationManager.sol";
import {ParaSwapV5ActionsMixin} from "../utils/0.6.12/actions/ParaSwapV5ActionsMixin.sol";
import {AdapterBase} from "../utils/0.6.12/AdapterBase.sol";

/// @title ParaSwapV5Adapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for interacting with ParaSwap (v5)
/// @dev Does not support any protocol that collects additional protocol fees as ETH/WETH, e.g., 0x v3
contract ParaSwapV5Adapter is AdapterBase, ParaSwapV5ActionsMixin {
    using AddressArrayLib for address[];

    enum SwapType {
        Simple,
        Multi,
        Mega
    }

    event MultipleOrdersItemFailed(uint256 index, bytes reason);

    constructor(
        address _integrationManager,
        address _augustusSwapper,
        address _tokenTransferProxy,
        address _feePartner,
        uint256 _feePercent
    )
        public
        AdapterBase(_integrationManager)
        ParaSwapV5ActionsMixin(_augustusSwapper, _tokenTransferProxy, _feePartner, _feePercent)
    {}

    /////////////
    // ACTIONS //
    /////////////

    /// @notice Executes multiple trades on ParaSwap
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function takeMultipleOrders(address _vaultProxy, bytes calldata _actionData, bytes calldata _assetData)
        external
        postActionSpendAssetsTransferHandler(_vaultProxy, _assetData)
    {
        (bytes[] memory ordersData, bool allowOrdersToFail) = __decodeTakeMultipleOrdersCallArgs(_actionData);

        if (allowOrdersToFail) {
            for (uint256 i; i < ordersData.length; i++) {
                try this.takeOrderAndValidateIncoming(_vaultProxy, ordersData[i]) {}
                catch (bytes memory reason) {
                    emit MultipleOrdersItemFailed(i, reason);
                }
            }
        } else {
            for (uint256 i; i < ordersData.length; i++) {
                __takeOrderAndValidateIncoming(_vaultProxy, ordersData[i]);
            }
        }
    }

    /// @notice Trades assets on ParaSwap
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @dev ParaSwap v5 completely uses entire outgoing asset balance and incoming asset
    /// is sent directly to the beneficiary (the _vaultProxy)
    function takeOrder(address _vaultProxy, bytes calldata _actionData, bytes calldata) external {
        __takeOrder({_vaultProxy: _vaultProxy, _orderData: _actionData});
    }

    /// @notice External implementation of __takeOrderAndValidateIncoming(), only intended for internal usage
    /// @dev Necessary for try/catch
    function takeOrderAndValidateIncoming(address _vaultProxy, bytes calldata _orderData) external {
        __takeOrderAndValidateIncoming(_vaultProxy, _orderData);
    }

    /// @dev Helper to route an order according to its swap type
    function __takeOrder(address _vaultProxy, bytes memory _orderData) private {
        (
            uint256 minIncomingAssetAmount,
            uint256 expectedIncomingAssetAmount,
            address outgoingAsset,
            uint256 outgoingAssetAmount,
            bytes16 uuid,
            SwapType swapType,
            bytes memory swapData
        ) = __decodeTakeOrderCallArgs(_orderData);

        if (swapType == SwapType.Mega) {
            __paraSwapV5MegaSwap({
                _fromToken: outgoingAsset,
                _fromAmount: outgoingAssetAmount,
                _toAmount: minIncomingAssetAmount,
                _expectedAmount: expectedIncomingAssetAmount,
                _beneficiary: payable(_vaultProxy),
                _uuid: uuid,
                _path: __decodeMegaSwapData(swapData)
            });
        } else if (swapType == SwapType.Multi) {
            __paraSwapV5MultiSwap({
                _fromToken: outgoingAsset,
                _fromAmount: outgoingAssetAmount,
                _toAmount: minIncomingAssetAmount,
                _expectedAmount: expectedIncomingAssetAmount,
                _beneficiary: payable(_vaultProxy),
                _uuid: uuid,
                _path: __decodeMultiSwapData(swapData)
            });
        } else if (swapType == SwapType.Simple) {
            __paraSwapV5SimpleSwap({
                _fromToken: outgoingAsset,
                _fromAmount: outgoingAssetAmount,
                _toAmount: minIncomingAssetAmount,
                _expectedAmount: expectedIncomingAssetAmount,
                _simpleSwapParams: __decodeSimpleSwapData(swapData),
                _beneficiary: payable(_vaultProxy),
                _uuid: uuid
            });
        }
    }

    /// @dev Helper to trade assets on ParaSwap and then validate the received asset amount.
    /// The validation is probably unnecessary since ParaSwap validates the min amount,
    /// but it is consistent with the practice of doing all validations internally also,
    /// which is bypassed during the actions that call this function.
    function __takeOrderAndValidateIncoming(address _vaultProxy, bytes memory _orderData) private {
        (uint256 minIncomingAssetAmount,,,,, SwapType swapType, bytes memory swapData) =
            __decodeTakeOrderCallArgs(_orderData);

        address incomingAsset = __getIncomingAssetFromSwapData({_swapType: swapType, _swapData: swapData});

        uint256 preIncomingAssetBal = IERC20(incomingAsset).balanceOf(_vaultProxy);

        __takeOrder({_vaultProxy: _vaultProxy, _orderData: _orderData});

        require(
            IERC20(incomingAsset).balanceOf(_vaultProxy).sub(preIncomingAssetBal) >= minIncomingAssetAmount,
            "__takeOrderAndValidateIncoming: Received incoming asset less than expected"
        );
    }

    /////////////////////////////
    // PARSE ASSETS FOR ACTION //
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
        if (_selector == TAKE_ORDER_SELECTOR) {
            spendAssets_ = new address[](1);
            spendAssetAmounts_ = new uint256[](1);
            incomingAssets_ = new address[](1);
            minIncomingAssetAmounts_ = new uint256[](1);
            SwapType swapType;
            bytes memory swapData;

            (minIncomingAssetAmounts_[0],, spendAssets_[0], spendAssetAmounts_[0],, swapType, swapData) =
                __decodeTakeOrderCallArgs(_actionData);

            incomingAssets_[0] = __getIncomingAssetFromSwapData({_swapType: swapType, _swapData: swapData});
        } else if (_selector == TAKE_MULTIPLE_ORDERS_SELECTOR) {
            (bytes[] memory ordersData,) = __decodeTakeMultipleOrdersCallArgs(_actionData);

            spendAssets_ = new address[](ordersData.length);
            spendAssetAmounts_ = new uint256[](ordersData.length);
            for (uint256 i; i < ordersData.length; i++) {
                SwapType swapType;
                bytes memory swapData;
                (,, spendAssets_[i], spendAssetAmounts_[i],, swapType, swapData) =
                    __decodeTakeOrderCallArgs(ordersData[i]);

                // Add unique incoming assets
                incomingAssets_ = incomingAssets_.addUniqueItem(
                    __getIncomingAssetFromSwapData({_swapType: swapType, _swapData: swapData})
                );
            }
            (spendAssets_, spendAssetAmounts_) = __aggregateAssetAmounts(spendAssets_, spendAssetAmounts_);

            // Ignores the IntegrationManager's incoming asset amount validations in order
            // to support optional order failure bypass,
            // and also due to min amounts being more of a per-order validation
            // (see __takeOrderAndValidateIncoming() for inline validation)
            minIncomingAssetAmounts_ = new uint256[](incomingAssets_.length);
        } else {
            revert("parseAssetsForAction: _selector invalid");
        }

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    //////////////
    // DECODERS //
    //////////////

    /// @dev Helper to decode the encoded swapData for MegaSwap
    function __decodeMegaSwapData(bytes memory _swapData)
        private
        pure
        returns (IParaSwapV5AugustusSwapper.MegaSwapPath[] memory path_)
    {
        return abi.decode(_swapData, (IParaSwapV5AugustusSwapper.MegaSwapPath[]));
    }

    /// @dev Helper to decode the encoded swapData for MultiSwap
    function __decodeMultiSwapData(bytes memory _swapData)
        private
        pure
        returns (IParaSwapV5AugustusSwapper.Path[] memory path_)
    {
        return abi.decode(_swapData, (IParaSwapV5AugustusSwapper.Path[]));
    }

    /// @dev Helper to decode the encoded swapData for SimpleSwap
    function __decodeSimpleSwapData(bytes memory _swapData)
        private
        pure
        returns (SimpleSwapParams memory simpleSwapParams_)
    {
        return abi.decode(_swapData, (SimpleSwapParams));
    }

    /// @dev Helper to decode the encoded callOnIntegration call arguments for takeOrder()
    function __decodeTakeOrderCallArgs(bytes memory _actionData)
        private
        pure
        returns (
            uint256 minIncomingAssetAmount_,
            uint256 expectedIncomingAssetAmount_,
            address outgoingAsset_,
            uint256 outgoingAssetAmount_,
            bytes16 uuid_, // Passed as a courtesy to ParaSwap for analytics
            SwapType swapType_,
            bytes memory swapData_
        )
    {
        return abi.decode(_actionData, (uint256, uint256, address, uint256, bytes16, SwapType, bytes));
    }

    /// @dev Helper to decode the encoded callOnIntegration call arguments for takeMultipleOrders()
    function __decodeTakeMultipleOrdersCallArgs(bytes calldata _actionData)
        private
        pure
        returns (bytes[] memory ordersData, bool allowOrdersToFail)
    {
        return abi.decode(_actionData, (bytes[], bool));
    }

    /////////////
    // HELPERS //
    /////////////

    /// @dev Helper to retrieve incoming asset from swapData
    function __getIncomingAssetFromSwapData(SwapType _swapType, bytes memory _swapData)
        private
        pure
        returns (address incomingAsset_)
    {
        if (_swapType == SwapType.Mega) {
            IParaSwapV5AugustusSwapper.MegaSwapPath[] memory megaPaths = __decodeMegaSwapData(_swapData);
            IParaSwapV5AugustusSwapper.Path[] memory paths = megaPaths[0].path;
            incomingAsset_ = paths[paths.length - 1].to;
        } else if (_swapType == SwapType.Multi) {
            IParaSwapV5AugustusSwapper.Path[] memory paths = __decodeMultiSwapData(_swapData);
            incomingAsset_ = paths[paths.length - 1].to;
        } else if (_swapType == SwapType.Simple) {
            SimpleSwapParams memory simpleSwapParams = __decodeSimpleSwapData(_swapData);
            incomingAsset_ = simpleSwapParams.incomingAsset;
        }
    }
}
