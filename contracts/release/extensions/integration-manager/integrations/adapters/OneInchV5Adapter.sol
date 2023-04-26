// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../../../../utils/AddressArrayLib.sol";
import "../utils/actions/OneInchV5ActionsMixin.sol";
import "../utils/AdapterBase.sol";

/// @title OneInchV5Adapter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Adapter for interacting with OneInch V5
contract OneInchV5Adapter is AdapterBase, OneInchV5ActionsMixin {
    using AddressArrayLib for address[];

    event MultipleOrdersItemFailed(uint256 index, bytes reason);

    constructor(address _integrationManager, address _oneInchV5Exchange)
        public
        AdapterBase(_integrationManager)
        OneInchV5ActionsMixin(_oneInchV5Exchange)
    {}

    /////////////
    // ACTIONS //
    /////////////

    /// @notice Executes multiple trades on OneInch
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function takeMultipleOrders(
        address _vaultProxy,
        bytes calldata _actionData,
        bytes calldata _assetData
    ) external postActionSpendAssetsTransferHandler(_vaultProxy, _assetData) {
        (bytes[] memory ordersData, bool allowOrdersToFail) = __decodeTakeMultipleOrdersCallArgs(
            _actionData
        );

        if (allowOrdersToFail) {
            for (uint256 i; i < ordersData.length; i++) {
                try this.takeOrderAndValidateIncoming(_vaultProxy, ordersData[i]) {} catch (
                    bytes memory reason
                ) {
                    emit MultipleOrdersItemFailed(i, reason);
                }
            }
        } else {
            for (uint256 i; i < ordersData.length; i++) {
                __takeOrderAndValidateIncoming(_vaultProxy, ordersData[i]);
            }
        }
    }

    /// @notice Trades assets on OneInch
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @param _assetData Parsed spend assets and incoming assets data for this action
    function takeOrder(
        address _vaultProxy,
        bytes calldata _actionData,
        bytes calldata _assetData
    ) external postActionSpendAssetsTransferHandler(_vaultProxy, _assetData) {
        __takeOrder({_orderData: _actionData});
    }

    /// @notice External implementation of __takeOrderAndValidateIncoming(), only intended for internal usage
    /// @dev Necessary for try/catch
    function takeOrderAndValidateIncoming(address _vaultProxy, bytes calldata _orderData)
        external
    {
        __takeOrderAndValidateIncoming(_vaultProxy, _orderData);
    }

    /// @dev Helper to route an order according to its swap type
    function __takeOrder(bytes memory _orderData) private {
        (
            address executor,
            IOneInchV5AggregationRouter.SwapDescription memory swapDescription,
            bytes memory data
        ) = __decodeTakeOrderCallArgs(_orderData);

        __oneInchV5Swap({_executor: executor, _description: swapDescription, _data: data});
    }

    /// @dev Helper to trade assets on OneInch and then validate the received asset amount.
    /// The validation is probably unnecessary since OneInch validates the min amount,
    /// but it is consistent with the practice of doing all validations internally also,
    /// which is bypassed during the actions that call this function.
    function __takeOrderAndValidateIncoming(address _vaultProxy, bytes memory _orderData) private {
        (
            ,
            IOneInchV5AggregationRouter.SwapDescription memory swapDescription,

        ) = __decodeTakeOrderCallArgs(_orderData);

        uint256 preIncomingAssetBal = ERC20(swapDescription.dstToken).balanceOf(_vaultProxy);

        __takeOrder({_orderData: _orderData});

        require(
            ERC20(swapDescription.dstToken).balanceOf(_vaultProxy).sub(preIncomingAssetBal) >=
                swapDescription.minReturnAmount,
            "__takeOrderAndValidateIncoming: Received incoming asset less than expected"
        );
    }

    /////////////////////////////
    // PARSE ASSETS FOR ACTION //
    /////////////////////////////

    /// @notice Parses the expected assets in a particular action
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _selector The function selector for the callOnIntegration
    /// @param _actionData Data specific to this action
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForAction(
        address _vaultProxy,
        bytes4 _selector,
        bytes calldata _actionData
    )
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

            (
                ,
                IOneInchV5AggregationRouter.SwapDescription memory swapDescription,

            ) = __decodeTakeOrderCallArgs(_actionData);

            require(
                _vaultProxy == swapDescription.dstReceiver,
                "parseAssetsForAction: invalid dstReceiver"
            );

            spendAssets_[0] = swapDescription.srcToken;
            spendAssetAmounts_[0] = swapDescription.amount;
            incomingAssets_[0] = swapDescription.dstToken;
            minIncomingAssetAmounts_[0] = swapDescription.minReturnAmount;
        } else if (_selector == TAKE_MULTIPLE_ORDERS_SELECTOR) {
            (bytes[] memory ordersData, ) = __decodeTakeMultipleOrdersCallArgs(_actionData);

            spendAssets_ = new address[](ordersData.length);
            spendAssetAmounts_ = new uint256[](ordersData.length);
            for (uint256 i; i < ordersData.length; i++) {
                (
                    ,
                    IOneInchV5AggregationRouter.SwapDescription memory swapDescription,

                ) = __decodeTakeOrderCallArgs(ordersData[i]);

                require(
                    _vaultProxy == swapDescription.dstReceiver,
                    "parseAssetsForAction: invalid dstReceiver"
                );

                spendAssets_[i] = swapDescription.srcToken;
                spendAssetAmounts_[i] = swapDescription.amount;
                incomingAssets_ = incomingAssets_.addUniqueItem(swapDescription.dstToken);
            }

            (spendAssets_, spendAssetAmounts_) = __aggregateAssetAmounts(
                spendAssets_,
                spendAssetAmounts_
            );

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

    /// @dev Helper to decode the encoded callOnIntegration call arguments for takeOrder()
    function __decodeTakeOrderCallArgs(bytes memory _actionData)
        private
        pure
        returns (
            address executor_,
            IOneInchV5AggregationRouter.SwapDescription memory swapDescription_,
            bytes memory data_
        )
    {
        return
            abi.decode(_actionData, (address, IOneInchV5AggregationRouter.SwapDescription, bytes));
    }

    /// @dev Helper to decode the encoded callOnIntegration call arguments for takeMultipleOrders()
    function __decodeTakeMultipleOrdersCallArgs(bytes calldata _actionData)
        private
        pure
        returns (bytes[] memory ordersData, bool allowOrdersToFail)
    {
        return abi.decode(_actionData, (bytes[], bool));
    }
}
